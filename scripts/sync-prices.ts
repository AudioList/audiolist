/**
 * sync-prices.ts
 *
 * Main orchestrator that coordinates price scraping across all retailers.
 * Fetches catalogs, matches products, creates price_listings, and denormalizes
 * the lowest price back onto the products table.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> BESTBUY_API_KEY=<key> npx tsx scripts/sync-prices.ts
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
  type ShopifyProduct,
} from "./scrapers/shopify.ts";
import { searchBestBuy } from "./scrapers/bestbuy.ts";
import { findBestMatch, MATCH_THRESHOLDS } from "./scrapers/matcher.ts";

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
): Promise<Map<string, ShopifyProduct[]>> {
  const shopifyRetailers = retailers.filter((r) => r.api_type === "shopify");
  const catalogs = new Map<string, ShopifyProduct[]>();
  const CONCURRENCY = 4; // Fetch up to 4 stores in parallel

  log("PHASE-A", `Fetching catalogs for ${shopifyRetailers.length} Shopify retailer(s) (concurrency: ${CONCURRENCY})...`);

  for (let i = 0; i < shopifyRetailers.length; i += CONCURRENCY) {
    const batch = shopifyRetailers.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (retailer) => {
        log("PHASE-A", `Fetching catalog for "${retailer.name}" (${retailer.shop_domain})...`);
        const catalog = await fetchShopifyCatalog(retailer.shop_domain);
        return { retailerId: retailer.id, name: retailer.name, catalog };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        catalogs.set(result.value.retailerId, result.value.catalog);
        log("PHASE-A", `"${result.value.name}": ${result.value.catalog.length} products fetched`);
      } else {
        logError("PHASE-A", "Catalog fetch failed", result.reason);
      }
    }
  }

  log("PHASE-A", `Catalogs fetched: ${catalogs.size}/${shopifyRetailers.length} retailers`);
  return catalogs;
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
      return { name: p.title, id: p.handle };
    }

    // For third-party retailers, include vendor in the name for better matching
    const nameWithVendor =
      p.vendor && !p.title.toLowerCase().includes(p.vendor.toLowerCase())
        ? `${p.vendor} ${p.title}`
        : p.title;
    return { name: nameWithVendor, id: p.handle };
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
  bestBuyApiKey: string | undefined
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
    for (const retailer of shopifyRetailers) {
      const rStats = stats.get(retailer.id)!;
      const candidates = shopifyCandidates.get(retailer.id);
      if (!candidates || candidates.length === 0) continue;

      try {
        // For first-party stores, strip the store's own brand from the product name
        // to improve match accuracy (e.g., "64 Audio U12t" → "U12t" on 64audio.com)
        const matchName = stripFirstPartyBrand(product.name, retailer.id);

        const match = findBestMatch(
          matchName,
          candidates
        ) as MatchResult | null;

        if (!match || match.score < MATCH_THRESHOLDS.PENDING_REVIEW) {
          rStats.skipped++;
          continue;
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
    if (bestBuyRetailer && bestBuyApiKey) {
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
            bbCandidates
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
  const listings: { product_id: string; price: number; affiliate_url: string | null; product_url: string | null }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("price_listings")
      .select("product_id, price, affiliate_url, product_url")
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
    { price: number; affiliate_url: string | null }
  >();

  for (const listing of listings) {
    const existing = lowestByProduct.get(listing.product_id);
    if (!existing || listing.price < existing.price) {
      lowestByProduct.set(listing.product_id, {
        price: listing.price,
        affiliate_url: listing.affiliate_url ?? listing.product_url,
      });
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
        const { error: updateError } = await supabase
          .from("products")
          .update({ price: info.price, affiliate_url: info.affiliate_url })
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

  // Step 1: Load retailers
  log("INIT", "Loading active retailers from Supabase...");
  const retailers = await getRetailers();
  if (retailers.length === 0) {
    log("INIT", "No active retailers found. Exiting.");
    return;
  }
  log("INIT", `Loaded ${retailers.length} active retailer(s): ${retailers.map((r) => r.name).join(", ")}`);

  // Step 2: Load products
  const products = await loadAllProducts();
  if (products.length === 0) {
    log("INIT", "No products with brand found. Exiting.");
    return;
  }

  // Phase A: Fetch Shopify catalogs
  console.log("\n--- Phase A: Fetch Shopify Catalogs ---\n");
  const shopifyCatalogs = await fetchShopifyCatalogs(retailers);

  // Phase B: Match products
  console.log("\n--- Phase B: Match Products ---\n");
  const { matchRows, listingRows, stats } = await matchProducts(
    products,
    retailers,
    shopifyCatalogs,
    bestBuyApiKey
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
