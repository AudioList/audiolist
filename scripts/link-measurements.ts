/**
 * link-measurements.ts
 *
 * Daily enrichment: fetches Squig-Rank PPI measurement data and links it
 * to existing products in the database. Products matched get PPI fields
 * updated and source_type set to 'merged'. Unmatched measurements are
 * inserted as source_type='measurement'.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/link-measurements.ts [--dev]
 *
 * --dev: Limit to top 100 measurements by PPI score per data file.
 */

import "./lib/env.js";
import { getSupabase } from './config/retailers.ts';
import { extractBrand } from './brand-config.ts';
import { normalizeName, findBestMatch, buildCandidateIndex, findBestMatchIndexed, type IndexedCandidate } from './scrapers/matcher.ts';
import { parseProductVariant } from './variant-config.ts';

const DEV_MODE = process.argv.includes('--dev');
const DEV_LIMIT_PER_FILE = 100;
const BATCH_SIZE = 1000;
const UPSERT_BATCH_SIZE = 500;
const MATCH_THRESHOLD = 0.75;

// ---------------------------------------------------------------------------
// Data sources — same 3 Squig-Rank GitHub files as sync-to-supabase.ts
// ---------------------------------------------------------------------------

const DATA_SOURCES = [
  {
    url: 'https://raw.githubusercontent.com/AudioList/Squig-Rank/main/public/data/results.json',
    label: 'IEM (711)',
    targetMatch: 'ISO 11904-2 DF',
    categoryId: 'iem' as const,
  },
  {
    url: 'https://raw.githubusercontent.com/AudioList/Squig-Rank/main/public/data/results_hp_kb5.json',
    label: 'HP KB5',
    targetMatch: 'KEMAR DF',
    categoryId: 'headphone' as const,
  },
  {
    url: 'https://raw.githubusercontent.com/AudioList/Squig-Rank/main/public/data/results_hp_5128.json',
    label: 'HP 5128',
    targetMatch: '5128 DF',
    categoryId: 'headphone' as const,
  },
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RankedEntry {
  id: string;
  name: string;
  similarity: number;
  stdev: number;
  slope: number;
  avgError: number;
  price: number | null;
  quality: 'high' | 'low';
  sourceDomain: string;
  type: 'iem' | 'headphone';
  rig: '711' | '5128';
  pinna: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
}

interface TargetGroup {
  targetName: string;
  ranked: RankedEntry[];
}

interface ResultsFile {
  generatedAt: string;
  totalIEMs: number;
  results: TargetGroup[];
}

type ExistingProduct = {
  id: string;
  name: string;
  brand: string | null;
  category_id: string;
  source_type: string | null;
};

type Stats = {
  fetched: number;
  deduplicated: number;
  matched: number;
  inserted: number;
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
  console.error(`[${timestamp()}] [${phase}] ERROR: ${msg} — ${detail}`);
}

async function fetchJson<T>(url: string, label: string): Promise<T | null> {
  try {
    log('FETCH', `Fetching ${label}...`);
    const res = await fetch(url);
    if (!res.ok) {
      logError('FETCH', `${label} returned HTTP ${res.status}`, new Error(`HTTP ${res.status}`));
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    logError('FETCH', `Exception fetching ${label}`, err);
    return null;
  }
}

function findDfTarget(data: ResultsFile, matchStr: string, label: string): RankedEntry[] {
  const matchLower = matchStr.toLowerCase();
  const group = data.results.find((g) =>
    g.targetName.toLowerCase().includes(matchLower),
  );
  if (!group) {
    log('PARSE', `WARNING: No target group containing "${matchStr}" found in ${label}. Available: ${data.results.map((g) => g.targetName).join(', ')}`);
    return [];
  }
  log('PARSE', `Found target "${group.targetName}" with ${group.ranked.length} entries in ${label}`);
  return group.ranked;
}

// ---------------------------------------------------------------------------
// Load existing products for matching
// ---------------------------------------------------------------------------

async function loadExistingProducts(): Promise<Map<string, ExistingProduct[]>> {
  const supabase = getSupabase();
  const all: ExistingProduct[] = [];
  let offset = 0;

  log('LOAD', 'Loading existing products for measurement linking...');

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, brand, category_id, source_type')
      .in('category_id', ['iem', 'headphone'])
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
    if (group) {
      group.push(p);
    } else {
      byCategory.set(p.category_id, [p]);
    }
  }

  log('LOAD', `Loaded ${all.length} existing IEM/headphone products across ${byCategory.size} categories`);
  return byCategory;
}

// ---------------------------------------------------------------------------
// Deduplicate measurement entries by source_id, keep highest PPI
// ---------------------------------------------------------------------------

interface MeasurementEntry {
  sourceId: string;
  entry: RankedEntry;
  categoryId: string;
}

function deduplicateMeasurements(entries: MeasurementEntry[]): MeasurementEntry[] {
  const bySourceId = new Map<string, MeasurementEntry>();

  for (const m of entries) {
    const existing = bySourceId.get(m.sourceId);
    if (!existing || m.entry.similarity > existing.entry.similarity) {
      bySourceId.set(m.sourceId, m);
    }
  }

  return Array.from(bySourceId.values());
}

// ---------------------------------------------------------------------------
// Main processing
// ---------------------------------------------------------------------------

async function linkMeasurements(
  measurements: MeasurementEntry[],
  existingByCategory: Map<string, ExistingProduct[]>
): Promise<Stats> {
  const supabase = getSupabase();
  const stats: Stats = {
    fetched: measurements.length,
    deduplicated: measurements.length,
    matched: 0,
    inserted: 0,
    errors: 0,
  };

  // Collect updates and inserts for batch processing
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  const inserts: Record<string, unknown>[] = [];

  // Pre-build candidate indices per category
  log('LINK', 'Building candidate indices...');
  const categoryIndices = new Map<string, IndexedCandidate[]>();
  const brandIndices = new Map<string, Map<string, IndexedCandidate[]>>();

  for (const [catId, products] of existingByCategory) {
    const candidates = products.map((c) => ({ name: c.name, id: c.id }));
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
    for (const [brandKey, candidates] of byBrand) {
      brandIndexMap.set(brandKey, buildCandidateIndex(candidates));
    }
    brandIndices.set(catId, brandIndexMap);
  }
  log('LINK', `Built indices for ${categoryIndices.size} categories`);

  for (let i = 0; i < measurements.length; i++) {
    const m = measurements[i];
    const { entry, categoryId } = m;

    if ((i + 1) % 200 === 0 || i === 0) {
      log('LINK', `Processing ${i + 1}/${measurements.length}: "${entry.name}"`);
    }

    try {
      const brand = extractBrand(entry.name);
      const parsed = parseProductVariant(entry.name);
      const primaryVariant = parsed.variants[0] ?? null;

      // Use pre-built indices for matching
      const brandKey = brand?.toLowerCase();
      const brandIndex = brandKey ? brandIndices.get(categoryId)?.get(brandKey) : undefined;
      const categoryIndex = categoryIndices.get(categoryId);

      const candidateIndex = (brandIndex && brandIndex.length > 0) ? brandIndex : categoryIndex;

      const match = (candidateIndex && candidateIndex.length > 0)
        ? findBestMatchIndexed(entry.name, candidateIndex)
        : null;

      if (match && match.score >= MATCH_THRESHOLD) {
        updates.push({
          id: match.id,
          data: {
            ppi_score: entry.similarity,
            ppi_stdev: entry.stdev,
            ppi_slope: entry.slope,
            ppi_avg_error: entry.avgError,
            source_domain: entry.sourceDomain,
            rig_type: entry.rig,
            pinna: entry.pinna,
            quality: entry.quality,
            source_type: 'merged',
            updated_at: new Date().toISOString(),
          },
        });
        stats.matched++;
      } else {
        inserts.push({
          source_id: entry.id,
          category_id: categoryId,
          name: entry.name,
          brand,
          price: entry.price,
          ppi_score: entry.similarity,
          ppi_stdev: entry.stdev,
          ppi_slope: entry.slope,
          ppi_avg_error: entry.avgError,
          source_domain: entry.sourceDomain,
          rig_type: entry.rig,
          pinna: entry.pinna,
          quality: entry.quality,
          source_type: 'measurement',
          variant_type: primaryVariant?.type ?? null,
          variant_value: primaryVariant?.value ?? null,
          first_seen: entry.firstSeen,
          in_stock: false,
          updated_at: new Date().toISOString(),
        });
        stats.inserted++;
      }
    } catch (err) {
      logError('LINK', `Exception processing "${entry.name}"`, err);
      stats.errors++;
    }
  }

  // Apply updates in parallel chunks of 25
  const UPDATE_CONCURRENCY = 25;
  if (updates.length > 0) {
    log('UPDATE', `Updating ${updates.length} matched products with PPI data (${UPDATE_CONCURRENCY} concurrent)...`);
    let updateErrors = 0;

    for (let i = 0; i < updates.length; i += UPDATE_CONCURRENCY) {
      const chunk = updates.slice(i, i + UPDATE_CONCURRENCY);
      const results = await Promise.all(
        chunk.map((upd) =>
          supabase.from('products').update(upd.data).eq('id', upd.id)
        )
      );

      for (const result of results) {
        if (result.error) {
          updateErrors++;
        }
      }
    }
    if (updateErrors > 0) {
      log('UPDATE', `${updateErrors} update errors`);
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
  console.log('  AudioList Measurement Linker');
  console.log(`  Mode: ${DEV_MODE ? 'DEV (top 100 per file)' : 'FULL'}`);
  console.log(`  Started at ${new Date().toISOString()}`);
  console.log('=================================================================\n');

  // 1. Fetch all three measurement files in parallel
  log('FETCH', 'Fetching Squig-Rank data from GitHub...');
  const results = await Promise.all(
    DATA_SOURCES.map((src) => fetchJson<ResultsFile>(src.url, src.label)),
  );

  // 2. Extract DF-target entries
  log('PARSE', 'Extracting DF-target groups...');
  const allMeasurements: MeasurementEntry[] = [];

  for (let i = 0; i < DATA_SOURCES.length; i++) {
    const data = results[i];
    const src = DATA_SOURCES[i];
    if (!data) continue;

    let entries = findDfTarget(data, src.targetMatch, src.label);

    // Dev mode: take top 100 by PPI score
    if (DEV_MODE && entries.length > DEV_LIMIT_PER_FILE) {
      entries = [...entries]
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, DEV_LIMIT_PER_FILE);
      log('PARSE', `  DEV: Limited ${src.label} to top ${DEV_LIMIT_PER_FILE} by PPI`);
    }

    for (const entry of entries) {
      allMeasurements.push({
        sourceId: entry.id,
        entry,
        categoryId: src.categoryId,
      });
    }
  }

  log('PARSE', `Total measurement entries: ${allMeasurements.length}`);

  if (allMeasurements.length === 0) {
    log('DONE', 'No measurement entries found. Nothing to do.');
    return;
  }

  // 3. Deduplicate by source_id (keep highest PPI)
  const deduplicated = deduplicateMeasurements(allMeasurements);
  log('DEDUP', `Deduplicated: ${allMeasurements.length} → ${deduplicated.length}`);

  // 4. Load existing products for matching
  const existingByCategory = await loadExistingProducts();

  // 5. Link measurements to products
  log('LINK', `Linking ${deduplicated.length} measurements to products...`);
  const stats = await linkMeasurements(deduplicated, existingByCategory);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n=================================================================');
  console.log('  MEASUREMENT LINKING COMPLETE');
  console.log('=================================================================');
  console.log(`  Duration:           ${elapsed}s`);
  console.log(`  Fetched:            ${allMeasurements.length}`);
  console.log(`  Deduplicated:       ${deduplicated.length}`);
  console.log(`  Matched (merged):   ${stats.matched}`);
  console.log(`  Inserted (new):     ${stats.inserted}`);
  console.log(`  Errors:             ${stats.errors}`);
  console.log(`  Mode:               ${DEV_MODE ? 'DEV (limited)' : 'FULL'}`);
  console.log('=================================================================\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
