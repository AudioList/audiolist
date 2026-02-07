/**
 * Snapshots current price_listings into price_history.
 * Designed to run daily via cron or manual invocation.
 * Run: npx tsx scripts/snapshot-prices.ts
 */
import { getSupabase } from './config/retailers';

async function main() {
  const supabase = getSupabase();

  console.log('Fetching current price listings...');

  // Fetch all active price listings
  const { data: listings, error: fetchError } = await supabase
    .from('price_listings')
    .select('product_id, retailer_id, price, in_stock');

  if (fetchError) {
    console.error(`Failed to fetch listings: ${fetchError.message}`);
    process.exit(1);
  }

  if (!listings || listings.length === 0) {
    console.log('No price listings found. Nothing to snapshot.');
    return;
  }

  console.log(`Found ${listings.length} price listings. Inserting into price_history...`);

  // Insert in batches of 500 to avoid payload limits
  const BATCH_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < listings.length; i += BATCH_SIZE) {
    const batch = listings.slice(i, i + BATCH_SIZE).map((l) => ({
      product_id: l.product_id,
      retailer_id: l.retailer_id,
      price: l.price,
      in_stock: l.in_stock,
    }));

    const { error: insertError } = await supabase
      .from('price_history')
      .insert(batch);

    if (insertError) {
      console.error(`Failed to insert batch at offset ${i}: ${insertError.message}`);
    } else {
      inserted += batch.length;
      console.log(`  Inserted batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} rows)`);
    }
  }

  console.log(`Done. Snapshot complete: ${inserted} / ${listings.length} rows inserted.`);
}

main().catch(console.error);
