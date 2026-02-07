/**
 * Fix false price listing merges for Moondrop Space Travel products.
 *
 * Problem: The fuzzy matcher matched "Moondrop Space Travel" (original TWS)
 * and its DSP variants (Basshead, Monitor, Reference) to "Space Travel 2"
 * listings on Linsoul, HiFiGo, and other retailers.
 *
 * This script:
 * 1. Finds price_listings where the product_url or external_id contains "space-travel-2"
 *    but the canonical product is a Space Travel (original) variant
 * 2. Deletes those bad listings
 * 3. Deletes corresponding bad product_matches
 * 4. Recalculates lowest prices for affected products
 *
 * Usage:
 *   npx tsx scripts/fix-space-travel-listings.ts --dry-run
 *   npx tsx scripts/fix-space-travel-listings.ts
 */
import { getSupabase } from './config/retailers';

const DRY = process.argv.includes('--dry-run');

// Space Travel original + DSP tuning mode products (NOT Space Travel 2)
const SPACE_TRAVEL_IDS = [
  '5ac821c0-41d7-458b-accc-52e39e33cb6b', // Moondrop Space Travel (original, 5128)
  'bf5d1278-340a-4d28-b284-ebd4d6f76f8e', // Moondrop Space Travel Basshead
  '8542c616-4f55-41a7-9c22-03c7b26d115d', // Moondrop Space Travel Monitor
  'a64fd45a-de82-4d69-b01b-7e6794ba5d4a', // Moondrop Space Travel Reference
];

async function main() {
  const sb = getSupabase();

  if (DRY) console.log('[DRY RUN] No changes will be made.\n');

  // == Step 1: Find and delete bad price_listings ==
  console.log('=== Step 1: Delete price_listings pointing to Space Travel 2 ===');

  for (const productId of SPACE_TRAVEL_IDS) {
    // Get product name for logging
    const { data: product } = await sb
      .from('products')
      .select('name')
      .eq('id', productId)
      .single();

    const label = product?.name ?? productId;

    // Find listings where external_id or product_url contains "space-travel-2"
    const { data: listings } = await sb
      .from('price_listings')
      .select('id, retailer_id, external_id, product_url, price, in_stock')
      .eq('product_id', productId);

    if (!listings || listings.length === 0) {
      console.log(`  "${label}": no price_listings found.`);
      continue;
    }

    // Filter for bad listings: external_id or product_url references Space Travel 2
    const badListings = listings.filter(l =>
      (l.external_id && l.external_id.includes('space-travel-2')) ||
      (l.product_url && l.product_url.includes('space-travel-2'))
    );

    if (badListings.length === 0) {
      console.log(`  "${label}": ${listings.length} listing(s), none point to Space Travel 2.`);
      continue;
    }

    console.log(`  "${label}": ${badListings.length} bad listing(s) pointing to Space Travel 2:`);
    for (const bl of badListings) {
      console.log(`    - ${bl.retailer_id}: $${bl.price} (${bl.in_stock ? 'in stock' : 'OOS'}) -> ${bl.product_url}`);
    }

    if (!DRY) {
      const ids = badListings.map(l => l.id);
      const { error } = await sb.from('price_listings').delete().in('id', ids);
      if (error) console.error(`    ERROR deleting: ${error.message}`);
      else console.log(`    Deleted ${ids.length} listing(s).`);
    }
  }

  // == Step 2: Find and delete bad product_matches ==
  console.log('\n=== Step 2: Delete product_matches pointing to Space Travel 2 ===');

  for (const productId of SPACE_TRAVEL_IDS) {
    const { data: product } = await sb
      .from('products')
      .select('name')
      .eq('id', productId)
      .single();

    const label = product?.name ?? productId;

    const { data: matches } = await sb
      .from('product_matches')
      .select('id, retailer_id, external_id, external_name, match_score, status')
      .eq('product_id', productId);

    if (!matches || matches.length === 0) {
      console.log(`  "${label}": no product_matches found.`);
      continue;
    }

    // Filter for bad matches: external_id or external_name references Space Travel 2
    const badMatches = matches.filter(m =>
      (m.external_id && m.external_id.includes('space-travel-2')) ||
      (m.external_name && m.external_name.toLowerCase().includes('space travel 2'))
    );

    // Also remove clearly wrong matches (different products entirely)
    const wrongMatches = matches.filter(m =>
      !badMatches.includes(m) && (
        (m.external_name && m.external_name.toLowerCase().includes('spaceship')) ||
        (m.external_name && m.external_name.toLowerCase().includes('para headphones')) ||
        (m.external_name && m.external_name.toLowerCase().includes('bricasti'))
      )
    );

    const allBad = [...badMatches, ...wrongMatches];

    if (allBad.length === 0) {
      console.log(`  "${label}": ${matches.length} match(es), none are bad.`);
      continue;
    }

    console.log(`  "${label}": ${allBad.length} bad match(es):`);
    for (const bm of allBad) {
      console.log(`    - ${bm.retailer_id}: "${bm.external_name}" (score=${Number(bm.match_score).toFixed(3)}, ${bm.status})`);
    }

    if (!DRY) {
      const ids = allBad.map(m => m.id);
      const { error } = await sb.from('product_matches').delete().in('id', ids);
      if (error) console.error(`    ERROR deleting: ${error.message}`);
      else console.log(`    Deleted ${ids.length} match(es).`);
    }
  }

  // == Step 3: Keep the Shenzhen Audio listing for the original Space Travel ==
  // The SZA listing (moondrop-space-travel-13mm-dynamic-driver-bluetooth-in-ear-headphone)
  // is the CORRECT listing for the original Space Travel. It should only be on the
  // original product (5ac821c0), not the DSP variants.
  console.log('\n=== Step 3: Fix Shenzhen Audio listing assignment ===');

  const szaExternalId = 'moondrop-space-travel-13mm-dynamic-driver-bluetooth-in-ear-headphone';
  const correctProductId = '5ac821c0-41d7-458b-accc-52e39e33cb6b';

  // The SZA listing should stay on the original, but check if DSP variants also have it
  for (const productId of SPACE_TRAVEL_IDS) {
    if (productId === correctProductId) continue;

    const { data: szaListing } = await sb
      .from('price_listings')
      .select('id, product_url, price')
      .eq('product_id', productId)
      .eq('retailer_id', 'shenzhenaudio');

    if (szaListing?.length) {
      console.log(`  DSP variant ${productId} has SZA listing -- will remove (belongs on original only)`);
      if (!DRY) {
        const ids = szaListing.map(l => l.id);
        await sb.from('price_listings').delete().in('id', ids);
        console.log(`    Deleted ${ids.length} SZA listing(s) from variant.`);
      }
    }
  }

  // == Step 4: Recalculate lowest prices ==
  console.log('\n=== Step 4: Recalculate lowest prices ===');

  for (const pid of SPACE_TRAVEL_IDS) {
    const { data: product } = await sb
      .from('products')
      .select('name')
      .eq('id', pid)
      .single();

    const label = product?.name ?? pid;

    const { data: listings } = await sb
      .from('price_listings')
      .select('price, in_stock, affiliate_url, product_url')
      .eq('product_id', pid)
      .order('price', { ascending: true });

    if (!listings || listings.length === 0) {
      console.log(`  "${label}": no remaining listings -- setting price=null, in_stock=false`);
      if (!DRY) {
        await sb.from('products').update({ price: null, affiliate_url: null, in_stock: false }).eq('id', pid);
      }
      continue;
    }

    const inStock = listings.filter(l => l.in_stock);
    const best = inStock.length > 0 ? inStock[0] : listings[0];
    console.log(`  "${label}": lowest = $${best.price} (${best.in_stock ? 'in stock' : 'OOS'}), ${listings.length} listing(s) remaining`);

    if (!DRY) {
      await sb.from('products').update({
        price: best.price,
        affiliate_url: best.affiliate_url ?? best.product_url,
        in_stock: best.in_stock,
      }).eq('id', pid);
    }
  }

  console.log('\nDone.' + (DRY ? ' (dry run -- no changes made)' : ''));
}

main().catch(console.error);
