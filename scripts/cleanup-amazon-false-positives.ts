/**
 * cleanup-amazon-false-positives.ts
 *
 * Purges false positive Amazon matches where non-audio products (books, games,
 * DVDs, t-shirts, etc.) were matched to audio products.
 *
 * Detection criteria:
 * 1. ISBN-format external_ids (10+ digits, no "B0" prefix) -- always books
 * 2. Known junk ASINs manually identified
 * 3. Price sanity: Amazon price < $5 for a product normally > $50 (likely a book/media)
 * 4. External name contains non-audio keywords (board game, paperback, hardcover, DVD, etc.)
 *
 * For each false positive:
 * - Delete the price_listing
 * - Update product_matches status to 'rejected'
 * - Re-denormalize the product's price from remaining valid listings
 *
 * Usage: npx tsx scripts/cleanup-amazon-false-positives.ts [--dry-run]
 */

import { getSupabase } from './config/retailers.ts';

const DRY_RUN = process.argv.includes('--dry-run');

// Patterns that indicate a non-audio product on Amazon
const NON_AUDIO_NAME_PATTERNS = [
  /\bpaperback\b/i,
  /\bhardcover\b/i,
  /\bboard game\b/i,
  /\bcard game\b/i,
  /\btabletop\b/i,
  /\bdvd\b/i,
  /\bblu-?ray\b/i,
  /\bvhs\b/i,
  /\bsheet music\b/i,
  /\bnovel\b/i,
  /\bt-?shirt\b/i,
  /\btee shirt\b/i,
  /\bposter\b/i,
  /\bnotebook\b/i,
  /\bjournal\b/i,
  /\bcalendar\b/i,
  /\bcoloring book\b/i,
  /\bsticker\b/i,
  /\baction figure\b/i,
  /\bfigurine\b/i,
  /\bplush\b/i,
  /\btoy\b/i,
  /\bpuzzle\b/i,
  /\bvinyl\s+record\b/i,
  /\bLP\s+record\b/i,
  /\baudio\s*cd\b/i,
  /\bmusic\s*cd\b/i,
  /\bcomic\b/i,
  /\bmanga\b/i,
  /\bgraphic novel\b/i,
  /\bkindle\b/i,
  /\bebook\b/i,
  /\be-?book\b/i,
  /\bsoftware\b/i,
  /\bvideo game\b/i,
  /\bplaystation\b/i,
  /\bxbox\b/i,
  /\bnintendo\b/i,
  /\bperiodic table\b/i,
];

/**
 * Check if an external_id looks like an ISBN rather than an ASIN.
 * Real ASINs: B0XXXXXXXXX (start with B0, 10 chars)
 * ISBNs: 10 or 13 digits, sometimes with X at end
 */
function isLikelyISBN(externalId: string): boolean {
  // Real ASINs start with "B0"
  if (/^B0[A-Z0-9]{8,}$/i.test(externalId)) return false;
  // Looks like ISBN-10 or ISBN-13 (all digits, optionally ending with X)
  if (/^\d{9}[\dXx]$/.test(externalId)) return true;  // ISBN-10
  if (/^\d{13}$/.test(externalId)) return true;         // ISBN-13
  return false;
}

/**
 * Check if an external name suggests a non-audio product.
 */
function isNonAudioName(name: string): boolean {
  return NON_AUDIO_NAME_PATTERNS.some((rx) => rx.test(name));
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function log(phase: string, msg: string): void {
  console.log(`[${timestamp()}] [${phase}] ${msg}`);
}

async function main() {
  const supabase = getSupabase();
  const startTime = Date.now();

  console.log('=================================================================');
  console.log('  Amazon False Positive Cleanup');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('=================================================================\n');

  // Step 1: Find the Amazon retailer ID
  const { data: retailers } = await supabase
    .from('retailers')
    .select('id')
    .ilike('name', '%amazon%')
    .limit(1);

  if (!retailers || retailers.length === 0) {
    log('ERROR', 'Amazon retailer not found');
    return;
  }
  const amazonRetailerId = retailers[0].id;
  log('LOAD', `Amazon retailer ID: ${amazonRetailerId}`);

  // Step 2: Load all Amazon price_listings
  log('LOAD', 'Loading Amazon price listings...');
  const allListings: any[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('price_listings')
      .select('id, product_id, external_id, price, affiliate_url, in_stock')
      .eq('retailer_id', amazonRetailerId)
      .range(offset, offset + 999);

    if (error) { log('ERROR', error.message); break; }
    if (!data || data.length === 0) break;
    allListings.push(...data);
    offset += 1000;
    if (data.length < 1000) break;
  }

  log('LOAD', `Found ${allListings.length} Amazon price listings`);

  // Step 3: Load corresponding product_matches for context (external_name)
  log('LOAD', 'Loading Amazon product matches...');
  const allMatches: any[] = [];
  offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('product_matches')
      .select('id, product_id, external_id, external_name, external_price, match_score, status')
      .eq('retailer_id', amazonRetailerId)
      .range(offset, offset + 999);

    if (error) { log('ERROR', error.message); break; }
    if (!data || data.length === 0) break;
    allMatches.push(...data);
    offset += 1000;
    if (data.length < 1000) break;
  }

  log('LOAD', `Found ${allMatches.length} Amazon product matches`);

  // Build lookup: external_id -> match record
  const matchByExternalId = new Map<string, any>();
  for (const m of allMatches) {
    // Keep the one with highest match_score if multiple
    const existing = matchByExternalId.get(m.external_id);
    if (!existing || m.match_score > existing.match_score) {
      matchByExternalId.set(m.external_id, m);
    }
  }

  // Step 4: Load products to check price sanity
  const productIds = [...new Set(allListings.map((l: any) => l.product_id))];
  log('LOAD', `Loading ${productIds.length} affected products...`);

  const productPrices = new Map<string, { name: string; price: number | null; ppi_score: number | null }>();
  for (let i = 0; i < productIds.length; i += 100) {
    const batch = productIds.slice(i, i + 100);
    const { data } = await supabase
      .from('products')
      .select('id, name, price, ppi_score')
      .in('id', batch);
    if (data) {
      for (const p of data) {
        productPrices.set(p.id, { name: p.name, price: p.price, ppi_score: p.ppi_score });
      }
    }
  }

  // Step 5: Identify false positives
  const falsePositiveListingIds: string[] = [];
  const falsePositiveMatchIds: string[] = [];
  const affectedProductIds = new Set<string>();
  const reasons: Record<string, string> = {};

  for (const listing of allListings) {
    const matchRecord = matchByExternalId.get(listing.external_id);
    const externalName = matchRecord?.external_name ?? '';
    const product = productPrices.get(listing.product_id);
    let isFalse = false;
    let reason = '';

    // Check 1: ISBN format (books)
    if (isLikelyISBN(listing.external_id)) {
      isFalse = true;
      reason = `ISBN format: ${listing.external_id}`;
    }

    // Check 2: Non-audio name keywords
    if (!isFalse && externalName && isNonAudioName(externalName)) {
      isFalse = true;
      reason = `Non-audio name: "${externalName}"`;
    }

    // Check 3: Price sanity -- Amazon price < $5 for audio product with PPI (should be $20+)
    if (!isFalse && listing.price !== null && listing.price < 5 && product?.ppi_score !== null) {
      isFalse = true;
      reason = `Suspiciously cheap: $${listing.price} for "${product?.name}"`;
    }

    // Check 4: Single-word Amazon name matching a multi-word audio product.
    // These are generic word matches (books/media/games titled "Zenith", "Hamlet", etc.)
    // A real audio product listing on Amazon always includes brand + model.
    // But skip this check if the Amazon name contains the actual audio brand.
    if (!isFalse && externalName) {
      const externalWords = externalName.trim().split(/\s+/);
      const productName = product?.name ?? '';
      const productWords = productName.trim().split(/\s+/);

      // Extract the brand from the audio product name (first word typically)
      const audioBrand = productWords[0]?.toLowerCase() ?? '';

      // Check if Amazon name contains the audio brand
      const amazonContainsBrand = audioBrand.length > 2 &&
        externalName.toLowerCase().includes(audioBrand);

      if (externalWords.length <= 2 && externalName.length <= 25 && productWords.length >= 2 && !amazonContainsBrand) {
        // Short Amazon name without the audio brand -- almost certainly a non-audio product
        isFalse = true;
        reason = `Short generic name: "${externalName}" -> "${productName}"`;
      }
    }

    // Check 5: Amazon price < $5 for a product with PPI (definitely a book/media/etc.)
    if (!isFalse && listing.price !== null && listing.price < 5 && product?.ppi_score !== null) {
      isFalse = true;
      reason = `Sub-$5 suspect: $${listing.price} for "${product?.name}" (PPI=${product?.ppi_score?.toFixed(1)})`;
    }

    if (isFalse) {
      falsePositiveListingIds.push(listing.id);
      affectedProductIds.add(listing.product_id);
      reasons[listing.id] = reason;

      if (matchRecord) {
        falsePositiveMatchIds.push(matchRecord.id);
      }
    }
  }

  log('DETECT', `Found ${falsePositiveListingIds.length} false positive listings`);
  log('DETECT', `Affecting ${affectedProductIds.size} products`);

  // Print details
  for (const listing of allListings) {
    if (falsePositiveListingIds.includes(listing.id)) {
      const product = productPrices.get(listing.product_id);
      const matchRecord = matchByExternalId.get(listing.external_id);
      console.log(`  FALSE: ${listing.external_id} "${matchRecord?.external_name ?? '?'}" -> "${product?.name}" ($${listing.price}) [${reasons[listing.id]}]`);
    }
  }

  if (DRY_RUN) {
    console.log('\n(DRY RUN -- no changes made)');
    return;
  }

  // Step 6: Delete false positive price_listings
  if (falsePositiveListingIds.length > 0) {
    log('DELETE', `Deleting ${falsePositiveListingIds.length} false positive price listings...`);
    for (let i = 0; i < falsePositiveListingIds.length; i += 100) {
      const batch = falsePositiveListingIds.slice(i, i + 100);
      const { error } = await supabase
        .from('price_listings')
        .delete()
        .in('id', batch);
      if (error) log('ERROR', `Delete batch ${i}: ${error.message}`);
    }
  }

  // Step 7: Reject false positive product_matches
  if (falsePositiveMatchIds.length > 0) {
    log('REJECT', `Rejecting ${falsePositiveMatchIds.length} false positive matches...`);
    for (let i = 0; i < falsePositiveMatchIds.length; i += 100) {
      const batch = falsePositiveMatchIds.slice(i, i + 100);
      const { error } = await supabase
        .from('product_matches')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
        .in('id', batch);
      if (error) log('ERROR', `Reject batch ${i}: ${error.message}`);
    }
  }

  // Step 8: Re-denormalize prices for affected products
  log('DENORM', `Re-denormalizing prices for ${affectedProductIds.size} affected products...`);
  let priceFixed = 0;
  let priceCleared = 0;

  for (const productId of affectedProductIds) {
    // Find the cheapest valid in-stock listing
    const { data: validListings } = await supabase
      .from('price_listings')
      .select('price, affiliate_url, product_url, in_stock, image_url')
      .eq('product_id', productId)
      .eq('in_stock', true)
      .order('price', { ascending: true })
      .limit(1);

    if (validListings && validListings.length > 0) {
      const best = validListings[0];
      await supabase.from('products').update({
        price: best.price,
        affiliate_url: best.affiliate_url ?? best.product_url,
        in_stock: true,
      }).eq('id', productId);
      priceFixed++;
    } else {
      // No valid listings remain -- check if any listing exists at all
      const { data: anyListings } = await supabase
        .from('price_listings')
        .select('price, affiliate_url, product_url')
        .eq('product_id', productId)
        .order('price', { ascending: true })
        .limit(1);

      if (anyListings && anyListings.length > 0) {
        const best = anyListings[0];
        await supabase.from('products').update({
          price: best.price,
          affiliate_url: best.affiliate_url ?? best.product_url,
          in_stock: false,
        }).eq('id', productId);
        priceFixed++;
      } else {
        // No listings at all -- clear denormalized price only if it was from Amazon
        const product = productPrices.get(productId);
        if (product?.price !== null) {
          // Check if the product's affiliate_url is from Amazon
          const { data: p } = await supabase
            .from('products')
            .select('affiliate_url')
            .eq('id', productId)
            .single();

          if (p?.affiliate_url?.includes('amazon.com')) {
            await supabase.from('products').update({
              affiliate_url: null,
              in_stock: false,
            }).eq('id', productId);
            priceCleared++;
          }
        }
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n=================================================================');
  console.log('  AMAZON CLEANUP COMPLETE');
  console.log('=================================================================');
  console.log(`  Duration:              ${elapsed}s`);
  console.log(`  False positive listings: ${falsePositiveListingIds.length}`);
  console.log(`  Matches rejected:      ${falsePositiveMatchIds.length}`);
  console.log(`  Products re-priced:    ${priceFixed}`);
  console.log(`  Prices cleared:        ${priceCleared}`);
  console.log('=================================================================\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
