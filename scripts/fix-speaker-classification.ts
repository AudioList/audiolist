/**
 * fix-speaker-classification.ts
 *
 * Phase 2: Move non-speaker items (cables, accessories) out of the speaker category.
 *
 * Usage:
 *   npx tsx scripts/fix-speaker-classification.ts --dry-run
 *   npx tsx scripts/fix-speaker-classification.ts
 */

import { getSupabase } from './config/retailers.ts';
import { detectSpeakerCategory } from './scrapers/matcher.ts';
import type { CategoryId } from './config/store-collections.ts';

const BATCH = 1000;
const UPDATE_BATCH = 50;
const DRY = process.argv.includes('--dry-run');

interface ProductRow {
  id: string;
  name: string;
  brand: string | null;
  category_id: CategoryId;
}

async function main() {
  const supabase = getSupabase();

  console.log('=================================================================');
  console.log('  Phase 2: Speaker Category Cleanup');
  console.log(`  Mode: ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log('=================================================================\n');

  // Load all speaker products
  const products: ProductRow[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, brand, category_id')
      .eq('category_id', 'speaker')
      .range(offset, offset + BATCH - 1);
    if (error) { console.error('Error loading speaker products:', error.message); break; }
    if (!data || data.length === 0) break;
    products.push(...(data as ProductRow[]));
    offset += BATCH;
    if (data.length < BATCH) break;
  }

  console.log(`Loaded ${products.length} speaker products\n`);

  // Detect reclassifications
  const reclassifications: { product: ProductRow; target: CategoryId }[] = [];
  for (const p of products) {
    const detected = detectSpeakerCategory(p.name);
    if (detected) {
      reclassifications.push({ product: p, target: detected });
    }
  }

  console.log(`Found ${reclassifications.length} products to reclassify\n`);
  if (reclassifications.length === 0) { console.log('Nothing to fix.'); return; }

  // Report grouped by target
  const byTarget = new Map<string, typeof reclassifications>();
  for (const r of reclassifications) {
    const key = `speaker -> ${r.target}`;
    if (!byTarget.has(key)) byTarget.set(key, []);
    byTarget.get(key)!.push(r);
  }

  for (const [direction, items] of [...byTarget.entries()].sort()) {
    console.log(`\n=== ${direction} (${items.length}) ===`);
    const byBrand = new Map<string, typeof items>();
    for (const r of items) {
      const b = r.product.brand ?? '(no brand)';
      if (!byBrand.has(b)) byBrand.set(b, []);
      byBrand.get(b)!.push(r);
    }
    for (const [brand, bItems] of [...byBrand.entries()].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  --- ${brand} (${bItems.length}) ---`);
      for (const r of bItems) {
        console.log(`    ${r.product.name}`);
      }
    }
  }

  console.log(`\n=================================================================`);
  console.log(`  Total: ${reclassifications.length} products to reclassify`);
  console.log('=================================================================\n');

  if (DRY) { console.log('[DRY RUN] No changes applied.\n'); return; }

  console.log('Applying updates...\n');
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < reclassifications.length; i += UPDATE_BATCH) {
    const batch = reclassifications.slice(i, i + UPDATE_BATCH);
    const promises = batch.map(async (r) => {
      const { error } = await supabase
        .from('products')
        .update({ category_id: r.target })
        .eq('id', r.product.id);
      if (error) { console.error(`  ERROR: "${r.product.name}": ${error.message}`); errors++; }
      else { updated++; }
    });
    await Promise.all(promises);
    if ((i + UPDATE_BATCH) % 100 < UPDATE_BATCH) {
      console.log(`  Progress: ${Math.min(i + UPDATE_BATCH, reclassifications.length)}/${reclassifications.length}`);
    }
  }

  console.log(`\nDone! Updated: ${updated}, Errors: ${errors}\n`);
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
