/**
 * sync-stores-core.ts
 *
 * Shared sync logic extracted from sync-stores.ts.
 * Parameterized by category filter for category-specific pipelines.
 */

import { getSupabase, getRetailers, buildAffiliateUrl, type Retailer } from '../config/retailers.ts';
import { fetchShopifyCollection, type ShopifyProduct } from '../scrapers/shopify.ts';
import { normalizeName } from '../scrapers/matcher.ts';
import { STORE_COLLECTIONS, type CategoryId, type CollectionMapping } from '../config/store-collections.ts';
import { log, logError, delay } from './log.ts';

const UPSERT_BATCH_SIZE = 100;
const COLLECTION_DELAY_MS = 400;
const STORE_CONCURRENCY = 3;

type RetailerProductUpsertRow = {
  id: string;
  retailer_id: string;
  external_id: string;
  canonical_device_id: string | null;
  price: number | null;
  compare_at_price: number | null;
  on_sale: boolean;
  in_stock: boolean;
  product_url: string | null;
  affiliate_url: string | null;
  image_url: string | null;
};

async function upsertDeviceOffersFromRetailerProducts(
  retailerProductRows: RetailerProductUpsertRow[],
  nowIso: string,
  label: string,
): Promise<void> {
  const offerRows = retailerProductRows
    .filter((rp) => rp.canonical_device_id && rp.price != null)
    .map((rp) => ({
      device_id: rp.canonical_device_id,
      retailer_product_id: rp.id,
      retailer_id: rp.retailer_id,
      external_id: rp.external_id,
      price: rp.price,
      compare_at_price: rp.compare_at_price,
      on_sale: rp.on_sale || (rp.compare_at_price != null && rp.price != null && rp.compare_at_price > rp.price),
      currency: 'USD',
      in_stock: rp.in_stock,
      product_url: rp.product_url,
      affiliate_url: rp.affiliate_url ?? rp.product_url,
      image_url: rp.image_url,
      last_checked: nowIso,
    }));

  if (offerRows.length === 0) return;

  const supabase = getSupabase();
  const { error } = await supabase
    .from('device_offers')
    .upsert(offerRows, { onConflict: 'retailer_id,external_id' });

  if (error) {
    logError('OFFERS', `device_offers upsert failed (${label})`, error);
  }
}

export interface SyncStoresOptions {
  categoryFilter: Set<CategoryId> | null;
  devMode: boolean;
  label: string;
}

function extractPrice(product: ShopifyProduct): {
  price: number | null;
  compareAtPrice: number | null;
  inStock: boolean;
} {
  if (!product.variants || product.variants.length === 0) {
    return { price: null, compareAtPrice: null, inStock: false };
  }

  let lowestAvailable: number | null = null;
  let lowestAny: number | null = null;
  let hasAvailable = false;
  let bestCompareAt: number | null = null;

  for (const v of product.variants) {
    const p = parseFloat(v.price);
    if (isNaN(p) || p <= 0) continue;

    if (lowestAny === null || p < lowestAny) lowestAny = p;

    if (v.available) {
      hasAvailable = true;
      if (lowestAvailable === null || p < lowestAvailable) {
        lowestAvailable = p;
        // Use compare_at_price from the cheapest available variant
        if (v.compare_at_price) {
          const cap = parseFloat(v.compare_at_price);
          if (!isNaN(cap) && cap > 0) bestCompareAt = cap;
        }
      }
    }
  }

  // If no available variant had compare_at_price, check cheapest overall
  if (bestCompareAt === null) {
    for (const v of product.variants) {
      if (v.compare_at_price) {
        const cap = parseFloat(v.compare_at_price);
        if (!isNaN(cap) && cap > 0 && (bestCompareAt === null || cap > bestCompareAt)) {
          bestCompareAt = cap;
        }
      }
    }
  }

  const finalPrice = lowestAvailable ?? lowestAny;
  // Only keep compare_at_price if it's actually higher than the sale price
  const validCompareAt = bestCompareAt !== null && finalPrice !== null && bestCompareAt > finalPrice
    ? bestCompareAt
    : null;

  return {
    price: finalPrice,
    compareAtPrice: validCompareAt,
    inStock: hasAvailable,
  };
}

async function upsertStoreProducts(
  rows: Record<string, unknown>[],
  domain: string
): Promise<number> {
  if (rows.length === 0) return 0;

  const supabase = getSupabase();
  let successCount = 0;

  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('retailer_products')
        .upsert(batch, { onConflict: 'retailer_id,external_id' })
        .select('id, retailer_id, external_id, canonical_device_id, price, compare_at_price, on_sale, in_stock, product_url, affiliate_url, image_url');

      if (error) {
        logError('UPSERT', `Batch ${Math.floor(i / UPSERT_BATCH_SIZE) + 1} for ${domain}`, error);
      } else {
        successCount += batch.length;
        await upsertDeviceOffersFromRetailerProducts(
          (data ?? []) as RetailerProductUpsertRow[],
          nowIso,
          `${domain}:batch-${Math.floor(i / UPSERT_BATCH_SIZE) + 1}`,
        );
      }
    } catch (err) {
      logError('UPSERT', `Batch exception for ${domain}`, err);
    }
  }

  return successCount;
}

async function syncShopifyStore(
  domain: string,
  retailer: Retailer,
  collections: CollectionMapping[],
  devMode: boolean
): Promise<{ fetched: number; upserted: number }> {
  let totalFetched = 0;
  let totalUpserted = 0;
  const DEV_LIMIT = 100;

  for (const mapping of collections) {
    const maxPages = devMode ? 1 : 100;
    const limit = devMode ? DEV_LIMIT : 250;

    const products = await fetchShopifyCollection(domain, mapping.handle, {
      maxPages,
      limit,
    });

    totalFetched += products.length;

    const rows = products.map((p) => {
      const { price, compareAtPrice, inStock } = extractPrice(p);
      const productUrl = `https://${domain}/products/${p.handle}`;
      const affiliateUrl = buildAffiliateUrl(
        retailer,
        productUrl,
        p.handle,
        String(p.id)
      );

      const now = new Date().toISOString();

      return {
        retailer_id: retailer.id,
        external_id: p.handle,
        title: p.title,
        normalized_title: normalizeName(p.title),
        vendor: p.vendor || null,
        product_type: p.product_type || null,
        tags: p.tags || [],
        source_category_id: mapping.categoryId,
        price,
        compare_at_price: compareAtPrice,
        on_sale: compareAtPrice !== null,
        in_stock: inStock,
        image_url: p.images?.[0]?.src ?? null,
        product_url: productUrl,
        affiliate_url: affiliateUrl ?? productUrl,
        raw_data: { handle: p.handle, shopify_id: p.id },
        imported_at: now,
        last_seen_at: now,
      };
    });

    const upserted = await upsertStoreProducts(rows, domain);
    totalUpserted += upserted;

    log('SYNC', `${domain}/${mapping.handle} (${mapping.categoryId}): ${products.length} fetched, ${upserted} upserted`);

    if (collections.indexOf(mapping) < collections.length - 1) {
      await delay(COLLECTION_DELAY_MS);
    }
  }

  return { fetched: totalFetched, upserted: totalUpserted };
}

/**
 * Sync deal/sale collections for a store.
 * Products in these collections get their on_sale flag set to true.
 * This does NOT create new store_products -- it only flags existing ones.
 */
async function syncDealCollections(
  domain: string,
  retailer: Retailer,
  dealCollections: string[],
  devMode: boolean
): Promise<number> {
  if (dealCollections.length === 0) return 0;

  const supabase = getSupabase();
  let totalFlagged = 0;
  const nowIso = new Date().toISOString();

  for (const handle of dealCollections) {
    const maxPages = devMode ? 1 : 100;
    const limit = devMode ? 100 : 250;

    const products = await fetchShopifyCollection(domain, handle, { maxPages, limit });

    if (products.length === 0) {
      log('DEALS', `${domain}/${handle}: empty collection, skipping`);
      continue;
    }

    // Extract handles of products in this deal collection
    const externalIds = products.map((p) => p.handle);

    // Batch update on_sale flag for matching store_products
    for (let i = 0; i < externalIds.length; i += UPSERT_BATCH_SIZE) {
      const batch = externalIds.slice(i, i + UPSERT_BATCH_SIZE);
      const { data, error } = await supabase
        .from('retailer_products')
        .update({ on_sale: true })
        .eq('retailer_id', retailer.id)
        .in('external_id', batch)
        .select('id, retailer_id, external_id, canonical_device_id, price, compare_at_price, on_sale, in_stock, product_url, affiliate_url, image_url');

      if (error) {
        logError('DEALS', `Error flagging on_sale for ${domain}/${handle}`, error);
      } else {
        totalFlagged += data?.length ?? 0;
        await upsertDeviceOffersFromRetailerProducts(
          (data ?? []) as RetailerProductUpsertRow[],
          nowIso,
          `${domain}:deals:${handle}`,
        );
      }
    }

    // Also update compare_at_price for products from deal collections
    // that might have sale pricing
    const saleRows = products
      .map((p) => {
        const { compareAtPrice } = extractPrice(p);
        return compareAtPrice ? { externalId: p.handle, compareAtPrice } : null;
      })
      .filter((r): r is { externalId: string; compareAtPrice: number } => r !== null);

    for (const row of saleRows) {
      const { data, error } = await supabase
        .from('retailer_products')
        .update({ compare_at_price: row.compareAtPrice, on_sale: true })
        .eq('retailer_id', retailer.id)
        .eq('external_id', row.externalId)
        .is('compare_at_price', null) // Don't overwrite if already set
        .select('id, retailer_id, external_id, canonical_device_id, price, compare_at_price, on_sale, in_stock, product_url, affiliate_url, image_url');

      if (error) {
        logError('DEALS', `Error setting compare_at_price for ${domain}/${handle}/${row.externalId}`, error);
      } else if (data && data.length > 0) {
        await upsertDeviceOffersFromRetailerProducts(
          data as RetailerProductUpsertRow[],
          nowIso,
          `${domain}:compare-at:${handle}`,
        );
      }
    }

    log('DEALS', `${domain}/${handle}: ${products.length} products, ${totalFlagged} flagged on_sale`);

    await delay(COLLECTION_DELAY_MS);
  }

  return totalFlagged;
}

export async function runSyncStores(options: SyncStoresOptions): Promise<void> {
  const startTime = Date.now();
  console.log('=================================================================');
  console.log(`  AudioList Store Sync — ${options.label}`);
  console.log(`  Mode: ${options.devMode ? 'DEV (100 per collection)' : 'FULL'}`);
  if (options.categoryFilter) {
    console.log(`  Categories: ${[...options.categoryFilter].join(', ')}`);
  }
  console.log(`  Started at ${new Date().toISOString()}`);
  console.log('=================================================================\n');

  log('INIT', 'Loading retailers...');
  const retailers = await getRetailers();
  const retailerMap = new Map(retailers.map((r) => [r.id, r]));
  log('INIT', `Loaded ${retailers.length} retailers`);

  const storeEntries = Object.entries(STORE_COLLECTIONS);
  let grandFetched = 0;
  let grandUpserted = 0;
  let storesProcessed = 0;

  // Build list of valid store jobs, filtering collections by category
  const storeJobs: { domain: string; retailer: Retailer; collections: CollectionMapping[] }[] = [];
  for (const [domain, config] of storeEntries) {
    const retailer = retailerMap.get(config.retailerId);
    if (!retailer) {
      log('SKIP', `No retailer found for "${config.retailerId}" (${domain}), skipping`);
      continue;
    }

    const filteredCollections = options.categoryFilter
      ? config.collections.filter((c) => options.categoryFilter!.has(c.categoryId))
      : config.collections;

    if (filteredCollections.length === 0) {
      log('SKIP', `${domain}: no matching collections for ${options.label}, skipping`);
      continue;
    }

    storeJobs.push({ domain, retailer, collections: filteredCollections });
  }

  log('INIT', `${storeJobs.length} stores with matching collections`);

  // Process stores in chunks of STORE_CONCURRENCY
  for (let i = 0; i < storeJobs.length; i += STORE_CONCURRENCY) {
    const chunk = storeJobs.slice(i, i + STORE_CONCURRENCY);
    log('STORE', `Processing stores ${i + 1}-${Math.min(i + STORE_CONCURRENCY, storeJobs.length)} of ${storeJobs.length} concurrently...`);

    const results = await Promise.all(
      chunk.map(async (job) => {
        log('STORE', `  Starting ${job.domain} (${job.collections.length} collections)...`);
        const result = await syncShopifyStore(job.domain, job.retailer, job.collections, options.devMode);
        log('STORE', `  ${job.domain} complete: ${result.fetched} fetched, ${result.upserted} upserted`);
        return result;
      })
    );

    for (const result of results) {
      grandFetched += result.fetched;
      grandUpserted += result.upserted;
      storesProcessed++;
    }
  }

  // -------------------------------------------------------------------------
  // Deal collection sync: flag on_sale for products in sale/deals collections
  // -------------------------------------------------------------------------
  let totalDealsFlagged = 0;
  const dealJobs: { domain: string; retailer: Retailer; dealCollections: string[] }[] = [];

  for (const [domain, config] of storeEntries) {
    if (!config.dealCollections || config.dealCollections.length === 0) continue;
    const retailer = retailerMap.get(config.retailerId);
    if (!retailer) continue;
    dealJobs.push({ domain, retailer, dealCollections: config.dealCollections });
  }

  if (dealJobs.length > 0) {
    log('DEALS', `Syncing deal collections from ${dealJobs.length} stores...`);

    // First, reset on_sale to false for all stores that have deal collections
    // so stale flags get cleared
    for (const job of dealJobs) {
      const nowIso = new Date().toISOString();
      const { data, error } = await getSupabase()
        .from('retailer_products')
        // Only reset deal-derived flags; preserve real compare_at sales.
        .update({ on_sale: false })
        .eq('retailer_id', job.retailer.id)
        .eq('on_sale', true)
        .is('compare_at_price', null)
        .select('id, retailer_id, external_id, canonical_device_id, price, compare_at_price, on_sale, in_stock, product_url, affiliate_url, image_url');

      if (error) {
        logError('DEALS', `Error resetting on_sale for ${job.domain}`, error);
      } else if (data && data.length > 0) {
        await upsertDeviceOffersFromRetailerProducts(
          data as RetailerProductUpsertRow[],
          nowIso,
          `${job.domain}:reset-deals`,
        );
      }
    }

    for (const job of dealJobs) {
      const flagged = await syncDealCollections(
        job.domain,
        job.retailer,
        job.dealCollections,
        options.devMode,
      );
      totalDealsFlagged += flagged;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n=================================================================');
  console.log(`  STORE SYNC COMPLETE — ${options.label}`);
  console.log('=================================================================');
  console.log(`  Duration:           ${elapsed}s`);
  console.log(`  Stores processed:   ${storesProcessed}/${storeJobs.length}`);
  console.log(`  Products fetched:   ${grandFetched}`);
  console.log(`  Products upserted:  ${grandUpserted}`);
  if (totalDealsFlagged > 0) {
    console.log(`  Deals flagged:      ${totalDealsFlagged}`);
  }
  console.log(`  Mode:               ${options.devMode ? 'DEV (limited)' : 'FULL'}`);
  console.log('=================================================================\n');
}
