/**
 * link-measurements.ts
 *
 * Daily enrichment: fetches Squig-Rank measurement data (PPI + metadata),
 * stores it in the Measurement Lab tables, and links measurements to
 * canonical retailer-backed devices.
 *
 * Important: measurements NEVER create catalog devices. Unmatched items
 * remain in `measurements` only and are reviewed later.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/link-measurements.ts [--dev]
 *
 * --dev: Limit to top 100 measurements by PPI score per data file.
 */

import "./lib/env.js";
import { getSupabase } from './config/retailers.ts';
import { extractBrand } from './brand-config.ts';
import { normalizeName, buildCandidateIndex, findBestMatchIndexed, type IndexedCandidate } from './scrapers/matcher.ts';

const DEV_MODE = process.argv.includes('--dev');
const DEV_LIMIT_PER_FILE = 100;
const BATCH_SIZE = 1000;
const UPSERT_BATCH_SIZE = 500;

// Precision-first defaults: auto-approve only for very strong matches.
const AUTO_APPROVE_THRESHOLD = 0.92;
const QUEUE_REVIEW_THRESHOLD = 0.75;

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
};

type Stats = {
  fetched: number;
  deduplicated: number;
  stored: number;
  linkedApproved: number;
  linkedPending: number;
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

function buildSquigSourceUrl(sourceDomain: string | null | undefined, rawName: string): string | null {
  if (!sourceDomain) return null;
  if (sourceDomain.endsWith('.squig.link')) {
    return `https://${sourceDomain}/?share=${encodeURIComponent(rawName)}`;
  }
  if (sourceDomain === 'graph.hangout.audio') {
    return `https://graph.hangout.audio/?share=${encodeURIComponent(rawName)}`;
  }
  return null;
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

async function loadExistingDevices(): Promise<Map<string, ExistingProduct[]>> {
  const supabase = getSupabase();
  const all: ExistingProduct[] = [];
  let offset = 0;

  log('LOAD', 'Loading existing devices for measurement linking...');

  while (true) {
    const { data, error } = await supabase
      .from('devices')
      .select('id, name, brand, category_id')
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

  log('LOAD', `Loaded ${all.length} existing IEM/headphone devices across ${byCategory.size} categories`);
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
    stored: 0,
    linkedApproved: 0,
    linkedPending: 0,
    errors: 0,
  };

  // 1) Upsert measurements into Measurement Lab
  log('STORE', `Upserting ${measurements.length} Squig measurements into Measurement Lab...`);
  const nowIso = new Date().toISOString();

  type StoredMeasurement = {
    measurement_id: string;
    source_measurement_id: string;
    category_id: string;
    raw_name: string;
    normalized_name: string;
    source_domain: string | null;
  };

  const stored: StoredMeasurement[] = [];

  for (let i = 0; i < measurements.length; i += UPSERT_BATCH_SIZE) {
    const batch = measurements.slice(i, i + UPSERT_BATCH_SIZE);

    const measurementRows = batch.map((m) => {
      const brand = extractBrand(m.entry.name);
      return {
        source: 'squig',
        source_measurement_id: m.entry.id,
        category_id: m.categoryId,
        raw_name: m.entry.name,
        brand,
        model: null,
        normalized_name: normalizeName(m.entry.name),
        source_domain: m.entry.sourceDomain ?? null,
        // For squig sources the UI can often reconstruct a per-measurement link from
        // source_domain + raw_name; we still store source_url if we can.
        source_url: buildSquigSourceUrl(m.entry.sourceDomain, m.entry.name),
        raw_payload: m.entry,
        first_seen_at: m.entry.firstSeen ? new Date(m.entry.firstSeen).toISOString() : nowIso,
        last_seen_at: m.entry.lastSeen ? new Date(m.entry.lastSeen).toISOString() : nowIso,
        updated_at: nowIso,
      };
    });

    const { data, error } = await supabase
      .from('measurements')
      .upsert(measurementRows, { onConflict: 'source,source_measurement_id' })
      .select('id, source_measurement_id, category_id, raw_name, normalized_name, source_domain');

    if (error) {
      logError('STORE', `Upsert batch ${Math.floor(i / UPSERT_BATCH_SIZE) + 1}`, error);
      stats.errors++;
      continue;
    }

    for (const row of (data ?? []) as Array<{ id: string; source_measurement_id: string; category_id: string; raw_name: string; normalized_name: string; source_domain: string | null }>) {
      stored.push({
        measurement_id: row.id,
        source_measurement_id: row.source_measurement_id,
        category_id: row.category_id,
        raw_name: row.raw_name,
        normalized_name: row.normalized_name,
        source_domain: row.source_domain,
      });
    }
  }

  stats.stored = stored.length;

  // 2) Upsert measurement_squig payload rows
  log('STORE', `Upserting measurement_squig rows for ${stored.length} measurements...`);

  const bySourceId = new Map<string, RankedEntry>();
  for (const m of measurements) bySourceId.set(m.entry.id, m.entry);

  for (let i = 0; i < stored.length; i += UPSERT_BATCH_SIZE) {
    const batch = stored.slice(i, i + UPSERT_BATCH_SIZE);
    const squigRows = batch
      .map((m) => {
        const entry = bySourceId.get(m.source_measurement_id);
        if (!entry) return null;
        return {
          measurement_id: m.measurement_id,
          ppi_score: entry.similarity,
          ppi_stdev: entry.stdev,
          ppi_slope: entry.slope,
          ppi_avg_error: entry.avgError,
          rig_type: entry.rig,
          pinna: entry.pinna,
          quality: entry.quality,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (squigRows.length === 0) continue;

    const { error } = await supabase
      .from('measurement_squig')
      .upsert(squigRows, { onConflict: 'measurement_id' });

    if (error) {
      logError('STORE', `measurement_squig batch ${Math.floor(i / UPSERT_BATCH_SIZE) + 1}`, error);
      stats.errors++;
    }
  }

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

  // 3) Link stored measurements to devices
  log('LINK', `Linking ${stored.length} stored measurements to devices...`);

  const linkRows: Array<Record<string, unknown>> = [];
  const reviewTaskRows: Array<Record<string, unknown>> = [];

  for (let i = 0; i < stored.length; i++) {
    const m = stored[i];
    const entry = bySourceId.get(m.source_measurement_id);
    if (!entry) continue;
    const categoryId = m.category_id;

    if ((i + 1) % 200 === 0 || i === 0) {
      log('LINK', `Processing ${i + 1}/${stored.length}: "${entry.name}"`);
    }

    try {
      const brand = extractBrand(entry.name);
      // Use pre-built indices for matching
      const brandKey = brand?.toLowerCase();
      const brandIndex = brandKey ? brandIndices.get(categoryId)?.get(brandKey) : undefined;
      const categoryIndex = categoryIndices.get(categoryId);

      const candidateIndex = (brandIndex && brandIndex.length > 0) ? brandIndex : categoryIndex;

      const match = (candidateIndex && candidateIndex.length > 0)
        ? findBestMatchIndexed(entry.name, candidateIndex)
        : null;

      if (!match) continue;

      const status = match.score >= AUTO_APPROVE_THRESHOLD ? 'approved'
        : match.score >= QUEUE_REVIEW_THRESHOLD ? 'pending'
          : null;

      if (!status) continue;

      linkRows.push({
        device_id: match.id,
        measurement_id: m.measurement_id,
        status,
        confidence: match.score,
        method: 'squig_name_fuzzy_v1',
        is_primary: status === 'approved',
        notes: null,
        updated_at: nowIso,
      });

      if (status === 'approved') {
        stats.linkedApproved++;
      } else {
        stats.linkedPending++;
        reviewTaskRows.push({
          task_type: 'measurement_link',
          status: 'open',
          priority: Math.round(match.score * 100),
          device_id: match.id,
          measurement_id: m.measurement_id,
          payload: {
            suggested_device_id: match.id,
            suggested_device_name: match.name,
            score: match.score,
            source: 'squig',
          },
          reason: `Review measurement link for "${entry.name}" (${match.score.toFixed(3)})`,
        });
      }
    } catch (err) {
      logError('LINK', `Exception processing "${entry.name}"`, err);
      stats.errors++;
    }
  }

  if (linkRows.length > 0) {
    log('UPSERT', `Upserting ${linkRows.length} device_measurement_links...`);
    for (let i = 0; i < linkRows.length; i += UPSERT_BATCH_SIZE) {
      const batch = linkRows.slice(i, i + UPSERT_BATCH_SIZE);
      const { error } = await supabase
        .from('device_measurement_links')
        .upsert(batch, { onConflict: 'device_id,measurement_id' });
      if (error) {
        logError('UPSERT', `device_measurement_links batch ${Math.floor(i / UPSERT_BATCH_SIZE) + 1}`, error);
        stats.errors++;
      }
    }
  }

  if (reviewTaskRows.length > 0) {
    log('UPSERT', `Inserting ${reviewTaskRows.length} review_tasks...`);
    for (let i = 0; i < reviewTaskRows.length; i += UPSERT_BATCH_SIZE) {
      const batch = reviewTaskRows.slice(i, i + UPSERT_BATCH_SIZE);
      const { error } = await supabase
        .from('review_tasks')
        .insert(batch);
      if (error) {
        logError('UPSERT', `review_tasks batch ${Math.floor(i / UPSERT_BATCH_SIZE) + 1}`, error);
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

  // 4. Load existing devices for matching
  const existingByCategory = await loadExistingDevices();

  // 5. Store and link measurements to devices
  log('LINK', `Storing and linking ${deduplicated.length} measurements to devices...`);
  const stats = await linkMeasurements(deduplicated, existingByCategory);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n=================================================================');
  console.log('  MEASUREMENT LINKING COMPLETE');
  console.log('=================================================================');
  console.log(`  Duration:           ${elapsed}s`);
  console.log(`  Fetched:            ${allMeasurements.length}`);
  console.log(`  Deduplicated:       ${deduplicated.length}`);
  console.log(`  Stored:             ${stats.stored}`);
  console.log(`  Linked (approved):  ${stats.linkedApproved}`);
  console.log(`  Linked (pending):   ${stats.linkedPending}`);
  console.log(`  Errors:             ${stats.errors}`);
  console.log(`  Mode:               ${DEV_MODE ? 'DEV (limited)' : 'FULL'}`);
  console.log('=================================================================\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
