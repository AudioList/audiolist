/**
 * cleanup-brands.ts
 *
 * One-time script to normalise every product.brand in the database
 * using the canonical KNOWN_BRANDS list and junk filters from brand-config.ts.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/cleanup-brands.ts
 *
 * What it does:
 *   1. Fetches ALL products (with pagination).
 *   2. Re-derives brand from the product name using extractBrand().
 *   3. Collects every row whose brand changed (including junk → null).
 *   4. Batch-updates the database.
 */

import { createClient } from '@supabase/supabase-js';
import { extractBrand } from './brand-config';

const SUPABASE_URL = 'https://sycfaajrlnkyczrauusx.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_KEY is required.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const PAGE_SIZE = 1000;
const UPDATE_BATCH = 500;

async function main() {
  console.log('=== Brand Cleanup ===\n');

  // ---- 1. Fetch all products ----
  console.log('Step 1: Fetching all products...');
  const allProducts: { id: string; name: string; brand: string | null }[] = [];
  let page = 0;

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, brand')
      .order('id')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) {
      console.error('Fetch error:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    allProducts.push(...data);
    if (data.length < PAGE_SIZE) break;
    page++;
  }

  console.log(`  Loaded ${allProducts.length} products.\n`);

  // ---- 2. Re-derive brands ----
  console.log('Step 2: Re-deriving brands...');

  const updates: { id: string; brand: string | null }[] = [];
  let nulledJunk = 0;
  let consolidated = 0;
  let unchanged = 0;

  for (const p of allProducts) {
    // extractBrand handles everything: known brands, aliases, junk filtering
    const newBrand = extractBrand(p.name);

    if (newBrand !== p.brand) {
      updates.push({ id: p.id, brand: newBrand });

      if (p.brand && !newBrand) {
        nulledJunk++;
      } else {
        consolidated++;
      }
    } else {
      unchanged++;
    }
  }

  console.log(`  Unchanged:    ${unchanged}`);
  console.log(`  Consolidated: ${consolidated} (casing / variant fix)`);
  console.log(`  Nulled junk:  ${nulledJunk}`);
  console.log(`  Total updates: ${updates.length}\n`);

  if (updates.length === 0) {
    console.log('Nothing to update. Done!');
    return;
  }

  // ---- 3. Show sample changes ----
  console.log('Sample changes (first 30):');
  for (const u of updates.slice(0, 30)) {
    const p = allProducts.find((x) => x.id === u.id)!;
    console.log(`  ${JSON.stringify(p.brand)} -> ${JSON.stringify(u.brand)}  (name: ${p.name.slice(0, 60)})`);
  }
  console.log('');

  // ---- 4. Batch update ----
  console.log(`Step 3: Updating ${updates.length} rows in batches of ${UPDATE_BATCH}...`);
  let updatedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < updates.length; i += UPDATE_BATCH) {
    const batch = updates.slice(i, i + UPDATE_BATCH);
    const batchNum = Math.floor(i / UPDATE_BATCH) + 1;
    const totalBatches = Math.ceil(updates.length / UPDATE_BATCH);

    // Use individual updates grouped by brand to reduce round trips
    // Group by target brand
    const byBrand = new Map<string | null, string[]>();
    for (const u of batch) {
      const key = u.brand;
      if (!byBrand.has(key)) byBrand.set(key, []);
      byBrand.get(key)!.push(u.id);
    }

    let batchOk = true;
    for (const [brand, ids] of byBrand) {
      const { error } = await supabase
        .from('products')
        .update({ brand })
        .in('id', ids);

      if (error) {
        console.error(`  Batch ${batchNum}/${totalBatches} ERROR for brand=${JSON.stringify(brand)}: ${error.message}`);
        errorCount += ids.length;
        batchOk = false;
      } else {
        updatedCount += ids.length;
      }
    }

    if (batchOk) {
      console.log(`  Batch ${batchNum}/${totalBatches}: updated ${batch.length} rows`);
    }
  }

  // ---- 5. Summary ----
  console.log('\n=== Cleanup Complete ===');
  console.log(`  Total products:    ${allProducts.length}`);
  console.log(`  Updated:           ${updatedCount}`);
  console.log(`  Errors:            ${errorCount}`);

  // ---- 6. Post-cleanup stats ----
  console.log('\nPost-cleanup brand stats:');
  const { data: brandData } = await supabase
    .from('products')
    .select('brand')
    .not('brand', 'is', null)
    .order('brand');

  if (brandData) {
    const counts: Record<string, number> = {};
    for (const r of brandData) counts[r.brand as string] = (counts[r.brand as string] || 0) + 1;
    const unique = Object.keys(counts);
    console.log(`  Unique brands: ${unique.length}`);
    console.log(`  Top 20 by count:`);
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20);
    for (const [b, c] of top) console.log(`    ${b}: ${c}`);
  }

  if (errorCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
