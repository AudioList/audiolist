/**
 * bestbuy-sync.ts
 *
 * Retailer-first Best Buy offer sync.
 *
 * - Searches Best Buy for existing catalog devices (devices/products view)
 * - Writes listings into retailer_products (as Best Buy retailer lineage)
 * - Writes purchasable offers into device_offers
 * - Queues review_tasks.offer_link for borderline matches
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=... BESTBUY_API_KEY=... npx tsx scripts/bestbuy-sync.ts [options]
 *
 * Options:
 *   --mode=daily|discover|refresh
 *   --category=iem|headphone|microphone|hp_accessory
 *   --limit=N
 *   --delay=ms
 *   --discontinued-checks=N   Max BestBuy page checks per run (default: 40)
 *   --dry-run
 */

import './lib/env.js';
import { getSupabase, buildAffiliateUrl, type Retailer } from './config/retailers.ts';
import { BestBuyApiError, getBestBuyProductsBySkus, listBestBuyProductsByCategoryIds, type BestBuyProduct } from './scrapers/bestbuy.ts';
import { normalizeName } from './scrapers/matcher.ts';
import { BESTBUY_CATEGORY_IDS } from './config/bestbuy-taxonomy.ts';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

type RunMode = 'discover' | 'refresh' | 'daily';

type Product = {
  id: string;
  name: string;
  brand: string | null;
  category_id: string | null;
  ppi_score: number | null;
  is_best_variant: boolean;
};

type ExistingOffer = {
  device_id: string;
  retailer_product_id: string;
  external_id: string;
  price: number;
  compare_at_price: number | null;
  on_sale: boolean;
  in_stock: boolean;
  product_url: string | null;
  affiliate_url: string | null;
  image_url: string | null;
  last_checked: string | null;
};

type LinkDecision = 'auto' | 'pending';

type LinkAttempt = {
  deviceId: string;
  deviceName: string;
  deviceBrand: string | null;
  deviceCategoryId: string;
  sku: string;
  bestbuyTitle: string;
  score: number;
  decision: LinkDecision;
  searchQuery: string;
  price: number | null;
  inStock: boolean;
  imageUrl: string | null;
  productUrl: string;
  affiliateUrl: string;
};

const args = process.argv.slice(2);

function getArg(name: string, defaultValue: string): string {
  const prefix = `--${name}=`;
  const arg = args.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : defaultValue;
}

const MODE = getArg('mode', 'daily') as RunMode;
const CATEGORY_FILTER = getArg('category', '');
const LIMIT = parseInt(getArg('limit', '0'), 10) || 0;
const START_DELAY_MS = parseInt(getArg('delay', '1200'), 10) || 1200;
const DISCONTINUED_PAGE_CHECKS = parseInt(getArg('discontinued-checks', '40'), 10) || 0;
const PAGE_SIZE = parseInt(getArg('page-size', '100'), 10) || 100;
const MAX_PAGES_PER_RUN = parseInt(getArg('max-pages', '5'), 10) || 5;
const DRY_RUN = args.includes('--dry-run');

const PRODUCT_BATCH_SIZE = 1000;
const UPSERT_BATCH_SIZE = 100;
// Best Buy per-second limits can be as low as 1 req/sec for some keys.
// Default to a conservative delay and adaptively back off on 403 rate_limit.
const BASE_DELAY_MS = 1200;
const MAX_DELAY_MS = 10_000;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hasDiscontinuedNewConditionBanner(productUrl: string): Promise<boolean> {
  // BestBuy product pages sometimes show:
  // "This item is no longer available in new condition. See similar items below"
  // This can happen even when the API still returns the SKU.
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15_000);
  try {
    const resp = await fetch(productUrl, {
      headers: {
        'User-Agent': 'AudioList BestBuy Sync/1.0',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: ac.signal,
    });
    if (!resp.ok) return false;
    const html = (await resp.text()).toLowerCase();
    return html.includes('no longer available in new condition');
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

function shouldExcludeByCategoryPath(bb: BestBuyProduct): boolean {
  // Exclude obvious mis-buckets.
  const excluded = new Set([
    // Canon CMOS HD Camcorder
    'pcmcat236900050011',
  ]);

  for (const cp of bb.categoryPath ?? []) {
    if (excluded.has(cp.id)) return true;
  }
  return false;
}

async function upsertBestBuyRetailerProducts(
  retailer: Retailer,
  sourceCategoryId: string,
  bbProducts: BestBuyProduct[],
  nowIso: string
): Promise<number> {
  if (bbProducts.length === 0) return 0;
  const supabase = getSupabase();

  const rows = bbProducts
    .filter((bb) => bb.name && bb.name.length > 2)
    .filter((bb) => !shouldExcludeByCategoryPath(bb))
    .map((bb) => {
      const priceCandidate = bb.salePrice ?? bb.regularPrice ?? null;
      const price = priceCandidate != null && priceCandidate > 0 ? priceCandidate : null;
      const regular = bb.regularPrice != null && bb.regularPrice > 0 ? bb.regularPrice : null;
      const compareAt = price != null && regular != null && regular > price ? regular : null;
      const onSale = compareAt != null;
      const inStock = bb.onlineAvailability ?? false;
      const productUrl = bb.url ?? `https://www.bestbuy.com/site/${bb.sku}.p`;
      const affiliateUrl = bb.affiliateUrl
        ?? buildAffiliateUrl(retailer, productUrl, String(bb.sku), String(bb.sku))
        ?? productUrl;

      return {
        retailer_id: retailer.id,
        external_id: String(bb.sku),
        title: bb.name,
        normalized_title: normalizeName(bb.name),
        vendor: bb.manufacturer,
        product_type: null,
        tags: [],
        source_category_id: sourceCategoryId,
        price,
        compare_at_price: compareAt,
        on_sale: onSale,
        in_stock: inStock,
        image_url: bb.image,
        product_url: productUrl,
        affiliate_url: affiliateUrl,
        raw_data: {
          source: 'bestbuy-sync:crawl',
          sku: bb.sku,
          manufacturer: bb.manufacturer,
          modelNumber: bb.modelNumber,
          department: bb.department,
          class: bb.class,
          subclass: bb.subclass,
          categoryPath: bb.categoryPath,
          crawled_at: nowIso,
        },
        imported_at: nowIso,
        last_seen_at: nowIso,
        // NOTE: do NOT set processed/canonical_device_id; preserve existing state.
      };
    });

  if (rows.length === 0) return 0;

  let upserted = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    const { error } = await supabase
      .from('retailer_products')
      .upsert(batch, { onConflict: 'retailer_id,external_id' });
    if (error) {
      logError('UPSERT', `bestbuy retailer_products batch ${Math.floor(i / UPSERT_BATCH_SIZE) + 1}`, error);
      continue;
    }
    upserted += batch.length;
  }

  return upserted;
}

function isRetryableBestBuyError(err: unknown): err is BestBuyApiError {
  return err instanceof BestBuyApiError && (err.kind === 'rate_limit' || err.kind === 'unknown');
}

async function withBestBuyRetries<T>(
  fn: () => Promise<T>,
  label: string,
  state: { delayMs: number; rateLimited: number }
): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await fn();
      } catch (err) {
        if (err instanceof BestBuyApiError) {
          if (err.kind === 'auth') {
          const snippet = err.bodySnippet ? ` Response: ${err.bodySnippet.replace(/\s+/g, ' ').slice(0, 220)}` : '';
          throw new Error(`Best Buy API rejected the request (403 auth). Verify BESTBUY_API_KEY.${snippet}`);
          }
          if (err.kind === 'quota') {
          const snippet = err.bodySnippet ? ` Response: ${err.bodySnippet.replace(/\s+/g, ' ').slice(0, 220)}` : '';
          throw new Error(`Best Buy API quota exceeded. Wait for quota reset or request a higher quota.${snippet}`);
          }

        // rate_limit / unknown: back off and retry.
        state.rateLimited++;
        const backoff = Math.min(MAX_DELAY_MS, Math.max(state.delayMs * 2, 1000 * (attempt + 1)));
        state.delayMs = backoff;
        log('RATE', `${label}: ${err.message}. Backing off ${backoff}ms (attempt ${attempt + 1}/6)`);
        if (err.bodySnippet) {
          log('RATE', `Best Buy response snippet: ${err.bodySnippet.replace(/\s+/g, ' ').slice(0, 160)}`);
        }
        await sleep(backoff);
        continue;
      }

      // Non-BestBuy errors: retry a couple times, then rethrow.
      const backoff = Math.min(MAX_DELAY_MS, 500 * (attempt + 1));
      await sleep(backoff);
      if (attempt >= 2) throw err;
    }
  }

  throw new Error(`Best Buy request failed after retries: ${label}`);
}

async function loadAllProducts(): Promise<Product[]> {
  const supabase = getSupabase();
  const all: Product[] = [];
  let offset = 0;

  log('LOAD', 'Loading products/devices from Supabase...');

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, brand, category_id, ppi_score, is_best_variant')
      .order('ppi_score', { ascending: false })
      .range(offset, offset + PRODUCT_BATCH_SIZE - 1);

    if (error) {
      logError('LOAD', `Failed to load products at offset ${offset}`, error);
      break;
    }

    const batch = (data ?? []) as Product[];
    if (batch.length === 0) break;
    all.push(...batch);
    offset += batch.length;
    if (batch.length < PRODUCT_BATCH_SIZE) break;
  }

  log('LOAD', `Total products loaded: ${all.length}`);
  return all;
}

type ProgressState = {
  version: 1;
  pageByCategory: Record<string, number>;
};

const PROGRESS_PATH = resolve('scripts/data/bestbuy-progress.json');

function loadProgress(): ProgressState {
  try {
    const raw = readFileSync(PROGRESS_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ProgressState>;
    return {
      version: 1,
      pageByCategory: parsed.pageByCategory ?? {},
    };
  } catch {
    return { version: 1, pageByCategory: {} };
  }
}

function saveProgress(state: ProgressState): void {
  mkdirSync(resolve('scripts/data'), { recursive: true });
  writeFileSync(PROGRESS_PATH, JSON.stringify(state, null, 2));
}

async function discoverByCategoryCrawl(
  retailer: Retailer,
  apiKey: string,
  products: Product[],
  state: { delayMs: number; rateLimited: number },
  progress: ProgressState
): Promise<{ auto: number; pending: number; skipped: number; processed: number }> {
  // Crawl validated Best Buy categories and ingest them into retailer_products.
  // NOTE: The downstream processor enforces BestBuy category conflicts via review_tasks.retailer_category.
  const categoryJobs: { sourceCategoryId: 'iem' | 'headphone' | 'microphone' | 'hp_accessory'; bestbuyCategoryIds: string[] }[] = [
    { sourceCategoryId: 'iem', bestbuyCategoryIds: [...BESTBUY_CATEGORY_IDS.iem] },
    { sourceCategoryId: 'headphone', bestbuyCategoryIds: [...BESTBUY_CATEGORY_IDS.headphone] },
    { sourceCategoryId: 'microphone', bestbuyCategoryIds: [...BESTBUY_CATEGORY_IDS.microphone] },
    { sourceCategoryId: 'hp_accessory', bestbuyCategoryIds: [...BESTBUY_CATEGORY_IDS.hp_accessory] },
  ];

  const allowedSourceCategories = new Set(categoryJobs.map((j) => j.sourceCategoryId));
  const filteredJobs = CATEGORY_FILTER && allowedSourceCategories.has(CATEGORY_FILTER as typeof categoryJobs[number]['sourceCategoryId'])
    ? categoryJobs.filter((j) => j.sourceCategoryId === CATEGORY_FILTER)
    : categoryJobs;

  const stats = { auto: 0, pending: 0, skipped: 0, processed: 0 };

  for (const job of filteredJobs) {
    let page = progress.pageByCategory[job.sourceCategoryId] ?? 1;
    let pagesFetched = 0;

    while (pagesFetched < MAX_PAGES_PER_RUN) {
      const pageLabel = `crawl:${job.sourceCategoryId}:page:${page}`;
      const resp = await withBestBuyRetries(
        () => listBestBuyProductsByCategoryIds(job.bestbuyCategoryIds, apiKey, page, PAGE_SIZE),
        pageLabel,
        state
      );

      const bbProducts = resp.products;
      if (!bbProducts || bbProducts.length === 0) {
        // If empty, advance to next page; if we reached end, wrap.
        page = page >= resp.totalPages ? 1 : page + 1;
        progress.pageByCategory[job.sourceCategoryId] = page;
        saveProgress(progress);
        break;
      }

      const nowIso = new Date().toISOString();
      stats.processed += bbProducts.length;
      const upserted = await upsertBestBuyRetailerProducts(retailer, job.sourceCategoryId, bbProducts, nowIso);
      // Reuse fields in return type: auto = ingested, skipped = filtered out.
      stats.auto += upserted;

      pagesFetched++;
      page = page >= resp.totalPages ? 1 : page + 1;
      progress.pageByCategory[job.sourceCategoryId] = page;
      saveProgress(progress);

      await sleep(state.delayMs);
    }
  }

  return stats;
}

async function loadExistingOfferDeviceIds(retailerId: string): Promise<Set<string>> {
  const supabase = getSupabase();
  const deviceIds = new Set<string>();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('device_offers')
      .select('device_id')
      .eq('retailer_id', retailerId)
      .range(offset, offset + PRODUCT_BATCH_SIZE - 1);

    if (error) {
      logError('LOAD', 'Failed to load existing offers', error);
      break;
    }

    const batch = (data ?? []) as { device_id: string }[];
    if (batch.length === 0) break;
    for (const row of batch) deviceIds.add(row.device_id);
    offset += batch.length;
    if (batch.length < PRODUCT_BATCH_SIZE) break;
  }

  return deviceIds;
}

async function loadStaleOfferProducts(retailerId: string, products: Product[]): Promise<Product[]> {
  const supabase = getSupabase();
  const stale: { product_id: string; last_checked: string | null }[] = [];
  let offset = 0;

  log('LOAD', 'Loading stale Best Buy offers for refresh...');

  while (true) {
    const { data, error } = await supabase
      .from('price_listings')
      .select('product_id, last_checked')
      .eq('retailer_id', retailerId)
      .order('last_checked', { ascending: true, nullsFirst: true })
      .range(offset, offset + PRODUCT_BATCH_SIZE - 1);

    if (error) {
      logError('LOAD', 'Failed to load stale offers', error);
      break;
    }

    const batch = (data ?? []) as { product_id: string; last_checked: string | null }[];
    if (batch.length === 0) break;
    stale.push(...batch);
    offset += batch.length;
    if (batch.length < PRODUCT_BATCH_SIZE) break;
  }

  const productMap = new Map(products.map((p) => [p.id, p]));
  const result: Product[] = [];
  for (const row of stale) {
    const p = productMap.get(row.product_id);
    if (p) result.push(p);
  }

  log('LOAD', `Found ${result.length} Best Buy offers to refresh`);
  return result;
}

async function loadExistingOffers(retailerId: string): Promise<ExistingOffer[]> {
  const supabase = getSupabase();
  const all: ExistingOffer[] = [];
  let offset = 0;

  log('LOAD', `Loading existing offers for ${retailerId}...`);
  while (true) {
    const { data, error } = await supabase
      .from('device_offers')
      .select('device_id, retailer_product_id, external_id, price, compare_at_price, on_sale, in_stock, product_url, affiliate_url, image_url, last_checked')
      .eq('retailer_id', retailerId)
      .range(offset, offset + PRODUCT_BATCH_SIZE - 1);

    if (error) {
      logError('LOAD', 'Failed to load existing offers', error);
      break;
    }

    const batch = (data ?? []) as ExistingOffer[];
    if (batch.length === 0) break;
    all.push(...batch);
    offset += batch.length;
    if (batch.length < PRODUCT_BATCH_SIZE) break;
  }

  log('LOAD', `Loaded ${all.length} existing offers`);
  return all;
}

async function refreshOffersBySku(retailer: Retailer, apiKey: string, offers: ExistingOffer[]): Promise<void> {
  if (offers.length === 0) return;
  const supabase = getSupabase();
  const nowIso = new Date().toISOString();

  // Only refresh offers that have numeric SKUs.
  const bySku = new Map<string, ExistingOffer>();
  for (const o of offers) {
    const sku = String(o.external_id).trim();
    if (!sku) continue;
    bySku.set(sku, o);
  }

  const skus = [...bySku.keys()];
  log('REFRESH', `Refreshing ${skus.length} Best Buy SKUs in batches...`);

  const state = { delayMs: Math.max(BASE_DELAY_MS, START_DELAY_MS), rateLimited: 0 };
  let pageChecksUsed = 0;
  for (let i = 0; i < skus.length; i += 100) {
    const batchSkus = skus.slice(i, i + 100);
    if (batchSkus.length === 0) continue;

    const bbProducts = await withBestBuyRetries(
      () => getBestBuyProductsBySkus(batchSkus, apiKey),
      `refresh:sku-in(${batchSkus.length})`,
      state
    );
    const bbBySku = new Map(bbProducts.map((p) => [String(p.sku), p]));

    const offerRows: Record<string, unknown>[] = [];
    const rpUpdates: { id: string; patch: Record<string, unknown> }[] = [];
    const discontinuedMarked: string[] = [];

    for (const sku of batchSkus) {
      const existing = bySku.get(sku);
      if (!existing) continue;
      const bb = bbBySku.get(sku);

      const fallbackProductUrl = existing.product_url ?? `https://www.bestbuy.com/site/${sku}.p?skuId=${sku}`;

      // If Best Buy doesn't return the SKU even with active=*, mark out of stock.
      if (!bb) {
        offerRows.push({
          device_id: existing.device_id,
          retailer_product_id: existing.retailer_product_id,
          retailer_id: retailer.id,
          external_id: existing.external_id,
          price: existing.price,
          compare_at_price: existing.compare_at_price,
          on_sale: existing.on_sale,
          currency: 'USD',
          in_stock: false,
          product_url: existing.product_url,
          affiliate_url: existing.affiliate_url ?? existing.product_url,
          image_url: existing.image_url,
          last_checked: nowIso,
        });
        rpUpdates.push({
          id: existing.retailer_product_id,
          patch: {
            in_stock: false,
            imported_at: nowIso,
            last_seen_at: nowIso,
            raw_data: { source: 'bestbuy-sync:refresh', refreshed_at: nowIso, missing_from_api: true },
          },
        });

        // Fallback: product page banner for discontinued-new items.
        if (!DRY_RUN && DISCONTINUED_PAGE_CHECKS > 0 && pageChecksUsed < DISCONTINUED_PAGE_CHECKS) {
          pageChecksUsed++;
          const discontinued = await hasDiscontinuedNewConditionBanner(fallbackProductUrl);
          if (discontinued) {
            discontinuedMarked.push(existing.external_id);
            rpUpdates.push({
              id: existing.retailer_product_id,
              patch: {
                in_stock: false,
                price: null,
                compare_at_price: null,
                on_sale: false,
                imported_at: nowIso,
                last_seen_at: nowIso,
                raw_data: { source: 'bestbuy-sync:refresh', refreshed_at: nowIso, discontinued_new: true, discontinued_banner: true },
              },
            });
          }
          await sleep(250);
        }
        continue;
      }

      // Discontinued / no longer available new condition.
      // Best Buy typically marks these as active=false. We keep offers for data
      // preservation, but mark the retailer_product as discontinued_new so the
      // UI/report can hide them.
      if (bb.active === false) {
        discontinuedMarked.push(existing.external_id);
        // Preserve the offer row for data/history, but mark it as out of stock.
        offerRows.push({
          device_id: existing.device_id,
          retailer_product_id: existing.retailer_product_id,
          retailer_id: retailer.id,
          external_id: existing.external_id,
          price: existing.price,
          compare_at_price: existing.compare_at_price,
          on_sale: false,
          currency: 'USD',
          in_stock: false,
          product_url: bb.url ?? existing.product_url ?? `https://www.bestbuy.com/site/${sku}.p`,
          affiliate_url: existing.affiliate_url ?? existing.product_url,
          image_url: bb.image ?? existing.image_url,
          last_checked: nowIso,
        });
        rpUpdates.push({
          id: existing.retailer_product_id,
          patch: {
            title: bb.name,
            normalized_title: normalizeName(bb.name),
            vendor: bb.manufacturer,
            price: null,
            compare_at_price: null,
            on_sale: false,
            in_stock: false,
            image_url: bb.image ?? existing.image_url,
            product_url: bb.url ?? existing.product_url ?? `https://www.bestbuy.com/site/${sku}.p`,
            affiliate_url: existing.affiliate_url ?? existing.product_url,
            imported_at: nowIso,
            last_seen_at: nowIso,
            raw_data: {
              source: 'bestbuy-sync:refresh',
              refreshed_at: nowIso,
              bestbuy_active: false,
              discontinued_new: true,
              manufacturer: bb.manufacturer,
              modelNumber: bb.modelNumber,
              department: bb.department,
              class: bb.class,
              subclass: bb.subclass,
              categoryPath: bb.categoryPath,
            },
          },
        });
        continue;
      }

      const priceCandidate = bb.salePrice ?? bb.regularPrice;
      const price = priceCandidate != null && priceCandidate > 0 ? priceCandidate : existing.price;
      const regular = bb.regularPrice != null && bb.regularPrice > 0 ? bb.regularPrice : null;
      const compareAt = regular != null && regular > price ? regular : null;
      const onSale = compareAt != null;
      const inStock = bb.onlineAvailability ?? existing.in_stock;
      const productUrl = bb.url ?? existing.product_url ?? `https://www.bestbuy.com/site/${sku}.p`;
      const affiliateUrl = bb.affiliateUrl
        ?? buildAffiliateUrl(retailer, productUrl, sku, sku)
        ?? existing.affiliate_url
        ?? productUrl;

      offerRows.push({
        device_id: existing.device_id,
        retailer_product_id: existing.retailer_product_id,
        retailer_id: retailer.id,
        external_id: existing.external_id,
        price,
        compare_at_price: compareAt,
        on_sale: onSale,
        currency: 'USD',
        in_stock: inStock,
        product_url: productUrl,
        affiliate_url: affiliateUrl,
        image_url: bb.image ?? existing.image_url,
        last_checked: nowIso,
      });

      rpUpdates.push({
        id: existing.retailer_product_id,
        patch: {
          title: bb.name,
          normalized_title: normalizeName(bb.name),
          vendor: bb.manufacturer,
          price,
          compare_at_price: compareAt,
          on_sale: onSale,
          in_stock: inStock,
          image_url: bb.image,
          product_url: productUrl,
          affiliate_url: affiliateUrl,
          imported_at: nowIso,
          last_seen_at: nowIso,
          raw_data: {
            source: 'bestbuy-sync:refresh',
            refreshed_at: nowIso,
            manufacturer: bb.manufacturer,
            modelNumber: bb.modelNumber,
            department: bb.department,
            class: bb.class,
            subclass: bb.subclass,
            categoryPath: bb.categoryPath,
          },
        },
      });

      // Second discontinuation signal: product page banner.
      // Only check when out of stock, and cap checks per run.
      if (!inStock && !DRY_RUN && DISCONTINUED_PAGE_CHECKS > 0 && pageChecksUsed < DISCONTINUED_PAGE_CHECKS) {
        pageChecksUsed++;
        const discontinued = await hasDiscontinuedNewConditionBanner(productUrl);
        if (discontinued) {
          discontinuedMarked.push(existing.external_id);
          rpUpdates.push({
            id: existing.retailer_product_id,
            patch: {
              in_stock: false,
              price: null,
              compare_at_price: null,
              on_sale: false,
              imported_at: nowIso,
              last_seen_at: nowIso,
              raw_data: { source: 'bestbuy-sync:refresh', refreshed_at: nowIso, discontinued_new: true, discontinued_banner: true },
            },
          });
        }
        await sleep(250);
      }
    }

    if (offerRows.length > 0) {
      const { error } = await supabase
        .from('device_offers')
        .upsert(offerRows, { onConflict: 'retailer_id,external_id' });
      if (error) logError('REFRESH', 'device_offers upsert failed', error);
    }

    if (discontinuedMarked.length > 0) {
      log(
        'REFRESH',
        `Marked ${discontinuedMarked.length} Best Buy SKU(s) as discontinued-new (kept offers; UI can hide using retailer_products.raw_data)`
      );
    }

    // Update retailer_products by id.
    if (rpUpdates.length > 0) {
      // Use concurrency to avoid huge sequential waits.
      const CHUNK = 20;
      for (let j = 0; j < rpUpdates.length; j += CHUNK) {
        const chunk = rpUpdates.slice(j, j + CHUNK);
        await Promise.all(
          chunk.map((u) =>
            supabase
              .from('retailer_products')
              .update(u.patch)
              .eq('id', u.id)
          )
        );
      }
    }

    await sleep(state.delayMs);
  }
}

async function flushAttempts(retailer: Retailer, attempts: LinkAttempt[]): Promise<void> {
  if (attempts.length === 0) return;

  const supabase = getSupabase();
  const nowIso = new Date().toISOString();

  // Deduplicate by SKU.
  const bestBySku = new Map<string, LinkAttempt>();
  for (const a of attempts) {
    const existing = bestBySku.get(a.sku);
    if (!existing) {
      bestBySku.set(a.sku, a);
      continue;
    }
    const rank = (x: LinkAttempt) => (x.decision === 'auto' ? 2_000 : 1_000) + x.score;
    if (rank(a) > rank(existing)) bestBySku.set(a.sku, a);
  }

  const deduped = [...bestBySku.values()];

  const retailerProductRows = deduped.map((a) => ({
    retailer_id: retailer.id,
    external_id: a.sku,
    title: a.bestbuyTitle,
    normalized_title: normalizeName(a.bestbuyTitle),
    vendor: null,
    product_type: null,
    tags: [],
    source_category_id: a.deviceCategoryId,
    price: a.price,
    compare_at_price: null,
    on_sale: false,
    in_stock: a.inStock,
    image_url: a.imageUrl,
    product_url: a.productUrl,
    affiliate_url: a.affiliateUrl,
    raw_data: {
      source: 'bestbuy-sync',
      matched_device_id: a.deviceId,
      matched_device_name: a.deviceName,
      matched_device_brand: a.deviceBrand,
      match_score: a.score,
      decision: a.decision,
      search_query: a.searchQuery,
      scraped_at: nowIso,
    },
    imported_at: nowIso,
    last_seen_at: nowIso,
    processed: true,
  }));

  const rpIdBySku = new Map<string, string>();
  for (let i = 0; i < retailerProductRows.length; i += UPSERT_BATCH_SIZE) {
    const batch = retailerProductRows.slice(i, i + UPSERT_BATCH_SIZE);
    const { data, error } = await supabase
      .from('retailer_products')
      .upsert(batch, { onConflict: 'retailer_id,external_id' })
      .select('id, external_id');
    if (error) {
      logError('FLUSH', 'retailer_products upsert failed', error);
      continue;
    }
    for (const row of (data ?? []) as { id: string; external_id: string }[]) {
      rpIdBySku.set(row.external_id, row.id);
    }
  }

  // For auto-approved links, set canonical_device_id if it's currently NULL.
  const autoLinks = deduped.filter((a) => a.decision === 'auto');
  if (autoLinks.length > 0) {
    const LINK_CHUNK = 25;
    for (let i = 0; i < autoLinks.length; i += LINK_CHUNK) {
      const chunk = autoLinks.slice(i, i + LINK_CHUNK);
      await Promise.all(
        chunk.map((a) => {
          const rpId = rpIdBySku.get(a.sku);
          if (!rpId) return Promise.resolve();
          return supabase
            .from('retailer_products')
            .update({ canonical_device_id: a.deviceId })
            .eq('id', rpId)
            .is('canonical_device_id', null);
        })
      );
    }
  }

  // Load existing offers to avoid overwriting device links.
  const skus = deduped.map((d) => d.sku);
  const existingOfferDeviceBySku = new Map<string, string>();
  for (let i = 0; i < skus.length; i += UPSERT_BATCH_SIZE) {
    const batch = skus.slice(i, i + UPSERT_BATCH_SIZE);
    const { data, error } = await supabase
      .from('device_offers')
      .select('external_id, device_id')
      .eq('retailer_id', retailer.id)
      .in('external_id', batch);
    if (error) {
      logError('FLUSH', 'device_offers load failed', error);
      continue;
    }
    for (const row of (data ?? []) as { external_id: string; device_id: string }[]) {
      existingOfferDeviceBySku.set(row.external_id, row.device_id);
    }
  }

  const offerInsertRows: Record<string, unknown>[] = [];
  const offerUpdateRows: Record<string, unknown>[] = [];
  const reviewTaskRows: Record<string, unknown>[] = [];

  for (const a of deduped) {
    const rpId = rpIdBySku.get(a.sku);
    if (!rpId) continue;

    const offerFields = {
      retailer_id: retailer.id,
      external_id: a.sku,
      price: a.price,
      compare_at_price: null,
      on_sale: false,
      currency: 'USD',
      in_stock: a.inStock,
      product_url: a.productUrl,
      affiliate_url: a.affiliateUrl,
      image_url: a.imageUrl,
      last_checked: nowIso,
    };

    if (a.decision === 'auto') {
      const existingDeviceId = existingOfferDeviceBySku.get(a.sku);
      if (!existingDeviceId) {
        if (a.price != null && a.price > 0) {
          offerInsertRows.push({
            device_id: a.deviceId,
            retailer_product_id: rpId,
            ...offerFields,
          });
        }
      } else {
        if (a.price != null && a.price > 0) offerUpdateRows.push(offerFields);
        if (existingDeviceId !== a.deviceId) {
          reviewTaskRows.push({
            task_type: 'offer_link',
            status: 'open',
            priority: Math.round(a.score * 100),
            retailer_product_id: rpId,
            device_id: a.deviceId,
            payload: {
              suggested_device_id: a.deviceId,
              suggested_device_name: a.deviceName,
              score: a.score,
              current_device_id: existingDeviceId,
              search_query: a.searchQuery,
            },
            reason: 'Conflicting Best Buy offer link (existing device differs)',
          });
        }
      }
    } else {
      reviewTaskRows.push({
        task_type: 'offer_link',
        status: 'open',
        priority: Math.round(a.score * 100),
        retailer_product_id: rpId,
        device_id: a.deviceId,
        payload: {
          suggested_device_id: a.deviceId,
          suggested_device_name: a.deviceName,
          score: a.score,
          search_query: a.searchQuery,
        },
        reason: `Best Buy match needs review (score=${a.score.toFixed(3)})`,
      });
    }
  }

  if (offerInsertRows.length > 0) {
    for (let i = 0; i < offerInsertRows.length; i += UPSERT_BATCH_SIZE) {
      const batch = offerInsertRows.slice(i, i + UPSERT_BATCH_SIZE);
      const { error } = await supabase
        .from('device_offers')
        .upsert(batch, { onConflict: 'retailer_id,external_id', ignoreDuplicates: true });
      if (error) logError('FLUSH', 'device_offers insert failed', error);
    }
  }

  if (offerUpdateRows.length > 0) {
    for (let i = 0; i < offerUpdateRows.length; i += UPSERT_BATCH_SIZE) {
      const batch = offerUpdateRows.slice(i, i + UPSERT_BATCH_SIZE);
      const { error } = await supabase
        .from('device_offers')
        .upsert(batch, { onConflict: 'retailer_id,external_id' });
      if (error) logError('FLUSH', 'device_offers update failed', error);
    }
  }

  if (reviewTaskRows.length > 0) {
    for (let i = 0; i < reviewTaskRows.length; i += UPSERT_BATCH_SIZE) {
      const batch = reviewTaskRows.slice(i, i + UPSERT_BATCH_SIZE);
      const { error } = await supabase
        .from('review_tasks')
        .upsert(batch, { onConflict: 'task_type,retailer_product_id', ignoreDuplicates: true });
      if (error) logError('FLUSH', 'review_tasks upsert failed', error);
    }
  }
}

async function main(): Promise<void> {
  const bestBuyApiKey = process.env.BESTBUY_API_KEY;
  if (!bestBuyApiKey) {
    console.error('Missing BESTBUY_API_KEY');
    process.exit(1);
  }

  console.log('=================================================================');
  console.log('  Best Buy Offer Sync');
  console.log('=================================================================');
  console.log(`  Mode:     ${MODE}`);
  if (CATEGORY_FILTER) console.log(`  Category: ${CATEGORY_FILTER}`);
  if (LIMIT) console.log(`  Limit:    ${LIMIT}`);
  if (DRY_RUN) console.log('  ** DRY RUN **');
  console.log(`  Started:  ${new Date().toISOString()}`);
  console.log('=================================================================\n');

  const supabase = getSupabase();
  const bestbuy = await (async (): Promise<Retailer> => {
    const { data, error } = await supabase
      .from('retailers')
      .select('id, name, base_url, shop_domain, api_type, affiliate_tag, affiliate_url_template, is_active')
      .eq('id', 'bestbuy')
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load retailers.bestbuy: ${error.message}`);
    }

    if (data) return data as Retailer;

    // Bootstrap Best Buy retailer row if it's missing.
    const seed = {
      id: 'bestbuy',
      name: 'Best Buy',
      base_url: 'https://www.bestbuy.com',
      shop_domain: 'www.bestbuy.com',
      api_type: 'bestbuy',
      affiliate_tag: null,
      affiliate_url_template: null,
      is_active: true,
    };

    const { data: inserted, error: insertErr } = await supabase
      .from('retailers')
      .insert(seed)
      .select('id, name, base_url, shop_domain, api_type, affiliate_tag, affiliate_url_template, is_active')
      .single();

    if (insertErr || !inserted) {
      throw new Error(
        `Best Buy retailer is missing and could not be created automatically: ${insertErr?.message ?? 'unknown error'}`
      );
    }

    log('INIT', 'Created retailers.bestbuy row (bootstrap)');
    return inserted as Retailer;
  })();

  let products = await loadAllProducts();
  products = products.filter((p) => p.category_id != null);

  // Reduce duplicates/noise: only operate on best variants.
  products = products.filter((p) => p.is_best_variant);

  // Best Buy scope: start with iem + headphone + microphone by default.
  if (!CATEGORY_FILTER) {
    const allowed = new Set(['iem', 'headphone', 'microphone']);
    products = products.filter((p) => p.category_id && allowed.has(p.category_id));
  }

  if (CATEGORY_FILTER) {
    products = products.filter((p) => p.category_id === CATEGORY_FILTER);
  }
  if (LIMIT > 0) {
    products = products.slice(0, LIMIT);
  }

  const existingOffers = await loadExistingOffers(bestbuy.id);
  const existingOfferDevices = await loadExistingOfferDeviceIds(bestbuy.id);
  const discoverList = products.filter((p) => !existingOfferDevices.has(p.id));

  // Refresh uses SKUs directly (not product matching).
  const refreshOffers = MODE === 'refresh' || MODE === 'daily'
    ? existingOffers
    : [];

  log('INIT', `Targets: discover=${discoverList.length} device(s), refresh=${refreshOffers.length} offer(s)`);

  if (!DRY_RUN && (MODE === 'refresh' || MODE === 'daily') && refreshOffers.length > 0) {
    await refreshOffersBySku(bestbuy, bestBuyApiKey, refreshOffers);
  }

  const targetList: Product[] = MODE === 'discover' || MODE === 'daily' ? discoverList : [];

  const state = { delayMs: Math.max(BASE_DELAY_MS, START_DELAY_MS), rateLimited: 0 };
  let processed = 0;
  let auto = 0;
  let pending = 0;
  let skipped = 0;

  if (!DRY_RUN && (MODE === 'discover' || MODE === 'daily')) {
    log('INIT', `Discover strategy: crawl (pageSize=${PAGE_SIZE}, maxPages=${MAX_PAGES_PER_RUN})`);
    const progress = loadProgress();
    const crawlStats = await discoverByCategoryCrawl(bestbuy, bestBuyApiKey, products, state, progress);
    processed += crawlStats.processed;
    auto += crawlStats.auto;
    pending += crawlStats.pending;
    skipped += crawlStats.skipped;
  }

  console.log('\n=================================================================');
  console.log('  BEST BUY SYNC COMPLETE');
  console.log('=================================================================');
  console.log(`  Processed:       ${processed}`);
  console.log(`  Auto-approved:   ${auto}`);
  console.log(`  Pending review:  ${pending}`);
  console.log(`  Skipped:         ${skipped}`);
  console.log(`  Rate limited:    ${state.rateLimited}`);
  console.log('=================================================================\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
