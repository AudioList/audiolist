/**
 * cleanup-stale-listings.ts
 *
 * Removes price_listings that no longer have a corresponding store_product.
 * This happens when a product is removed from a retailer's collection between
 * sync runs -- the store_product gets overwritten/removed but the old
 * price_listing persists.
 */
import { getSupabase } from './config/retailers.ts';

async function main() {
  const sb = getSupabase();
  const PAGE_SIZE = 1000;

  console.log('Finding stale price_listings (no matching store_product)...\n');

  // Load all price_listings
  const allListings: { id: string; retailer_id: string; external_id: string; product_id: string }[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb.from('price_listings')
      .select('id, retailer_id, external_id, product_id')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error('Error loading listings:', error); return; }
    if (!data || data.length === 0) break;
    allListings.push(...data);
    offset += data.length;
    if (data.length < PAGE_SIZE) break;
  }
  console.log(`Loaded ${allListings.length} price_listings`);

  // Load all store_products (just retailer_id + external_id)
  const storeKeys = new Set<string>();
  offset = 0;
  while (true) {
    const { data, error } = await sb.from('store_products')
      .select('retailer_id, external_id')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error('Error loading store_products:', error); return; }
    if (!data || data.length === 0) break;
    for (const sp of data) {
      storeKeys.add(`${sp.retailer_id}|${sp.external_id}`);
    }
    offset += data.length;
    if (data.length < PAGE_SIZE) break;
  }
  console.log(`Loaded ${storeKeys.size} unique store_product keys`);

  // Find listings with no matching store_product
  // Skip Amazon since it uses a different sync mechanism
  const staleIds: string[] = [];
  const staleSamples: string[] = [];
  for (const listing of allListings) {
    if (listing.retailer_id === 'amazon') continue; // Amazon uses a different pipeline
    const key = `${listing.retailer_id}|${listing.external_id}`;
    if (!storeKeys.has(key)) {
      staleIds.push(listing.id);
      if (staleSamples.length < 20) {
        staleSamples.push(`  ${listing.retailer_id} / ${listing.external_id}`);
      }
    }
  }

  console.log(`\nFound ${staleIds.length} stale price_listings`);
  if (staleSamples.length > 0) {
    console.log('Sample stale listings:');
    for (const s of staleSamples) console.log(s);
    if (staleIds.length > staleSamples.length) {
      console.log(`  ... and ${staleIds.length - staleSamples.length} more`);
    }
  }

  if (staleIds.length === 0) {
    console.log('Nothing to clean up.');
    return;
  }

  // Delete stale listings
  console.log(`\nDeleting ${staleIds.length} stale price_listings...`);
  const BATCH = 100;
  let deleted = 0;
  for (let i = 0; i < staleIds.length; i += BATCH) {
    const batch = staleIds.slice(i, i + BATCH);
    const { error } = await sb.from('price_listings').delete().in('id', batch);
    if (error) {
      console.error(`Error deleting batch ${i / BATCH + 1}:`, error);
    } else {
      deleted += batch.length;
    }
  }
  console.log(`Deleted ${deleted} stale price_listings`);

  // Verify
  const { count } = await sb.from('price_listings').select('*', { count: 'exact', head: true });
  console.log(`\nRemaining price_listings: ${count}`);
}

main().catch(console.error);
