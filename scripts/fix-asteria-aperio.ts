/**
 * Fix false merges involving 7th Acoustics Asteria and Warwick Acoustics Aperio.
 *
 * Issues:
 * 1. 7th Acoustics Asteria IEM (b8b88ea8) falsely matched to HP.com Warwick Aperio ($35k)
 * 2. Aperio Electrostatic (ec2120d8) falsely matched to HIFIMAN Jade II and Audeze CRBN
 * 3. Duplicate Asteria products across categories
 * 4. Aperio wrongly categorized as 'dap' instead of 'headphone'
 *
 * Usage:
 *   npx tsx scripts/fix-asteria-aperio.ts --dry-run
 *   npx tsx scripts/fix-asteria-aperio.ts
 */
import { getSupabase } from './config/retailers';

const DRY = process.argv.includes('--dry-run');

async function main() {
  const sb = getSupabase();

  if (DRY) console.log('[DRY RUN] No changes will be made.\n');

  // ── 1. Delete bad product_matches ──────────────────────────────
  console.log('=== Step 1: Delete bad product_matches ===');

  // 1a. Asteria IEM matched to HP.com Aperio
  const { data: badMatch1 } = await sb
    .from('product_matches')
    .select('id, product_id, external_name, match_score')
    .eq('product_id', 'b8b88ea8-b9b5-41fb-96aa-f60db11b0bf3')
    .eq('retailer_id', 'headphones')
    .ilike('external_name', '%aperio%');

  if (badMatch1?.length) {
    console.log(`  Found ${badMatch1.length} bad Asteria->Aperio match(es):`, badMatch1.map(m => m.external_name));
    if (!DRY) {
      const ids = badMatch1.map(m => m.id);
      const { error } = await sb.from('product_matches').delete().in('id', ids);
      if (error) console.error('  ERROR deleting:', error.message);
      else console.log(`  Deleted ${ids.length} match(es).`);
    }
  } else {
    console.log('  No Asteria->Aperio bad matches found (may already be cleaned).');
  }

  // 1b. Aperio matched to Jade II (apos) and CRBN (audeze)
  for (const retailerId of ['apos', 'audeze']) {
    const { data: badMatches } = await sb
      .from('product_matches')
      .select('id, external_name, match_score')
      .eq('product_id', 'ec2120d8-7811-452c-8e30-95ade65a4c3c')
      .eq('retailer_id', retailerId);

    if (badMatches?.length) {
      console.log(`  Found ${badMatches.length} bad Aperio->${retailerId} match(es):`, badMatches.map(m => m.external_name));
      if (!DRY) {
        const ids = badMatches.map(m => m.id);
        const { error } = await sb.from('product_matches').delete().in('id', ids);
        if (error) console.error('  ERROR:', error.message);
        else console.log(`  Deleted ${ids.length} match(es).`);
      }
    } else {
      console.log(`  No Aperio->${retailerId} bad matches found.`);
    }
  }

  // ── 2. Delete bad price_listings ───────────────────────────────
  console.log('\n=== Step 2: Delete bad price_listings ===');

  const badListings = [
    { product_id: 'b8b88ea8-b9b5-41fb-96aa-f60db11b0bf3', retailer_id: 'headphones', label: 'Asteria IEM -> HP.com Aperio' },
    { product_id: 'ec2120d8-7811-452c-8e30-95ade65a4c3c', retailer_id: 'apos', label: 'Aperio -> Apos Jade II' },
    { product_id: 'ec2120d8-7811-452c-8e30-95ade65a4c3c', retailer_id: 'audeze', label: 'Aperio -> Audeze CRBN' },
  ];

  for (const bl of badListings) {
    const { data: listings } = await sb
      .from('price_listings')
      .select('id, price, in_stock')
      .eq('product_id', bl.product_id)
      .eq('retailer_id', bl.retailer_id);

    if (listings?.length) {
      console.log(`  ${bl.label}: found ${listings.length} listing(s) at $${listings.map(l => l.price).join(', $')}`);
      if (!DRY) {
        const ids = listings.map(l => l.id);
        const { error } = await sb.from('price_listings').delete().in('id', ids);
        if (error) console.error('  ERROR:', error.message);
        else console.log(`  Deleted ${ids.length} listing(s).`);
      }
    } else {
      console.log(`  ${bl.label}: no listings found.`);
    }
  }

  // ── 3. Merge duplicate Asteria products ────────────────────────
  console.log('\n=== Step 3: Merge duplicate Asteria products ===');

  const winnerId = 'b8b88ea8-b9b5-41fb-96aa-f60db11b0bf3'; // 7th Acoustics Asteria (IEM, squig.link)
  const losers = [
    '21b755c2-ce84-41f6-be70-8644390934ed', // store:bloomaudio (wrong category headphone)
    '1055c9f7-c1bd-45b4-835b-768ce7f6bb5a', // 7th Acoustic ASTERIA (hbb squig)
  ];

  for (const loserId of losers) {
    const { data: loserProduct } = await sb
      .from('products')
      .select('id, name, category_id')
      .eq('id', loserId)
      .single();

    if (!loserProduct) {
      console.log(`  Loser ${loserId}: not found (already merged?).`);
      continue;
    }
    console.log(`  Merging "${loserProduct.name}" (${loserProduct.category_id}) -> winner ${winnerId}`);

    if (!DRY) {
      // Transfer price_listings
      const { error: plErr } = await sb
        .from('price_listings')
        .update({ product_id: winnerId })
        .eq('product_id', loserId);
      if (plErr) console.error('    price_listings transfer error:', plErr.message);

      // Transfer product_matches
      const { error: pmErr } = await sb
        .from('product_matches')
        .update({ product_id: winnerId })
        .eq('product_id', loserId);
      if (pmErr) console.error('    product_matches transfer error:', pmErr.message);

      // Transfer build_items
      const { error: biErr } = await sb
        .from('build_items')
        .update({ product_id: winnerId })
        .eq('product_id', loserId);
      if (biErr) console.error('    build_items transfer error:', biErr.message);

      // Transfer store_products canonical links
      const { error: spErr } = await sb
        .from('store_products')
        .update({ canonical_product_id: winnerId })
        .eq('canonical_product_id', loserId);
      if (spErr) console.error('    store_products transfer error:', spErr.message);

      // Delete the loser product
      const { error: delErr } = await sb
        .from('products')
        .delete()
        .eq('id', loserId);
      if (delErr) console.error('    DELETE error:', delErr.message);
      else console.log(`    Deleted loser "${loserProduct.name}".`);
    }
  }

  // c01e07ff = "7th Acoustics Asteria Narw" -- keep separate (different variant)
  console.log('  Keeping "7th Acoustics Asteria Narw" (c01e07ff) separate -- different variant.');

  // ── 4. Fix Aperio category ─────────────────────────────────────
  console.log('\n=== Step 4: Fix Aperio category (dap -> headphone) ===');

  const aperioId = 'ec2120d8-7811-452c-8e30-95ade65a4c3c';
  const { data: aperio } = await sb
    .from('products')
    .select('id, name, category_id')
    .eq('id', aperioId)
    .single();

  if (aperio) {
    console.log(`  "${aperio.name}" current category: ${aperio.category_id}`);
    if (aperio.category_id !== 'headphone') {
      if (!DRY) {
        const { error } = await sb
          .from('products')
          .update({ category_id: 'headphone' })
          .eq('id', aperioId);
        if (error) console.error('  ERROR:', error.message);
        else console.log('  Updated to "headphone".');
      } else {
        console.log('  Would update to "headphone".');
      }
    } else {
      console.log('  Already "headphone".');
    }
  }

  // ── 5. Recalculate lowest prices ──────────────────────────────
  console.log('\n=== Step 5: Recalculate lowest prices for affected products ===');

  const affectedIds = [winnerId, aperioId];
  for (const pid of affectedIds) {
    const { data: listings } = await sb
      .from('price_listings')
      .select('price, in_stock, affiliate_url, product_url')
      .eq('product_id', pid)
      .order('price', { ascending: true });

    if (!listings || listings.length === 0) {
      console.log(`  ${pid}: no listings -- setting price=null, in_stock=false`);
      if (!DRY) {
        await sb.from('products').update({ price: null, affiliate_url: null, in_stock: false }).eq('id', pid);
      }
      continue;
    }

    // Prefer in-stock lowest, fallback to OOS lowest
    const inStock = listings.filter(l => l.in_stock);
    const best = inStock.length > 0 ? inStock[0] : listings[0];
    console.log(`  ${pid}: lowest = $${best.price} (${best.in_stock ? 'in stock' : 'OOS'}), ${listings.length} listing(s) total`);

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
