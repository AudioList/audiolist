/**
 * sync-stores-core.ts
 *
 * Shared sync logic extracted from sync-stores.ts.
 * Parameterized by category filter for category-specific pipelines.
 */

import { getSupabase, getRetailers, buildAffiliateUrl, type Retailer } from '../config/retailers.ts';
import { fetchShopifyCollection, type ShopifyProduct } from '../scrapers/shopify.ts';
import { STORE_COLLECTIONS, type CategoryId, type CollectionMapping } from '../config/store-collections.ts';
import { log, logError, delay } from './log.ts';

const UPSERT_BATCH_SIZE = 100;
const COLLECTION_DELAY_MS = 400;
const STORE_CONCURRENCY = 3;

export interface SyncStoresOptions {
  categoryFilter: Set<CategoryId> | null;
  devMode: boolean;
  label: string;
}

function extractPrice(product: ShopifyProduct): { price: number | null; inStock: boolean } {
  if (!product.variants || product.variants.length === 0) {
    return { price: null, inStock: false };
  }

  let lowestAvailable: number | null = null;
  let lowestAny: number | null = null;
  let hasAvailable = false;

  for (const v of product.variants) {
    const p = parseFloat(v.price);
    if (isNaN(p) || p <= 0) continue;

    if (lowestAny === null || p < lowestAny) lowestAny = p;

    if (v.available) {
      hasAvailable = true;
      if (lowestAvailable === null || p < lowestAvailable) lowestAvailable = p;
    }
  }

  return {
    price: lowestAvailable ?? lowestAny,
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
      const { error } = await supabase
        .from('store_products')
        .upsert(batch, { onConflict: 'retailer_id,external_id' });

      if (error) {
        logError('UPSERT', `Batch ${Math.floor(i / UPSERT_BATCH_SIZE) + 1} for ${domain}`, error);
      } else {
        successCount += batch.length;
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
      const { price, inStock } = extractPrice(p);
      const productUrl = `https://${domain}/products/${p.handle}`;
      const affiliateUrl = buildAffiliateUrl(
        retailer,
        productUrl,
        p.handle,
        String(p.id)
      );

      return {
        retailer_id: retailer.id,
        external_id: p.handle,
        title: p.title,
        vendor: p.vendor || null,
        product_type: p.product_type || null,
        tags: p.tags || [],
        category_id: mapping.categoryId,
        price,
        in_stock: inStock,
        image_url: p.images?.[0]?.src ?? null,
        product_url: productUrl,
        affiliate_url: affiliateUrl ?? productUrl,
        raw_data: {},
        imported_at: new Date().toISOString(),
        processed: false,
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

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n=================================================================');
  console.log(`  STORE SYNC COMPLETE — ${options.label}`);
  console.log('=================================================================');
  console.log(`  Duration:           ${elapsed}s`);
  console.log(`  Stores processed:   ${storesProcessed}/${storeJobs.length}`);
  console.log(`  Products fetched:   ${grandFetched}`);
  console.log(`  Products upserted:  ${grandUpserted}`);
  console.log(`  Mode:               ${options.devMode ? 'DEV (limited)' : 'FULL'}`);
  console.log('=================================================================\n');
}
