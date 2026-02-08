/**
 * audit-brand-mismatches.ts
 *
 * General audit: find all approved product_matches where the matched product's
 * brand and the external product's extracted brand are completely different.
 * Rejects those matches, deletes associated price_listings, and re-denormalizes.
 *
 * Handles false positives:
 * - Strips retailer name prefixes from external product names before brand
 *   extraction (e.g., "MusicTeck Rhapsodio Infinity" -> "Rhapsodio Infinity")
 * - Skips first-party stores where the store IS the brand (64 Audio, Campfire,
 *   Audeze, Dekoni) since external names won't have a brand prefix
 * - Uses brand alias resolution to handle spelling variants (ZiiGaat vs Ziigat)
 *
 * Usage:
 *   npx tsx scripts/audit-brand-mismatches.ts --dry-run
 *   npx tsx scripts/audit-brand-mismatches.ts
 */

import { getSupabase } from './config/retailers.ts';
import { brandsSimilar } from './scrapers/matcher.ts';
import { extractBrand } from './brand-config.ts';

const BATCH = 1000;
const DRY = process.argv.includes('--dry-run');

/**
 * First-party retailer IDs: stores where the retailer IS the brand.
 * Product names from these stores won't have a recognizable brand prefix
 * (e.g., 64 Audio lists "Fourte Blanc", not "64 Audio Fourte Blanc").
 * Skip brand checking for these retailers to avoid false positives.
 */
const FIRST_PARTY_RETAILERS = new Set([
  '64audio',
  'campfireaudio',
  'audeze',
  'dekoniaudio',
  'svsound',
  'kef',
  'emotiva',
  'peachtreeaudio',
  'psaudio',
  'rel',
  'aperionaudio',
  'qacoustics',
  'buchardtaudio',
  'wharfedale',
  'jamo',
  'trianglehifi',
  'schiit',
  'tonor',
  'fifine',
  'maono',
  'lewitt',
  'sontronics',
  'synco',
  'cloud-microphones',
]);

async function main() {
  const supabase = getSupabase();

  console.log('=================================================================');
  console.log('  Audit Brand-Mismatch Approved Matches');
  console.log(`  Mode: ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log('=================================================================\n');

  // Step 1: Load retailer names for prefix stripping
  const { data: retailers } = await supabase
    .from('retailers')
    .select('id, name');

  // Build retailer name prefixes (lowercase, longest first) for stripping
  const retailerPrefixes: { prefix: string; len: number }[] = [];
  if (retailers) {
    for (const r of retailers) {
      if (r.name) {
        retailerPrefixes.push({ prefix: r.name.toLowerCase(), len: r.name.length });
        // Also add the no-space version (e.g., "BloomAudio" -> "bloomaudio")
        const noSpace = r.name.replace(/\s+/g, '').toLowerCase();
        if (noSpace !== r.name.toLowerCase()) {
          retailerPrefixes.push({ prefix: noSpace, len: noSpace.length });
        }
      }
    }
  }
  retailerPrefixes.sort((a, b) => b.len - a.len); // longest first

  console.log(`Loaded ${retailerPrefixes.length} retailer name prefixes for stripping\n`);

  // Step 2: Load all approved matches
  const approved: {
    id: string;
    product_id: string;
    retailer_id: string;
    external_id: string;
    external_name: string;
    match_score: number;
  }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('product_matches')
      .select('id, product_id, retailer_id, external_id, external_name, match_score')
      .eq('status', 'approved')
      .range(offset, offset + BATCH - 1);

    if (error) {
      console.error('Error loading approved matches:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    approved.push(...data);
    offset += BATCH;
    if (data.length < BATCH) break;
  }

  console.log(`Loaded ${approved.length} approved matches\n`);

  // Step 3: Load product brands
  const productBrands = new Map<string, string | null>();
  const productIds = [...new Set(approved.map(m => m.product_id))];

  for (let i = 0; i < productIds.length; i += 50) {
    const batch = productIds.slice(i, i + 50);
    const { data } = await supabase
      .from('products')
      .select('id, brand')
      .in('id', batch);

    if (data) {
      for (const p of data) {
        productBrands.set(p.id, p.brand);
      }
    }
  }

  console.log(`Loaded brands for ${productBrands.size} products\n`);

  // Step 4: Check each approved match for brand mismatch
  const mismatches: typeof approved = [];
  let skippedFirstParty = 0;
  let skippedUnknown = 0;
  let strippedRetailerCount = 0;

  for (const match of approved) {
    // Skip first-party retailers entirely -- their product names lack brand prefixes
    if (FIRST_PARTY_RETAILERS.has(match.retailer_id)) {
      skippedFirstParty++;
      continue;
    }

    const productBrand = productBrands.get(match.product_id);
    if (!productBrand) {
      skippedUnknown++;
      continue;
    }

    // Strip retailer name prefix before extracting brand
    let cleanedName = match.external_name;
    const lower = cleanedName.toLowerCase().trim();
    for (const { prefix, len } of retailerPrefixes) {
      if (lower.startsWith(prefix)) {
        const charAfter = cleanedName.charAt(len);
        if (charAfter === ' ' || charAfter === '-' || charAfter === ':' || charAfter === '|') {
          cleanedName = cleanedName.slice(len).replace(/^[-:\s|]+/, '').trim();
          strippedRetailerCount++;
          break;
        }
      }
    }

    const externalBrand = extractBrand(cleanedName);
    if (!externalBrand) {
      skippedUnknown++;
      continue;
    }

    const relation = brandsSimilar(productBrand, externalBrand);
    if (relation === 'different') {
      mismatches.push(match);
      console.log(`  MISMATCH: "${match.external_name}" (brand: ${externalBrand}) -> product brand: ${productBrand} [${match.retailer_id}] (score=${match.match_score.toFixed(3)})`);
    }
  }

  console.log(`\nSkipped ${skippedFirstParty} first-party retailer matches`);
  console.log(`Skipped ${skippedUnknown} matches with unknown brands`);
  console.log(`Stripped retailer prefix from ${strippedRetailerCount} external names`);
  console.log(`\nFound ${mismatches.length} brand-mismatched approved matches out of ${approved.length} total\n`);

  if (mismatches.length === 0) {
    console.log('No brand mismatches found. Nothing to do.');
    return;
  }

  if (DRY) {
    console.log('*** DRY RUN complete. No changes made. ***');
    return;
  }

  // Step 5: Reject mismatched matches
  const matchIds = mismatches.map(m => m.id);
  let rejectedCount = 0;

  for (let i = 0; i < matchIds.length; i += 50) {
    const batch = matchIds.slice(i, i + 50);
    const { error } = await supabase
      .from('product_matches')
      .update({ status: 'rejected' })
      .in('id', batch);
    if (error) console.error(`Error rejecting batch ${i}:`, error.message);
    else rejectedCount += batch.length;
  }

  console.log(`Rejected ${rejectedCount} matches`);

  // Step 6: Delete associated price_listings
  let deletedListings = 0;
  for (const match of mismatches) {
    const { error } = await supabase
      .from('price_listings')
      .delete()
      .eq('product_id', match.product_id)
      .eq('retailer_id', match.retailer_id);
    if (error) console.error(`Error deleting listing for ${match.product_id}:`, error.message);
    else deletedListings++;
  }

  console.log(`Deleted ${deletedListings} price_listings`);

  // Step 7: Re-denormalize affected products
  const affectedProductIds = [...new Set(mismatches.map(m => m.product_id))];
  let redenormalized = 0;

  for (const productId of affectedProductIds) {
    // Find the next best valid listing
    const { data: bestListing } = await supabase
      .from('price_listings')
      .select('price, affiliate_url, product_url, image_url')
      .eq('product_id', productId)
      .eq('in_stock', true)
      .order('price', { ascending: true })
      .limit(1);

    if (bestListing && bestListing.length > 0) {
      const best = bestListing[0];
      await supabase
        .from('products')
        .update({
          price: best.price,
          affiliate_url: best.affiliate_url ?? best.product_url,
          ...(best.image_url ? { image_url: best.image_url } : {}),
        })
        .eq('id', productId);
    } else {
      // No valid listings remain -- clear price and affiliate
      await supabase
        .from('products')
        .update({ price: null, affiliate_url: null, image_url: null })
        .eq('id', productId);
    }
    redenormalized++;
  }

  console.log(`Re-denormalized ${redenormalized} products`);

  console.log(`\n=================================================================`);
  console.log('  AUDIT COMPLETE');
  console.log(`  Matches rejected: ${rejectedCount}`);
  console.log(`  Listings deleted: ${deletedListings}`);
  console.log(`  Products re-denormalized: ${redenormalized}`);
  console.log('=================================================================\n');
}

main().catch(console.error);
