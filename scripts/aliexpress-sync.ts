/**
 * aliexpress-sync.ts
 *
 * AliExpress product sync via the Affiliate API. Discovers products from
 * curated official brand stores, generates affiliate links, and upserts
 * to the store_products staging table for processing.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> ALIEXPRESS_APP_KEY=<key> \
 *   ALIEXPRESS_APP_SECRET=<secret> ALIEXPRESS_TRACKING_ID=<id> \
 *   npx tsx scripts/aliexpress-sync.ts [options]
 *
 * Modes:
 *   --mode=discover    Search for new products from curated stores (default)
 *   --mode=refresh     Update prices for existing AliExpress store_products
 *   --mode=daily       Run discover then refresh within API budget (for cron)
 *
 * Options:
 *   --brand=moondrop   Filter to a single brand (case-insensitive)
 *   --category=iem     Filter to a single category
 *   --budget=N         API call budget (default: 4000, reserves 1000)
 *   --dry-run          Preview without making API calls or DB writes
 *   --limit=N          Limit number of brands to process
 */

import { getSupabase, getRetailers, type Retailer } from './config/retailers.ts';
import {
  createAliExpressClient,
  type AliExpressClient,
  type AliExpressProduct,
  type AliExpressConfig,
  AliExpressApiError,
} from './scrapers/aliexpress.ts';
import {
  ALIEXPRESS_STORES,
  CURATED_SELLER_IDS,
  SELLER_ID_MAP,
  type AliExpressStoreConfig,
} from './config/aliexpress-stores.ts';
import { isAliExpressJunk } from './lib/aliexpress-quality-gate.ts';
import { detectCorrectCategory } from './scrapers/matcher.ts';
import { extractBrand } from './brand-config.ts';
import type { CategoryId } from './config/store-collections.ts';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getArg(name: string, defaultValue: string): string {
  const prefix = `--${name}=`;
  const arg = args.find(a => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : defaultValue;
}

const MODE = getArg('mode', 'discover') as 'discover' | 'refresh' | 'daily';
const BRAND_FILTER = getArg('brand', '').toLowerCase() || null;
const CATEGORY_FILTER = getArg('category', '') || null;
const API_BUDGET = parseInt(getArg('budget', '4000'), 10);
const LIMIT = parseInt(getArg('limit', '0'), 10) || 0;
const DRY_RUN = args.includes('--dry-run');

const UPSERT_BATCH_SIZE = 100;
const SEARCH_PAGE_SIZE = 50;
const SEARCH_DELAY_MS = 300;
const AFFILIATE_LINK_BATCH_SIZE = 50;

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function log(phase: string, msg: string): void {
  console.log(`[${timestamp()}] [${phase}] ${msg}`);
}

function logError(phase: string, msg: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[${timestamp()}] [${phase}] ERROR: ${msg} -- ${detail}`);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

type SyncStats = {
  brandsProcessed: number;
  apiCalls: number;
  productsFound: number;
  productsFromCurated: number;
  productsNew: number;
  productsSkippedJunk: number;
  productsSkippedExisting: number;
  productsUpserted: number;
  affiliateLinksGenerated: number;
  errors: number;
};

function emptyStats(): SyncStats {
  return {
    brandsProcessed: 0,
    apiCalls: 0,
    productsFound: 0,
    productsFromCurated: 0,
    productsNew: 0,
    productsSkippedJunk: 0,
    productsSkippedExisting: 0,
    productsUpserted: 0,
    affiliateLinksGenerated: 0,
    errors: 0,
  };
}

// ---------------------------------------------------------------------------
// Category detection for multi-category stores
// ---------------------------------------------------------------------------

function detectAliExpressCategory(
  product: AliExpressProduct,
  storeConfig: AliExpressStoreConfig,
): CategoryId {
  // Single-category store: use it directly
  if (storeConfig.categories.length === 1) {
    return storeConfig.categories[0];
  }

  // Try the title-based detector from matcher.ts
  const brand = storeConfig.brandName;
  const detected = detectCorrectCategory(product.product_title, brand, storeConfig.categories[0]);
  if (detected && storeConfig.categories.includes(detected as CategoryId)) {
    return detected as CategoryId;
  }

  // Try brand extraction from title for category hint
  const titleBrand = extractBrand(product.product_title);
  const detectedFromTitle = detectCorrectCategory(product.product_title, titleBrand, storeConfig.categories[0]);
  if (detectedFromTitle && storeConfig.categories.includes(detectedFromTitle as CategoryId)) {
    return detectedFromTitle as CategoryId;
  }

  // Fallback: use first category in config
  return storeConfig.categories[0];
}

// ---------------------------------------------------------------------------
// Discover mode
// ---------------------------------------------------------------------------

async function discoverProducts(
  client: AliExpressClient,
  stats: SyncStats,
): Promise<void> {
  const supabase = getSupabase();

  // Load existing AliExpress store_products to skip duplicates
  log('LOAD', 'Loading existing AliExpress store_products...');
  const existingIds = new Set<string>();
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('store_products')
      .select('external_id')
      .eq('retailer_id', 'aliexpress')
      .range(offset, offset + 999);
    if (error) { logError('LOAD', 'Failed to load existing', error); break; }
    if (!data || data.length === 0) break;
    for (const row of data) existingIds.add(row.external_id);
    offset += data.length;
    if (data.length < 1000) break;
  }
  log('LOAD', `Found ${existingIds.size} existing AliExpress store_products`);

  // Filter stores based on CLI args
  let stores = [...ALIEXPRESS_STORES];
  if (BRAND_FILTER) {
    stores = stores.filter(s =>
      s.brandName.toLowerCase() === BRAND_FILTER ||
      s.searchKeywords.some(k => k.toLowerCase() === BRAND_FILTER)
    );
  }
  if (CATEGORY_FILTER) {
    stores = stores.filter(s => s.categories.includes(CATEGORY_FILTER as CategoryId));
  }
  if (LIMIT > 0) {
    stores = stores.slice(0, LIMIT);
  }

  log('DISCOVER', `Processing ${stores.length} stores (budget: ${API_BUDGET}, remaining: ${client.getRemainingQuota()})`);

  const allRows: Record<string, unknown>[] = [];

  for (const store of stores) {
    if (client.getRemainingQuota() < 10) {
      log('BUDGET', 'API budget nearly exhausted, stopping discovery');
      break;
    }

    log('DISCOVER', `--- ${store.brandName} (seller: ${store.sellerId}) ---`);
    stats.brandsProcessed++;

    const storeNewProducts: AliExpressProduct[] = [];

    for (const keyword of store.searchKeywords) {
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages && client.getRemainingQuota() > 5) {
        if (DRY_RUN) {
          log('DRY-RUN', `Would search: "${keyword}" page ${page}`);
          break;
        }

        try {
          const result = await client.searchProducts({
            keywords: keyword,
            pageNo: page,
            pageSize: SEARCH_PAGE_SIZE,
          });

          stats.productsFound += result.products.length;

          // Calculate total pages
          if (page === 1 && result.totalCount > 0) {
            totalPages = Math.ceil(result.totalCount / SEARCH_PAGE_SIZE);
            log('DISCOVER', `"${keyword}": ${result.totalCount} total results (${totalPages} pages)`);
          }

          // Filter to only products from this curated store
          const fromStore = result.products.filter(p =>
            p.shop_id === store.sellerId
          );
          stats.productsFromCurated += fromStore.length;

          // Filter out already-known products
          const newProducts = fromStore.filter(p => !existingIds.has(p.product_id));

          // Filter out junk
          for (const p of newProducts) {
            if (isAliExpressJunk(p.product_title)) {
              stats.productsSkippedJunk++;
              log('JUNK', `Skipping: "${p.product_title}"`);
            } else {
              storeNewProducts.push(p);
              existingIds.add(p.product_id); // Avoid duplicates within session
            }
          }

          const skippedExisting = fromStore.length - newProducts.length;
          stats.productsSkippedExisting += skippedExisting;

          if (result.products.length < SEARCH_PAGE_SIZE) break; // Last page

          page++;
          await delay(SEARCH_DELAY_MS);
        } catch (err) {
          if (err instanceof AliExpressApiError && err.isRateLimit) {
            log('BUDGET', 'Rate limit reached, stopping');
            return;
          }
          logError('DISCOVER', `Search "${keyword}" page ${page}`, err);
          stats.errors++;
          break;
        }
      }
    }

    stats.productsNew += storeNewProducts.length;
    log('DISCOVER', `${store.brandName}: ${storeNewProducts.length} new products found`);

    if (storeNewProducts.length === 0 || DRY_RUN) continue;

    // Generate affiliate links in batches
    const productUrls = storeNewProducts.map(p => p.product_url).filter(Boolean);
    const affiliateLinkMap = new Map<string, string>();

    for (let i = 0; i < productUrls.length; i += AFFILIATE_LINK_BATCH_SIZE) {
      const batch = productUrls.slice(i, i + AFFILIATE_LINK_BATCH_SIZE);
      try {
        const links = await client.generateAffiliateLinks(batch);
        for (const link of links) {
          affiliateLinkMap.set(link.source_url, link.promotion_link);
        }
        stats.affiliateLinksGenerated += links.length;
        await delay(SEARCH_DELAY_MS);
      } catch (err) {
        logError('AFFILIATE', `Generate links batch`, err);
        stats.errors++;
        // Continue without affiliate links -- use promotion_link from search results
      }
    }

    // Transform to store_products rows
    for (const p of storeNewProducts) {
      const price = parseFloat(p.sale_price);
      const categoryId = detectAliExpressCategory(p, store);
      const affiliateUrl = affiliateLinkMap.get(p.product_url) ?? p.promotion_link ?? p.product_url;

      allRows.push({
        retailer_id: 'aliexpress',
        external_id: p.product_id,
        title: p.product_title,
        vendor: store.brandName,
        product_type: null,
        tags: [],
        category_id: categoryId,
        price: isNaN(price) ? null : price,
        in_stock: true,
        image_url: p.product_main_image_url || null,
        product_url: p.product_url,
        affiliate_url: affiliateUrl,
        raw_data: {
          original_price: p.original_price,
          discount: p.discount,
          evaluate_rate: p.evaluate_rate,
          shop_id: p.shop_id,
          ali_category_id: p.second_level_category_id,
        },
        imported_at: new Date().toISOString(),
        processed: false,
      });
    }
  }

  // Batch upsert all rows
  if (allRows.length > 0 && !DRY_RUN) {
    log('UPSERT', `Upserting ${allRows.length} store_products...`);
    for (let i = 0; i < allRows.length; i += UPSERT_BATCH_SIZE) {
      const batch = allRows.slice(i, i + UPSERT_BATCH_SIZE);
      try {
        const { error } = await supabase
          .from('store_products')
          .upsert(batch, { onConflict: 'retailer_id,external_id' });
        if (error) {
          logError('UPSERT', `Batch ${Math.floor(i / UPSERT_BATCH_SIZE) + 1}`, error);
          stats.errors++;
        } else {
          stats.productsUpserted += batch.length;
        }
      } catch (err) {
        logError('UPSERT', 'Batch exception', err);
        stats.errors++;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Refresh mode
// ---------------------------------------------------------------------------

async function refreshProducts(
  client: AliExpressClient,
  stats: SyncStats,
): Promise<void> {
  const supabase = getSupabase();

  // Load existing AliExpress store_products, ordered by stalest first
  log('LOAD', 'Loading AliExpress store_products for refresh...');
  const products: { id: string; external_id: string; retailer_id: string }[] = [];
  let offset = 0;
  while (true) {
    let query = supabase
      .from('store_products')
      .select('id, external_id, retailer_id')
      .eq('retailer_id', 'aliexpress')
      .order('imported_at', { ascending: true });

    if (BRAND_FILTER) {
      // Filter by vendor (brand)
      const store = ALIEXPRESS_STORES.find(s => s.brandName.toLowerCase() === BRAND_FILTER);
      if (store) query = query.eq('vendor', store.brandName);
    }

    query = query.range(offset, offset + 999);
    const { data, error } = await query;
    if (error) { logError('LOAD', 'Failed to load store_products', error); break; }
    if (!data || data.length === 0) break;
    products.push(...data);
    offset += data.length;
    if (data.length < 1000) break;
  }

  log('REFRESH', `Found ${products.length} products to refresh`);

  if (products.length === 0 || DRY_RUN) return;

  // Batch fetch product details (20 per API call)
  const DETAIL_BATCH_SIZE = 20;
  for (let i = 0; i < products.length; i += DETAIL_BATCH_SIZE) {
    if (client.getRemainingQuota() < 5) {
      log('BUDGET', 'API budget nearly exhausted, stopping refresh');
      break;
    }

    const batch = products.slice(i, i + DETAIL_BATCH_SIZE);
    const productIds = batch.map(p => p.external_id);

    try {
      const details = await client.getProductDetails(productIds);

      // Update each product with fresh data
      const updates: Record<string, unknown>[] = [];
      for (const detail of details) {
        const price = parseFloat(detail.sale_price);
        updates.push({
          retailer_id: 'aliexpress',
          external_id: detail.product_id,
          price: isNaN(price) ? null : price,
          in_stock: true,
          imported_at: new Date().toISOString(),
          processed: false, // Re-process with updated price
        });
      }

      // Mark products not found in API response as out of stock
      const foundIds = new Set(details.map(d => d.product_id));
      for (const p of batch) {
        if (!foundIds.has(p.external_id)) {
          updates.push({
            retailer_id: 'aliexpress',
            external_id: p.external_id,
            in_stock: false,
            imported_at: new Date().toISOString(),
            processed: false,
          });
        }
      }

      // Upsert updates
      if (updates.length > 0) {
        const { error } = await supabase
          .from('store_products')
          .upsert(updates, { onConflict: 'retailer_id,external_id' });
        if (error) {
          logError('REFRESH', 'Upsert failed', error);
          stats.errors++;
        } else {
          stats.productsUpserted += updates.length;
        }
      }

      log('REFRESH', `Refreshed ${i + batch.length}/${products.length} (${details.length} found, ${batch.length - details.length} not found)`);
      await delay(SEARCH_DELAY_MS);
    } catch (err) {
      if (err instanceof AliExpressApiError && err.isRateLimit) {
        log('BUDGET', 'Rate limit reached, stopping');
        break;
      }
      logError('REFRESH', `Batch ${Math.floor(i / DETAIL_BATCH_SIZE) + 1}`, err);
      stats.errors++;
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();

  // Validate env vars
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;
  const trackingId = process.env.ALIEXPRESS_TRACKING_ID;

  if (!appKey || !appSecret || !trackingId) {
    console.error('Missing required environment variables:');
    if (!appKey) console.error('  ALIEXPRESS_APP_KEY');
    if (!appSecret) console.error('  ALIEXPRESS_APP_SECRET');
    if (!trackingId) console.error('  ALIEXPRESS_TRACKING_ID');
    console.error('\nSign up at https://openservice.aliexpress.com and https://portals.aliexpress.com');
    process.exit(1);
  }

  console.log('=================================================================');
  console.log('  AudioList AliExpress Sync');
  console.log(`  Mode:     ${MODE}`);
  console.log(`  Budget:   ${API_BUDGET} API calls`);
  if (BRAND_FILTER) console.log(`  Brand:    ${BRAND_FILTER}`);
  if (CATEGORY_FILTER) console.log(`  Category: ${CATEGORY_FILTER}`);
  if (DRY_RUN) console.log('  ** DRY RUN -- no API calls or DB writes **');
  console.log(`  Started:  ${new Date().toISOString()}`);
  console.log('=================================================================\n');

  const config: AliExpressConfig = { appKey, appSecret, trackingId };
  const client = createAliExpressClient(config);

  const stats = emptyStats();

  try {
    if (MODE === 'discover' || MODE === 'daily') {
      log('MODE', 'Starting DISCOVER phase...');
      await discoverProducts(client, stats);
    }

    if (MODE === 'refresh' || MODE === 'daily') {
      log('MODE', 'Starting REFRESH phase...');
      await refreshProducts(client, stats);
    }
  } catch (err) {
    logError('FATAL', 'Unhandled error', err);
    stats.errors++;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n=================================================================');
  console.log('  ALIEXPRESS SYNC COMPLETE');
  console.log('=================================================================');
  console.log(`  Duration:              ${elapsed}s`);
  console.log(`  Mode:                  ${MODE}`);
  console.log(`  Brands processed:      ${stats.brandsProcessed}`);
  console.log(`  API calls used:        ${client.getCallCount()}`);
  console.log(`  API calls remaining:   ${client.getRemainingQuota()}`);
  console.log(`  Products found (API):  ${stats.productsFound}`);
  console.log(`  From curated stores:   ${stats.productsFromCurated}`);
  console.log(`  New (not seen before): ${stats.productsNew}`);
  console.log(`  Skipped (junk):        ${stats.productsSkippedJunk}`);
  console.log(`  Skipped (existing):    ${stats.productsSkippedExisting}`);
  console.log(`  Affiliate links:       ${stats.affiliateLinksGenerated}`);
  console.log(`  Upserted to DB:        ${stats.productsUpserted}`);
  console.log(`  Errors:                ${stats.errors}`);
  console.log('=================================================================\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
