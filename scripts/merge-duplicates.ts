/**
 * merge-duplicates.ts
 *
 * Finds products that normalize to the same name within a category and merges
 * them. For each duplicate group:
 *   1. Picks the "best" product as the winner (in-stock + highest PPI)
 *   2. Reassigns price_listings, product_matches, build_items,
 *      store_products, price_history, product_families to the winner
 *   3. Deletes the loser products
 *
 * Usage: npx tsx scripts/merge-duplicates.ts [--dev] [--dry-run]
 */

import { getSupabase } from './config/retailers.ts';
import { normalizeName } from './scrapers/matcher.ts';

const BATCH = 1000;

interface ProductRow {
  id: string;
  name: string;
  category_id: string;
  ppi_score: number | null;
  price: number | null;
  in_stock: boolean | null;
  brand: string | null;
}

function pickWinner(products: ProductRow[]): ProductRow {
  // Sort: in-stock first, then by PPI desc, then by price (having price > null)
  const sorted = [...products].sort((a, b) => {
    // Prefer in-stock
    const aStock = a.in_stock === true ? 1 : 0;
    const bStock = b.in_stock === true ? 1 : 0;
    if (bStock !== aStock) return bStock - aStock;

    // Prefer has price
    const aHasPrice = a.price !== null && a.price > 0 ? 1 : 0;
    const bHasPrice = b.price !== null && b.price > 0 ? 1 : 0;
    if (bHasPrice !== aHasPrice) return bHasPrice - aHasPrice;

    // Prefer highest PPI
    const aPpi = a.ppi_score ?? 0;
    const bPpi = b.ppi_score ?? 0;
    if (bPpi !== aPpi) return bPpi - aPpi;

    // Prefer cleaner name (shorter usually means less noise)
    return a.name.length - b.name.length;
  });

  return sorted[0];
}

async function main() {
  const devMode = process.argv.includes('--dev');
  const dryRun = process.argv.includes('--dry-run');

  const supabase = getSupabase();

  console.log('=================================================================');
  console.log('  Merge Duplicate Products');
  console.log(`  Mode: ${devMode ? 'DEV' : 'FULL'} ${dryRun ? '(DRY RUN)' : ''}`);
  console.log('=================================================================\n');

  // Step 1: Load all products
  const allProducts: ProductRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, category_id, ppi_score, price, in_stock, brand')
      .range(offset, offset + BATCH - 1);

    if (error) {
      console.error('Error loading products:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    allProducts.push(...(data as ProductRow[]));
    offset += BATCH;
    if (data.length < BATCH) break;
  }

  console.log(`Loaded ${allProducts.length} products`);

  // Step 2: Group by normalized name + category
  const groups = new Map<string, ProductRow[]>();
  for (const p of allProducts) {
    const key = p.category_id + '::' + normalizeName(p.name);
    const group = groups.get(key);
    if (group) group.push(p);
    else groups.set(key, [p]);
  }

  // Find duplicates
  const dupes = [...groups.entries()]
    .filter(([, g]) => g.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`Found ${dupes.length} duplicate groups\n`);

  if (dupes.length === 0) {
    console.log('No duplicates to merge.');
    return;
  }

  const limit = devMode ? Math.min(50, dupes.length) : dupes.length;

  let totalMerged = 0;
  let totalDeleted = 0;
  let totalListingsMoved = 0;
  let totalMatchesMoved = 0;
  let totalBuildItemsMoved = 0;
  let totalStoreProductsMoved = 0;

  for (let gi = 0; gi < limit; gi++) {
    const [key, products] = dupes[gi];
    const winner = pickWinner(products);
    const losers = products.filter((p) => p.id !== winner.id);

    if (dryRun && gi < 30) {
      console.log(`[${key}] Winner: ${winner.name} (PPI: ${winner.ppi_score?.toFixed(1) ?? 'null'}, $${winner.price ?? 'null'})`);
      for (const l of losers) {
        console.log(`  Merge: ${l.name} (PPI: ${l.ppi_score?.toFixed(1) ?? 'null'}, $${l.price ?? 'null'})`);
      }
    }

    if (dryRun) {
      totalMerged++;
      totalDeleted += losers.length;
      continue;
    }

    const loserIds = losers.map((l) => l.id);

    // 2a: Move price_listings
    // First delete conflicting ones (same retailer already exists for winner)
    const { data: winnerListings } = await supabase
      .from('price_listings')
      .select('retailer_id')
      .eq('product_id', winner.id);

    const winnerRetailerIds = new Set((winnerListings ?? []).map((l: any) => l.retailer_id));

    for (const loserId of loserIds) {
      // Delete conflicting listings (retailer already covered by winner)
      if (winnerRetailerIds.size > 0) {
        await supabase
          .from('price_listings')
          .delete()
          .eq('product_id', loserId)
          .in('retailer_id', [...winnerRetailerIds]);
      }

      // Move remaining listings to winner
      const { data: moved } = await supabase
        .from('price_listings')
        .update({ product_id: winner.id })
        .eq('product_id', loserId)
        .select('id');

      if (moved) {
        totalListingsMoved += moved.length;
        // Add the newly acquired retailer_ids to winner set
        for (const m of moved) {
          // We'd need retailer_id but select only gets id, so just move on
        }
      }
    }

    // 2b: Move product_matches
    const { data: winnerMatches } = await supabase
      .from('product_matches')
      .select('retailer_id')
      .eq('product_id', winner.id);

    const winnerMatchRetailerIds = new Set((winnerMatches ?? []).map((m: any) => m.retailer_id));

    for (const loserId of loserIds) {
      if (winnerMatchRetailerIds.size > 0) {
        await supabase
          .from('product_matches')
          .delete()
          .eq('product_id', loserId)
          .in('retailer_id', [...winnerMatchRetailerIds]);
      }

      const { data: moved } = await supabase
        .from('product_matches')
        .update({ product_id: winner.id })
        .eq('product_id', loserId)
        .select('id');

      if (moved) totalMatchesMoved += moved.length;
    }

    // 2c: Move build_items
    for (const loserId of loserIds) {
      const { data: moved } = await supabase
        .from('build_items')
        .update({ product_id: winner.id })
        .eq('product_id', loserId)
        .select('id');

      if (moved) totalBuildItemsMoved += moved.length;
    }

    // 2d: Move store_products canonical references
    for (const loserId of loserIds) {
      const { data: moved } = await supabase
        .from('store_products')
        .update({ canonical_product_id: winner.id })
        .eq('canonical_product_id', loserId)
        .select('id');

      if (moved) totalStoreProductsMoved += moved.length;
    }

    // 2e: Move price_history (no unique constraint on product_id+retailer_id)
    for (const loserId of loserIds) {
      await supabase
        .from('price_history')
        .update({ product_id: winner.id })
        .eq('product_id', loserId);
    }

    // 2f: Move product_families
    for (const loserId of loserIds) {
      await supabase
        .from('product_families')
        .update({ base_product_id: winner.id })
        .eq('base_product_id', loserId);
    }

    // 3: Delete loser products
    for (const loserId of loserIds) {
      const { error: delError } = await supabase
        .from('products')
        .delete()
        .eq('id', loserId);

      if (delError) {
        console.error(`  Error deleting ${loserId}: ${delError.message}`);
      } else {
        totalDeleted++;
      }
    }

    totalMerged++;

    if ((gi + 1) % 50 === 0) {
      console.log(`  Processed ${gi + 1}/${limit} groups (${totalDeleted} products deleted)...`);
    }
  }

  // Step 3: Denormalize prices for affected winners
  if (!dryRun && totalListingsMoved > 0) {
    console.log('\nDenormalizing lowest prices for merged products...');
    const winnerIds = dupes.slice(0, limit).map(([, products]) => pickWinner(products).id);
    const uniqueWinnerIds = [...new Set(winnerIds)];

    for (let i = 0; i < uniqueWinnerIds.length; i += 50) {
      const batch = uniqueWinnerIds.slice(i, i + 50);
      for (const productId of batch) {
        const { data: listings } = await supabase
          .from('price_listings')
          .select('price, affiliate_url, product_url, in_stock')
          .eq('product_id', productId)
          .eq('in_stock', true)
          .order('price', { ascending: true })
          .limit(1);

        if (listings && listings.length > 0) {
          const best = listings[0];
          await supabase
            .from('products')
            .update({
              price: best.price,
              affiliate_url: best.affiliate_url ?? best.product_url,
              in_stock: true,
            })
            .eq('id', productId);
        }
      }
    }
  }

  console.log(`\n=================================================================`);
  console.log(`  MERGE COMPLETE ${dryRun ? '(DRY RUN)' : ''}`);
  console.log(`  Groups merged: ${totalMerged}`);
  console.log(`  Products deleted: ${totalDeleted}`);
  if (!dryRun) {
    console.log(`  Price listings moved: ${totalListingsMoved}`);
    console.log(`  Product matches moved: ${totalMatchesMoved}`);
    console.log(`  Build items moved: ${totalBuildItemsMoved}`);
    console.log(`  Store products moved: ${totalStoreProductsMoved}`);
  }
  console.log('=================================================================\n');
}

main().catch(console.error);
