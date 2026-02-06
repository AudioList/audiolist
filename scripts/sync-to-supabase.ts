/**
 * sync-to-supabase.ts
 *
 * Fetches pre-built PPI ranking data from the Squig-Rank GitHub repo
 * and upserts it into the Supabase `products` table.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/sync-to-supabase.ts
 */

import { createClient } from '@supabase/supabase-js';
import { extractBrand } from './brand-config';
import { parseProductVariant } from './variant-config';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = 'https://sycfaajrlnkyczrauusx.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_KEY environment variable is not set.');
  console.error('Usage: SUPABASE_SERVICE_KEY=<key> npx tsx scripts/sync-to-supabase.ts');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const DATA_SOURCES = [
  {
    url: 'https://raw.githubusercontent.com/AudioList/Squig-Rank/main/public/data/results.json',
    label: 'IEM (711)',
    targetMatch: 'ISO 11904-2 DF',
  },
  {
    url: 'https://raw.githubusercontent.com/AudioList/Squig-Rank/main/public/data/results_hp_kb5.json',
    label: 'HP KB5',
    targetMatch: 'KEMAR DF',
  },
  {
    url: 'https://raw.githubusercontent.com/AudioList/Squig-Rank/main/public/data/results_hp_5128.json',
    label: 'HP 5128',
    targetMatch: '5128 DF',
  },
] as const;

const UPSERT_BATCH_SIZE = 500;

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

interface ProductRow {
  source_id: string;
  category_id: string;
  name: string;
  brand: string | null;
  price: number | null;
  ppi_score: number;
  ppi_stdev: number;
  ppi_slope: number;
  ppi_avg_error: number;
  source_domain: string;
  rig_type: string;
  pinna: string | null;
  quality: string;
  variant_type: string | null;
  variant_value: string | null;
  first_seen: string | null;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string, label: string): Promise<T | null> {
  try {
    console.log(`  Fetching ${label}...`);
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`  ERROR: ${label} returned HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`  ERROR fetching ${label}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

function findDfTarget(data: ResultsFile, matchStr: string, label: string): RankedEntry[] {
  const matchLower = matchStr.toLowerCase();
  const group = data.results.find((g) =>
    g.targetName.toLowerCase().includes(matchLower),
  );
  if (!group) {
    console.warn(`  WARNING: No target group containing "${matchStr}" found in ${label}. Available targets: ${data.results.map((g) => g.targetName).join(', ')}`);
    return [];
  }
  console.log(`  Found target "${group.targetName}" with ${group.ranked.length} entries in ${label}`);
  return group.ranked;
}

function mapToProductRow(entry: RankedEntry): ProductRow {
  // Parse variant modifiers from the product name
  const parsed = parseProductVariant(entry.name);
  const primaryVariant = parsed.variants[0] ?? null;

  return {
    source_id: entry.id,
    category_id: entry.type === 'iem' ? 'iem' : 'headphone',
    name: entry.name,
    brand: extractBrand(entry.name),
    price: entry.price,
    ppi_score: entry.similarity,
    ppi_stdev: entry.stdev,
    ppi_slope: entry.slope,
    ppi_avg_error: entry.avgError,
    source_domain: entry.sourceDomain,
    rig_type: entry.rig,
    pinna: entry.pinna,
    quality: entry.quality,
    variant_type: primaryVariant?.type ?? null,
    variant_value: primaryVariant?.value ?? null,
    first_seen: entry.firstSeen,
    updated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Squig-Rank -> Supabase Sync ===\n');

  // 1. Fetch all three files in parallel
  console.log('Step 1: Fetching data from GitHub...');
  const [iemData, hpKb5Data, hp5128Data] = await Promise.all(
    DATA_SOURCES.map((src) => fetchJson<ResultsFile>(src.url, src.label)),
  );

  // 2. Extract DF-target ranked arrays
  console.log('\nStep 2: Extracting DF-target groups...');
  const allEntries: RankedEntry[] = [];
  let totalFetched = 0;

  for (const [data, src] of [
    [iemData, DATA_SOURCES[0]] as const,
    [hpKb5Data, DATA_SOURCES[1]] as const,
    [hp5128Data, DATA_SOURCES[2]] as const,
  ]) {
    if (!data) continue;
    const entries = findDfTarget(data, src.targetMatch, src.label);
    totalFetched += entries.length;
    allEntries.push(...entries);
  }

  console.log(`\n  Total entries fetched: ${totalFetched}`);

  if (allEntries.length === 0) {
    console.error('\nNo entries found. Aborting.');
    process.exit(1);
  }

  // 3. Map to product rows
  console.log('\nStep 3: Mapping & deduplicating...');
  const productMap = new Map<string, ProductRow>();

  for (const entry of allEntries) {
    const row = mapToProductRow(entry);
    const existing = productMap.get(row.source_id);
    if (!existing || row.ppi_score > existing.ppi_score) {
      productMap.set(row.source_id, row);
    }
  }

  const products = Array.from(productMap.values());
  console.log(`  Deduplicated: ${totalFetched} -> ${products.length} unique products`);

  // 4. Upsert into Supabase in batches
  console.log(`\nStep 4: Upserting ${products.length} products into Supabase (batches of ${UPSERT_BATCH_SIZE})...`);
  let upsertedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < products.length; i += UPSERT_BATCH_SIZE) {
    const batch = products.slice(i, i + UPSERT_BATCH_SIZE);
    const batchNum = Math.floor(i / UPSERT_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(products.length / UPSERT_BATCH_SIZE);

    try {
      const { error, count } = await supabase
        .from('products')
        .upsert(batch, { onConflict: 'source_id', count: 'exact' });

      if (error) {
        console.error(`  Batch ${batchNum}/${totalBatches} ERROR: ${error.message}`);
        errorCount += batch.length;
      } else {
        const affected = count ?? batch.length;
        upsertedCount += affected;
        console.log(`  Batch ${batchNum}/${totalBatches}: upserted ${affected} rows`);
      }
    } catch (err) {
      console.error(`  Batch ${batchNum}/${totalBatches} EXCEPTION:`, err instanceof Error ? err.message : err);
      errorCount += batch.length;
    }
  }

  // 5. Summary
  console.log('\n=== Sync Complete ===');
  console.log(`  Total fetched:      ${totalFetched}`);
  console.log(`  After dedup:        ${products.length}`);
  console.log(`  Upserted:           ${upsertedCount}`);
  console.log(`  Errors:             ${errorCount}`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
