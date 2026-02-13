/**
 * backfill-microphone-specs.ts
 *
 * Multi-pass enrichment script to populate mic_connection, mic_type,
 * and mic_pattern for microphone products.
 *
 * Extraction passes (per attribute, only fills NULLs):
 * 1. Product name keywords (extractMic*)
 * 2. Store product titles (via canonical_product_id)
 * 3. Store product tags (via extractTagAttributes + structured tags)
 * 4. Store product product_type (mic_connection only)
 * 5. Known brand/model lookup table
 *
 * Usage:
 *   npx tsx scripts/backfill-microphone-specs.ts --dry-run
 *   npx tsx scripts/backfill-microphone-specs.ts
 *   npx tsx scripts/backfill-microphone-specs.ts --dev
 */

import { getSupabase } from './config/retailers.ts';
import {
  extractMicConnection,
  extractMicType,
  extractMicPattern,
  extractMicConnectionFromProductType,
} from './scrapers/matcher.ts';
import { extractTagAttributes } from './lib/extract-tags.ts';
import { lookupKnownMicSpecs } from './lib/mic-known-specs.ts';

const BATCH = 1000;
const UPDATE_BATCH = 50;
const DRY = process.argv.includes('--dry-run');
const DEV = process.argv.includes('--dev');

interface MicProduct {
  id: string;
  name: string;
  mic_connection: string | null;
  mic_type: string | null;
  mic_pattern: string | null;
}

interface MicUpdate {
  mic_connection?: string;
  mic_type?: string;
  mic_pattern?: string;
}

async function main() {
  const supabase = getSupabase();

  console.log('=================================================================');
  console.log('  Backfill microphone specs (connection, type, pattern)');
  console.log(`  Mode: ${DRY ? 'DRY RUN' : 'LIVE'}${DEV ? ' [DEV]' : ''}`);
  console.log('=================================================================\n');

  // Step 1: Load all microphone products with at least one NULL attribute
  const products: MicProduct[] = [];
  let offset = 0;
  const limit = DEV ? 100 : 10000;

  while (products.length < limit) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, mic_connection, mic_type, mic_pattern')
      .eq('category_id', 'microphone')
      .or('mic_connection.is.null,mic_type.is.null,mic_pattern.is.null')
      .range(offset, offset + BATCH - 1);

    if (error) {
      console.error('Error loading products:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    products.push(...data);
    offset += BATCH;
    if (data.length < BATCH) break;
  }

  console.log(`Loaded ${products.length} microphone products with at least one NULL attribute\n`);

  if (products.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  // Track updates per product
  const updates = new Map<string, MicUpdate>();

  function setUpdate(id: string, field: keyof MicUpdate, value: string) {
    const existing = updates.get(id) || {};
    existing[field] = value;
    updates.set(id, existing);
  }

  // Helper: check if a field still needs filling for a product
  function needsField(p: MicProduct, field: keyof MicUpdate): boolean {
    if (field === 'mic_connection' && p.mic_connection !== null) return false;
    if (field === 'mic_type' && p.mic_type !== null) return false;
    if (field === 'mic_pattern' && p.mic_pattern !== null) return false;
    // Also check if we already found a value in a previous pass
    const u = updates.get(p.id);
    if (u && u[field]) return false;
    return true;
  }

  // ── Pass 1: Product name extraction ──
  console.log('Pass 1: Extracting from canonical product names...');
  let p1conn = 0, p1type = 0, p1pat = 0;
  for (const p of products) {
    if (needsField(p, 'mic_connection')) {
      const v = extractMicConnection(p.name);
      if (v) { setUpdate(p.id, 'mic_connection', v); p1conn++; }
    }
    if (needsField(p, 'mic_type')) {
      const v = extractMicType(p.name);
      if (v) { setUpdate(p.id, 'mic_type', v); p1type++; }
    }
    if (needsField(p, 'mic_pattern')) {
      const v = extractMicPattern(p.name);
      if (v) { setUpdate(p.id, 'mic_pattern', v); p1pat++; }
    }
  }
  console.log(`  connection: ${p1conn}, type: ${p1type}, pattern: ${p1pat}`);

  // ── Pass 2-4: Store products (title, tags, product_type) ──
  // Collect product IDs still missing at least one attribute
  const stillMissing = new Set(
    products.filter(p =>
      needsField(p, 'mic_connection') ||
      needsField(p, 'mic_type') ||
      needsField(p, 'mic_pattern')
    ).map(p => p.id)
  );

  if (stillMissing.size > 0) {
    console.log(`Pass 2-4: Checking store_products for ${stillMissing.size} remaining products...`);
    let p2conn = 0, p2type = 0, p2pat = 0;
    let p3conn = 0, p3type = 0, p3pat = 0;
    let p4conn = 0;
    let spOffset = 0;

    // Build a quick lookup from product ID -> MicProduct
    const productMap = new Map(products.map(p => [p.id, p]));

    while (true) {
      const { data: storeProducts, error } = await supabase
        .from('store_products')
        .select('canonical_product_id, title, tags, product_type')
        .not('canonical_product_id', 'is', null)
        .eq('category_id', 'microphone')
        .range(spOffset, spOffset + BATCH - 1);

      if (error) {
        console.error('Error loading store_products:', error.message);
        break;
      }
      if (!storeProducts || storeProducts.length === 0) break;

      for (const sp of storeProducts) {
        const pid = sp.canonical_product_id as string;
        const p = productMap.get(pid);
        if (!p) continue;

        // Pass 2: Store product title
        if (needsField(p, 'mic_connection')) {
          const v = extractMicConnection(sp.title as string);
          if (v) { setUpdate(pid, 'mic_connection', v); p2conn++; }
        }
        if (needsField(p, 'mic_type')) {
          const v = extractMicType(sp.title as string);
          if (v) { setUpdate(pid, 'mic_type', v); p2type++; }
        }
        if (needsField(p, 'mic_pattern')) {
          const v = extractMicPattern(sp.title as string);
          if (v) { setUpdate(pid, 'mic_pattern', v); p2pat++; }
        }

        // Pass 3: Store product tags
        const tags = sp.tags as string[] | null;
        if (tags && tags.length > 0) {
          const tagAttrs = extractTagAttributes(tags);
          if (needsField(p, 'mic_connection') && tagAttrs.mic_connection) {
            setUpdate(pid, 'mic_connection', tagAttrs.mic_connection); p3conn++;
          }
          if (needsField(p, 'mic_type') && tagAttrs.mic_type) {
            setUpdate(pid, 'mic_type', tagAttrs.mic_type); p3type++;
          }
          if (needsField(p, 'mic_pattern') && tagAttrs.mic_pattern) {
            setUpdate(pid, 'mic_pattern', tagAttrs.mic_pattern); p3pat++;
          }
        }

        // Pass 4: product_type (connection only)
        if (needsField(p, 'mic_connection')) {
          const v = extractMicConnectionFromProductType(sp.product_type as string | null);
          if (v) { setUpdate(pid, 'mic_connection', v); p4conn++; }
        }
      }

      spOffset += BATCH;
      if (storeProducts.length < BATCH) break;
    }

    console.log(`  Pass 2 (titles)  - connection: ${p2conn}, type: ${p2type}, pattern: ${p2pat}`);
    console.log(`  Pass 3 (tags)    - connection: ${p3conn}, type: ${p3type}, pattern: ${p3pat}`);
    console.log(`  Pass 4 (ptype)   - connection: ${p4conn}`);
  }

  // ── Pass 5: Known brand/model lookup ──
  console.log('Pass 5: Known brand/model lookup...');
  let p5conn = 0, p5type = 0, p5pat = 0;
  for (const p of products) {
    if (needsField(p, 'mic_connection') || needsField(p, 'mic_type') || needsField(p, 'mic_pattern')) {
      const known = lookupKnownMicSpecs(p.name);
      if (known) {
        if (needsField(p, 'mic_connection') && known.mic_connection) {
          setUpdate(p.id, 'mic_connection', known.mic_connection); p5conn++;
        }
        if (needsField(p, 'mic_type') && known.mic_type) {
          setUpdate(p.id, 'mic_type', known.mic_type); p5type++;
        }
        if (needsField(p, 'mic_pattern') && known.mic_pattern) {
          setUpdate(p.id, 'mic_pattern', known.mic_pattern); p5pat++;
        }
      }
    }
  }
  console.log(`  connection: ${p5conn}, type: ${p5type}, pattern: ${p5pat}`);

  // ── Summary ──
  const totalWithUpdates = [...updates.entries()].filter(([_, u]) => Object.keys(u).length > 0).length;
  const connUpdates = [...updates.values()].filter(u => u.mic_connection).length;
  const typeUpdates = [...updates.values()].filter(u => u.mic_type).length;
  const patUpdates = [...updates.values()].filter(u => u.mic_pattern).length;

  console.log(`\nSummary:`);
  console.log(`  Products to update: ${totalWithUpdates}`);
  console.log(`  Connection fills: ${connUpdates}`);
  console.log(`  Type fills: ${typeUpdates}`);
  console.log(`  Pattern fills: ${patUpdates}`);

  if (DRY) {
    console.log('\nSample updates:');
    let shown = 0;
    for (const p of products) {
      const u = updates.get(p.id);
      if (!u || Object.keys(u).length === 0) continue;
      console.log(`  ${p.name}`);
      if (u.mic_connection) console.log(`    connection: NULL -> ${u.mic_connection}`);
      if (u.mic_type) console.log(`    type: NULL -> ${u.mic_type}`);
      if (u.mic_pattern) console.log(`    pattern: NULL -> ${u.mic_pattern}`);
      if (++shown >= 20) {
        console.log(`  ... and ${totalWithUpdates - shown} more`);
        break;
      }
    }
    console.log('\n*** DRY RUN complete. No changes made. ***');
    return;
  }

  // ── Apply updates ──
  console.log('\nApplying updates...');
  let updated = 0;
  let errors = 0;

  for (const [id, u] of updates) {
    if (Object.keys(u).length === 0) continue;

    const { error } = await supabase
      .from('products')
      .update(u)
      .eq('id', id);

    if (error) {
      console.error(`  Error updating ${id}:`, error.message);
      errors++;
    } else {
      updated++;
    }
  }

  console.log(`\n=================================================================`);
  console.log(`  BACKFILL COMPLETE`);
  console.log(`  Products updated: ${updated}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Connection fills: ${connUpdates}`);
  console.log(`  Type fills: ${typeUpdates}`);
  console.log(`  Pattern fills: ${patUpdates}`);
  console.log('=================================================================\n');
}

main().catch(console.error);
