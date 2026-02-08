/**
 * process-store-products-core.ts
 *
 * Shared processing logic extracted from process-store-products.ts.
 * Parameterized by category filter for category-specific pipelines.
 */

import { getSupabase, getRetailers, type Retailer } from '../config/retailers.ts';
import { extractBrand } from '../brand-config.ts';
import { normalizeName, buildCandidateIndex, findBestMatchIndexed, extractHeadphoneDesign, extractIemType, extractMicConnection, extractMicType, extractMicPattern, detectCorrectCategory, isJunkProduct, isMicrophoneJunk, type IndexedCandidate } from '../scrapers/matcher.ts';
import type { CategoryId } from '../config/store-collections.ts';
import { log, logError } from './log.ts';
import { extractTagAttributes } from './extract-tags.ts';

const BATCH_SIZE = 1000;
const UPSERT_BATCH_SIZE = 100;
const MERGE_THRESHOLD = 0.85;
const REVIEW_THRESHOLD = 0.65;

export interface ProcessStoreProductsOptions {
  categoryFilter: Set<CategoryId> | null;
  devMode: boolean;
  label: string;
}

type StoreProduct = {
  id: string;
  retailer_id: string;
  external_id: string;
  title: string;
  vendor: string | null;
  product_type: string | null;
  tags: string[];
  category_id: string | null;
  price: number | null;
  in_stock: boolean;
  image_url: string | null;
  product_url: string | null;
  affiliate_url: string | null;
};

type ExistingProduct = {
  id: string;
  name: string;
  brand: string | null;
  category_id: string;
};

type Stats = {
  merged: number;
  created: number;
  pendingReview: number;
  skipped: number;
  errors: number;
  listingsCreated: number;
};

const DEV_LIMIT_PER_CATEGORY = 100;

function extractStoreBrand(sp: StoreProduct): string | null {
  if (sp.vendor && sp.vendor.trim().length > 0) {
    const fromVendor = extractBrand(sp.vendor.trim());
    if (fromVendor) return fromVendor;
  }
  return extractBrand(sp.title);
}

async function loadUnprocessed(
  categoryFilter: Set<CategoryId> | null,
  devMode: boolean
): Promise<StoreProduct[]> {
  const supabase = getSupabase();
  const all: StoreProduct[] = [];
  let offset = 0;

  log('LOAD', 'Loading unprocessed store_products...');

  while (true) {
    let query = supabase
      .from('store_products')
      .select('id, retailer_id, external_id, title, vendor, product_type, tags, category_id, price, in_stock, image_url, product_url, affiliate_url')
      .eq('processed', false)
      .not('category_id', 'is', null);

    if (categoryFilter) {
      query = query.in('category_id', [...categoryFilter]);
    }

    query = query.range(offset, offset + BATCH_SIZE - 1);

    const { data, error } = await query;

    if (error) {
      logError('LOAD', `Failed at offset ${offset}`, error);
      break;
    }

    const batch = (data ?? []) as StoreProduct[];
    if (batch.length === 0) break;

    all.push(...batch);
    offset += BATCH_SIZE;
    if (batch.length < BATCH_SIZE) break;
  }

  log('LOAD', `Loaded ${all.length} unprocessed store_products`);

  if (devMode && all.length > 0) {
    const byCategory = new Map<string, StoreProduct[]>();
    for (const sp of all) {
      const cat = sp.category_id!;
      const group = byCategory.get(cat);
      if (group) group.push(sp);
      else byCategory.set(cat, [sp]);
    }

    const limited: StoreProduct[] = [];
    for (const [cat, products] of byCategory) {
      limited.push(...products.slice(0, DEV_LIMIT_PER_CATEGORY));
      log('LOAD', `  DEV: ${cat}: ${Math.min(products.length, DEV_LIMIT_PER_CATEGORY)}/${products.length}`);
    }

    log('LOAD', `DEV mode: limited to ${limited.length} store_products`);
    return limited;
  }

  return all;
}

async function loadExistingProducts(
  categoryFilter: Set<CategoryId> | null
): Promise<Map<string, ExistingProduct[]>> {
  const supabase = getSupabase();
  const all: ExistingProduct[] = [];
  let offset = 0;

  log('LOAD', 'Loading existing products for dedup matching...');

  while (true) {
    let query = supabase
      .from('products')
      .select('id, name, brand, category_id');

    if (categoryFilter) {
      query = query.in('category_id', [...categoryFilter]);
    }

    query = query.range(offset, offset + BATCH_SIZE - 1);

    const { data, error } = await query;

    if (error) {
      logError('LOAD', `Failed at offset ${offset}`, error);
      break;
    }

    const batch = (data ?? []) as ExistingProduct[];
    if (batch.length === 0) break;

    all.push(...batch);
    offset += BATCH_SIZE;
    if (batch.length < BATCH_SIZE) break;
  }

  const byCategory = new Map<string, ExistingProduct[]>();
  for (const p of all) {
    const group = byCategory.get(p.category_id);
    if (group) group.push(p);
    else byCategory.set(p.category_id, [p]);
  }

  log('LOAD', `Loaded ${all.length} existing products across ${byCategory.size} categories`);
  return byCategory;
}

async function processStoreProducts(
  storeProducts: StoreProduct[],
  existingByCategory: Map<string, ExistingProduct[]>,
  retailerMap: Map<string, Retailer>
): Promise<Stats> {
  const supabase = getSupabase();
  const stats: Stats = {
    merged: 0,
    created: 0,
    pendingReview: 0,
    skipped: 0,
    errors: 0,
    listingsCreated: 0,
  };

  const listingRows: Record<string, unknown>[] = [];
  const matchRows: Record<string, unknown>[] = [];
  const spUpdateWithCanonical: { id: string; canonicalProductId: string }[] = [];
  const spUpdateProcessedOnly: string[] = [];

  // Build a product-id-to-category lookup for cross-category guard
  const productCategoryMap = new Map<string, string>();
  for (const [catId, products] of existingByCategory) {
    for (const p of products) {
      productCategoryMap.set(p.id, catId);
    }
  }

  // Pre-build candidate indices per category
  log('PROCESS', 'Building candidate indices...');
  const categoryIndices = new Map<string, IndexedCandidate[]>();
  const brandIndices = new Map<string, Map<string, IndexedCandidate[]>>();

  for (const [catId, products] of existingByCategory) {
    const candidates = products.map((c) => ({ name: c.name, id: c.id, brand: c.brand }));
    categoryIndices.set(catId, buildCandidateIndex(candidates));

    const byBrand = new Map<string, { name: string; id: string; brand: string }[]>();
    for (const p of products) {
      if (p.brand) {
        const brandKey = p.brand.toLowerCase();
        const list = byBrand.get(brandKey);
        if (list) list.push({ name: p.name, id: p.id, brand: p.brand });
        else byBrand.set(brandKey, [{ name: p.name, id: p.id, brand: p.brand }]);
      }
    }
    const brandIndexMap = new Map<string, IndexedCandidate[]>();
    for (const [brandKey, candidates] of byBrand) {
      brandIndexMap.set(brandKey, buildCandidateIndex(candidates));
    }
    brandIndices.set(catId, brandIndexMap);
  }
  log('PROCESS', `Built indices for ${categoryIndices.size} categories`);

  for (let i = 0; i < storeProducts.length; i++) {
    const sp = storeProducts[i];
    const categoryId = sp.category_id!;

    if ((i + 1) % 100 === 0 || i === 0) {
      log('PROCESS', `Processing ${i + 1}/${storeProducts.length}: "${sp.title}"`);
    }

    try {
      const brand = extractStoreBrand(sp);
      const retailer = retailerMap.get(sp.retailer_id);

      // Category override: detect misclassification across all categories
      let effectiveCategoryId = categoryId;

      // Skip junk/test products entirely
      if (isJunkProduct(sp.title)) {
        log('JUNK', `Skipping junk product: "${sp.title}"`);
        spUpdateProcessedOnly.push(sp.id);
        stats.skipped++;
        continue;
      }

      // Skip non-microphone products in microphone category
      if (categoryId === 'microphone' && isMicrophoneJunk(sp.title)) {
        log('JUNK', `Skipping non-microphone product: "${sp.title}"`);
        spUpdateProcessedOnly.push(sp.id);
        stats.skipped++;
        continue;
      }

      const detected = detectCorrectCategory(sp.title, brand, categoryId as CategoryId);
      if (detected) {
        log('CATEGORY', `Override: "${sp.title}" store=${categoryId} -> detected=${detected}`);
        effectiveCategoryId = detected;
      }

      const brandKey = brand?.toLowerCase();
      const brandIndex = brandKey ? brandIndices.get(effectiveCategoryId)?.get(brandKey) : undefined;
      const categoryIndex = categoryIndices.get(effectiveCategoryId);
      const usingBrandIndex = brandIndex && brandIndex.length > 0;
      const candidateIndex = usingBrandIndex ? brandIndex : categoryIndex;

      const match = (candidateIndex && candidateIndex.length > 0)
        ? findBestMatchIndexed(sp.title, candidateIndex, { productBrand: brand })
        : null;

      let canonicalProductId: string | null = null;

      // Cross-category guard: skip match if the matched product is in a different category
      const matchedCategory = match ? productCategoryMap.get(match.id) : undefined;
      const crossCategory = match && matchedCategory && matchedCategory !== effectiveCategoryId;
      if (crossCategory) {
        log('GUARD', `Cross-category match skipped: "${sp.title}" (${effectiveCategoryId}) -> matched product in ${matchedCategory} (score=${match!.score.toFixed(3)})`);
      }

      // Stricter thresholds when falling back from brand-specific to full-category index
      const effectiveMergeThreshold = usingBrandIndex ? MERGE_THRESHOLD : 0.92;
      const effectiveReviewThreshold = usingBrandIndex ? REVIEW_THRESHOLD : 0.75;

      if (match && match.score >= effectiveMergeThreshold && !crossCategory) {
        canonicalProductId = match.id;
        stats.merged++;
      } else if (match && match.score >= effectiveReviewThreshold && !crossCategory) {
        matchRows.push({
          product_id: match.id,
          retailer_id: sp.retailer_id,
          external_id: sp.external_id,
          external_name: sp.title,
          external_price: sp.price,
          match_score: match.score,
          status: 'pending',
        });
        stats.pendingReview++;
      } else {
        // Extract headphone design type from title and/or Shopify tags
        let headphoneDesign = effectiveCategoryId === 'headphone'
          ? extractHeadphoneDesign(sp.title)
          : null;

        // Extract structured attributes from Shopify tags (driver_type, wearing_style, headphone_design)
        const tagAttrs = (sp.tags && sp.tags.length > 0) ? extractTagAttributes(sp.tags) : null;

        // Tags can supplement title-based extraction
        if (!headphoneDesign && tagAttrs?.headphone_design) {
          headphoneDesign = tagAttrs.headphone_design;
        }

        // Build initial specs from tag extraction
        const initialSpecs: Record<string, unknown> = {};
        if (tagAttrs?.driver_type) initialSpecs.driver_type = tagAttrs.driver_type;
        if (tagAttrs?.wearing_style) initialSpecs.wearing_style = tagAttrs.wearing_style;

        // Extract IEM type from title and/or tags
        let iemType: 'tws' | 'active' | 'passive' | null = null;
        if (effectiveCategoryId === 'iem') {
          iemType = extractIemType(sp.title);
          if (!iemType && tagAttrs?.iem_type) {
            iemType = tagAttrs.iem_type;
          }
          if (!iemType) {
            iemType = 'passive'; // Default for IEMs
          }
        }

        // Extract microphone attributes from title and/or tags
        let micConnection: string | null = null;
        let micType: string | null = null;
        let micPattern: string | null = null;
        if (effectiveCategoryId === 'microphone') {
          micConnection = extractMicConnection(sp.title);
          if (!micConnection && tagAttrs?.mic_connection) micConnection = tagAttrs.mic_connection;

          micType = extractMicType(sp.title);
          if (!micType && tagAttrs?.mic_type) micType = tagAttrs.mic_type;

          micPattern = extractMicPattern(sp.title);
          if (!micPattern && tagAttrs?.mic_pattern) micPattern = tagAttrs.mic_pattern;
        }

        const { data: newProduct, error: insertError } = await supabase
          .from('products')
          .insert({
            source_id: `store:${sp.retailer_id}:${sp.external_id}`,
            category_id: effectiveCategoryId,
            name: sp.title,
            brand,
            price: sp.price,
            image_url: sp.image_url,
            affiliate_url: sp.affiliate_url ?? sp.product_url,
            source_type: 'store',
            in_stock: sp.in_stock,
            ...(headphoneDesign ? { headphone_design: headphoneDesign } : {}),
            ...(iemType ? { iem_type: iemType } : {}),
            ...(micConnection ? { mic_connection: micConnection } : {}),
            ...(micType ? { mic_type: micType } : {}),
            ...(micPattern ? { mic_pattern: micPattern } : {}),
            ...(Object.keys(initialSpecs).length > 0 ? { specs: initialSpecs } : {}),
          })
          .select('id')
          .single();

        if (insertError) {
          if (insertError.code === '23505') {
            const { data: existing } = await supabase
              .from('products')
              .select('id')
              .eq('source_id', `store:${sp.retailer_id}:${sp.external_id}`)
              .single();

            if (existing) {
              canonicalProductId = existing.id;
              stats.merged++;
            } else {
              stats.errors++;
              continue;
            }
          } else {
            logError('PROCESS', `Insert product "${sp.title}"`, insertError);
            stats.errors++;
            continue;
          }
        } else if (newProduct) {
          canonicalProductId = newProduct.id;
          stats.created++;

          const existingList = existingByCategory.get(categoryId);
          const newEntry = { id: newProduct.id, name: sp.title, brand, category_id: categoryId };
          if (existingList) existingList.push(newEntry);
          else existingByCategory.set(categoryId, [newEntry]);
          productCategoryMap.set(newProduct.id, categoryId);

          const idx = categoryIndices.get(categoryId);
          if (idx) {
            const [newIndexed] = buildCandidateIndex([{ name: sp.title, id: newProduct.id, brand }]);
            idx.push(newIndexed);
          }
          if (brandKey) {
            let brandMap = brandIndices.get(categoryId);
            if (!brandMap) {
              brandMap = new Map();
              brandIndices.set(categoryId, brandMap);
            }
            const bIdx = brandMap.get(brandKey);
            const [newIndexed] = buildCandidateIndex([{ name: sp.title, id: newProduct.id, brand }]);
            if (bIdx) bIdx.push(newIndexed);
            else brandMap.set(brandKey, [newIndexed]);
          }
        }
      }

      if (canonicalProductId) {
        listingRows.push({
          product_id: canonicalProductId,
          retailer_id: sp.retailer_id,
          external_id: sp.external_id,
          price: sp.price,
          currency: 'USD',
          in_stock: sp.in_stock,
          product_url: sp.product_url,
          affiliate_url: sp.affiliate_url ?? sp.product_url,
          image_url: sp.image_url,
          last_checked: new Date().toISOString(),
        });
        stats.listingsCreated++;
        spUpdateWithCanonical.push({ id: sp.id, canonicalProductId });
      } else {
        spUpdateProcessedOnly.push(sp.id);
      }
    } catch (err) {
      logError('PROCESS', `Exception processing "${sp.title}"`, err);
      stats.errors++;
    }
  }

  // Batch mark all store_products as processed
  const allProcessedIds = [...spUpdateProcessedOnly, ...spUpdateWithCanonical.map((u) => u.id)];
  if (allProcessedIds.length > 0) {
    log('BATCH', `Marking ${allProcessedIds.length} store_products as processed...`);
    for (let i = 0; i < allProcessedIds.length; i += UPSERT_BATCH_SIZE) {
      const batch = allProcessedIds.slice(i, i + UPSERT_BATCH_SIZE);
      await supabase.from('store_products').update({ processed: true }).in('id', batch);
    }
  }

  // Update canonical_product_id in parallel chunks
  if (spUpdateWithCanonical.length > 0) {
    log('BATCH', `Linking ${spUpdateWithCanonical.length} store_products to canonical products...`);
    const LINK_CONCURRENCY = 25;
    for (let i = 0; i < spUpdateWithCanonical.length; i += LINK_CONCURRENCY) {
      const chunk = spUpdateWithCanonical.slice(i, i + LINK_CONCURRENCY);
      await Promise.all(
        chunk.map((u) =>
          supabase.from('store_products')
            .update({ canonical_product_id: u.canonicalProductId })
            .eq('id', u.id)
        )
      );
    }
  }

  // Batch upsert price_listings
  if (listingRows.length > 0) {
    log('UPSERT', `Upserting ${listingRows.length} price_listings...`);
    for (let i = 0; i < listingRows.length; i += UPSERT_BATCH_SIZE) {
      const batch = listingRows.slice(i, i + UPSERT_BATCH_SIZE);
      const { error } = await supabase
        .from('price_listings')
        .upsert(batch, { onConflict: 'product_id,retailer_id' });

      if (error) {
        logError('UPSERT', 'price_listings batch', error);
      }
    }
  }

  // Batch upsert product_matches for pending reviews
  if (matchRows.length > 0) {
    log('UPSERT', `Upserting ${matchRows.length} product_matches (pending review)...`);
    for (let i = 0; i < matchRows.length; i += UPSERT_BATCH_SIZE) {
      const batch = matchRows.slice(i, i + UPSERT_BATCH_SIZE);
      const { error } = await supabase
        .from('product_matches')
        .upsert(batch, { onConflict: 'product_id,retailer_id' });

      if (error) {
        logError('UPSERT', 'product_matches batch', error);
      }
    }
  }

  return stats;
}

async function denormalizeLowestPrices(): Promise<number> {
  const supabase = getSupabase();
  const PAGE_SIZE = 1000;

  log('DENORM', 'Finding lowest in-stock price per product...');

  const listings: { product_id: string; price: number; affiliate_url: string | null; product_url: string | null }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('price_listings')
      .select('product_id, price, affiliate_url, product_url')
      .eq('in_stock', true)
      .order('price', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      logError('DENORM', 'Failed to fetch price_listings', error);
      return 0;
    }

    if (!data || data.length === 0) break;
    listings.push(...data);
    offset += data.length;
    if (data.length < PAGE_SIZE) break;
  }

  if (listings.length === 0) {
    log('DENORM', 'No in-stock listings found.');
    return 0;
  }

  log('DENORM', `Fetched ${listings.length} in-stock listings`);

  const lowestByProduct = new Map<string, { price: number; affiliate_url: string | null }>();
  for (const listing of listings) {
    const existing = lowestByProduct.get(listing.product_id);
    if (!existing || listing.price < existing.price) {
      lowestByProduct.set(listing.product_id, {
        price: listing.price,
        affiliate_url: listing.affiliate_url ?? listing.product_url,
      });
    }
  }

  log('DENORM', `Updating ${lowestByProduct.size} products with lowest prices...`);

  let updatedCount = 0;
  const entries = Array.from(lowestByProduct.entries());
  const DENORM_CONCURRENCY = 25;

  for (let i = 0; i < entries.length; i += DENORM_CONCURRENCY) {
    const chunk = entries.slice(i, i + DENORM_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(([productId, info]) =>
        supabase
          .from('products')
          .update({ price: info.price, affiliate_url: info.affiliate_url, in_stock: true })
          .eq('id', productId)
      )
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].error) {
        logError('DENORM', `Failed to update product ${chunk[j][0]}`, results[j].error);
      } else {
        updatedCount++;
      }
    }
  }

  log('DENORM', `Updated ${updatedCount} products`);
  return updatedCount;
}

export async function runProcessStoreProducts(options: ProcessStoreProductsOptions): Promise<void> {
  const startTime = Date.now();
  console.log('=================================================================');
  console.log(`  AudioList Store Product Processor — ${options.label}`);
  console.log(`  Mode: ${options.devMode ? 'DEV (100 per category)' : 'FULL'}`);
  if (options.categoryFilter) {
    console.log(`  Categories: ${[...options.categoryFilter].join(', ')}`);
  }
  console.log(`  Started at ${new Date().toISOString()}`);
  console.log('=================================================================\n');

  const retailers = await getRetailers();
  const retailerMap = new Map(retailers.map((r) => [r.id, r]));

  const storeProducts = await loadUnprocessed(options.categoryFilter, options.devMode);
  if (storeProducts.length === 0) {
    log('DONE', 'No unprocessed store products. Nothing to do.');
    return;
  }

  const existingByCategory = await loadExistingProducts(options.categoryFilter);

  log('PROCESS', `Processing ${storeProducts.length} store products...`);
  const stats = await processStoreProducts(storeProducts, existingByCategory, retailerMap);

  console.log('\n--- Denormalize Lowest Prices ---\n');
  const denormalized = await denormalizeLowestPrices();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n=================================================================');
  console.log(`  PROCESSING COMPLETE — ${options.label}`);
  console.log('=================================================================');
  console.log(`  Duration:           ${elapsed}s`);
  console.log(`  Store products:     ${storeProducts.length}`);
  console.log(`  Merged (existing):  ${stats.merged}`);
  console.log(`  Created (new):      ${stats.created}`);
  console.log(`  Pending review:     ${stats.pendingReview}`);
  console.log(`  Skipped:            ${stats.skipped}`);
  console.log(`  Errors:             ${stats.errors}`);
  console.log(`  Listings created:   ${stats.listingsCreated}`);
  console.log(`  Prices denormalized: ${denormalized}`);
  console.log('=================================================================\n');
}
