/**
 * sync-prices.ts
 *
 * Main orchestrator that coordinates price scraping across all retailers.
 * Fetches catalogs, matches products, creates price_listings, and denormalizes
 * the lowest price back onto the products table.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> BESTBUY_API_KEY=<key> npx tsx scripts/sync-prices.ts
 *
 * Flags:
 *   --amazon-only       Only run Amazon scraping (skip Shopify & Best Buy)
 *   --skip-amazon       Skip Amazon scraping
 *   --skip-shopify      Skip Shopify catalog fetching
 *   --skip-bestbuy      Skip Best Buy API calls
 *   --limit=N           Process only first N products (by PPI score DESC)
 *   --category=iem      Only process products in this category
 */

import {
  getRetailers,
  getSupabase,
  buildAffiliateUrl,
  FIRST_PARTY_BRAND_STRIP,
  type Retailer,
} from "./config/retailers.ts";
import {
  fetchShopifyCatalog,
  fetchShopifyCollection,
  type ShopifyProduct,
} from "./scrapers/shopify.ts";
import { searchBestBuy } from "./scrapers/bestbuy.ts";
import { searchAmazon, closeBrowser as closeAmazonBrowser } from "./scrapers/amazon.ts";
import { findBestMatch, MATCH_THRESHOLDS } from "./scrapers/matcher.ts";
import { STORE_COLLECTIONS, type CategoryId } from "./config/store-collections.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Product = {
  id: string;
  name: string;
  brand: string | null;
  category_id: string | null;
  ppi_score: number | null;
  price: number | null;
  affiliate_url: string | null;
};

type MatchCandidate = {
  name: string;
  id: string;
  brand?: string | null;
};

type MatchResult = {
  name: string;
  id: string;
  score: number;
};

type RetailerStats = {
  auto: number;
  pending: number;
  skipped: number;
  errors: number;
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PRODUCT_BATCH_SIZE = 1000;
const UPSERT_BATCH_SIZE = 100;
const PROGRESS_LOG_INTERVAL = 100;
const BESTBUY_DELAY_MS = 200; // 5 QPS limit
const AMAZON_DELAY_MS = 3000; // ~1 request per 3 seconds to be respectful

// CLI flags
const AMAZON_ONLY = process.argv.includes("--amazon-only");
const SKIP_AMAZON = process.argv.includes("--skip-amazon");
const SKIP_SHOPIFY = process.argv.includes("--skip-shopify");
const SKIP_BESTBUY = process.argv.includes("--skip-bestbuy");
const PRODUCT_LIMIT = (() => {
  const idx = process.argv.findIndex((a) => a.startsWith("--limit="));
  if (idx >= 0) return parseInt(process.argv[idx].split("=")[1], 10);
  return 0; // 0 = no limit
})();
const CATEGORY_FILTER = (() => {
  const idx = process.argv.findIndex((a) => a.startsWith("--category="));
  if (idx >= 0) return process.argv[idx].split("=")[1];
  return ""; // empty = all categories
})();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function log(phase: string, msg: string): void {
  console.log(`[${timestamp()}] [${phase}] ${msg}`);
}

function logError(phase: string, msg: string, err: unknown): void {
  const detail =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null
        ? JSON.stringify(err)
        : String(err);
  console.error(`[${timestamp()}] [${phase}] ERROR: ${msg} — ${detail}`);
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

async function loadAllProducts(): Promise<Product[]> {
  const supabase = getSupabase();
  const allProducts: Product[] = [];
  let offset = 0;

  log("LOAD", "Loading products from Supabase (brand IS NOT NULL, ordered by ppi_score DESC)...");

  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, brand, category_id, ppi_score, price, affiliate_url")
      .not("brand", "is", null)
      .order("ppi_score", { ascending: false })
      .range(offset, offset + PRODUCT_BATCH_SIZE - 1);

    if (error) {
      logError("LOAD", `Failed to load products at offset ${offset}`, error);
      break;
    }

    const batch = (data ?? []) as Product[];
    if (batch.length === 0) break;

    allProducts.push(...batch);
    log("LOAD", `Loaded ${allProducts.length} products so far (batch of ${batch.length})`);
    offset += PRODUCT_BATCH_SIZE;

    if (batch.length < PRODUCT_BATCH_SIZE) break;
  }

  log("LOAD", `Total products loaded: ${allProducts.length}`);
  return allProducts;
}

async function upsertBatch(
  table: string,
  rows: Record<string, unknown>[],
  conflictColumns: string,
  phase: string
): Promise<number> {
  if (rows.length === 0) return 0;

  const supabase = getSupabase();
  let successCount = 0;

  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
    const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(rows.length / UPSERT_BATCH_SIZE);

    try {
      const { error } = await supabase
        .from(table)
        .upsert(batch, { onConflict: conflictColumns });

      if (error) {
        logError(phase, `Upsert ${table} batch ${batchNum}/${totalBatches} failed`, error);
      } else {
        successCount += batch.length;
        log(phase, `Upserted ${table} batch ${batchNum}/${totalBatches} (${batch.length} rows)`);
      }
    } catch (err) {
      logError(phase, `Upsert ${table} batch ${batchNum}/${totalBatches} exception`, err);
    }
  }

  return successCount;
}

// ---------------------------------------------------------------------------
// Phase A: Fetch Shopify catalogs
// ---------------------------------------------------------------------------

async function fetchShopifyCatalogs(
  retailers: Retailer[]
): Promise<{
  catalogs: Map<string, ShopifyProduct[]>;
  collectionCategories: Map<string, Map<string, CategoryId>>;
}> {
  const shopifyRetailers = retailers.filter((r) => r.api_type === "shopify");
  const catalogs = new Map<string, ShopifyProduct[]>();
  const collectionCategories = new Map<string, Map<string, CategoryId>>();
  const CONCURRENCY = 4; // Fetch up to 4 stores in parallel

  log("PHASE-A", `Fetching catalogs for ${shopifyRetailers.length} Shopify retailer(s) (concurrency: ${CONCURRENCY})...`);

  for (let i = 0; i < shopifyRetailers.length; i += CONCURRENCY) {
    const batch = shopifyRetailers.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (retailer) => {
        // Check if this retailer has collection mappings in STORE_COLLECTIONS
        const storeEntry = Object.entries(STORE_COLLECTIONS)
          .find(([_domain, config]) => config.retailerId === retailer.id);

        if (storeEntry) {
          // Per-collection fetch: use collection URLs as category gates
          const [domain, config] = storeEntry;
          log("PHASE-A", `Fetching ${config.collections.length} collections for "${retailer.name}" (${domain})...`);

          const allProducts: ShopifyProduct[] = [];
          const handleCategoryMap = new Map<string, CategoryId>();

          for (const mapping of config.collections) {
            try {
              const products = await fetchShopifyCollection(domain, mapping.handle);
              for (const p of products) {
                allProducts.push(p);
                // First collection wins (a product may appear in multiple collections)
                if (!handleCategoryMap.has(p.handle)) {
                  handleCategoryMap.set(p.handle, mapping.categoryId);
                }
              }
              log("PHASE-A", `  ${retailer.name}/${mapping.handle}: ${products.length} products (-> ${mapping.categoryId})`);
            } catch (err) {
              logError("PHASE-A", `Collection fetch failed: ${retailer.name}/${mapping.handle}`, err);
            }
          }

          // Deduplicate by handle
          const seen = new Set<string>();
          const deduped = allProducts.filter(p => {
            if (seen.has(p.handle)) return false;
            seen.add(p.handle);
            return true;
          });

          return { retailerId: retailer.id, name: retailer.name, catalog: deduped, handleCategories: handleCategoryMap };
        } else {
          // Fallback: full catalog fetch for retailers not in STORE_COLLECTIONS
          log("PHASE-A", `Fetching full catalog for "${retailer.name}" (${retailer.shop_domain})...`);
          const catalog = await fetchShopifyCatalog(retailer.shop_domain);
          return { retailerId: retailer.id, name: retailer.name, catalog, handleCategories: null };
        }
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        catalogs.set(result.value.retailerId, result.value.catalog);
        if (result.value.handleCategories) {
          collectionCategories.set(result.value.retailerId, result.value.handleCategories);
        }
        log("PHASE-A", `"${result.value.name}": ${result.value.catalog.length} products fetched${result.value.handleCategories ? ` (${result.value.handleCategories.size} handle->category mappings)` : ''}`);
      } else {
        logError("PHASE-A", "Catalog fetch failed", result.reason);
      }
    }
  }

  log("PHASE-A", `Catalogs fetched: ${catalogs.size}/${shopifyRetailers.length} retailers`);
  return { catalogs, collectionCategories };
}

// ---------------------------------------------------------------------------
// Cross-category guard: build handle-to-category lookup per retailer
// ---------------------------------------------------------------------------

/**
 * Build a mapping of (retailer_id -> (external_id/handle -> category_id))
 * from the store_products table. This allows us to verify that a Shopify match
 * is in the same category as the canonical product before creating a listing.
 */
async function loadStoreProductCategories(
  retailerIds: string[]
): Promise<Map<string, Map<string, string>>> {
  const supabase = getSupabase();
  const result = new Map<string, Map<string, string>>();

  for (const rId of retailerIds) {
    result.set(rId, new Map());
  }

  let offset = 0;
  const PAGE_SIZE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('store_products')
      .select('retailer_id, external_id, category_id')
      .in('retailer_id', retailerIds)
      .not('category_id', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      logError('GUARD', 'Failed to load store_product categories', error);
      break;
    }

    if (!data || data.length === 0) break;

    for (const row of data as { retailer_id: string; external_id: string; category_id: string }[]) {
      const rMap = result.get(row.retailer_id);
      if (rMap) rMap.set(row.external_id, row.category_id);
    }

    offset += PAGE_SIZE;
    if (data.length < PAGE_SIZE) break;
  }

  log('GUARD', `Loaded store_product category mappings for ${retailerIds.length} retailer(s)`);
  for (const [rId, map] of result) {
    if (map.size > 0) log('GUARD', `  ${rId}: ${map.size} handle->category entries`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Phase B: Match products
// ---------------------------------------------------------------------------

function buildShopifyCandidates(catalog: ShopifyProduct[], retailerId?: string): MatchCandidate[] {
  const isFirstParty = retailerId ? retailerId in FIRST_PARTY_BRAND_STRIP : false;

  return catalog.map((p) => {
    // For first-party stores, skip vendor prepending — the vendor IS the store brand
    // and prepending it creates noise that hurts match accuracy.
    if (isFirstParty) {
      return { name: p.title, id: p.handle, brand: p.vendor || null };
    }

    // For third-party retailers, include vendor in the name for better matching
    const nameWithVendor =
      p.vendor && !p.title.toLowerCase().includes(p.vendor.toLowerCase())
        ? `${p.vendor} ${p.title}`
        : p.title;
    return { name: nameWithVendor, id: p.handle, brand: p.vendor || null };
  });
}

/**
 * Strip the store's own brand from a product name for first-party store matching.
 * E.g., "64 Audio U12t" on 64audio.com → "U12t" for much better match confidence.
 */
function stripFirstPartyBrand(productName: string, retailerId: string): string {
  const brands = FIRST_PARTY_BRAND_STRIP[retailerId];
  if (!brands) return productName;

  for (const brand of brands) {
    if (productName.toLowerCase().startsWith(brand.toLowerCase())) {
      const stripped = productName.slice(brand.length).trim();
      // Only strip if there's still meaningful content left
      if (stripped.length > 0) return stripped;
    }
  }

  return productName;
}

async function matchProducts(
  products: Product[],
  retailers: Retailer[],
  shopifyCatalogs: Map<string, ShopifyProduct[]>,
  bestBuyApiKey: string | undefined,
  storeProductCategories: Map<string, Map<string, string>>,
  collectionCategories: Map<string, Map<string, CategoryId>>
): Promise<{
  matchRows: Record<string, unknown>[];
  listingRows: Record<string, unknown>[];
  stats: Map<string, RetailerStats>;
}> {
  const matchRows: Record<string, unknown>[] = [];
  const listingRows: Record<string, unknown>[] = [];
  const stats = new Map<string, RetailerStats>();

  const shopifyRetailers = retailers.filter((r) => r.api_type === "shopify");
  const bestBuyRetailer = retailers.find((r) => r.api_type === "bestbuy");
  const amazonRetailer = retailers.find((r) => r.api_type === "amazon");

  // Initialize stats
  for (const r of retailers) {
    stats.set(r.id, { auto: 0, pending: 0, skipped: 0, errors: 0 });
  }

  // Pre-build candidate lists for Shopify retailers
  const shopifyCandidates = new Map<string, MatchCandidate[]>();
  for (const r of shopifyRetailers) {
    const catalog = shopifyCatalogs.get(r.id);
    if (catalog) {
      shopifyCandidates.set(r.id, buildShopifyCandidates(catalog, r.id));
    }
  }

  // Build a lookup map for Shopify products by handle per retailer
  const shopifyProductByHandle = new Map<string, Map<string, ShopifyProduct>>();
  for (const r of shopifyRetailers) {
    const catalog = shopifyCatalogs.get(r.id);
    if (catalog) {
      const byHandle = new Map<string, ShopifyProduct>();
      for (const p of catalog) {
        byHandle.set(p.handle, p);
      }
      shopifyProductByHandle.set(r.id, byHandle);
    }
  }

  const FLUSH_INTERVAL = 500;

  async function flushRows() {
    if (matchRows.length > 0) {
      log("PHASE-B", `Flushing ${matchRows.length} matches, ${listingRows.length} listings to Supabase...`);
      await upsertBatch("product_matches", [...matchRows], "product_id,retailer_id", "PHASE-B-FLUSH");
      await upsertBatch("price_listings", [...listingRows], "product_id,retailer_id", "PHASE-B-FLUSH");
      matchRows.length = 0;
      listingRows.length = 0;
    }
  }

  log("PHASE-B", `Matching ${products.length} products against ${retailers.length} retailer(s)...`);

  for (let pi = 0; pi < products.length; pi++) {
    const product = products[pi];

    if ((pi + 1) % PROGRESS_LOG_INTERVAL === 0 || pi === 0) {
      log("PHASE-B", `Processing product ${pi + 1}/${products.length}: "${product.name}"`);
    }

    // Flush accumulated rows every FLUSH_INTERVAL products
    if (pi > 0 && pi % FLUSH_INTERVAL === 0) {
      await flushRows();
    }

    // --- Shopify retailers ---
    if (!AMAZON_ONLY && !SKIP_SHOPIFY)
    for (const retailer of shopifyRetailers) {
      const rStats = stats.get(retailer.id)!;
      const candidates = shopifyCandidates.get(retailer.id);
      if (!candidates || candidates.length === 0) continue;

      try {
        // For first-party stores, strip the store's own brand from the product name
        // to improve match accuracy (e.g., "64 Audio U12t" → "U12t" on 64audio.com)
        const matchName = stripFirstPartyBrand(product.name, retailer.id);

        // Skip brand penalty for first-party stores (the store IS the brand)
        const isFirstParty = retailer.id in FIRST_PARTY_BRAND_STRIP;
        const matchBrand = isFirstParty ? null : product.brand;

        const match = findBestMatch(
          matchName,
          candidates,
          { productBrand: matchBrand },
        ) as MatchResult | null;

        if (!match || match.score < MATCH_THRESHOLDS.PENDING_REVIEW) {
          rStats.skipped++;
          continue;
        }

        // Double-layer cross-category guard:
        // 1. Check store_products table (from previous sync-stores runs)
        // 2. Check collection-based category mappings (from per-collection fetch)
        if (product.category_id) {
          const storeCategory = storeProductCategories.get(retailer.id)?.get(match.id);
          const collectionCategory = collectionCategories.get(retailer.id)?.get(match.id);
          const guardedCategory = storeCategory || collectionCategory;
          if (guardedCategory && guardedCategory !== product.category_id) {
            log('GUARD', `Cross-category match skipped: "${product.name}" (${product.category_id}) -> "${match.name}" (${guardedCategory}) @ ${retailer.name} (score=${match.score.toFixed(3)})`);
            rStats.skipped++;
            continue;
          }
        }

        const isAutoApprove = match.score >= MATCH_THRESHOLDS.AUTO_APPROVE;
        const status = isAutoApprove ? "approved" : "pending";

        // Look up the actual Shopify product for price/image/availability
        const handleMap = shopifyProductByHandle.get(retailer.id);
        const shopifyProduct = handleMap?.get(match.id);
        const firstVariant = shopifyProduct?.variants?.[0];
        const price = firstVariant ? parseFloat(firstVariant.price) : null;
        const inStock = firstVariant?.available ?? false;
        const imageUrl = shopifyProduct?.images?.[0]?.src ?? null;
        const productUrl = `https://${retailer.shop_domain}/products/${match.id}`;

        // Build product_matches row
        matchRows.push({
          product_id: product.id,
          retailer_id: retailer.id,
          external_id: match.id,
          external_name: match.name,
          external_price: price,
          match_score: match.score,
          status,
        });

        if (isAutoApprove) {
          rStats.auto++;
        } else {
          rStats.pending++;
        }

        // If auto-approved, also create a price_listing
        if (isAutoApprove && price !== null) {
          const affiliateUrl = buildAffiliateUrl(
            retailer,
            productUrl,
            match.id,
            String(shopifyProduct?.id ?? "")
          );

          listingRows.push({
            product_id: product.id,
            retailer_id: retailer.id,
            external_id: match.id,
            price,
            currency: "USD",
            in_stock: inStock,
            product_url: productUrl,
            affiliate_url: affiliateUrl ?? productUrl,
            image_url: imageUrl,
            last_checked: new Date().toISOString(),
          });
        }
      } catch (err) {
        rStats.errors++;
        logError("PHASE-B", `Shopify match error for "${product.name}" @ "${retailer.name}"`, err);
      }
    }

    // --- Best Buy ---
    if (bestBuyRetailer && bestBuyApiKey && !AMAZON_ONLY && !SKIP_BESTBUY) {
      const rStats = stats.get(bestBuyRetailer.id)!;

      try {
        const bbResults = await searchBestBuy(product.name, bestBuyApiKey);

        if (bbResults.length > 0) {
          // Build candidates from Best Buy results
          const bbCandidates: MatchCandidate[] = bbResults.map((bp) => ({
            name: bp.name,
            id: String(bp.sku),
          }));

          const match = findBestMatch(
            product.name,
            bbCandidates,
            { productBrand: product.brand },
          ) as MatchResult | null;

          if (match && match.score >= MATCH_THRESHOLDS.PENDING_REVIEW) {
            const isAutoApprove = match.score >= MATCH_THRESHOLDS.AUTO_APPROVE;
            const status = isAutoApprove ? "approved" : "pending";

            // Find the full Best Buy product data
            const bbProduct = bbResults.find((bp) => String(bp.sku) === match.id);
            const price = bbProduct?.salePrice ?? bbProduct?.regularPrice ?? null;
            const inStock = bbProduct?.onlineAvailability ?? false;
            const imageUrl = bbProduct?.image ?? null;
            const productUrl = bbProduct?.url ?? `https://www.bestbuy.com/site/${match.id}.p`;

            matchRows.push({
              product_id: product.id,
              retailer_id: bestBuyRetailer.id,
              external_id: match.id,
              external_name: match.name,
              external_price: price,
              match_score: match.score,
              status,
            });

            if (isAutoApprove) {
              rStats.auto++;
            } else {
              rStats.pending++;
            }

            if (isAutoApprove && price !== null) {
              const affiliateUrl = buildAffiliateUrl(
                bestBuyRetailer,
                productUrl,
                match.id,
                match.id
              );

              listingRows.push({
                product_id: product.id,
                retailer_id: bestBuyRetailer.id,
                external_id: match.id,
                price,
                currency: "USD",
                in_stock: inStock,
                product_url: productUrl,
                affiliate_url: affiliateUrl ?? productUrl,
                image_url: imageUrl,
                last_checked: new Date().toISOString(),
              });
            }
          } else {
            rStats.skipped++;
          }
        } else {
          rStats.skipped++;
        }

        // Respect 5 QPS rate limit
        await delay(BESTBUY_DELAY_MS);
      } catch (err) {
        rStats.errors++;
        logError("PHASE-B", `Best Buy match error for "${product.name}"`, err);
        await delay(BESTBUY_DELAY_MS);
      }
    }

    // --- Amazon ---
    if (amazonRetailer && !SKIP_AMAZON) {
      const rStats = stats.get(amazonRetailer.id)!;

      try {
        // Use the product name directly — it typically already includes the brand
        // Only prepend brand if the product name doesn't already contain it
        let searchQuery = product.name;
        if (
          product.brand &&
          !product.name.toLowerCase().includes(product.brand.toLowerCase())
        ) {
          searchQuery = `${product.brand} ${product.name}`;
        }

        const azResults = await searchAmazon(searchQuery, {
          maxResults: 5,
          affiliateTag: amazonRetailer.affiliate_tag ?? undefined,
        });

        if (azResults.length > 0) {
          // Build candidates from Amazon results
          const azCandidates: MatchCandidate[] = azResults
            .filter((ap) => ap.name && ap.name.length > 3) // Skip truncated names
            .map((ap) => ({
              name: ap.name,
              id: ap.asin,
            }));

          if (azCandidates.length > 0) {
            const match = findBestMatch(
              product.name,
              azCandidates,
              { productBrand: product.brand },
            ) as MatchResult | null;

            if (match && match.score >= MATCH_THRESHOLDS.PENDING_REVIEW) {
              const isAutoApprove = match.score >= MATCH_THRESHOLDS.AUTO_APPROVE;
              const status = isAutoApprove ? "approved" : "pending";

              // Find the full Amazon product data
              const azProduct = azResults.find((ap) => ap.asin === match.id);
              const price = azProduct?.price ?? null;
              const inStock = azProduct?.inStock ?? false;
              const imageUrl = azProduct?.image ?? null;

              // Build the affiliate URL using the ASIN
              const affiliateUrl = buildAffiliateUrl(
                amazonRetailer,
                azProduct?.url ?? `https://www.amazon.com/dp/${match.id}`,
                match.id,
                match.id // ASIN as external_id
              );

              matchRows.push({
                product_id: product.id,
                retailer_id: amazonRetailer.id,
                external_id: match.id,
                external_name: match.name,
                external_price: price,
                match_score: match.score,
                status,
              });

              if (isAutoApprove) {
                rStats.auto++;
              } else {
                rStats.pending++;
              }

              if (isAutoApprove && price !== null && price > 0) {
                listingRows.push({
                  product_id: product.id,
                  retailer_id: amazonRetailer.id,
                  external_id: match.id,
                  price,
                  currency: "USD",
                  in_stock: inStock,
                  product_url: azProduct?.url ?? `https://www.amazon.com/dp/${match.id}`,
                  affiliate_url: affiliateUrl ?? `https://www.amazon.com/dp/${match.id}?tag=${amazonRetailer.affiliate_tag}`,
                  image_url: imageUrl,
                  last_checked: new Date().toISOString(),
                });
              }
            } else {
              rStats.skipped++;
            }
          } else {
            rStats.skipped++;
          }
        } else {
          rStats.skipped++;
        }

        // Rate limit — Amazon needs a longer delay to avoid blocks
        await delay(AMAZON_DELAY_MS);
      } catch (err) {
        rStats.errors++;
        logError("PHASE-B", `Amazon match error for "${product.name}"`, err);
        await delay(AMAZON_DELAY_MS);
      }
    }
  }

  // Final flush
  await flushRows();

  log("PHASE-B", `Matching complete.`);
  return { matchRows, listingRows, stats };
}

// ---------------------------------------------------------------------------
// Phase C: Upsert matches & price_listings
// ---------------------------------------------------------------------------

async function upsertMatchesAndListings(
  matchRows: Record<string, unknown>[],
  listingRows: Record<string, unknown>[]
): Promise<{ matchesUpserted: number; listingsUpserted: number }> {
  log("PHASE-C", `Upserting ${matchRows.length} product_matches...`);
  const matchesUpserted = await upsertBatch(
    "product_matches",
    matchRows,
    "product_id,retailer_id",
    "PHASE-C"
  );

  log("PHASE-C", `Upserting ${listingRows.length} price_listings...`);
  const listingsUpserted = await upsertBatch(
    "price_listings",
    listingRows,
    "product_id,retailer_id",
    "PHASE-C"
  );

  log("PHASE-C", `Upserted: ${matchesUpserted} matches, ${listingsUpserted} listings`);
  return { matchesUpserted, listingsUpserted };
}

// ---------------------------------------------------------------------------
// Phase D: Denormalize lowest price onto products
// ---------------------------------------------------------------------------

async function denormalizeLowestPrices(): Promise<number> {
  const supabase = getSupabase();

  log("PHASE-D", "Finding lowest in-stock price per product...");

  // Fetch all in-stock price_listings (paginated to avoid Supabase 1000-row default limit)
  const PAGE_SIZE = 1000;
  const listings: { product_id: string; price: number; affiliate_url: string | null; product_url: string | null; image_url: string | null }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("price_listings")
      .select("product_id, price, affiliate_url, product_url, image_url")
      .eq("in_stock", true)
      .order("price", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      logError("PHASE-D", "Failed to fetch price_listings", error);
      return 0;
    }

    if (!data || data.length === 0) break;
    listings.push(...data);
    offset += data.length;
    if (data.length < PAGE_SIZE) break;
  }

  if (listings.length === 0) {
    log("PHASE-D", "No in-stock listings found. Nothing to denormalize.");
    return 0;
  }

  log("PHASE-D", `Fetched ${listings.length} in-stock listings`);

  // Group by product_id, keep only the lowest price per product
  const lowestByProduct = new Map<
    string,
    { price: number; affiliate_url: string | null; image_url: string | null }
  >();

  for (const listing of listings) {
    const existing = lowestByProduct.get(listing.product_id);
    if (!existing || listing.price < existing.price) {
      lowestByProduct.set(listing.product_id, {
        price: listing.price,
        affiliate_url: listing.affiliate_url ?? listing.product_url,
        image_url: listing.image_url,
      });
    }
  }

  // Second pass: fill in missing images from any listing that has one
  for (const listing of listings) {
    const existing = lowestByProduct.get(listing.product_id);
    if (existing && !existing.image_url && listing.image_url) {
      existing.image_url = listing.image_url;
    }
  }

  log("PHASE-D", `Found lowest prices for ${lowestByProduct.size} product(s). Updating...`);

  // Update products individually (can't upsert since we only have partial columns)
  let updatedCount = 0;
  const entries = Array.from(lowestByProduct.entries());
  for (let i = 0; i < entries.length; i += UPSERT_BATCH_SIZE) {
    const batch = entries.slice(i, i + UPSERT_BATCH_SIZE);
    const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(entries.length / UPSERT_BATCH_SIZE);

    try {
      let batchSuccess = 0;
      for (const [productId, info] of batch) {
        const updatePayload: { price: number; affiliate_url: string | null; image_url?: string } = {
          price: info.price,
          affiliate_url: info.affiliate_url,
        };
        if (info.image_url) {
          updatePayload.image_url = info.image_url;
        }
        const { error: updateError } = await supabase
          .from("products")
          .update(updatePayload)
          .eq("id", productId);

        if (updateError) {
          logError("PHASE-D", `Failed to update product ${productId}`, updateError);
        } else {
          batchSuccess++;
        }
      }
      updatedCount += batchSuccess;
      log("PHASE-D", `Updated products batch ${batchNum}/${totalBatches} (${batchSuccess}/${batch.length} rows)`);
    } catch (err) {
      logError("PHASE-D", `Update batch ${batchNum}/${totalBatches} exception`, err);
    }
  }

  log("PHASE-D", `Denormalized prices for ${updatedCount} product(s)`);
  return updatedCount;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log("=================================================================");
  console.log("  AudioList Price Sync");
  console.log(`  Started at ${new Date().toISOString()}`);
  console.log("=================================================================\n");

  // Validate environment
  const bestBuyApiKey = process.env.BESTBUY_API_KEY;
  if (!bestBuyApiKey) {
    log("INIT", "BESTBUY_API_KEY not set — Best Buy scraping will be skipped.");
  } else {
    log("INIT", "BESTBUY_API_KEY found — Best Buy scraping enabled.");
  }

  if (!SKIP_AMAZON && !AMAZON_ONLY) {
    log("INIT", "Amazon scraping enabled (Playwright headless browser).");
  } else if (AMAZON_ONLY) {
    log("INIT", "Amazon-only mode — skipping Shopify and Best Buy.");
  } else if (SKIP_AMAZON) {
    log("INIT", "Amazon scraping disabled (--skip-amazon).");
  }
  if (PRODUCT_LIMIT > 0) {
    log("INIT", `Product limit: ${PRODUCT_LIMIT}`);
  }
  if (CATEGORY_FILTER) {
    log("INIT", `Category filter: ${CATEGORY_FILTER}`);
  }

  // Step 1: Load retailers
  log("INIT", "Loading active retailers from Supabase...");
  const retailers = await getRetailers();
  if (retailers.length === 0) {
    log("INIT", "No active retailers found. Exiting.");
    return;
  }
  log("INIT", `Loaded ${retailers.length} active retailer(s): ${retailers.map((r) => r.name).join(", ")}`);

  // Step 2: Load products
  let products = await loadAllProducts();
  if (products.length === 0) {
    log("INIT", "No products with brand found. Exiting.");
    return;
  }

  // Apply category filter
  if (CATEGORY_FILTER) {
    products = products.filter((p) => p.category_id === CATEGORY_FILTER);
    log("INIT", `Filtered to ${products.length} products in category "${CATEGORY_FILTER}"`);
  }

  // Apply product limit
  if (PRODUCT_LIMIT > 0 && products.length > PRODUCT_LIMIT) {
    products = products.slice(0, PRODUCT_LIMIT);
    log("INIT", `Limited to first ${PRODUCT_LIMIT} products (sorted by PPI score DESC)`);
  }

  // Phase A: Fetch Shopify catalogs
  console.log("\n--- Phase A: Fetch Shopify Catalogs ---\n");
  let shopifyCatalogs: Map<string, ShopifyProduct[]>;
  let collectionCategories: Map<string, Map<string, CategoryId>>;
  if (AMAZON_ONLY || SKIP_SHOPIFY) {
    shopifyCatalogs = new Map();
    collectionCategories = new Map();
    log("PHASE-A", "Skipped (Amazon-only or --skip-shopify mode).");
  } else {
    const result = await fetchShopifyCatalogs(retailers);
    shopifyCatalogs = result.catalogs;
    collectionCategories = result.collectionCategories;
  }

  // Load store_product category mappings for cross-category guard
  const shopifyRetailerIds = retailers
    .filter((r) => r.api_type === "shopify")
    .map((r) => r.id);
  const storeProductCategories = shopifyRetailerIds.length > 0
    ? await loadStoreProductCategories(shopifyRetailerIds)
    : new Map<string, Map<string, string>>();

  // Phase B: Match products
  console.log("\n--- Phase B: Match Products ---\n");
  const { matchRows, listingRows, stats } = await matchProducts(
    products,
    retailers,
    shopifyCatalogs,
    bestBuyApiKey,
    storeProductCategories,
    collectionCategories
  );

  // Phase C: Upsert matches and price_listings
  console.log("\n--- Phase C: Upsert Matches & Price Listings ---\n");
  const { matchesUpserted, listingsUpserted } = await upsertMatchesAndListings(
    matchRows,
    listingRows
  );

  // Phase D: Denormalize lowest price
  console.log("\n--- Phase D: Denormalize Lowest Price ---\n");
  const productsUpdated = await denormalizeLowestPrices();

  // Clean up Amazon browser
  await closeAmazonBrowser();

  // Final summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n=================================================================");
  console.log("  SYNC COMPLETE");
  console.log("=================================================================");
  console.log(`  Duration:                 ${elapsed}s`);
  console.log(`  Products processed:       ${products.length}`);
  console.log(`  Retailers:                ${retailers.length}`);
  console.log("");
  console.log("  Matches per retailer:");
  for (const [retailerId, rStats] of stats) {
    const retailer = retailers.find((r) => r.id === retailerId);
    const name = retailer?.name ?? retailerId;
    console.log(`    ${name}:`);
    console.log(`      Auto-approved:  ${rStats.auto}`);
    console.log(`      Pending review: ${rStats.pending}`);
    console.log(`      Skipped:        ${rStats.skipped}`);
    console.log(`      Errors:         ${rStats.errors}`);
  }
  console.log("");
  console.log(`  product_matches upserted: ${matchesUpserted}`);
  console.log(`  price_listings upserted:  ${listingsUpserted}`);
  console.log(`  products.price updated:   ${productsUpdated}`);
  console.log("=================================================================\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
