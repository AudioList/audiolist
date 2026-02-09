/**
 * dedup-products.ts
 *
 * Deduplicates products that have the same identity (normalized name + brand + category)
 * but exist as separate rows due to different source_types (measurement vs store).
 *
 * Strategy:
 *   1. Load all products (IEM + headphone categories)
 *   2. Group by normalized name + brand + category
 *   3. For groups with multiple rows, pick the canonical winner:
 *      - Prefer rows with both PPI score AND price
 *      - Then rows with PPI score (measurement)
 *      - Then rows with price (store)
 *      - Tie-break: highest PPI score, then newest updated_at
 *   4. Merge data from losers into the winner:
 *      - Copy PPI fields if winner lacks them
 *      - Copy price/affiliate_url if winner lacks them
 *   5. Re-point all price_listings from loser product_ids to the winner
 *   6. Re-point all build_items from loser product_ids to the winner
 *   7. Delete loser product rows
 *
 * Usage: npx tsx scripts/dedup-products.ts [--dev] [--dry-run]
 *
 * --dev: Limit to first 50 duplicate groups
 * --dry-run: Print what would happen without making changes
 */

import { getSupabase } from './config/retailers.ts';
import { normalizeName } from './scrapers/matcher.ts';

const BATCH = 1000;
const DEV_MODE = process.argv.includes('--dev');
const DRY_RUN = process.argv.includes('--dry-run');

interface Product {
  id: string;
  name: string;
  brand: string | null;
  category_id: string;
  source_type: string | null;
  ppi_score: number | null;
  ppi_stdev: number | null;
  ppi_slope: number | null;
  ppi_avg_error: number | null;
  price: number | null;
  affiliate_url: string | null;
  image_url: string | null;
  source_domain: string | null;
  source_id: string | null;
  rig_type: string | null;
  pinna: string | null;
  quality: string | null;
  in_stock: boolean | null;
  updated_at: string | null;
  headphone_design: string | null;
  iem_type: string | null;
  driver_type: string | null;
  variant_type: string | null;
  variant_value: string | null;
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function log(phase: string, msg: string): void {
  console.log(`[${timestamp()}] [${phase}] ${msg}`);
}

/**
 * Rank a product for canonical selection.
 * Higher score = better candidate to keep.
 */
function rankProduct(p: Product): number {
  let score = 0;
  if (p.ppi_score != null) score += 100;    // Has measurement data
  if (p.price != null) score += 50;          // Has price
  if (p.affiliate_url) score += 10;          // Has affiliate link
  if (p.image_url) score += 5;              // Has image
  if (p.in_stock) score += 20;              // Currently in stock
  if (p.source_type === 'merged') score += 15; // Already merged = best
  if (p.ppi_score != null) score += p.ppi_score; // Higher PPI = better measurement
  return score;
}

async function main() {
  const startTime = Date.now();
  const supabase = getSupabase();

  console.log('=================================================================');
  console.log('  Product Deduplication');
  console.log(`  Mode: ${DEV_MODE ? 'DEV' : 'FULL'}${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`  Started at ${new Date().toISOString()}`);
  console.log('=================================================================\n');

  // Step 1: Load all IEM + headphone products
  log('LOAD', 'Loading products...');
  const allProducts: Product[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, brand, category_id, source_type, ppi_score, ppi_stdev, ppi_slope, ppi_avg_error, price, affiliate_url, image_url, source_domain, source_id, rig_type, pinna, quality, in_stock, updated_at, headphone_design, iem_type, driver_type, variant_type, variant_value')
      .in('category_id', ['iem', 'headphone'])
      .range(offset, offset + BATCH - 1);

    if (error) {
      log('LOAD', `Error at offset ${offset}: ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;
    allProducts.push(...(data as Product[]));
    offset += BATCH;
    if (data.length < BATCH) break;
  }

  log('LOAD', `Loaded ${allProducts.length} products`);

  // Step 2: Group by normalized name + brand + category
  log('GROUP', 'Grouping products by identity...');
  const groups = new Map<string, Product[]>();

  for (const p of allProducts) {
    const normalized = normalizeName(p.name);
    const brandKey = (p.brand ?? 'unknown').toLowerCase().trim();
    const key = `${p.category_id}|${brandKey}|${normalized}`;

    const group = groups.get(key);
    if (group) {
      group.push(p);
    } else {
      groups.set(key, [p]);
    }
  }

  // Filter to only groups with duplicates
  const dupGroups = [...groups.entries()].filter(([, products]) => products.length > 1);
  log('GROUP', `Found ${dupGroups.length} duplicate groups (${dupGroups.reduce((s, [, p]) => s + p.length, 0)} total products)`);

  if (dupGroups.length === 0) {
    log('DONE', 'No duplicates found.');
    return;
  }

  const limit = DEV_MODE ? Math.min(50, dupGroups.length) : dupGroups.length;
  let totalMerged = 0;
  let totalDeleted = 0;
  let totalListingsRepointed = 0;
  let totalBuildItemsRepointed = 0;
  let errors = 0;

  // Step 3: Process each duplicate group
  for (let i = 0; i < limit; i++) {
    const [key, products] = dupGroups[i];

    // Rank products and pick the best as canonical
    products.sort((a, b) => rankProduct(b) - rankProduct(a));
    const winner = products[0];
    const losers = products.slice(1);

    if ((i + 1) % 100 === 0 || i === 0) {
      log('DEDUP', `Processing group ${i + 1}/${limit}: "${winner.name}" (${products.length} duplicates)`);
    }

    // Build update data by merging loser fields into winner where winner lacks them
    const updateData: Record<string, unknown> = {};

    for (const loser of losers) {
      // Copy PPI data if winner lacks it
      if (winner.ppi_score == null && loser.ppi_score != null) {
        updateData.ppi_score = loser.ppi_score;
        updateData.ppi_stdev = loser.ppi_stdev;
        updateData.ppi_slope = loser.ppi_slope;
        updateData.ppi_avg_error = loser.ppi_avg_error;
        updateData.source_domain = loser.source_domain;
        updateData.rig_type = loser.rig_type;
        updateData.pinna = loser.pinna;
        updateData.quality = loser.quality;
        updateData.source_type = 'merged';
        // Update winner reference for subsequent loser checks
        winner.ppi_score = loser.ppi_score;
      }

      // Copy price data if winner lacks it
      if (winner.price == null && loser.price != null) {
        updateData.price = loser.price;
        updateData.affiliate_url = loser.affiliate_url;
        updateData.in_stock = loser.in_stock;
        winner.price = loser.price;
      }

      // Copy image if winner lacks it
      if (!winner.image_url && loser.image_url) {
        updateData.image_url = loser.image_url;
        winner.image_url = loser.image_url;
      }

      // Copy headphone design if winner lacks it
      if (!winner.headphone_design && loser.headphone_design) {
        updateData.headphone_design = loser.headphone_design;
      }

      // Copy IEM type if winner lacks it
      if (!winner.iem_type && loser.iem_type) {
        updateData.iem_type = loser.iem_type;
      }

      // Copy driver type if winner lacks it
      if (!winner.driver_type && loser.driver_type) {
        updateData.driver_type = loser.driver_type;
      }

      // Copy source_id if winner lacks it (important for upsert identity)
      if (!winner.source_id && loser.source_id) {
        updateData.source_id = loser.source_id;
      }
    }

    if (DRY_RUN) {
      const loserNames = losers.map((l) => `"${l.name}" (${l.source_type}, ppi=${l.ppi_score}, price=${l.price})`).join(', ');
      log('DRY', `KEEP: "${winner.name}" (${winner.source_type}, ppi=${winner.ppi_score}, price=${winner.price}) | DELETE: ${loserNames}`);
      totalMerged++;
      totalDeleted += losers.length;
      continue;
    }

    try {
      const loserIds = losers.map((l) => l.id);

      // 4. Update winner with merged data
      if (Object.keys(updateData).length > 0) {
        updateData.updated_at = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('products')
          .update(updateData)
          .eq('id', winner.id);

        if (updateError) {
          log('ERROR', `Failed to update winner ${winner.id}: ${updateError.message}`);
          errors++;
          continue;
        }
      }

      // 5. Re-point price_listings from losers to winner
      const { data: repointed, error: repointError } = await supabase
        .from('price_listings')
        .update({ product_id: winner.id })
        .in('product_id', loserIds)
        .select('id');

      if (repointError) {
        // Likely unique constraint violation -- some listings may already exist for winner
        // Try one-by-one approach
        let repointedCount = 0;
        for (const loserId of loserIds) {
          const { data: loserListings } = await supabase
            .from('price_listings')
            .select('id, retailer_id, external_id')
            .eq('product_id', loserId);

          if (loserListings) {
            for (const listing of loserListings) {
              // Check if winner already has a listing from this retailer+external_id
              const { data: existing } = await supabase
                .from('price_listings')
                .select('id')
                .eq('retailer_id', listing.retailer_id)
                .eq('external_id', listing.external_id)
                .single();

              if (existing) {
                // Already exists -- just delete the loser's listing
                await supabase.from('price_listings').delete().eq('id', listing.id);
              } else {
                // Re-point to winner
                await supabase
                  .from('price_listings')
                  .update({ product_id: winner.id })
                  .eq('id', listing.id);
                repointedCount++;
              }
            }
          }
        }
        totalListingsRepointed += repointedCount;
      } else {
        totalListingsRepointed += (repointed?.length ?? 0);
      }

      // 6. Re-point build_items from losers to winner
      const { data: buildRepointed } = await supabase
        .from('build_items')
        .update({ product_id: winner.id })
        .in('product_id', loserIds)
        .select('id');

      totalBuildItemsRepointed += (buildRepointed?.length ?? 0);

      // 7. Re-point store_products.canonical_product_id from losers to winner
      await supabase
        .from('store_products')
        .update({ canonical_product_id: winner.id })
        .in('canonical_product_id', loserIds);

      // 8. Delete product_matches referencing losers (to avoid FK violations)
      await supabase
        .from('product_matches')
        .delete()
        .in('product_id', loserIds);

      // 9. Delete loser products
      const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .in('id', loserIds);

      if (deleteError) {
        log('ERROR', `Failed to delete losers for "${winner.name}": ${deleteError.message}`);
        errors++;
        continue;
      }

      totalMerged++;
      totalDeleted += losers.length;
    } catch (err) {
      log('ERROR', `Exception processing "${winner.name}": ${err instanceof Error ? err.message : String(err)}`);
      errors++;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n=================================================================');
  console.log('  DEDUPLICATION COMPLETE');
  console.log('=================================================================');
  console.log(`  Duration:              ${elapsed}s`);
  console.log(`  Duplicate groups:      ${limit}`);
  console.log(`  Groups merged:         ${totalMerged}`);
  console.log(`  Products deleted:      ${totalDeleted}`);
  console.log(`  Listings re-pointed:   ${totalListingsRepointed}`);
  console.log(`  Build items re-pointed: ${totalBuildItemsRepointed}`);
  console.log(`  Errors:                ${errors}`);
  console.log(`  Mode:                  ${DEV_MODE ? 'DEV' : 'FULL'}${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log('=================================================================\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
