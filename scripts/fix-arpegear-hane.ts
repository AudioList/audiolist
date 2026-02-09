/**
 * fix-arpegear-hane.ts
 *
 * Fixes the ArpegEar Hane product fragmentation:
 *
 * 1. The "Topping Hane" and "Topping ArpegEar Hane" rows are duplicates
 *    with wrong brand -- re-point their price_listings to the canonical
 *    "Arpegear Hane" product and delete the duplicates.
 *
 * 2. The "[IEMs] ArpegEar Hane (8kHz)" and "[IEMs] ArpegEar Hane switches"
 *    rows are measurement variants with null brand -- set brand and merge
 *    if they overlap with existing switch variants.
 *
 * 3. Re-denormalize the canonical product's price from consolidated listings.
 */

import { getSupabase } from './config/retailers.ts';

async function main() {
  const supabase = getSupabase();

  // Canonical ArpegEar Hane (base model, PPI=38.89, has Linsoul listing)
  const CANONICAL_ID = '1e1eb482-dd85-4686-bd85-40800665b734';

  // Duplicates with wrong brand "Topping"
  const TOPPING_DUPES = [
    '93de586b-1617-49d4-9b23-41913f1725dd', // "Topping  Hane"
    'ab6b553b-025e-4d28-97e6-4bdd1ede61a0', // "Topping ArpegEar Hane"
    'cb72655e-8923-49d4-a7f7-aa0db587fc53', // "TOPPING Arpegear Hane 10mm..."
  ];

  // Orphan measurement rows with null brand
  const ORPHAN_MEASUREMENT_IDS = [
    '299de2c8-6311-420a-a842-e12c17392a46', // "[IEMs] ArpegEar Hane (8kHz)"
    'fc0de561-b069-424b-8ecc-7aee59989dae', // "[IEMs] ArpegEar Hane switches"
  ];

  console.log('=================================================================');
  console.log('  ArpegEar Hane Fragmentation Fix');
  console.log('=================================================================\n');

  // Step 1: Re-point price_listings from Topping dupes to canonical
  console.log('Step 1: Re-pointing price listings from Topping dupes...');
  for (const dupeId of TOPPING_DUPES) {
    // Get listings for this dupe
    const { data: listings } = await supabase
      .from('price_listings')
      .select('id, retailer_id, external_id, price')
      .eq('product_id', dupeId);

    if (listings && listings.length > 0) {
      for (const listing of listings) {
        // Check if canonical already has a listing from this retailer+external_id
        const { data: existing } = await supabase
          .from('price_listings')
          .select('id')
          .eq('product_id', CANONICAL_ID)
          .eq('retailer_id', listing.retailer_id)
          .eq('external_id', listing.external_id)
          .maybeSingle();

        if (existing) {
          // Already exists -- delete the dupe's listing
          await supabase.from('price_listings').delete().eq('id', listing.id);
          console.log(`  Deleted duplicate listing ${listing.id} ($${listing.price})`);
        } else {
          // Re-point to canonical
          const { error } = await supabase
            .from('price_listings')
            .update({ product_id: CANONICAL_ID })
            .eq('id', listing.id);
          console.log(`  Re-pointed listing ${listing.id} ($${listing.price}):`, error ? error.message : 'OK');
        }
      }
    }
  }

  // Step 2: Re-point store_products from Topping dupes to canonical
  console.log('\nStep 2: Re-pointing store_products...');
  await supabase
    .from('store_products')
    .update({ canonical_product_id: CANONICAL_ID })
    .in('canonical_product_id', TOPPING_DUPES);
  console.log('  Done');

  // Step 3: Delete product_matches for Topping dupes and orphans
  console.log('\nStep 3: Cleaning up product_matches...');
  const allDeleteIds = [...TOPPING_DUPES, ...ORPHAN_MEASUREMENT_IDS];
  const { error: matchDelErr } = await supabase
    .from('product_matches')
    .delete()
    .in('product_id', allDeleteIds);
  console.log('  Delete matches:', matchDelErr ? matchDelErr.message : 'OK');

  // Step 4: Delete build_items referencing dupes
  console.log('\nStep 4: Re-pointing build_items...');
  await supabase
    .from('build_items')
    .update({ product_id: CANONICAL_ID })
    .in('product_id', allDeleteIds);
  console.log('  Done');

  // Step 5: Delete the Topping duplicate products
  console.log('\nStep 5: Deleting Topping duplicate products...');
  const { error: delErr } = await supabase
    .from('products')
    .delete()
    .in('id', TOPPING_DUPES);
  console.log('  Delete Topping dupes:', delErr ? delErr.message : 'OK');

  // Step 6: Fix the orphan measurement rows -- set brand to ArpegEar
  console.log('\nStep 6: Setting brand on orphan measurement rows...');
  for (const orphanId of ORPHAN_MEASUREMENT_IDS) {
    const { error } = await supabase
      .from('products')
      .update({ brand: 'ArpegEar' })
      .eq('id', orphanId);
    console.log(`  Set brand on ${orphanId}:`, error ? error.message : 'OK');
  }

  // Step 7: Re-denormalize price for canonical from consolidated listings
  console.log('\nStep 7: Re-denormalizing canonical product price...');
  const { data: bestListing } = await supabase
    .from('price_listings')
    .select('price, affiliate_url, product_url, in_stock, image_url')
    .eq('product_id', CANONICAL_ID)
    .eq('in_stock', true)
    .order('price', { ascending: true })
    .limit(1);

  if (bestListing && bestListing.length > 0) {
    const best = bestListing[0];
    const { error } = await supabase.from('products').update({
      price: best.price,
      affiliate_url: best.affiliate_url ?? best.product_url,
      image_url: best.image_url,
      in_stock: true,
    }).eq('id', CANONICAL_ID);
    console.log(`  Set price=$${best.price}, in_stock=true:`, error ? error.message : 'OK');
  } else {
    // Try any listing (even out of stock)
    const { data: anyListing } = await supabase
      .from('price_listings')
      .select('price, affiliate_url, product_url, image_url')
      .eq('product_id', CANONICAL_ID)
      .order('price', { ascending: true })
      .limit(1);

    if (anyListing && anyListing.length > 0) {
      const best = anyListing[0];
      await supabase.from('products').update({
        price: best.price,
        affiliate_url: best.affiliate_url ?? best.product_url,
        image_url: best.image_url,
        in_stock: false,
      }).eq('id', CANONICAL_ID);
      console.log(`  Set price=$${best.price}, in_stock=false`);
    } else {
      console.log('  No listings found for canonical product');
    }
  }

  // Step 8: Verify final state
  console.log('\nStep 8: Verification...');
  const { data: haneProducts } = await supabase
    .from('products')
    .select('id, name, brand, price, in_stock, ppi_score')
    .ilike('name', '%arpeg%hane%')
    .order('name');

  console.log('\nArpegEar Hane products:');
  for (const p of haneProducts ?? []) {
    console.log(`  ${p.name} | brand=${p.brand} | price=$${p.price} | ppi=${p.ppi_score} | in_stock=${p.in_stock}`);
  }

  const { data: listings } = await supabase
    .from('price_listings')
    .select('id, product_id, price, in_stock, retailer_id')
    .eq('product_id', CANONICAL_ID);
  console.log(`\nCanonical product listings: ${listings?.length ?? 0}`);
  for (const l of listings ?? []) {
    console.log(`  $${l.price} | in_stock=${l.in_stock} | retailer=${l.retailer_id}`);
  }

  // Check if Topping dupes still exist
  const { data: remaining } = await supabase
    .from('products')
    .select('id, name')
    .in('id', TOPPING_DUPES);
  console.log(`\nTopping dupes remaining: ${remaining?.length ?? 0}`);

  console.log('\n=================================================================');
  console.log('  DONE');
  console.log('=================================================================\n');
}

main().catch(console.error);
