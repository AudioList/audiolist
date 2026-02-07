/**
 * link-spinorama.ts
 *
 * Fetches speaker measurement data from spinorama.org and links preference
 * scores to existing speaker products in the database. Unmatched speakers
 * are inserted as measurement-only products.
 *
 * Data source: https://www.spinorama.org/json/metadata.json
 * (1000+ speaker measurements with preference scores from pierreaubert/spinorama)
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/link-spinorama.ts [--dev]
 */

import { getSupabase } from './config/retailers.ts';
import { extractBrand } from './brand-config.ts';
import {
  normalizeName,
  buildCandidateIndex,
  findBestMatchIndexed,
} from './scrapers/matcher.ts';

const DEV_MODE = process.argv.includes('--dev');
const DEV_LIMIT = 50;
const BATCH_SIZE = 1000;
const UPSERT_BATCH = 100;
const MATCH_THRESHOLD = 0.70; // speakers have different naming, be slightly more lenient

const SPINORAMA_URL = 'https://www.spinorama.org/json/metadata.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpinMeasurement {
  brand: string;
  model: string;
  type: string;        // 'passive' | 'active'
  price: string;
  shape: string;       // 'bookshelves' | 'floorstanders' | 'center' | etc.
  amount: string;      // 'pair' | 'each'
  default_measurement: string;
  measurements: Record<string, {
    origin: string;
    format: string;
    review?: string;
    review_published?: string;
    quality?: string;
    pref_rating?: {
      pref_score: number;
      pref_score_wsub: number;
      nbd_on_axis: number;
      nbd_pred_in_room: number;
      sm_pred_in_room: number;
      lfx_hz: number;
      lfq?: number;
    };
    computed_sensitivity?: {
      sensitivity_1m: number;
    };
  }>;
}

type ExistingProduct = {
  id: string;
  name: string;
  brand: string | null;
  category_id: string;
  source_type: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

function log(phase: string, msg: string): void {
  console.log(`[${ts()}] [${phase}] ${msg}`);
}

// Map spinorama shape to a readable speaker_type
function mapShape(shape: string): string {
  const map: Record<string, string> = {
    bookshelves: 'bookshelf',
    floorstanders: 'floorstanding',
    center: 'center',
    subwoofer: 'subwoofer',
    surround: 'surround',
    cinema: 'cinema',
    outdoor: 'outdoor',
    soundbar: 'soundbar',
    liveportable: 'portable',
    ceiling: 'ceiling',
  };
  return map[shape] ?? shape;
}

// Normalize spinorama score (0-10 range) to our 0-100 PPI scale
// Score range: roughly -5 to 8.5
// We'll map: <0 → 0, 0-3 → 0-40, 3-5 → 40-60, 5-7 → 60-80, 7-8.5 → 80-100
function scoreTo100(score: number): number {
  if (score <= 0) return 0;
  // Linear mapping: 0 → 0, 8.5 → 100
  const scaled = Math.round((score / 8.5) * 100);
  return Math.max(0, Math.min(100, scaled));
}

// ---------------------------------------------------------------------------
// Load existing speaker products for matching
// ---------------------------------------------------------------------------

async function loadExistingSpeakers(): Promise<ExistingProduct[]> {
  const supabase = getSupabase();
  const all: ExistingProduct[] = [];
  let offset = 0;

  log('LOAD', 'Loading existing speaker products...');

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, brand, category_id, source_type')
      .eq('category_id', 'speaker')
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error('Load error:', error);
      break;
    }

    const batch = (data ?? []) as ExistingProduct[];
    if (batch.length === 0) break;
    all.push(...batch);
    offset += BATCH_SIZE;
    if (batch.length < BATCH_SIZE) break;
  }

  log('LOAD', `Loaded ${all.length} existing speaker products`);
  return all;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(65));
  console.log('  AudioList Spinorama Speaker Measurement Linker');
  console.log(`  Mode: ${DEV_MODE ? 'DEV' : 'FULL'}`);
  console.log(`  Started at ${new Date().toISOString()}`);
  console.log('='.repeat(65));
  console.log();

  // 1. Fetch spinorama metadata
  log('FETCH', `Fetching ${SPINORAMA_URL}...`);
  const res = await fetch(SPINORAMA_URL);
  if (!res.ok) {
    console.error(`Failed to fetch spinorama data: HTTP ${res.status}`);
    process.exit(1);
  }
  const rawData = (await res.json()) as Record<string, SpinMeasurement>;
  log('FETCH', `Fetched ${Object.keys(rawData).length} speaker entries`);

  // 2. Extract entries with preference scores
  interface ScoredSpeaker {
    fullName: string;
    brand: string;
    model: string;
    price: number | null;
    shape: string;
    speakerType: string;
    prefScore: number;
    prefScoreWsub: number;
    nbdOnAxis: number;
    smPredInRoom: number;
    lfxHz: number;
    origin: string;
    quality: string;
    sensitivity: number | null;
    review: string | null;
  }

  const speakers: ScoredSpeaker[] = [];

  for (const [_key, info] of Object.entries(rawData)) {
    const defMeas = info.default_measurement;
    const meas = info.measurements?.[defMeas];
    if (!meas?.pref_rating?.pref_score) continue;

    const pr = meas.pref_rating;
    const priceNum = info.price ? parseFloat(info.price) : null;

    speakers.push({
      fullName: `${info.brand} ${info.model}`.trim(),
      brand: info.brand,
      model: info.model,
      price: priceNum && !isNaN(priceNum) ? priceNum : null,
      shape: info.shape,
      speakerType: mapShape(info.shape),
      prefScore: pr.pref_score,
      prefScoreWsub: pr.pref_score_wsub,
      nbdOnAxis: pr.nbd_on_axis,
      smPredInRoom: pr.sm_pred_in_room,
      lfxHz: pr.lfx_hz,
      origin: meas.origin ?? 'unknown',
      quality: meas.quality ?? 'unknown',
      sensitivity: meas.computed_sensitivity?.sensitivity_1m ?? null,
      review: meas.review ?? null,
    });
  }

  log('PARSE', `${speakers.length} speakers with preference scores`);

  // Sort by pref_score descending
  speakers.sort((a, b) => b.prefScore - a.prefScore);

  if (DEV_MODE) {
    speakers.length = Math.min(speakers.length, DEV_LIMIT);
    log('DEV', `Limited to top ${speakers.length} speakers`);
  }

  // 3. Load existing speaker products
  const existing = await loadExistingSpeakers();

  // Build candidate index for fuzzy matching
  const candidates = existing.map((p) => ({
    id: p.id,
    name: p.name,
  }));
  const index = buildCandidateIndex(candidates);

  // 4. Match and prepare updates/inserts
  const supabase = getSupabase();
  let matched = 0;
  let inserted = 0;
  let errors = 0;
  const matchedProductIds = new Set<string>();

  for (let i = 0; i < speakers.length; i++) {
    const sp = speakers[i];
    const spBrand = extractBrand(sp.fullName) ?? sp.brand;

    // Try fuzzy matching against existing products
    const match = findBestMatchIndexed(sp.fullName, index);

    const ppiScore = scoreTo100(sp.prefScore);
    const updateData = {
      ppi_score: ppiScore,
      pref_score: sp.prefScore,
      pref_score_wsub: sp.prefScoreWsub,
      nbd_on_axis: sp.nbdOnAxis,
      sm_pred_in_room: sp.smPredInRoom,
      lfx_hz: sp.lfxHz,
      speaker_type: sp.speakerType,
      spinorama_origin: sp.origin,
      quality: sp.quality === 'high' ? 'high' : sp.quality === 'medium' ? 'medium' : 'low',
      source_domain: 'spinorama.org',
    };

    if (match && match.score >= MATCH_THRESHOLD && !matchedProductIds.has(match.id)) {
      // Update existing product with spinorama data
      matchedProductIds.add(match.id);
      const { error } = await supabase
        .from('products')
        .update({
          ...updateData,
          source_type: 'merged',
        })
        .eq('id', match.id);

      if (error) {
        console.error(`Update error for ${sp.fullName}:`, error.message);
        errors++;
      } else {
        matched++;
      }
    } else {
      // Insert as measurement-only speaker product
      const brand = spBrand || sp.brand;
      const { error } = await supabase
        .from('products')
        .upsert({
          source_id: `spinorama-${normalizeName(sp.fullName)}`,
          name: sp.fullName,
          brand,
          category_id: 'speaker',
          price: sp.price,
          ...updateData,
          source_type: 'measurement',
        }, {
          onConflict: 'source_id',
        });

      if (error) {
        console.error(`Insert error for ${sp.fullName}:`, error.message);
        errors++;
      } else {
        inserted++;
      }
    }

    if ((i + 1) % 100 === 0) {
      log('PROCESS', `Progress: ${i + 1}/${speakers.length} (matched=${matched}, inserted=${inserted})`);
    }
  }

  console.log();
  console.log('='.repeat(65));
  console.log('  SPINORAMA LINK COMPLETE');
  console.log('='.repeat(65));
  console.log(`  Speakers with scores:  ${speakers.length}`);
  console.log(`  Matched to existing:   ${matched}`);
  console.log(`  Inserted (new):        ${inserted}`);
  console.log(`  Errors:                ${errors}`);
  console.log('='.repeat(65));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
