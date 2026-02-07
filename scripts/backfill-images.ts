/**
 * backfill-images.ts
 *
 * One-time script to copy image_url from price_listings to products
 * where the product currently has no image but a retailer listing does.
 *
 * Image source priority:
 *   1. Shopify CDN (cdn.shopify.com) — stable, high quality
 *   2. Any other non-Amazon URL
 *   3. Amazon CDN (media-amazon.com) — can expire/change
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/backfill-images.ts
 *
 * Flags:
 *   --dry-run   Show what would be updated without making changes
 */

import { getSupabase } from "./config/retailers.ts";

const DRY_RUN = process.argv.includes("--dry-run");
const PAGE_SIZE = 1000;
const UPDATE_BATCH_SIZE = 50;

function log(phase: string, msg: string) {
  console.log(`[${phase}] ${msg}`);
}

function logError(phase: string, msg: string, err: unknown) {
  console.error(`[${phase}] ${msg}:`, err);
}

/**
 * Score an image URL by source quality.
 * Higher = better.
 */
function scoreImageUrl(url: string): number {
  if (url.includes("cdn.shopify.com")) return 3;
  if (url.includes("media-amazon.com")) return 1;
  return 2; // other sources (KEF, etc.)
}

/**
 * Pick the best image from a list of candidate URLs.
 */
function pickBestImage(urls: string[]): string | null {
  if (urls.length === 0) return null;
  urls.sort((a, b) => scoreImageUrl(b) - scoreImageUrl(a));
  return urls[0];
}

async function main(): Promise<void> {
  const startTime = Date.now();
  const supabase = getSupabase();

  console.log("=================================================================");
  console.log("  AudioList Image Backfill");
  console.log(`  Started at ${new Date().toISOString()}`);
  if (DRY_RUN) console.log("  ** DRY RUN MODE — no changes will be made **");
  console.log("=================================================================\n");

  // Step 1: Fetch all product IDs that are missing images
  log("STEP-1", "Fetching products with no image...");
  const productIds: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("id")
      .is("image_url", null)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      logError("STEP-1", "Failed to fetch products", error);
      return;
    }

    if (!data || data.length === 0) break;
    productIds.push(...data.map((p) => p.id));
    offset += data.length;
    if (data.length < PAGE_SIZE) break;
  }

  log("STEP-1", `Found ${productIds.length} products missing images`);

  if (productIds.length === 0) {
    log("DONE", "No products need image backfill. Exiting.");
    return;
  }

  // Step 2: Fetch ALL price_listings that have images (paginated)
  // Then filter to only those whose product_id is in our missing-image set
  log("STEP-2", "Fetching all price_listings with images...");
  const missingSet = new Set(productIds);
  const imageMap = new Map<string, string[]>(); // product_id -> candidate image URLs
  let listingsFetched = 0;
  let listingsOffset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("price_listings")
      .select("product_id, image_url")
      .not("image_url", "is", null)
      .range(listingsOffset, listingsOffset + PAGE_SIZE - 1);

    if (error) {
      logError("STEP-2", `Failed to fetch listings page at offset ${listingsOffset}`, error);
      break;
    }

    if (!data || data.length === 0) break;

    for (const row of data) {
      if (!row.image_url || !missingSet.has(row.product_id)) continue;
      const existing = imageMap.get(row.product_id) ?? [];
      existing.push(row.image_url);
      imageMap.set(row.product_id, existing);
      listingsFetched++;
    }

    listingsOffset += data.length;
    if (data.length < PAGE_SIZE) break;
  }

  log("STEP-2", `Scanned ${listingsOffset} listing(s), found ${listingsFetched} with images for ${imageMap.size} product(s)`);

  if (imageMap.size === 0) {
    log("DONE", "No images available in price_listings to backfill. Exiting.");
    return;
  }

  // Step 3: Pick best image for each product and update
  log("STEP-3", `${DRY_RUN ? "Would update" : "Updating"} ${imageMap.size} product(s)...`);

  const updates: { id: string; image_url: string }[] = [];
  for (const [productId, urls] of imageMap) {
    const best = pickBestImage(urls);
    if (best) {
      updates.push({ id: productId, image_url: best });
    }
  }

  if (DRY_RUN) {
    log("DRY-RUN", `Would update ${updates.length} product(s). Sample:`);
    for (const u of updates.slice(0, 10)) {
      console.log(`  ${u.id} -> ${u.image_url}`);
    }
    log("DONE", "Dry run complete. No changes made.");
    return;
  }

  let updatedCount = 0;
  const totalBatches = Math.ceil(updates.length / UPDATE_BATCH_SIZE);

  for (let i = 0; i < updates.length; i += UPDATE_BATCH_SIZE) {
    const batch = updates.slice(i, i + UPDATE_BATCH_SIZE);
    const batchNum = Math.floor(i / UPDATE_BATCH_SIZE) + 1;
    let batchSuccess = 0;

    for (const { id, image_url } of batch) {
      const { error } = await supabase
        .from("products")
        .update({ image_url })
        .eq("id", id);

      if (error) {
        logError("STEP-3", `Failed to update product ${id}`, error);
      } else {
        batchSuccess++;
      }
    }

    updatedCount += batchSuccess;
    log("STEP-3", `Batch ${batchNum}/${totalBatches}: ${batchSuccess}/${batch.length} updated`);
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const sourceCounts = { shopify: 0, amazon: 0, other: 0 };
  for (const u of updates) {
    if (u.image_url.includes("cdn.shopify.com")) sourceCounts.shopify++;
    else if (u.image_url.includes("media-amazon.com")) sourceCounts.amazon++;
    else sourceCounts.other++;
  }

  console.log("\n=================================================================");
  console.log("  IMAGE BACKFILL COMPLETE");
  console.log("=================================================================");
  console.log(`  Duration:          ${elapsed}s`);
  console.log(`  Products updated:  ${updatedCount}`);
  console.log(`  Image sources:`);
  console.log(`    Shopify CDN:     ${sourceCounts.shopify}`);
  console.log(`    Amazon CDN:      ${sourceCounts.amazon}`);
  console.log(`    Other:           ${sourceCounts.other}`);
  console.log("=================================================================\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
