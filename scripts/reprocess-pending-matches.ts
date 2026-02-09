/**
 * reprocess-pending-matches.ts
 *
 * Re-evaluates pending product_matches using the improved matcher
 * (with pipe-stripping). Auto-approves matches above the threshold,
 * creating price_listings and linking store_products.
 *
 * Usage: npx tsx scripts/reprocess-pending-matches.ts [--dev] [--threshold 0.78]
 */

import { getSupabase } from './config/retailers.ts';
import {
  normalizeName,
  buildCandidateIndex,
  findBestMatchIndexed,
  extractHeadphoneDesign,
  brandsSimilar,
} from './scrapers/matcher.ts';
import { extractBrand } from './brand-config.ts';

const BATCH = 1000;
const UPSERT_BATCH = 100;

// Auto-approve threshold for reprocessed matches.
// Aligned with the new MATCH_THRESHOLDS.AUTO_APPROVE (0.85).
const DEFAULT_THRESHOLD = 0.85;

interface PendingMatch {
  id: string;
  product_id: string;
  retailer_id: string;
  external_id: string;
  external_name: string;
  external_price: number | null;
  match_score: number;
  status: string;
}

async function main() {
  const devMode = process.argv.includes('--dev');
  const thresholdIdx = process.argv.indexOf('--threshold');
  const threshold = thresholdIdx !== -1 ? parseFloat(process.argv[thresholdIdx + 1]) : DEFAULT_THRESHOLD;

  const supabase = getSupabase();

  console.log('=================================================================');
  console.log('  Re-process Pending Product Matches');
  console.log(`  Mode: ${devMode ? 'DEV' : 'FULL'}`);
  console.log(`  Auto-approve threshold: ${threshold}`);
  console.log('=================================================================\n');

  // Step 1: Load all pending matches
  const pending: PendingMatch[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('product_matches')
      .select('id, product_id, retailer_id, external_id, external_name, external_price, match_score, status')
      .eq('status', 'pending')
      .range(offset, offset + BATCH - 1);

    if (error) {
      console.error('Error loading pending matches:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    pending.push(...(data as PendingMatch[]));
    offset += BATCH;
    if (data.length < BATCH) break;
  }

  console.log(`Loaded ${pending.length} pending matches`);
  if (pending.length === 0) return;

  // Step 2: Load existing products for re-matching (include brand for brand-aware scoring)
  const productsByCategory = new Map<string, { id: string; name: string; category_id: string; brand: string | null }[]>();
  let pOffset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, category_id, brand')
      .range(pOffset, pOffset + BATCH - 1);

    if (error) {
      console.error('Error loading products:', error.message);
      break;
    }
    if (!data || data.length === 0) break;

    for (const p of data) {
      const cat = p.category_id as string;
      const list = productsByCategory.get(cat);
      if (list) list.push(p as any);
      else productsByCategory.set(cat, [p as any]);
    }

    pOffset += BATCH;
    if (data.length < BATCH) break;
  }

  console.log(`Loaded products across ${productsByCategory.size} categories`);

  // Build candidate indices (include brand for brand-aware matching)
  const indices = new Map<string, ReturnType<typeof buildCandidateIndex>>();
  for (const [cat, prods] of productsByCategory) {
    indices.set(cat, buildCandidateIndex(prods.map((p) => ({ name: p.name, id: p.id, brand: p.brand }))));
  }

  // Step 3: Re-score pending matches with the improved normalization
  let autoApproved = 0;
  let unchanged = 0;
  let scoreImproved = 0;
  const listingRows: Record<string, unknown>[] = [];
  const approvedIds: string[] = [];
  const designUpdates: { id: string; design: string }[] = [];

  // Group pending matches. Look up the product to find its category
  const productIdToCategory = new Map<string, string>();
  for (const [cat, prods] of productsByCategory) {
    for (const p of prods) {
      productIdToCategory.set(p.id, cat);
    }
  }

  const limit = devMode ? Math.min(500, pending.length) : pending.length;

  for (let i = 0; i < limit; i++) {
    const pm = pending[i];
    const category = productIdToCategory.get(pm.product_id);
    if (!category) {
      unchanged++;
      continue;
    }

    const index = indices.get(category);
    if (!index) {
      unchanged++;
      continue;
    }

    // Re-score with brand-aware matching
    const externalBrand = extractBrand(pm.external_name);
    const match = findBestMatchIndexed(pm.external_name, index, { productBrand: externalBrand });

    if (match && match.id === pm.product_id && match.score >= threshold) {
      // Brand compatibility check: reject if brands are completely different
      const matchedProduct = productsByCategory.get(category)?.find(p => p.id === match.id);
      if (matchedProduct?.brand && externalBrand) {
        const brandRel = brandsSimilar(matchedProduct.brand, externalBrand);
        if (brandRel === 'different') {
          unchanged++;
          continue;
        }
      }

      // Same product matched with improved score -- auto-approve
      autoApproved++;
      approvedIds.push(pm.id);

      // Extract headphone design from the external name
      if (category === 'headphone') {
        const design = extractHeadphoneDesign(pm.external_name);
        if (design) {
          designUpdates.push({ id: pm.product_id, design });
        }
      }

      // Create a price listing
      listingRows.push({
        product_id: pm.product_id,
        retailer_id: pm.retailer_id,
        external_id: pm.external_id,
        price: pm.external_price,
        currency: 'USD',
        in_stock: true,
        product_url: null, // We don't have the URL in product_matches
        affiliate_url: null,
        last_checked: new Date().toISOString(),
      });

      if (match.score > pm.match_score) scoreImproved++;
    } else if (match && match.score > pm.match_score) {
      // Score improved but maybe different product or below threshold
      scoreImproved++;
      unchanged++;
    } else {
      unchanged++;
    }

    if ((i + 1) % 500 === 0) {
      console.log(`  Processed ${i + 1}/${limit}... (${autoApproved} auto-approved so far)`);
    }
  }

  console.log(`\nRe-scoring results:`);
  console.log(`  Auto-approved: ${autoApproved}`);
  console.log(`  Scores improved (but not approved): ${scoreImproved - autoApproved}`);
  console.log(`  Unchanged: ${unchanged}`);

  // Step 4: Look up store_products to get URLs for the approved matches
  if (approvedIds.length > 0) {
    console.log('\nLooking up store_product URLs for approved matches...');

    // Get the approved match details
    const approvedMatches = pending.filter((pm) => approvedIds.includes(pm.id));

    // Build a lookup from (retailer_id, external_id) to store_product URLs
    for (let i = 0; i < approvedMatches.length; i += UPSERT_BATCH) {
      const batch = approvedMatches.slice(i, i + UPSERT_BATCH);
      const externalIds = batch.map((m) => m.external_id);

      const { data: storeProds } = await supabase
        .from('store_products')
        .select('external_id, retailer_id, product_url, affiliate_url, image_url, in_stock')
        .in('external_id', externalIds);

      if (storeProds) {
        for (const sp of storeProds) {
          // Find the matching listing row
          const listing = listingRows.find(
            (lr) => lr.external_id === sp.external_id && lr.retailer_id === sp.retailer_id
          );
          if (listing) {
            listing.product_url = sp.product_url;
            listing.affiliate_url = sp.affiliate_url ?? sp.product_url;
            listing.image_url = sp.image_url;
            listing.in_stock = sp.in_stock;
          }
        }
      }
    }
  }

  // Step 5: Apply changes
  // 5a: Upsert price_listings (filter out null prices and deduplicate by retailer_id+external_id)
  const validListings = listingRows.filter((lr) => lr.price != null);
  const dedupedListings = (() => {
    const seen = new Map<string, typeof listingRows[0]>();
    for (const row of validListings) {
      const key = `${row.retailer_id}|${row.external_id}`;
      if (!seen.has(key)) seen.set(key, row);
    }
    return [...seen.values()];
  })();

  if (validListings.length < listingRows.length) {
    console.log(`  Filtered out ${listingRows.length - validListings.length} listings with null price`);
  }
  if (dedupedListings.length < validListings.length) {
    console.log(`  Deduplicated ${validListings.length} → ${dedupedListings.length} listings`);
  }

  if (dedupedListings.length > 0) {
    console.log(`\nUpserting ${dedupedListings.length} price_listings...`);
    for (let i = 0; i < dedupedListings.length; i += UPSERT_BATCH) {
      const batch = dedupedListings.slice(i, i + UPSERT_BATCH);
      const { error } = await supabase
        .from('price_listings')
        .upsert(batch, { onConflict: 'retailer_id,external_id' });

      if (error) {
        console.error(`  Error upserting batch ${i}: ${error.message}`);
      }
    }
  }

  // 5b: Mark approved matches as 'approved'
  if (approvedIds.length > 0) {
    console.log(`Marking ${approvedIds.length} matches as approved...`);
    for (let i = 0; i < approvedIds.length; i += UPSERT_BATCH) {
      const batch = approvedIds.slice(i, i + UPSERT_BATCH);
      const { error } = await supabase
        .from('product_matches')
        .update({ status: 'approved' })
        .in('id', batch);

      if (error) {
        console.error(`  Error updating status batch ${i}: ${error.message}`);
      }
    }
  }

  // 5c: Update headphone_design for products where we found it
  if (designUpdates.length > 0) {
    const seen = new Set<string>();
    const deduped = designUpdates.filter((u) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });

    console.log(`Updating headphone_design for ${deduped.length} products...`);
    const openIds = deduped.filter((u) => u.design === 'open').map((u) => u.id);
    const closedIds = deduped.filter((u) => u.design === 'closed').map((u) => u.id);

    if (openIds.length > 0) {
      for (let i = 0; i < openIds.length; i += UPSERT_BATCH) {
        await supabase.from('products').update({ headphone_design: 'open' }).in('id', openIds.slice(i, i + UPSERT_BATCH));
      }
    }
    if (closedIds.length > 0) {
      for (let i = 0; i < closedIds.length; i += UPSERT_BATCH) {
        await supabase.from('products').update({ headphone_design: 'closed' }).in('id', closedIds.slice(i, i + UPSERT_BATCH));
      }
    }
  }

  // Step 6: Denormalize lowest prices for approved products
  if (autoApproved > 0) {
    console.log('\nDenormalizing lowest prices for approved products...');
    const approvedProductIds = [...new Set(pending.filter((pm) => approvedIds.includes(pm.id)).map((pm) => pm.product_id))];

    for (const productId of approvedProductIds) {
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

  console.log(`\n=================================================================`);
  console.log('  REPROCESSING COMPLETE');
  console.log(`  Pending matches processed: ${limit}`);
  console.log(`  Auto-approved: ${autoApproved}`);
  console.log(`  Price listings created: ${listingRows.length}`);
  console.log(`  Design types extracted: ${designUpdates.length}`);
  console.log('=================================================================\n');
}

main().catch(console.error);
