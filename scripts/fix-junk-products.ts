/**
 * fix-junk-products.ts
 *
 * Phase 5: Delete junk/test items and fix individually misplaced products.
 *
 * Usage:
 *   npx tsx scripts/fix-junk-products.ts --dry-run
 *   npx tsx scripts/fix-junk-products.ts
 */

import { getSupabase } from './config/retailers.ts';
import { isJunkProduct, detectMisplacedProduct } from './scrapers/matcher.ts';
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
  console.log('  Phase 5: Junk & Misplaced Products Cleanup');
  console.log(`  Mode: ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log('=================================================================\n');

  // Load ALL products across all categories (we need to check every category for misplaced items)
  const allCategories: CategoryId[] = [
    'iem', 'headphone', 'dac', 'amp', 'speaker', 'cable', 'dap', 'microphone',
    'iem_tips', 'iem_cable', 'iem_filter', 'hp_pads', 'hp_cable',
  ];

  const products: ProductRow[] = [];
  for (const cat of allCategories) {
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, brand, category_id')
        .eq('category_id', cat)
        .range(offset, offset + BATCH - 1);
      if (error) { console.error(`Error loading ${cat}:`, error.message); break; }
      if (!data || data.length === 0) break;
      products.push(...(data as ProductRow[]));
      offset += BATCH;
      if (data.length < BATCH) break;
    }
  }

  console.log(`Loaded ${products.length} total products across all categories\n`);

  // Find junk products to delete
  const junkProducts: ProductRow[] = [];
  for (const p of products) {
    if (isJunkProduct(p.name)) {
      junkProducts.push(p);
    }
  }

  // Find misplaced products to move
  const reclassifications: { product: ProductRow; target: CategoryId }[] = [];
  for (const p of products) {
    const detected = detectMisplacedProduct(p.name, p.category_id);
    if (detected) {
      reclassifications.push({ product: p, target: detected });
    }
  }

  // Report junk
  if (junkProducts.length > 0) {
    console.log(`\n=== JUNK PRODUCTS TO DELETE (${junkProducts.length}) ===`);
    for (const p of junkProducts) {
      console.log(`  [${p.category_id}] "${p.name}" (brand: ${p.brand ?? 'null'}, id: ${p.id})`);
    }
  }

  // Report misplaced
  if (reclassifications.length > 0) {
    console.log(`\n=== MISPLACED PRODUCTS TO MOVE (${reclassifications.length}) ===`);
    const byDirection = new Map<string, typeof reclassifications>();
    for (const r of reclassifications) {
      const key = `${r.product.category_id} -> ${r.target}`;
      if (!byDirection.has(key)) byDirection.set(key, []);
      byDirection.get(key)!.push(r);
    }
    for (const [direction, items] of [...byDirection.entries()].sort()) {
      console.log(`\n  --- ${direction} (${items.length}) ---`);
      for (const r of items) {
        console.log(`    "${r.product.name}" (brand: ${r.product.brand ?? 'null'})`);
      }
    }
  }

  const totalActions = junkProducts.length + reclassifications.length;
  console.log(`\n=================================================================`);
  console.log(`  Junk to delete: ${junkProducts.length}`);
  console.log(`  Misplaced to move: ${reclassifications.length}`);
  console.log(`  Total actions: ${totalActions}`);
  console.log('=================================================================\n');

  if (totalActions === 0) { console.log('Nothing to fix.'); return; }
  if (DRY) { console.log('[DRY RUN] No changes applied.\n'); return; }

  console.log('Applying changes...\n');
  let deleted = 0;
  let moved = 0;
  let errors = 0;

  // Delete junk products
  for (const p of junkProducts) {
    // First delete any price_listings for this product
    const { error: plError } = await supabase
      .from('price_listings')
      .delete()
      .eq('product_id', p.id);
    if (plError) {
      console.error(`  ERROR deleting price_listings for "${p.name}": ${plError.message}`);
    }

    // Then delete the product
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', p.id);
    if (error) { console.error(`  ERROR deleting "${p.name}": ${error.message}`); errors++; }
    else { deleted++; console.log(`  Deleted: "${p.name}"`); }
  }

  // Move misplaced products
  for (let i = 0; i < reclassifications.length; i += UPDATE_BATCH) {
    const batch = reclassifications.slice(i, i + UPDATE_BATCH);
    const promises = batch.map(async (r) => {
      const { error } = await supabase
        .from('products')
        .update({ category_id: r.target })
        .eq('id', r.product.id);
      if (error) { console.error(`  ERROR moving "${r.product.name}": ${error.message}`); errors++; }
      else { moved++; }
    });
    await Promise.all(promises);
  }

  console.log(`\nDone! Deleted: ${deleted}, Moved: ${moved}, Errors: ${errors}\n`);
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
