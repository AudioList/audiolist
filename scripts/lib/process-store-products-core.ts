/**
 * process-store-products-core.ts
 *
 * Shared processing logic extracted from process-store-products.ts.
 * Parameterized by category filter for category-specific pipelines.
 */

import { getSupabase, getRetailers, type Retailer } from '../config/retailers.ts';
import { extractBrand } from '../brand-config.ts';
import { normalizeName, buildCandidateIndex, findBestMatchIndexed, extractHeadphoneDesign, extractIemType, extractDriverType, extractMicConnection, extractMicType, extractMicPattern, detectCorrectCategory, isJunkProduct, isMicrophoneJunk, type IndexedCandidate } from '../scrapers/matcher.ts';
import type { CategoryId } from '../config/store-collections.ts';
import { log, logError } from './log.ts';
import { extractTagAttributes } from './extract-tags.ts';
import { isAliExpressJunk, cleanAliExpressTitle } from './aliexpress-quality-gate.ts';

const BATCH_SIZE = 1000;
const UPSERT_BATCH_SIZE = 100;
const MERGE_THRESHOLD = 0.85;
const REVIEW_THRESHOLD = 0.65;

// ---------------------------------------------------------------------------
// Bloom Audio product_type gate: allowlist + reclassification
// Their product_type values are precise and map 1:1 to AudioList categories.
// ---------------------------------------------------------------------------

/** For each collection-assigned category, which Bloom product_type values are valid. */
const BLOOM_ALLOWED_PRODUCT_TYPES: Record<string, Set<string>> = {
  'iem':       new Set(['headphones']),
  'headphone': new Set(['headphones']),
  'dac':       new Set(['dac', 'dac and amp', 'portable dac and amp', 'streamer']),
  'amp':       new Set(['amp']),
  'dap':       new Set(['digital audio player']),
  'speaker':   new Set(['speakers']),
  'cable':     new Set(['headphone cable']),
  'hp_cable':  new Set(['headphone cable']),
  'iem_tips':  new Set(['eartips']),
  'hp_pads':   new Set(['accessory']),
};

/** When product_type disagrees with collection, map to the correct AudioList category. */
const BLOOM_PRODUCT_TYPE_TO_CATEGORY: Record<string, string> = {
  'dac':                   'dac',
  'dac and amp':           'dac',
  'portable dac and amp':  'dac',
  'streamer':              'dac',
  'amp':                   'amp',
  'digital audio player':  'dap',
  'speakers':              'speaker',
  'headphone cable':       'hp_cable',
  'eartips':               'iem_tips',
  // 'headphones' -> context-dependent (handled in gate logic)
  // 'accessory' -> skip when outside hp_pads
};

// ---------------------------------------------------------------------------
// Linsoul product_type gate: allowlist + reclassification
// Their product_type values are reasonably precise for gating.
// Driver type data comes from collection membership (dynamic-driver, hybrid, etc.)
// ---------------------------------------------------------------------------

/** For each collection-assigned category, which Linsoul product_type values are valid. */
const LINSOUL_ALLOWED_PRODUCT_TYPES: Record<string, Set<string>> = {
  'iem':       new Set(['in-ear monitors', 'earphones/iems', 'earphones', 'true wireless earphones/tws']),
  'headphone': new Set(['headphones']),
  'dac':       new Set(['amp & dac', 'portable dac/amp', 'audio decoder', 'usb sound card', 'dac card', 'audio transmitter', 'network audio players', 'music server', 'master clock', 'turntable']),
  'dap':       new Set(['digital audio players']),
  'cable':     new Set(['audio cable']),
  'iem_tips':  new Set(['eartips']),
  'hp_pads':   new Set(['case', 'ear hook', 'stand', 'audio accessories']),
};

/** When Linsoul product_type disagrees with collection, map to the correct category. */
const LINSOUL_PRODUCT_TYPE_TO_CATEGORY: Record<string, string> = {
  'in-ear monitors':            'iem',
  'earphones/iems':             'iem',
  'earphones':                  'iem',
  'true wireless earphones/tws':'iem',
  'headphones':                 'headphone',
  'amp & dac':                  'dac',
  'portable dac/amp':           'dac',
  'audio decoder':              'dac',
  'usb sound card':             'dac',
  'dac card':                   'dac',
  'digital audio players':      'dap',
  'audio cable':                'cable',
  'eartips':                    'iem_tips',
  'cable convertors':           'cable',
};

/** Linsoul driver-type collection handles -> driver_type values */
const LINSOUL_DRIVER_COLLECTIONS: Record<string, string> = {
  'dynamic-driver':     'dynamic',
  'balanced-armatures': 'balanced_armature',
  'hybrid':             'hybrid',
  'tribrid':            'tribrid',
  'quadbrid':           'quadbrid',
  'planar-magnetic':    'planar',
};

/**
 * Fetch Linsoul driver-type collection memberships and build a lookup map
 * from product handle (external_id) to driver_type value.
 * Called once at the start of processing when Linsoul products are present.
 */
async function buildLinsoulDriverTypeLookup(): Promise<Map<string, string>> {
  const lookup = new Map<string, string>();
  const baseUrl = 'https://www.linsoul.com/collections';

  for (const [handle, driverType] of Object.entries(LINSOUL_DRIVER_COLLECTIONS)) {
    let page = 1;
    while (true) {
      try {
        const url = `${baseUrl}/${handle}/products.json?limit=250&page=${page}`;
        const resp = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        });
        if (!resp.ok) break;
        const data = await resp.json() as { products?: { handle: string }[] };
        const products = data.products ?? [];
        if (products.length === 0) break;

        for (const p of products) {
          // Only set if not already set by a higher-priority driver type
          // Priority: quadbrid > tribrid > hybrid > planar > balanced_armature > dynamic
          const existing = lookup.get(p.handle);
          if (!existing || DRIVER_TYPE_PRIORITY[driverType] > DRIVER_TYPE_PRIORITY[existing]) {
            lookup.set(p.handle, driverType);
          }
        }

        if (products.length < 250) break;
        page++;
      } catch {
        break;
      }
    }
    log('LINSOUL_DRIVER', `${handle}: ${driverType} — found products in collection`);
  }

  log('LINSOUL_DRIVER', `Built driver_type lookup with ${lookup.size} entries`);
  return lookup;
}

/** Priority map: higher number = takes precedence when a product is in multiple driver collections */
const DRIVER_TYPE_PRIORITY: Record<string, number> = {
  'dynamic':           1,
  'balanced_armature': 2,
  'planar':            3,
  'hybrid':            4,
  'tribrid':           5,
  'quadbrid':          6,
};

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
  compare_at_price: number | null;
  on_sale: boolean;
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
      .select('id, retailer_id, external_id, title, vendor, product_type, tags, category_id, price, compare_at_price, on_sale, in_stock, image_url, product_url, affiliate_url')
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

  // Linsoul driver-type lookup: fetch driver-type collection memberships
  // only when there are Linsoul products in the batch
  let linsoulDriverLookup: Map<string, string> | null = null;
  if (storeProducts.some(sp => sp.retailer_id === 'linsoul')) {
    linsoulDriverLookup = await buildLinsoulDriverTypeLookup();
  }

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

      // Performance Audio product_type gate: their product_type field is curated
      // and overrides collection-based category assignment for mic vs mic_accessory.
      // Runs BEFORE microphone junk check so PA accessories aren't falsely skipped.
      // Note: only applies to microphone categories. For headphone/speaker/amp, PA's
      // product_type is too coarse (Recording/DJ/Live Sound) to be useful as a gate.
      // Those categories rely on collection-handle assignment + detectCorrectCategory().
      if (sp.retailer_id === 'performance-audio' && sp.product_type &&
          (categoryId === 'microphone' || categoryId === 'mic_accessory')) {
        const ptLower = sp.product_type.toLowerCase();
        if (ptLower === 'accessories' || ptLower === 'recording') {
          effectiveCategoryId = 'mic_accessory';
          if (categoryId !== 'mic_accessory') {
            log('PA_GATE', `product_type="${sp.product_type}" override: "${sp.title}" -> mic_accessory`);
          }
        } else if (ptLower === 'microphones') {
          effectiveCategoryId = 'microphone';
          if (categoryId !== 'microphone') {
            log('PA_GATE', `product_type="${sp.product_type}" override: "${sp.title}" -> microphone`);
          }
        }
      }

      // PA gate: audio-interfaces collection contains USB mics tagged as product_type "Microphones"
      // Override those to microphone instead of dac so they get proper classification.
      if (sp.retailer_id === 'performance-audio' && sp.product_type &&
          categoryId === 'dac') {
        const ptLower = sp.product_type.toLowerCase();
        if (ptLower === 'microphones') {
          effectiveCategoryId = 'microphone';
          log('PA_GATE', `product_type="${sp.product_type}" override: "${sp.title}" -> microphone`);
        }
      }

      // Bloom Audio product_type gate: their product_type is precise and maps 1:1
      // to AudioList categories. Use allowlist to validate collection assignment.
      // Cross-retailer benefit: accurate Bloom data enriches canonical products
      // that other retailers also link to.
      if (sp.retailer_id === 'bloomaudio' && sp.product_type) {
        const ptLower = sp.product_type.toLowerCase();
        const allowedSet = BLOOM_ALLOWED_PRODUCT_TYPES[categoryId];

        if (allowedSet && !allowedSet.has(ptLower)) {
          if (ptLower === 'accessory') {
            // Accessories outside hp_pads have no target category -- skip
            log('BLOOM_GATE', `Skipping accessory: "${sp.title}" (collection=${categoryId})`);
            spUpdateProcessedOnly.push(sp.id);
            stats.skipped++;
            continue;
          } else if (ptLower === 'headphones') {
            // "Headphones" in non-IEM/headphone collection -> default to headphone
            effectiveCategoryId = 'headphone';
            log('BLOOM_GATE', `product_type="${sp.product_type}" override: "${sp.title}" ${categoryId} -> headphone`);
          } else if (ptLower === 'headphone cable') {
            // Context-dependent: IEM collections -> iem_cable, else -> hp_cable
            const target = (categoryId === 'iem' || categoryId === 'iem_tips' || categoryId === 'iem_cable')
              ? 'iem_cable' : 'hp_cable';
            effectiveCategoryId = target;
            log('BLOOM_GATE', `product_type="${sp.product_type}" override: "${sp.title}" ${categoryId} -> ${target}`);
          } else {
            const target = BLOOM_PRODUCT_TYPE_TO_CATEGORY[ptLower];
            if (target) {
              effectiveCategoryId = target;
              log('BLOOM_GATE', `product_type="${sp.product_type}" override: "${sp.title}" ${categoryId} -> ${target}`);
            } else {
              log('BLOOM_GATE', `Unknown product_type="${sp.product_type}" for "${sp.title}" in ${categoryId}`);
            }
          }
        }
      }

      // Linsoul product_type gate: validate collection assignment against product_type.
      // Linsoul's product_type values ("In-Ear Monitors", "Headphones", "AMP & DAC", etc.)
      // are reliable enough for gating. Reclassify or skip when they disagree.
      if (sp.retailer_id === 'linsoul' && sp.product_type) {
        const ptLower = sp.product_type.toLowerCase();
        const allowedSet = LINSOUL_ALLOWED_PRODUCT_TYPES[categoryId];

        if (allowedSet && !allowedSet.has(ptLower)) {
          // Junk types: bundles, clearance, coming soon, early bird, gift cards, kinera (brand tag)
          const junkTypes = new Set(['bundles', 'clearance', 'coming soon', 'early bird products', 'gift card', 'kinera', 'mws_apo_generated']);
          if (junkTypes.has(ptLower)) {
            log('LINSOUL_GATE', `Skipping junk product_type="${sp.product_type}": "${sp.title}" (collection=${categoryId})`);
            spUpdateProcessedOnly.push(sp.id);
            stats.skipped++;
            continue;
          }

          // Try to reclassify based on product_type
          const target = LINSOUL_PRODUCT_TYPE_TO_CATEGORY[ptLower];
          if (target) {
            effectiveCategoryId = target;
            log('LINSOUL_GATE', `product_type="${sp.product_type}" override: "${sp.title}" ${categoryId} -> ${target}`);
          } else {
            log('LINSOUL_GATE', `Unknown product_type="${sp.product_type}" for "${sp.title}" in ${categoryId}`);
          }
        }
      }

      // AliExpress quality gate: their titles are noisy with marketing language.
      // Clean the title for better matching and skip obvious junk.
      let matchTitle = sp.title;
      if (sp.retailer_id === 'aliexpress') {
        if (isAliExpressJunk(sp.title)) {
          log('ALIEXPRESS_GATE', `Skipping junk: "${sp.title}"`);
          spUpdateProcessedOnly.push(sp.id);
          stats.skipped++;
          continue;
        }
        matchTitle = cleanAliExpressTitle(sp.title);
        if (matchTitle !== sp.title) {
          log('ALIEXPRESS_GATE', `Cleaned: "${sp.title}" -> "${matchTitle}"`);
        }
      }

      // Skip non-microphone products in microphone category (after PA gate override)
      if (effectiveCategoryId === 'microphone' && isMicrophoneJunk(sp.title)) {
        log('JUNK', `Skipping non-microphone product: "${sp.title}"`);
        spUpdateProcessedOnly.push(sp.id);
        stats.skipped++;
        continue;
      }

      const detected = detectCorrectCategory(sp.title, brand, effectiveCategoryId as CategoryId);
      if (detected) {
        log('CATEGORY', `Override: "${sp.title}" store=${effectiveCategoryId} -> detected=${detected}`);
        effectiveCategoryId = detected;
      }

      const brandKey = brand?.toLowerCase();
      const brandIndex = brandKey ? brandIndices.get(effectiveCategoryId)?.get(brandKey) : undefined;
      const categoryIndex = categoryIndices.get(effectiveCategoryId);
      const usingBrandIndex = brandIndex && brandIndex.length > 0;
      const candidateIndex = usingBrandIndex ? brandIndex : categoryIndex;

      const match = (candidateIndex && candidateIndex.length > 0)
        ? findBestMatchIndexed(matchTitle, candidateIndex, { productBrand: brand })
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

        // Extract driver type from title and/or tags (IEM + headphone categories)
        let driverType: string | null = null;
        if (effectiveCategoryId === 'iem' || effectiveCategoryId === 'headphone') {
          driverType = extractDriverType(sp.title);
          if (!driverType && tagAttrs?.driver_type) {
            driverType = tagAttrs.driver_type;
          }
          // Linsoul driver-type collection lookup: highest-confidence source
          // because collection membership is curated ground truth
          if (sp.retailer_id === 'linsoul' && linsoulDriverLookup) {
            const collectionDriverType = linsoulDriverLookup.get(sp.external_id);
            if (collectionDriverType) {
              if (driverType && driverType !== collectionDriverType) {
                log('LINSOUL_DRIVER', `Collection overrides title: "${sp.title}" ${driverType} -> ${collectionDriverType}`);
              }
              driverType = collectionDriverType;
            }
          }
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
            ...(driverType ? { driver_type: driverType } : {}),
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
          compare_at_price: sp.compare_at_price,
          on_sale: sp.on_sale || (sp.compare_at_price != null && sp.price != null && sp.compare_at_price > sp.price),
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

  // Deduplicate listingRows by (retailer_id, external_id).
  // Multiple store_products with the same external_id can match to different
  // canonical products; keep only the first (highest-confidence) match.
  const dedupedListingRows = (() => {
    const seen = new Map<string, typeof listingRows[0]>();
    for (const row of listingRows) {
      const key = `${row.retailer_id}|${row.external_id}`;
      if (!seen.has(key)) {
        seen.set(key, row);
      }
    }
    const deduped = [...seen.values()];
    if (deduped.length < listingRows.length) {
      log('DEDUP', `Deduplicated ${listingRows.length} listing rows to ${deduped.length} (removed ${listingRows.length - deduped.length} duplicate external_ids)`);
    }
    return deduped;
  })();

  // Batch upsert price_listings
  if (dedupedListingRows.length > 0) {
    log('UPSERT', `Upserting ${dedupedListingRows.length} price_listings...`);
    for (let i = 0; i < dedupedListingRows.length; i += UPSERT_BATCH_SIZE) {
      const batch = dedupedListingRows.slice(i, i + UPSERT_BATCH_SIZE);
      const { error } = await supabase
        .from('price_listings')
        .upsert(batch, { onConflict: 'retailer_id,external_id' });

      if (error) {
        logError('UPSERT', 'price_listings batch', error);
      }
    }
  }

  // Deduplicate matchRows by (retailer_id, external_id)
  const dedupedMatchRows = (() => {
    const seen = new Map<string, typeof matchRows[0]>();
    for (const row of matchRows) {
      const key = `${row.retailer_id}|${row.external_id}`;
      const existing = seen.get(key);
      if (!existing || (row.match_score ?? 0) > (existing.match_score ?? 0)) {
        seen.set(key, row);
      }
    }
    return [...seen.values()];
  })();

  // Batch upsert product_matches for pending reviews
  if (dedupedMatchRows.length > 0) {
    log('UPSERT', `Upserting ${dedupedMatchRows.length} product_matches (pending review)...`);
    for (let i = 0; i < dedupedMatchRows.length; i += UPSERT_BATCH_SIZE) {
      const batch = dedupedMatchRows.slice(i, i + UPSERT_BATCH_SIZE);
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
