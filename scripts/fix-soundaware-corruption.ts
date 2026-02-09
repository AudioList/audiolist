/**
 * fix-soundaware-corruption.ts
 *
 * One-shot script to fix the Soundaware A1 data corruption.
 * The old duplicate explosion caused the Soundaware A1 Linsoul listing
 * to contaminate 12+ unrelated products with its affiliate_url and image_url.
 *
 * This script:
 * 1. Fixes the Matrix Element X2 wrong affiliate URL
 * 2. Moves Soundaware A1 to 'dac' category (it's a network streamer, not an IEM)
 * 3. Moves Soundaware P1 to 'amp' category (it's a headphone amp)
 * 4. Re-populates prices from legitimate price_listings for affected products
 */

import { getSupabase } from './config/retailers.ts';

async function main() {
  const supabase = getSupabase();

  // 1. Fix Matrix Element X2 wrong soundaware affiliate URL
  const { error: e1 } = await supabase.from('products')
    .update({ affiliate_url: null })
    .eq('id', '50a81442-e138-4bd0-add9-c06e67798dd0');
  console.log('Cleared Matrix Element X2 affiliate_url:', e1 ? e1.message : 'OK');

  // 2. Move Soundaware A1 to 'dac' category
  const { error: e2 } = await supabase.from('products')
    .update({ category_id: 'dac' })
    .eq('id', '23192bcd-c1e8-46d7-84a4-52225c7cfa15');
  console.log('Moved Soundaware A1 to dac:', e2 ? e2.message : 'OK');

  // 3. Move Soundaware P1 to 'amp' category
  const { data: sp } = await supabase.from('products')
    .select('id, category_id')
    .eq('id', '2e78e7ce-e4d7-42c9-8de8-157241ec14b6')
    .single();

  if (sp && sp.category_id !== 'amp') {
    const { error: e3 } = await supabase.from('products')
      .update({ category_id: 'amp' })
      .eq('id', '2e78e7ce-e4d7-42c9-8de8-157241ec14b6');
    console.log('Moved Soundaware P1 to amp:', e3 ? e3.message : 'OK');
  } else {
    console.log('Soundaware P1 already in correct category');
  }

  // 4. Re-populate prices for affected products from their legitimate listings
  const affectedIds = [
    'fed83ef7-43a6-451b-81d3-7f58c5a68600', // Fengru QZX-A1
    'cfa3dcaa-c5bc-4589-b4f5-075b3b4d50f5', // RAAL SR1a
    '2cae9f55-aab1-43fc-9827-1e35274086ad', // Snowy A7-1
    '06fbeb83-902d-4537-9ddb-2e7ee17a1274', // BLON A7a1
    'e62f00a4-a2fa-4449-973d-11b186409b9b', // RAAL-requisite SR1a
    '937e9173-ecd6-4307-a2b5-7faa75d3d391', // Snowy88 A7-1
    'f70722ab-65a6-4ee5-9f3f-fc77d0f46aa9', // FiiO FA1
    '608b3fad-7b53-4d15-a1c7-7187094a389f', // Jadeaudio EA1
    '8d7b1a86-8c96-4035-8c71-0ba8fc9387f2', // Tozo A1
    // Also include RAAL-requisite products that got wrong images
    '9346996a-5f96-4c95-a356-6e39976e7c6d', // RAAL-requisite PDA-1a
    'd0827924-1568-4ef3-b5ac-d76e0d4a4284', // RAAL-requisite CA-1a
    'ffc9f9a4-e79f-4ade-b817-946f3bd710b7', // CA-1a Headphones
    '629dd460-5f94-4c42-8eda-82f2ab74a876', // Raal-requisite SR-1a
  ];

  let repopulated = 0;
  let noListings = 0;

  for (const pid of affectedIds) {
    // Get the best in-stock price listing (exclude any soundaware URLs)
    const { data: listings } = await supabase.from('price_listings')
      .select('price, affiliate_url, product_url, in_stock, image_url')
      .eq('product_id', pid)
      .eq('in_stock', true)
      .not('affiliate_url', 'ilike', '%soundaware%')
      .order('price', { ascending: true })
      .limit(1);

    if (listings && listings.length > 0) {
      const best = listings[0];
      await supabase.from('products').update({
        price: best.price,
        affiliate_url: best.affiliate_url ?? best.product_url,
        image_url: best.image_url,
        in_stock: true,
      }).eq('id', pid);
      repopulated++;
    } else {
      noListings++;
    }
  }

  console.log(`\nRe-populated prices: ${repopulated}`);
  console.log(`No valid listings: ${noListings}`);

  // 5. Verify the originally reported product
  const { data: check } = await supabase.from('products')
    .select('id, name, affiliate_url, image_url, price, in_stock')
    .eq('id', '2cae9f55-aab1-43fc-9827-1e35274086ad')
    .single();
  console.log('\nFinal state of Snowy A7-1:', JSON.stringify(check, null, 2));
}

main().catch(console.error);
