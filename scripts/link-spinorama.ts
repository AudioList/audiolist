/**
 * link-spinorama.ts
 *
 * Fetches speaker measurement data from spinorama.org, stores it in the
 * Measurement Lab domain, and links measurements to canonical retailer-backed
 * devices.
 *
 * Measurements NEVER create catalog devices. Unmatched items stay in
 * `measurements` only and can be reviewed later.
 *
 * Data source: https://www.spinorama.org/json/metadata.json
 * (1000+ speaker measurements with preference scores from pierreaubert/spinorama)
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/link-spinorama.ts [--dev]
 */

import { getSupabase } from './config/retailers.ts';
import {
  normalizeName,
  buildCandidateIndex,
  findBestMatchIndexed,
} from './scrapers/matcher.ts';

const DEV_MODE = process.argv.includes('--dev');
const DEV_LIMIT = 50;
const BATCH_SIZE = 1000;
const UPSERT_BATCH = 100;

// Precision-first defaults.
const AUTO_APPROVE_THRESHOLD = 0.90;
const QUEUE_REVIEW_THRESHOLD = 0.75;

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

// ---------------------------------------------------------------------------
// Load existing speaker devices for matching
// ---------------------------------------------------------------------------

async function loadExistingSpeakers(): Promise<ExistingProduct[]> {
  const supabase = getSupabase();
  const all: ExistingProduct[] = [];
  let offset = 0;

  log('LOAD', 'Loading existing speaker devices...');

  while (true) {
    const { data, error } = await supabase
      .from('devices')
      .select('id, name, brand, category_id')
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

  log('LOAD', `Loaded ${all.length} existing speaker devices`);
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
    sourceKey: string;
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
      sourceKey: _key,
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

  // 3. Load existing speaker devices
  const existing = await loadExistingSpeakers();

  // Build candidate index for fuzzy matching
  const candidates = existing.map((p) => ({
    id: p.id,
    name: p.name,
  }));
  const index = buildCandidateIndex(candidates);

  // 4. Store measurements + link to devices
  const supabase = getSupabase();
  const nowIso = new Date().toISOString();
  let storedCount = 0;
  let linkedApproved = 0;
  let linkedPending = 0;
  let errors = 0;

  type PendingMeasurement = {
    source_measurement_id: string;
    raw_name: string;
    brand: string | null;
    model: string | null;
    normalized_name: string;
    source_url: string | null;
    speakerType: string;
    prefScore: number;
    prefScoreWsub: number;
    nbdOnAxis: number;
    smPredInRoom: number;
    lfxHz: number;
    origin: string;
    quality: string;
    raw_payload: unknown;
  };

  const pending: PendingMeasurement[] = speakers.map((sp) => ({
    source_measurement_id: `spinorama::${sp.sourceKey}`,
    raw_name: sp.fullName,
    brand: sp.brand ?? null,
    model: sp.model ?? null,
    normalized_name: normalizeName(sp.fullName),
    source_url: sp.review,
    speakerType: sp.speakerType,
    prefScore: sp.prefScore,
    prefScoreWsub: sp.prefScoreWsub,
    nbdOnAxis: sp.nbdOnAxis,
    smPredInRoom: sp.smPredInRoom,
    lfxHz: sp.lfxHz,
    origin: sp.origin,
    quality: sp.quality,
    raw_payload: sp,
  }));

  log('STORE', `Upserting ${pending.length} Spinorama measurements into Measurement Lab...`);

  type StoredMeasurement = {
    measurement_id: string;
    raw_name: string;
    source_measurement_id: string;
  };

  const stored: StoredMeasurement[] = [];

  for (let i = 0; i < pending.length; i += UPSERT_BATCH) {
    const batch = pending.slice(i, i + UPSERT_BATCH);
    const measurementRows = batch.map((m) => ({
      source: 'spinorama',
      source_measurement_id: m.source_measurement_id,
      category_id: 'speaker',
      raw_name: m.raw_name,
      brand: m.brand,
      model: m.model,
      normalized_name: m.normalized_name,
      source_domain: 'spinorama.org',
      source_url: m.source_url,
      raw_payload: m.raw_payload,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      updated_at: nowIso,
    }));

    const { data, error } = await supabase
      .from('measurements')
      .upsert(measurementRows, { onConflict: 'source,source_measurement_id' })
      .select('id, raw_name, source_measurement_id');

    if (error) {
      console.error('Measurement upsert error:', error.message);
      errors++;
      continue;
    }

    for (const row of (data ?? []) as Array<{ id: string; raw_name: string; source_measurement_id: string }>) {
      stored.push({ measurement_id: row.id, raw_name: row.raw_name, source_measurement_id: row.source_measurement_id });
    }
  }

  storedCount = stored.length;

  const pendingBySourceId = new Map<string, PendingMeasurement>();
  for (const m of pending) pendingBySourceId.set(m.source_measurement_id, m);

  log('STORE', `Upserting measurement_spinorama rows for ${stored.length} measurements...`);
  for (let i = 0; i < stored.length; i += UPSERT_BATCH) {
    const batch = stored.slice(i, i + UPSERT_BATCH);
    const spinRows = batch
      .map((m) => {
        const src = pendingBySourceId.get(m.source_measurement_id);
        if (!src) return null;
        return {
          measurement_id: m.measurement_id,
          pref_score: src.prefScore,
          pref_score_wsub: src.prefScoreWsub,
          lfx_hz: src.lfxHz,
          nbd_on_axis: src.nbdOnAxis,
          sm_pred_in_room: src.smPredInRoom,
          speaker_type: src.speakerType,
          spinorama_origin: src.origin,
          quality: src.quality,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (spinRows.length === 0) continue;

    const { error } = await supabase
      .from('measurement_spinorama')
      .upsert(spinRows, { onConflict: 'measurement_id' });
    if (error) {
      console.error('measurement_spinorama upsert error:', error.message);
      errors++;
    }
  }

  const linkRows: Array<Record<string, unknown>> = [];
  const reviewTaskRows: Array<Record<string, unknown>> = [];

  for (let i = 0; i < stored.length; i++) {
    const m = stored[i];

    // Try fuzzy matching against existing devices
    const match = findBestMatchIndexed(m.raw_name, index);
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
      method: 'spinorama_name_fuzzy_v1',
      is_primary: status === 'approved',
      notes: null,
      updated_at: nowIso,
    });

    if (status === 'approved') {
      linkedApproved++;
    } else {
      linkedPending++;
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
          source: 'spinorama',
        },
        reason: `Review Spinorama measurement link for "${m.raw_name}" (${match.score.toFixed(3)})`,
      });
    }

    if ((i + 1) % 100 === 0) {
      log('PROCESS', `Progress: ${i + 1}/${stored.length} (approved=${linkedApproved}, pending=${linkedPending})`);
    }
  }

  if (linkRows.length > 0) {
    log('UPSERT', `Upserting ${linkRows.length} device_measurement_links...`);
    for (let i = 0; i < linkRows.length; i += UPSERT_BATCH) {
      const batch = linkRows.slice(i, i + UPSERT_BATCH);
      const { error } = await supabase
        .from('device_measurement_links')
        .upsert(batch, { onConflict: 'device_id,measurement_id' });
      if (error) {
        console.error('device_measurement_links upsert error:', error.message);
        errors++;
      }
    }
  }

  if (reviewTaskRows.length > 0) {
    log('UPSERT', `Inserting ${reviewTaskRows.length} review_tasks...`);
    for (let i = 0; i < reviewTaskRows.length; i += UPSERT_BATCH) {
      const batch = reviewTaskRows.slice(i, i + UPSERT_BATCH);
      const { error } = await supabase
        .from('review_tasks')
        .insert(batch);
      if (error) {
        console.error('review_tasks insert error:', error.message);
        errors++;
      }
    }
  }

  console.log();
  console.log('='.repeat(65));
  console.log('  SPINORAMA LINK COMPLETE');
  console.log('='.repeat(65));
  console.log(`  Speakers with scores:  ${speakers.length}`);
  console.log(`  Stored:                ${storedCount}`);
  console.log(`  Linked (approved):     ${linkedApproved}`);
  console.log(`  Linked (pending):      ${linkedPending}`);
  console.log(`  Errors:                ${errors}`);
  console.log('='.repeat(65));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
