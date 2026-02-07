/**
 * backfill-iem-type.ts
 *
 * One-time (re-runnable) script to populate the iem_type column for all IEM products.
 *
 * Detection passes:
 * 1. Product name keywords (TWS, truly wireless, true wireless)
 * 2. Variant type inference (anc -> tws, dsp -> active)
 * 3. Store product titles (check store_products for TWS keywords)
 * 4. Store product tags (via extractTagAttributes)
 * 5. Default: any IEM not detected as tws/active -> passive
 *
 * Usage:
 *   npx tsx scripts/backfill-iem-type.ts --dry-run
 *   npx tsx scripts/backfill-iem-type.ts
 */

import { getSupabase } from './config/retailers.ts';
import { extractIemType } from './scrapers/matcher.ts';
import { extractTagAttributes } from './lib/extract-tags.ts';

const BATCH = 1000;
const UPDATE_BATCH = 50;
const DRY = process.argv.includes('--dry-run');

async function main() {
  const supabase = getSupabase();

  console.log('=================================================================');
  console.log('  Backfill iem_type for IEM products');
  console.log(`  Mode: ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log('=================================================================\n');

  // Step 1: Load all IEM products that don't have iem_type set yet
  const products: { id: string; name: string; variant_type: string | null }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, variant_type')
      .eq('category_id', 'iem')
      .is('iem_type', null)
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

  console.log(`Loaded ${products.length} IEM products without iem_type\n`);

  if (products.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  const updates = new Map<string, 'tws' | 'active' | 'passive'>();

  // Pass 1: Product names
  console.log('Pass 1: Extracting from product names...');
  let pass1Count = 0;
  for (const p of products) {
    const type = extractIemType(p.name);
    if (type) {
      updates.set(p.id, type);
      pass1Count++;
    }
  }
  console.log(`  Found ${pass1Count} from names`);

  // Pass 2: Variant type inference
  console.log('Pass 2: Inferring from variant_type...');
  let pass2Count = 0;
  for (const p of products) {
    if (updates.has(p.id)) continue;
    if (p.variant_type === 'anc') {
      updates.set(p.id, 'tws');
      pass2Count++;
    } else if (p.variant_type === 'dsp') {
      updates.set(p.id, 'active');
      pass2Count++;
    }
  }
  console.log(`  Found ${pass2Count} from variant types`);

  // Pass 3: Store product titles
  const missingIds = new Set(products.filter(p => !updates.has(p.id)).map(p => p.id));
  if (missingIds.size > 0) {
    console.log(`Pass 3: Checking store_products titles for ${missingIds.size} remaining...`);
    let pass3Count = 0;
    let spOffset = 0;

    while (missingIds.size > 0) {
      const { data: storeProducts, error } = await supabase
        .from('store_products')
        .select('canonical_product_id, title, tags')
        .not('canonical_product_id', 'is', null)
        .eq('category_id', 'iem')
        .range(spOffset, spOffset + BATCH - 1);

      if (error) {
        console.error('Error loading store_products:', error.message);
        break;
      }
      if (!storeProducts || storeProducts.length === 0) break;

      for (const sp of storeProducts) {
        const pid = sp.canonical_product_id as string;
        if (!missingIds.has(pid)) continue;

        // Check title
        const type = extractIemType(sp.title as string);
        if (type) {
          updates.set(pid, type);
          missingIds.delete(pid);
          pass3Count++;
          continue;
        }

        // Check tags (Pass 4 integrated here)
        const tags = sp.tags as string[];
        if (tags && tags.length > 0) {
          const tagAttrs = extractTagAttributes(tags);
          if (tagAttrs.iem_type) {
            updates.set(pid, tagAttrs.iem_type);
            missingIds.delete(pid);
            pass3Count++;
          }
        }
      }

      spOffset += BATCH;
      if (storeProducts.length < BATCH) break;
    }
    console.log(`  Found ${pass3Count} from store_products titles/tags`);
  }

  // Pass 5: Default remaining to passive
  console.log('Pass 5: Defaulting remaining to passive...');
  let passiveCount = 0;
  for (const p of products) {
    if (!updates.has(p.id)) {
      updates.set(p.id, 'passive');
      passiveCount++;
    }
  }
  console.log(`  Defaulted ${passiveCount} to passive`);

  // Summary before applying
  const twsCount = [...updates.values()].filter(v => v === 'tws').length;
  const activeCount = [...updates.values()].filter(v => v === 'active').length;
  const passiveFinal = [...updates.values()].filter(v => v === 'passive').length;

  console.log(`\nSummary:`);
  console.log(`  TWS: ${twsCount}`);
  console.log(`  Active: ${activeCount}`);
  console.log(`  Passive: ${passiveFinal}`);
  console.log(`  Total: ${updates.size}`);

  if (DRY) {
    // Show some examples
    console.log('\nSample TWS:');
    const twsSamples = products.filter(p => updates.get(p.id) === 'tws').slice(0, 10);
    for (const s of twsSamples) console.log(`  - ${s.name}`);

    console.log('\nSample Active:');
    const activeSamples = products.filter(p => updates.get(p.id) === 'active').slice(0, 10);
    for (const s of activeSamples) console.log(`  - ${s.name}`);

    console.log('\n*** DRY RUN complete. No changes made. ***');
    return;
  }

  // Apply updates by type
  console.log('\nApplying updates...');
  let updated = 0;

  for (const type of ['tws', 'active', 'passive'] as const) {
    const ids = [...updates.entries()]
      .filter(([_, v]) => v === type)
      .map(([id]) => id);

    if (ids.length === 0) continue;

    for (let i = 0; i < ids.length; i += UPDATE_BATCH) {
      const batch = ids.slice(i, i + UPDATE_BATCH);
      const { error } = await supabase
        .from('products')
        .update({ iem_type: type })
        .in('id', batch);

      if (error) {
        console.error(`Error updating ${type} batch:`, error.message);
      } else {
        updated += batch.length;
      }
    }
  }

  console.log(`\n=================================================================`);
  console.log(`  BACKFILL COMPLETE`);
  console.log(`  Products updated: ${updated}`);
  console.log(`  TWS: ${twsCount}`);
  console.log(`  Active: ${activeCount}`);
  console.log(`  Passive: ${passiveFinal}`);
  console.log('=================================================================\n');
}

main().catch(console.error);
