/**
 * link-sinad.ts
 *
 * Scrapes AudioScienceReview's structured electronics database and links
 * SINAD measurements to existing DAC and amplifier products. Products
 * matched get SINAD fields updated and source_type set to 'merged'.
 * Unmatched measurements are inserted as source_type='measurement'.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/link-sinad.ts [options]
 *
 * Options:
 *   --dry-run       Log matches without writing to DB
 *   --limit=N       Process only first N ASR records
 *   --category=X    Only process 'dac' or 'amp' (default: both)
 */

import { getSupabase } from './config/retailers.ts';
import { extractBrand } from './brand-config.ts';
import {
  normalizeName,
  buildCandidateIndex,
  findBestMatchIndexed,
  type IndexedCandidate,
} from './scrapers/matcher.ts';

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = (() => {
  const arg = process.argv.find((a) => a.startsWith('--limit='));
  return arg ? parseInt(arg.split('=')[1], 10) : 0;
})();
const CATEGORY_FILTER = (() => {
  const arg = process.argv.find((a) => a.startsWith('--category='));
  return arg ? arg.split('=')[1] : null;
})();

const MATCH_THRESHOLD = 0.75;
const BATCH_SIZE = 1000;
const UPSERT_BATCH_SIZE = 500;
const UPDATE_CONCURRENCY = 25;
const PAGE_DELAY_MS = 1000;
const ASR_BASE_URL = 'https://www.audiosciencereview.com/asrdata/ElectronicsallList';
const RECORDS_PER_PAGE = 20;

// ---------------------------------------------------------------------------
// Device type to AudioList category mapping
// ---------------------------------------------------------------------------

type CategoryId = 'dac' | 'amp';

// DAC+AMP combos belong in the DAC category only.
// The AMP category is reserved for dedicated/pure amplifiers.
const DEVICE_TYPE_MAP: Record<string, CategoryId[]> = {
  'DAC (Dedicated)':                ['dac'],
  'DAC (Multifunction)':            ['dac'],
  'Cable DAC':                      ['dac'],
  'DAC+Headphone AMP':              ['dac'],
  'DAC+Speaker AMP':                ['dac'],
  'DAC+Preamp':                     ['dac'],
  'Power AMP':                      ['amp'],
  'Amplifier':                      ['amp'],
  'Headphone Amp (Dedicated)':      ['amp'],
  'Headphone Amp (Multifunction)':  ['amp'],
  'Speaker Amplifier (DSP)':        ['amp'],
  'Streamer Amplifier':             ['amp'],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AsrRecord {
  deviceType: string;
  brand: string;
  model: string;
  sinad: number | null;
  priceUsd: number | null;
  reviewer: string;
  recommended: boolean;
  reviewDate: string;
  reviewUrl: string;
  categories: CategoryId[];
}

type ExistingProduct = {
  id: string;
  name: string;
  brand: string | null;
  category_id: string;
  source_type: string | null;
};

type Stats = {
  scraped: number;
  relevant: number;
  matched: number;
  inserted: number;
  skippedNoSinad: number;
  errors: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function log(phase: string, msg: string): void {
  console.log(`[${timestamp()}] [${phase}] ${msg}`);
}

function logError(phase: string, msg: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[${timestamp()}] [${phase}] ERROR: ${msg} -- ${detail}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// HTML parsing: extract table rows from ASR database pages
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function parseAsrPage(html: string): AsrRecord[] {
  const records: AsrRecord[] = [];

  // Match table body rows: <tr data-rowindex="...">...<td>...</td>...</tr>
  // PHPMaker generates rows with data-rowindex attribute
  const rowRegex = /<tr[^>]*data-rowindex[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    // Extract all <td> cells
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(decodeHtmlEntities(stripHtml(cellMatch[1])));
    }

    // ASR table has 9 columns:
    // 0: Device Type, 1: Brand, 2: Model, 3: SINAD, 4: Price Each USD,
    // 5: Reviewer, 6: Recommended, 7: Review Date, 8: Review Link
    if (cells.length < 9) continue;

    const deviceType = cells[0].trim();
    const categories = DEVICE_TYPE_MAP[deviceType];
    if (!categories) continue; // Skip non-DAC/AMP device types

    const sinadStr = cells[3].trim();
    const sinad = sinadStr ? parseFloat(sinadStr) : null;
    const priceStr = cells[4].trim().replace(/[$,]/g, '');
    const priceUsd = priceStr ? parseFloat(priceStr) : null;

    // Extract review URL from <a href="..."> in the Review Link cell
    const linkCellHtml = rowHtml.match(/<td[^>]*>[\s\S]*?<\/td>/gi)?.[8] ?? '';
    const hrefMatch = linkCellHtml.match(/href="([^"]+)"/);
    const reviewUrl = hrefMatch ? hrefMatch[1] : '';

    // Recommended column: check for checkmark or "Y" or "Yes"
    const recCell = cells[6].trim().toLowerCase();
    const recommended = recCell === 'y' || recCell === 'yes' || recCell.includes('check') || recCell === '1';

    records.push({
      deviceType,
      brand: cells[1].trim(),
      model: cells[2].trim(),
      sinad: sinad !== null && !isNaN(sinad) ? sinad : null,
      priceUsd: priceUsd !== null && !isNaN(priceUsd) ? priceUsd : null,
      reviewer: cells[5].trim(),
      recommended,
      reviewDate: cells[7].trim(),
      reviewUrl,
      categories,
    });
  }

  return records;
}

// ---------------------------------------------------------------------------
// ASR scraping: fetch all pages
// ---------------------------------------------------------------------------

async function scrapeAsrDatabase(): Promise<AsrRecord[]> {
  const allRecords: AsrRecord[] = [];
  let pageNum = 0;
  let emptyPages = 0;

  log('SCRAPE', 'Starting ASR database scrape...');

  while (true) {
    const start = pageNum === 0 ? 0 : pageNum * RECORDS_PER_PAGE + 1;
    const url = pageNum === 0 ? ASR_BASE_URL : `${ASR_BASE_URL}?start=${start}`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });

      if (!res.ok) {
        logError('SCRAPE', `Page ${pageNum + 1} returned HTTP ${res.status}`, new Error(`HTTP ${res.status}`));
        break;
      }

      const html = await res.text();
      const records = parseAsrPage(html);

      if (records.length === 0) {
        emptyPages++;
        if (emptyPages >= 2) {
          log('SCRAPE', `Two consecutive empty pages at page ${pageNum + 1}. Stopping.`);
          break;
        }
      } else {
        emptyPages = 0;
        allRecords.push(...records);
      }

      if ((pageNum + 1) % 10 === 0 || pageNum === 0) {
        log('SCRAPE', `Page ${pageNum + 1}: ${records.length} relevant records (${allRecords.length} total so far)`);
      }

      // Check if we have the record limit (from all pages, not just relevant)
      // The page might have records we skip due to device type filtering
      if (LIMIT > 0 && allRecords.length >= LIMIT) {
        allRecords.splice(LIMIT);
        log('SCRAPE', `Reached --limit=${LIMIT}, stopping.`);
        break;
      }

      // Check total pages from HTML
      const totalMatch = html.match(/of\s+(\d[\d,]*)\s*<\/span>/);
      const totalRecords = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ''), 10) : 0;
      if (totalRecords > 0 && start + RECORDS_PER_PAGE >= totalRecords) {
        log('SCRAPE', `Reached end of records (${totalRecords} total in ASR DB).`);
        break;
      }

      // Safety: stop at 100 pages
      if (pageNum >= 99) {
        log('SCRAPE', 'Safety limit: 100 pages reached.');
        break;
      }

    } catch (err) {
      logError('SCRAPE', `Exception on page ${pageNum + 1}`, err);
      break;
    }

    pageNum++;
    await sleep(PAGE_DELAY_MS);
  }

  log('SCRAPE', `Scraping complete: ${allRecords.length} relevant DAC/AMP records from ${pageNum + 1} pages`);
  return allRecords;
}

// ---------------------------------------------------------------------------
// Load existing products for matching
// ---------------------------------------------------------------------------

async function loadExistingProducts(): Promise<Map<string, ExistingProduct[]>> {
  const supabase = getSupabase();
  const all: ExistingProduct[] = [];
  let offset = 0;

  const categories = CATEGORY_FILTER ? [CATEGORY_FILTER] : ['dac', 'amp'];
  log('LOAD', `Loading existing products for categories: ${categories.join(', ')}...`);

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, brand, category_id, source_type')
      .in('category_id', categories)
      .range(offset, offset + BATCH_SIZE - 1);

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

  log('LOAD', `Loaded ${all.length} existing DAC/AMP products across ${byCategory.size} categories`);
  for (const [cat, prods] of byCategory) {
    log('LOAD', `  ${cat}: ${prods.length} products`);
  }
  return byCategory;
}

// ---------------------------------------------------------------------------
// Deduplicate ASR records by brand+model, keep highest SINAD
// ---------------------------------------------------------------------------

function deduplicateRecords(records: AsrRecord[]): AsrRecord[] {
  const byKey = new Map<string, AsrRecord>();

  for (const r of records) {
    const key = normalizeName(`${r.brand} ${r.model}`);
    const existing = byKey.get(key);
    if (!existing || (r.sinad !== null && (existing.sinad === null || r.sinad > existing.sinad))) {
      byKey.set(key, r);
    }
  }

  return Array.from(byKey.values());
}

// ---------------------------------------------------------------------------
// Main linking logic
// ---------------------------------------------------------------------------

async function linkSinad(
  records: AsrRecord[],
  existingByCategory: Map<string, ExistingProduct[]>,
): Promise<Stats> {
  const supabase = getSupabase();
  const stats: Stats = {
    scraped: records.length,
    relevant: records.length,
    matched: 0,
    inserted: 0,
    skippedNoSinad: 0,
    errors: 0,
  };

  const updates: { id: string; data: Record<string, unknown> }[] = [];
  const inserts: Record<string, unknown>[] = [];
  const matchedProductIds = new Set<string>();

  // Build fuzzy match indices per category
  log('LINK', 'Building candidate indices...');
  const categoryIndices = new Map<string, IndexedCandidate[]>();
  const brandIndices = new Map<string, Map<string, IndexedCandidate[]>>();

  for (const [catId, products] of existingByCategory) {
    const candidates = products.map((p) => ({ name: p.name, id: p.id }));
    categoryIndices.set(catId, buildCandidateIndex(candidates));

    const byBrand = new Map<string, { name: string; id: string }[]>();
    for (const p of products) {
      if (p.brand) {
        const brandKey = p.brand.toLowerCase();
        const list = byBrand.get(brandKey);
        if (list) list.push({ name: p.name, id: p.id });
        else byBrand.set(brandKey, [{ name: p.name, id: p.id }]);
      }
    }
    const brandIndexMap = new Map<string, IndexedCandidate[]>();
    for (const [brandKey, brandCandidates] of byBrand) {
      brandIndexMap.set(brandKey, buildCandidateIndex(brandCandidates));
    }
    brandIndices.set(catId, brandIndexMap);
  }
  log('LINK', `Built indices for ${categoryIndices.size} categories`);

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    if ((i + 1) % 100 === 0 || i === 0) {
      log('LINK', `Processing ${i + 1}/${records.length}: "${record.brand} ${record.model}" (${record.deviceType})`);
    }

    if (record.sinad === null) {
      stats.skippedNoSinad++;
      continue;
    }

    const fullName = `${record.brand} ${record.model}`;

    try {
      const brand = extractBrand(fullName) ?? record.brand;
      const brandKey = brand?.toLowerCase();

      // Try matching in each mapped category
      for (const catId of record.categories) {
        if (CATEGORY_FILTER && catId !== CATEGORY_FILTER) continue;

        const brandIndex = brandKey ? brandIndices.get(catId)?.get(brandKey) : undefined;
        const categoryIndex = categoryIndices.get(catId);
        const candidateIndex = (brandIndex && brandIndex.length > 0) ? brandIndex : categoryIndex;

        const match = (candidateIndex && candidateIndex.length > 0)
          ? findBestMatchIndexed(fullName, candidateIndex)
          : null;

        if (match && match.score >= MATCH_THRESHOLD) {
          // Avoid double-updating the same product from a combo device
          if (matchedProductIds.has(match.id)) continue;
          matchedProductIds.add(match.id);

          if (DRY_RUN) {
            log('MATCH', `  [${catId}] "${fullName}" -> "${match.name}" (score: ${match.score.toFixed(3)}, SINAD: ${record.sinad} dB)`);
          }

          updates.push({
            id: match.id,
            data: {
              sinad_db: record.sinad,
              asr_device_type: record.deviceType,
              asr_recommended: record.recommended,
              asr_review_url: record.reviewUrl,
              asr_review_date: record.reviewDate,
              source_domain: 'audiosciencereview.com',
              source_type: 'merged',
              updated_at: new Date().toISOString(),
            },
          });
          stats.matched++;
        } else {
          // Only insert as new product for the primary (first) category
          if (catId === record.categories[0]) {
            if (DRY_RUN) {
              const bestInfo = match ? ` (best: "${match.name}" @ ${match.score.toFixed(3)})` : ' (no candidates)';
              log('INSERT', `  [${catId}] "${fullName}" SINAD: ${record.sinad} dB -- no match${bestInfo}`);
            }

            inserts.push({
              source_id: `asr-${normalizeName(fullName)}`,
              category_id: catId,
              name: fullName,
              brand: brand,
              price: record.priceUsd,
              sinad_db: record.sinad,
              asr_device_type: record.deviceType,
              asr_recommended: record.recommended,
              asr_review_url: record.reviewUrl,
              asr_review_date: record.reviewDate,
              source_domain: 'audiosciencereview.com',
              source_type: 'measurement',
              in_stock: false,
              updated_at: new Date().toISOString(),
            });
            stats.inserted++;
          }
        }
      }
    } catch (err) {
      logError('LINK', `Exception processing "${fullName}"`, err);
      stats.errors++;
    }
  }

  if (DRY_RUN) {
    log('DRY-RUN', 'Dry run mode -- no database writes performed.');
    return stats;
  }

  // Apply updates in parallel chunks
  if (updates.length > 0) {
    log('UPDATE', `Updating ${updates.length} matched products with SINAD data (${UPDATE_CONCURRENCY} concurrent)...`);
    let updateErrors = 0;

    for (let i = 0; i < updates.length; i += UPDATE_CONCURRENCY) {
      const chunk = updates.slice(i, i + UPDATE_CONCURRENCY);
      const results = await Promise.all(
        chunk.map((upd) =>
          supabase.from('products').update(upd.data).eq('id', upd.id),
        ),
      );

      for (const result of results) {
        if (result.error) {
          updateErrors++;
          logError('UPDATE', 'Failed to update product', result.error);
        }
      }
    }
    if (updateErrors > 0) {
      log('UPDATE', `${updateErrors} update errors`);
      stats.errors += updateErrors;
    }
  }

  // Batch upsert new measurement-only products
  if (inserts.length > 0) {
    log('INSERT', `Upserting ${inserts.length} measurement-only products...`);
    for (let i = 0; i < inserts.length; i += UPSERT_BATCH_SIZE) {
      const batch = inserts.slice(i, i + UPSERT_BATCH_SIZE);
      const { error } = await supabase
        .from('products')
        .upsert(batch, { onConflict: 'source_id' });

      if (error) {
        logError('INSERT', `Batch ${Math.floor(i / UPSERT_BATCH_SIZE) + 1}`, error);
        stats.errors++;
      }
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log('=================================================================');
  console.log('  AudioList SINAD Linker (AudioScienceReview)');
  console.log(`  Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}${LIMIT ? ` (limit: ${LIMIT})` : ''}${CATEGORY_FILTER ? ` (category: ${CATEGORY_FILTER})` : ''}`);
  console.log(`  Started at ${new Date().toISOString()}`);
  console.log('=================================================================\n');

  // 1. Scrape ASR database
  const rawRecords = await scrapeAsrDatabase();

  if (rawRecords.length === 0) {
    log('DONE', 'No relevant records found. Nothing to do.');
    return;
  }

  // 2. Deduplicate by brand+model (keep highest SINAD)
  const records = deduplicateRecords(rawRecords);
  log('DEDUP', `Deduplicated: ${rawRecords.length} -> ${records.length} unique devices`);

  // 3. Load existing products
  const existingByCategory = await loadExistingProducts();

  // 4. Link SINAD data to products
  log('LINK', `Linking ${records.length} ASR records to products...`);
  const stats = await linkSinad(records, existingByCategory);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n=================================================================');
  console.log('  SINAD LINKING COMPLETE');
  console.log('=================================================================');
  console.log(`  Duration:           ${elapsed}s`);
  console.log(`  ASR records scraped: ${rawRecords.length}`);
  console.log(`  After dedup:        ${records.length}`);
  console.log(`  Matched (merged):   ${stats.matched}`);
  console.log(`  Inserted (new):     ${stats.inserted}`);
  console.log(`  Skipped (no SINAD): ${stats.skippedNoSinad}`);
  console.log(`  Errors:             ${stats.errors}`);
  console.log(`  Mode:               ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  console.log('=================================================================\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
