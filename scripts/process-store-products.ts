/**
 * process-store-products.ts
 *
 * Processes unprocessed store_products: extracts brand, deduplicates across stores,
 * creates/updates products and price_listings, denormalizes lowest price.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/process-store-products.ts [--dev]
 *
 * --dev: Limit to 100 unprocessed store_products per category.
 */

import { getSupabase, buildAffiliateUrl, getRetailers, type Retailer } from './config/retailers.ts';
import { extractBrand } from './brand-config.ts';
import { normalizeName, diceCoefficient, findBestMatch, buildCandidateIndex, findBestMatchIndexed, type IndexedCandidate } from './scrapers/matcher.ts';

const DEV_MODE = process.argv.includes('--dev');
const DEV_LIMIT_PER_CATEGORY = 100;
const BATCH_SIZE = 1000;
const UPSERT_BATCH_SIZE = 100;

// Match thresholds for store product dedup
const MERGE_THRESHOLD = 0.85;
const REVIEW_THRESHOLD = 0.65;

type StoreProduct = {
  id: string;
  retailer_id: string;
  external_id: string;
  title: string;
  vendor: string | null;
  product_type: string | null;
  tags: string[];
  category_id: string | null;
  price: number | null;
  in_stock: boolean;
  image_url: string | null;
  product_url: string | null;
  affiliate_url: string | null;
};

type ExistingProduct = {
  id: string;
  name: string;
  brand: string | null;
  category_id: string;
};

type Stats = {
  merged: number;
  created: number;
  pendingReview: number;
  skipped: number;
  errors: number;
  listingsCreated: number;
};

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function log(phase: string, msg: string): void {
  console.log(`[${timestamp()}] [${phase}] ${msg}`);
}

function logError(phase: string, msg: string, err: unknown): void {
  const detail = err instanceof Error ? err.message
    : (err && typeof err === 'object' && 'message' in err) ? String((err as { message: string }).message)
    : String(err);
  console.error(`[${timestamp()}] [${phase}] ERROR: ${msg} — ${detail}`);
}

/**
 * Load unprocessed store_products, optionally limited by --dev flag.
 */
async function loadUnprocessed(): Promise<StoreProduct[]> {
  const supabase = getSupabase();
  const all: StoreProduct[] = [];
  let offset = 0;

  log('LOAD', 'Loading unprocessed store_products...');

  while (true) {
    let query = supabase
      .from('store_products')
      .select('id, retailer_id, external_id, title, vendor, product_type, tags, category_id, price, in_stock, image_url, product_url, affiliate_url')
      .eq('processed', false)
      .not('category_id', 'is', null)
      .range(offset, offset + BATCH_SIZE - 1);

    const { data, error } = await query;

    if (error) {
      logError('LOAD', `Failed at offset ${offset}`, error);
      break;
    }

    const batch = (data ?? []) as StoreProduct[];
    if (batch.length === 0) break;

    all.push(...batch);
    offset += BATCH_SIZE;
    if (batch.length < BATCH_SIZE) break;
  }

  log('LOAD', `Loaded ${all.length} unprocessed store_products`);

  if (DEV_MODE && all.length > 0) {
    // Group by category and take first DEV_LIMIT per category
    const byCategory = new Map<string, StoreProduct[]>();
    for (const sp of all) {
      const cat = sp.category_id!;
      const group = byCategory.get(cat);
      if (group) {
        group.push(sp);
      } else {
        byCategory.set(cat, [sp]);
      }
    }

    const limited: StoreProduct[] = [];
    for (const [cat, products] of byCategory) {
      limited.push(...products.slice(0, DEV_LIMIT_PER_CATEGORY));
      log('LOAD', `  DEV: ${cat}: ${Math.min(products.length, DEV_LIMIT_PER_CATEGORY)}/${products.length}`);
    }

    log('LOAD', `DEV mode: limited to ${limited.length} store_products`);
    return limited;
  }

  return all;
}

/**
 * Load existing products grouped by category for matching.
 */
async function loadExistingProducts(): Promise<Map<string, ExistingProduct[]>> {
  const supabase = getSupabase();
  const all: ExistingProduct[] = [];
  let offset = 0;

  log('LOAD', 'Loading existing products for dedup matching...');

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, brand, category_id')
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      logError('LOAD', `Failed at offset ${offset}`, error);
      break;
    }

    const batch = (data ?? []) as ExistingProduct[];
    if (batch.length === 0) break;

    all.push(...batch);
    offset += BATCH_SIZE;
    if (batch.length < BATCH_SIZE) break;
  }

  const byCategory = new Map<string, ExistingProduct[]>();
  for (const p of all) {
    const group = byCategory.get(p.category_id);
    if (group) {
      group.push(p);
    } else {
      byCategory.set(p.category_id, [p]);
    }
  }

  log('LOAD', `Loaded ${all.length} existing products across ${byCategory.size} categories`);
  return byCategory;
}

/**
 * Extract brand from a store product, preferring vendor field.
 */
function extractStoreBrand(sp: StoreProduct): string | null {
  // Prefer Shopify vendor field
  if (sp.vendor && sp.vendor.trim().length > 0) {
    // Cross-check with known brands
    const fromVendor = extractBrand(sp.vendor.trim());
    if (fromVendor) return fromVendor;
  }

  // Fall back to title-based extraction
  return extractBrand(sp.title);
}

async function processStoreProducts(
  storeProducts: StoreProduct[],
  existingByCategory: Map<string, ExistingProduct[]>,
  retailerMap: Map<string, Retailer>
): Promise<Stats> {
  const supabase = getSupabase();
  const stats: Stats = {
    merged: 0,
    created: 0,
    pendingReview: 0,
    skipped: 0,
    errors: 0,
    listingsCreated: 0,
  };

  const listingRows: Record<string, unknown>[] = [];
  const matchRows: Record<string, unknown>[] = [];

  // Batch updates for store_products: collect IDs to update in bulk
  const spUpdateWithCanonical: { id: string; canonicalProductId: string }[] = [];
  const spUpdateProcessedOnly: string[] = [];

  // Pre-build candidate indices per category for O(1) lookup
  log('PROCESS', 'Building candidate indices...');
  const categoryIndices = new Map<string, IndexedCandidate[]>();
  const brandIndices = new Map<string, Map<string, IndexedCandidate[]>>();

  for (const [catId, products] of existingByCategory) {
    const candidates = products.map((c) => ({ name: c.name, id: c.id }));
    categoryIndices.set(catId, buildCandidateIndex(candidates));

    // Build brand-scoped sub-indices
    const byBrand = new Map<string, { name: string; id: string }[]>();
    for (const p of products) {
      if (p.brand) {
        const brandKey = p.brand.toLowerCase();
        const list = byBrand.get(brandKey);
        if (list) list.push({ name: p.name, id: p.id });
        else byBrand.set(brandKey, [{ name: p.name, id: p.id }]);
      }
    }
    const brandIndexMap = new Map<string, IndexedCandidate[]>();
    for (const [brandKey, candidates] of byBrand) {
      brandIndexMap.set(brandKey, buildCandidateIndex(candidates));
    }
    brandIndices.set(catId, brandIndexMap);
  }
  log('PROCESS', `Built indices for ${categoryIndices.size} categories`);

  for (let i = 0; i < storeProducts.length; i++) {
    const sp = storeProducts[i];
    const categoryId = sp.category_id!;

    if ((i + 1) % 100 === 0 || i === 0) {
      log('PROCESS', `Processing ${i + 1}/${storeProducts.length}: "${sp.title}"`);
    }

    try {
      const brand = extractStoreBrand(sp);
      const retailer = retailerMap.get(sp.retailer_id);

      // Use pre-built indices for matching
      const brandKey = brand?.toLowerCase();
      const brandIndex = brandKey ? brandIndices.get(categoryId)?.get(brandKey) : undefined;
      const categoryIndex = categoryIndices.get(categoryId);

      const candidateIndex = (brandIndex && brandIndex.length > 0) ? brandIndex : categoryIndex;

      const match = (candidateIndex && candidateIndex.length > 0)
        ? findBestMatchIndexed(sp.title, candidateIndex)
        : null;

      let canonicalProductId: string | null = null;

      if (match && match.score >= MERGE_THRESHOLD) {
        canonicalProductId = match.id;
        stats.merged++;
      } else if (match && match.score >= REVIEW_THRESHOLD) {
        matchRows.push({
          product_id: match.id,
          retailer_id: sp.retailer_id,
          external_id: sp.external_id,
          external_name: sp.title,
          external_price: sp.price,
          match_score: match.score,
          status: 'pending',
        });
        stats.pendingReview++;
      } else {
        const { data: newProduct, error: insertError } = await supabase
          .from('products')
          .insert({
            source_id: `store:${sp.retailer_id}:${sp.external_id}`,
            category_id: categoryId,
            name: sp.title,
            brand,
            price: sp.price,
            image_url: sp.image_url,
            affiliate_url: sp.affiliate_url ?? sp.product_url,
            source_type: 'store',
            in_stock: sp.in_stock,
          })
          .select('id')
          .single();

        if (insertError) {
          if (insertError.code === '23505') {
            const { data: existing } = await supabase
              .from('products')
              .select('id')
              .eq('source_id', `store:${sp.retailer_id}:${sp.external_id}`)
              .single();

            if (existing) {
              canonicalProductId = existing.id;
              stats.merged++;
            } else {
              stats.errors++;
              continue;
            }
          } else {
            logError('PROCESS', `Insert product "${sp.title}"`, insertError);
            stats.errors++;
            continue;
          }
        } else if (newProduct) {
          canonicalProductId = newProduct.id;
          stats.created++;

          // Add to existing products map and rebuild index entry
          const existingList = existingByCategory.get(categoryId);
          const newEntry = { id: newProduct.id, name: sp.title, brand, category_id: categoryId };
          if (existingList) {
            existingList.push(newEntry);
          } else {
            existingByCategory.set(categoryId, [newEntry]);
          }
          // Add to category index
          const idx = categoryIndices.get(categoryId);
          if (idx) {
            const [newIndexed] = buildCandidateIndex([{ name: sp.title, id: newProduct.id }]);
            idx.push(newIndexed);
          }
          // Add to brand index
          if (brandKey) {
            let brandMap = brandIndices.get(categoryId);
            if (!brandMap) {
              brandMap = new Map();
              brandIndices.set(categoryId, brandMap);
            }
            const bIdx = brandMap.get(brandKey);
            const [newIndexed] = buildCandidateIndex([{ name: sp.title, id: newProduct.id }]);
            if (bIdx) bIdx.push(newIndexed);
            else brandMap.set(brandKey, [newIndexed]);
          }
        }
      }

      // Collect for batch update instead of individual DB calls
      if (canonicalProductId) {
        listingRows.push({
          product_id: canonicalProductId,
          retailer_id: sp.retailer_id,
          external_id: sp.external_id,
          price: sp.price,
          currency: 'USD',
          in_stock: sp.in_stock,
          product_url: sp.product_url,
          affiliate_url: sp.affiliate_url ?? sp.product_url,
          image_url: sp.image_url,
          last_checked: new Date().toISOString(),
        });
        stats.listingsCreated++;
        spUpdateWithCanonical.push({ id: sp.id, canonicalProductId });
      } else {
        spUpdateProcessedOnly.push(sp.id);
      }
    } catch (err) {
      logError('PROCESS', `Exception processing "${sp.title}"`, err);
      stats.errors++;
    }
  }

  // Batch mark all store_products as processed
  const allProcessedIds = [...spUpdateProcessedOnly, ...spUpdateWithCanonical.map((u) => u.id)];
  if (allProcessedIds.length > 0) {
    log('BATCH', `Marking ${allProcessedIds.length} store_products as processed...`);
    for (let i = 0; i < allProcessedIds.length; i += UPSERT_BATCH_SIZE) {
      const batch = allProcessedIds.slice(i, i + UPSERT_BATCH_SIZE);
      await supabase.from('store_products').update({ processed: true }).in('id', batch);
    }
  }

  // Update canonical_product_id in parallel chunks
  if (spUpdateWithCanonical.length > 0) {
    log('BATCH', `Linking ${spUpdateWithCanonical.length} store_products to canonical products...`);
    const LINK_CONCURRENCY = 25;
    for (let i = 0; i < spUpdateWithCanonical.length; i += LINK_CONCURRENCY) {
      const chunk = spUpdateWithCanonical.slice(i, i + LINK_CONCURRENCY);
      await Promise.all(
        chunk.map((u) =>
          supabase.from('store_products')
            .update({ canonical_product_id: u.canonicalProductId })
            .eq('id', u.id)
        )
      );
    }
  }

  // Deduplicate price_listings by (product_id, retailer_id), keeping the cheapest
  const dedupedListings = (() => {
    const map = new Map<string, typeof listingRows[0]>();
    for (const row of listingRows) {
      const key = `${row.product_id}::${row.retailer_id}`;
      const existing = map.get(key);
      if (!existing || (row.price !== null && (existing.price === null || row.price < existing.price))) {
        map.set(key, row);
      }
    }
    return [...map.values()];
  })();

  // Batch upsert price_listings
  if (dedupedListings.length > 0) {
    log('UPSERT', `Upserting ${dedupedListings.length} price_listings (deduped from ${listingRows.length})...`);
    for (let i = 0; i < dedupedListings.length; i += UPSERT_BATCH_SIZE) {
      const batch = dedupedListings.slice(i, i + UPSERT_BATCH_SIZE);
      const { error } = await supabase
        .from('price_listings')
        .upsert(batch, { onConflict: 'product_id,retailer_id' });

      if (error) {
        logError('UPSERT', 'price_listings batch', error);
      }
    }
  }

  // Deduplicate product_matches by (product_id, retailer_id)
  const dedupedMatches = (() => {
    const map = new Map<string, typeof matchRows[0]>();
    for (const row of matchRows) {
      const key = `${row.product_id}::${row.retailer_id}`;
      if (!map.has(key)) map.set(key, row);
    }
    return [...map.values()];
  })();

  // Batch upsert product_matches for pending reviews
  if (dedupedMatches.length > 0) {
    log('UPSERT', `Upserting ${dedupedMatches.length} product_matches (deduped from ${matchRows.length})...`);
    for (let i = 0; i < dedupedMatches.length; i += UPSERT_BATCH_SIZE) {
      const batch = dedupedMatches.slice(i, i + UPSERT_BATCH_SIZE);
      const { error } = await supabase
        .from('product_matches')
        .upsert(batch, { onConflict: 'product_id,retailer_id' });

      if (error) {
        logError('UPSERT', 'product_matches batch', error);
      }
    }
  }

  return stats;
}

/**
 * Denormalize lowest in-stock price onto products table.
 * Reuses logic from sync-prices.ts Phase D.
 */
async function denormalizeLowestPrices(): Promise<number> {
  const supabase = getSupabase();
  const PAGE_SIZE = 1000;

  log('DENORM', 'Finding lowest in-stock price per product...');

  const listings: { product_id: string; price: number; affiliate_url: string | null; product_url: string | null }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('price_listings')
      .select('product_id, price, affiliate_url, product_url')
      .eq('in_stock', true)
      .order('price', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      logError('DENORM', 'Failed to fetch price_listings', error);
      return 0;
    }

    if (!data || data.length === 0) break;
    listings.push(...data);
    offset += data.length;
    if (data.length < PAGE_SIZE) break;
  }

  if (listings.length === 0) {
    log('DENORM', 'No in-stock listings found.');
    return 0;
  }

  log('DENORM', `Fetched ${listings.length} in-stock listings`);

  // Group by product_id, keep lowest price
  const lowestByProduct = new Map<string, { price: number; affiliate_url: string | null }>();
  for (const listing of listings) {
    const existing = lowestByProduct.get(listing.product_id);
    if (!existing || listing.price < existing.price) {
      lowestByProduct.set(listing.product_id, {
        price: listing.price,
        affiliate_url: listing.affiliate_url ?? listing.product_url,
      });
    }
  }

  log('DENORM', `Updating ${lowestByProduct.size} products with lowest prices...`);

  let updatedCount = 0;
  const entries = Array.from(lowestByProduct.entries());
  const DENORM_CONCURRENCY = 25;

  for (let i = 0; i < entries.length; i += DENORM_CONCURRENCY) {
    const chunk = entries.slice(i, i + DENORM_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(([productId, info]) =>
        supabase
          .from('products')
          .update({ price: info.price, affiliate_url: info.affiliate_url, in_stock: true })
          .eq('id', productId)
      )
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].error) {
        logError('DENORM', `Failed to update product ${chunk[j][0]}`, results[j].error);
      } else {
        updatedCount++;
      }
    }
  }

  log('DENORM', `Updated ${updatedCount} products`);
  return updatedCount;
}

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log('=================================================================');
  console.log('  AudioList Store Product Processor');
  console.log(`  Mode: ${DEV_MODE ? 'DEV (100 per category)' : 'FULL'}`);
  console.log(`  Started at ${new Date().toISOString()}`);
  console.log('=================================================================\n');

  // Load retailers
  const retailers = await getRetailers();
  const retailerMap = new Map(retailers.map((r) => [r.id, r]));

  // Load unprocessed store products
  const storeProducts = await loadUnprocessed();
  if (storeProducts.length === 0) {
    log('DONE', 'No unprocessed store products. Nothing to do.');
    return;
  }

  // Load existing products for dedup
  const existingByCategory = await loadExistingProducts();

  // Process
  log('PROCESS', `Processing ${storeProducts.length} store products...`);
  const stats = await processStoreProducts(storeProducts, existingByCategory, retailerMap);

  // Denormalize prices
  console.log('\n--- Denormalize Lowest Prices ---\n');
  const denormalized = await denormalizeLowestPrices();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n=================================================================');
  console.log('  PROCESSING COMPLETE');
  console.log('=================================================================');
  console.log(`  Duration:           ${elapsed}s`);
  console.log(`  Store products:     ${storeProducts.length}`);
  console.log(`  Merged (existing):  ${stats.merged}`);
  console.log(`  Created (new):      ${stats.created}`);
  console.log(`  Pending review:     ${stats.pendingReview}`);
  console.log(`  Skipped:            ${stats.skipped}`);
  console.log(`  Errors:             ${stats.errors}`);
  console.log(`  Listings created:   ${stats.listingsCreated}`);
  console.log(`  Prices denormalized: ${denormalized}`);
  console.log('=================================================================\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
