/**
 * admin-server.ts — Lightweight Express admin for reviewing retailer-first tasks.
 *
 * Focus:
 *  - offer_link: link a retailer_product to an existing device, or create a new device
 *  - ingest_error: capture non-fatal ingestion/processing errors for review
 *  - device_merge: optional, basic merge workflow (soft merge)
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=... ADMIN_PASSWORD=secret npx tsx scripts/admin-server.ts
 */

import express, { Request, Response, NextFunction } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import './lib/env.js';
import { extractBrand } from './brand-config.ts';
import { extractHeadphoneType, normalizeName } from './scrapers/matcher.ts';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = 'https://sycfaajrlnkyczrauusx.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin';
const PORT = 3001;
const AUTH_COOKIE = 'admin_auth';
const COOKIE_VALUE = Buffer.from(ADMIN_PASSWORD).toString('base64');
const PAGE_SIZE = 50;

// Keep this list in sync with public.categories.
// Used for resolving retailer_category tasks without manual DB edits.
const CATEGORY_OPTIONS = [
  'iem',
  'iem_tips',
  'iem_cable',
  'iem_filter',
  'headphone',
  'hp_pads',
  'hp_cable',
  'hp_accessory',
  'dac',
  'amp',
  'dap',
  'speaker',
  'cable',
  'microphone',
  'mic_accessory',
] as const;

if (!SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_KEY environment variable is required.');
  console.error('Usage: SUPABASE_SERVICE_KEY=<key> ADMIN_PASSWORD=secret npx tsx scripts/admin-server.ts');
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReviewTask = {
  id: string;
  task_type: string;
  status: string;
  priority: number;
  retailer_product_id: string | null;
  device_id: string | null;
  measurement_id: string | null;
  payload: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
};

type RetailerProduct = {
  id: string;
  retailer_id: string;
  external_id: string;
  title: string;
  vendor: string | null;
  source_category_id: string;
  price: number | null;
  compare_at_price: number | null;
  on_sale: boolean;
  in_stock: boolean;
  product_url: string | null;
  affiliate_url: string | null;
  image_url: string | null;
  canonical_device_id: string | null;
  processed: boolean;
};

type Device = {
  id: string;
  category_id: string;
  name: string;
  brand: string | null;
  status: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    cookies[key] = decodeURIComponent(val);
  }
  return cookies;
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timestamp(): string {
  return new Date().toISOString();
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function extractStoreBrand(vendor: string | null, title: string): string | null {
  if (vendor && vendor.trim().length > 0) {
    const fromVendor = extractBrand(vendor.trim());
    if (fromVendor) return fromVendor;
  }
  return extractBrand(title);
}

async function loadRetailerProduct(id: string): Promise<RetailerProduct> {
  const { data, error } = await supabase
    .from('retailer_products')
    .select('id, retailer_id, external_id, title, vendor, source_category_id, price, compare_at_price, on_sale, in_stock, product_url, affiliate_url, image_url, canonical_device_id, processed')
    .eq('id', id)
    .single();

  if (error || !data) {
    throw new Error(`Failed to load retailer_product ${id}: ${error?.message}`);
  }
  return data as RetailerProduct;
}

async function loadDevice(id: string): Promise<Device> {
  const { data, error } = await supabase
    .from('devices')
    .select('id, category_id, name, brand, status')
    .eq('id', id)
    .single();

  if (error || !data) {
    throw new Error(`Device ${id} not found: ${error?.message}`);
  }
  return data as Device;
}

async function upsertDeviceOfferFromRetailerProduct(rp: RetailerProduct, deviceId: string): Promise<void> {
  if (rp.price == null) return; // device_offers.price is NOT NULL

  const offerRow = {
    device_id: deviceId,
    retailer_product_id: rp.id,
    retailer_id: rp.retailer_id,
    external_id: rp.external_id,
    price: rp.price,
    compare_at_price: rp.compare_at_price,
    on_sale: rp.on_sale || (rp.compare_at_price != null && rp.price != null && rp.compare_at_price > rp.price),
    currency: 'USD',
    in_stock: rp.in_stock,
    product_url: rp.product_url,
    affiliate_url: rp.affiliate_url ?? rp.product_url,
    image_url: rp.image_url,
    last_checked: timestamp(),
  };

  const { error } = await supabase
    .from('device_offers')
    .upsert(offerRow, { onConflict: 'retailer_id,external_id' });

  if (error) {
    throw new Error(`Failed to upsert device_offer: ${error.message}`);
  }
}

async function resolveTask(taskId: string, status: 'resolved' | 'rejected'): Promise<void> {
  const { error } = await supabase
    .from('review_tasks')
    .update({ status, resolved_at: timestamp() })
    .eq('id', taskId);

  if (error) {
    throw new Error(`Failed to update review_task ${taskId}: ${error.message}`);
  }
}

async function linkOfferTask(taskId: string, deviceId: string): Promise<void> {
  const { data: task, error: taskErr } = await supabase
    .from('review_tasks')
    .select('id, task_type, retailer_product_id')
    .eq('id', taskId)
    .single();

  if (taskErr || !task) throw new Error(`Task ${taskId} not found: ${taskErr?.message}`);
  if (task.task_type !== 'offer_link') throw new Error(`Task ${taskId} is not an offer_link task`);
  if (!task.retailer_product_id) throw new Error(`Task ${taskId} has no retailer_product_id`);

  const rp = await loadRetailerProduct(task.retailer_product_id);
  const device = await loadDevice(deviceId);

  if (device.category_id !== rp.source_category_id) {
    throw new Error(`Category mismatch: device=${device.category_id} retailer_product=${rp.source_category_id}`);
  }

  // 1) Link retailer product
  const { error: linkErr } = await supabase
    .from('retailer_products')
    .update({ canonical_device_id: device.id, processed: true, needs_review: false, review_reason: null })
    .eq('id', rp.id);

  if (linkErr) throw new Error(`Failed to link retailer_product: ${linkErr.message}`);

  // 2) Upsert offer
  await upsertDeviceOfferFromRetailerProduct(rp, device.id);

  // 3) Resolve task
  await resolveTask(taskId, 'resolved');
}

async function setCategoryFromRetailerCategoryTask(taskId: string, categoryId: string): Promise<void> {
  const { data: task, error: taskErr } = await supabase
    .from('review_tasks')
    .select('id, task_type, retailer_product_id')
    .eq('id', taskId)
    .single();

  if (taskErr || !task) throw new Error(`Task ${taskId} not found: ${taskErr?.message}`);
  if (task.task_type !== 'retailer_category') throw new Error(`Task ${taskId} is not a retailer_category task`);
  if (!task.retailer_product_id) throw new Error(`Task ${taskId} has no retailer_product_id`);

  const rp = await loadRetailerProduct(task.retailer_product_id);
  if (rp.canonical_device_id) {
    throw new Error(`Retailer product is already linked (canonical_device_id=${rp.canonical_device_id}); refusing to change category`);
  }

  const { error: updateErr } = await supabase
    .from('retailer_products')
    .update({
      source_category_id: categoryId,
      processed: false,
      needs_review: false,
      review_reason: null,
      detected_category_id: null,
      category_confidence: null,
    })
    .eq('id', rp.id);

  if (updateErr) throw new Error(`Failed to update retailer_product category: ${updateErr.message}`);

  await resolveTask(taskId, 'resolved');
}

async function createDeviceFromOfferTask(taskId: string): Promise<void> {
  const { data: task, error: taskErr } = await supabase
    .from('review_tasks')
    .select('id, task_type, retailer_product_id')
    .eq('id', taskId)
    .single();

  if (taskErr || !task) throw new Error(`Task ${taskId} not found: ${taskErr?.message}`);
  if (task.task_type !== 'offer_link') throw new Error(`Task ${taskId} is not an offer_link task`);
  if (!task.retailer_product_id) throw new Error(`Task ${taskId} has no retailer_product_id`);

  const rp = await loadRetailerProduct(task.retailer_product_id);

  const brand = extractStoreBrand(rp.vendor, rp.title);
  const headphoneType = rp.source_category_id === 'headphone'
    ? extractHeadphoneType(rp.title)
    : null;

  // Create device (or reuse if it already exists for this retailer product)
  let deviceId: string;
  const { data: inserted, error: insertErr } = await supabase
    .from('devices')
    .insert({
      category_id: rp.source_category_id,
      name: rp.title,
      brand,
      normalized_name: normalizeName(rp.title),
      image_url: rp.image_url,
      created_from_retailer_product_id: rp.id,
      ...(headphoneType ? { headphone_type: headphoneType } : {}),
    })
    .select('id')
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      const { data: existing } = await supabase
        .from('devices')
        .select('id')
        .eq('created_from_retailer_product_id', rp.id)
        .single();

      if (!existing?.id) {
        throw new Error(`Device exists but could not be loaded for retailer_product ${rp.id}`);
      }
      deviceId = existing.id as string;
    } else {
      throw new Error(`Device insert failed: ${insertErr.message}`);
    }
  } else {
    deviceId = (inserted as { id: string }).id;
  }

  // Link retailer product + upsert offer
  const { error: linkErr } = await supabase
    .from('retailer_products')
    .update({ canonical_device_id: deviceId, processed: true, needs_review: false, review_reason: null })
    .eq('id', rp.id);
  if (linkErr) throw new Error(`Failed to link retailer_product: ${linkErr.message}`);

  await upsertDeviceOfferFromRetailerProduct(rp, deviceId);
  await resolveTask(taskId, 'resolved');
}

async function mergeDeviceMergeTask(taskId: string): Promise<void> {
  const { data: task, error: taskErr } = await supabase
    .from('review_tasks')
    .select('id, task_type, device_id, payload')
    .eq('id', taskId)
    .single();

  if (taskErr || !task) throw new Error(`Task ${taskId} not found: ${taskErr?.message}`);
  if (task.task_type !== 'device_merge') throw new Error(`Task ${taskId} is not a device_merge task`);

  const loserId = asString(task.device_id);
  const payload = (task.payload ?? {}) as Record<string, unknown>;
  const winnerId = asString(payload.suggested_device_id);

  if (!loserId || !winnerId) {
    throw new Error('device_merge task missing device_id or payload.suggested_device_id');
  }

  if (loserId === winnerId) {
    throw new Error('Winner and loser device IDs are the same');
  }

  // Reassign the important references. This is a "soft merge": we do not delete
  // the losing device; we hide it so existing references remain safe.
  const { error: buildErr } = await supabase
    .from('build_items')
    .update({ product_id: winnerId })
    .eq('product_id', loserId);
  if (buildErr) throw new Error(`Merge failed (build_items reassignment): ${buildErr.message}`);

  const { error: offerErr } = await supabase
    .from('device_offers')
    .update({ device_id: winnerId })
    .eq('device_id', loserId);
  if (offerErr) throw new Error(`Merge failed (device_offers reassignment): ${offerErr.message}`);

  const { error: histErr } = await supabase
    .from('device_price_history')
    .update({ device_id: winnerId })
    .eq('device_id', loserId);
  if (histErr) throw new Error(`Merge failed (device_price_history reassignment): ${histErr.message}`);

  const { error: rpErr } = await supabase
    .from('retailer_products')
    .update({ canonical_device_id: winnerId })
    .eq('canonical_device_id', loserId);
  if (rpErr) throw new Error(`Merge failed (retailer_products reassignment): ${rpErr.message}`);

  const { error: hideErr } = await supabase
    .from('devices')
    .update({ status: 'hidden' })
    .eq('id', loserId);
  if (hideErr) throw new Error(`Merge failed (hide losing device): ${hideErr.message}`);

  await resolveTask(taskId, 'resolved');
}

// ---------------------------------------------------------------------------
// Express setup
// ---------------------------------------------------------------------------

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.path === '/login') return next();
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[AUTH_COOKIE] === COOKIE_VALUE) return next();
  res.redirect('/login');
}
app.use(authMiddleware);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/login', (_req: Request, res: Response) => {
  res.send(loginPage());
});

app.post('/login', (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  if (password === ADMIN_PASSWORD) {
    res.setHeader(
      'Set-Cookie',
      `${AUTH_COOKIE}=${encodeURIComponent(COOKIE_VALUE)}; Path=/; HttpOnly; SameSite=Lax`
    );
    res.redirect('/');
  } else {
    res.send(loginPage('Invalid password.'));
  }
});

app.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const type = (req.query.type as string) || 'offer_link';
    const offset = (page - 1) * PAGE_SIZE;

    const statusFilter: ('open' | 'in_review')[] = ['open', 'in_review'];

    // Basic stats
    const [
      { count: deviceCount },
      { count: offerCount },
      { count: openTaskCount },
    ] = await Promise.all([
      supabase.from('devices').select('*', { count: 'exact', head: true }),
      supabase.from('device_offers').select('*', { count: 'exact', head: true }),
      supabase
        .from('review_tasks')
        .select('*', { count: 'exact', head: true })
        .in('status', statusFilter as unknown as string[]),
    ]);

    // Load tasks
    let taskQuery = supabase
      .from('review_tasks')
      .select('id, task_type, status, priority, retailer_product_id, device_id, measurement_id, payload, reason, created_at, updated_at', { count: 'exact' })
      .in('status', statusFilter as unknown as string[])
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (type !== 'all') {
      taskQuery = taskQuery.eq('task_type', type);
    }

    const { data: tasksRaw, count: taskTotal, error: taskErr } = await taskQuery;
    if (taskErr) throw new Error(taskErr.message);

    const tasks = (tasksRaw ?? []) as ReviewTask[];

    // Load referenced retailer_products + devices
    const rpIds = Array.from(new Set(tasks.map(t => t.retailer_product_id).filter(Boolean))) as string[];
    const deviceIds = new Set<string>();
    for (const t of tasks) {
      if (t.device_id) deviceIds.add(t.device_id);
      const suggested = asString((t.payload ?? {}).suggested_device_id);
      if (suggested) deviceIds.add(suggested);
    }

    const [{ data: rpsRaw }, { data: devicesRaw }] = await Promise.all([
      rpIds.length > 0
        ? supabase
            .from('retailer_products')
            .select('id, retailer_id, external_id, title, vendor, source_category_id, price, compare_at_price, on_sale, in_stock, product_url, affiliate_url, image_url, canonical_device_id, processed')
            .in('id', rpIds)
        : Promise.resolve({ data: [] as unknown[] }),
      deviceIds.size > 0
        ? supabase
            .from('devices')
            .select('id, category_id, name, brand, status')
            .in('id', Array.from(deviceIds))
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

    const rpMap = new Map((rpsRaw ?? []).map((rp) => [(rp as RetailerProduct).id, rp as RetailerProduct]));
    const deviceMap = new Map((devicesRaw ?? []).map((d) => [(d as Device).id, d as Device]));

    const totalPages = Math.max(1, Math.ceil((taskTotal ?? 0) / PAGE_SIZE));

    res.send(
      dashboardPage({
        deviceCount: deviceCount ?? 0,
        offerCount: offerCount ?? 0,
        openTaskCount: openTaskCount ?? 0,
        tasks,
        rpMap,
        deviceMap,
        type,
        page,
        totalPages,
      })
    );
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).send(`<pre>Error: ${esc(err)}</pre>`);
  }
});

app.post('/task/:id/link', async (req: Request, res: Response) => {
  try {
    const deviceId = asString((req.body as { device_id?: string }).device_id);
    if (!deviceId) {
      res.status(400).send('device_id is required');
      return;
    }
    await linkOfferTask(req.params.id as string, deviceId);
    res.redirect(req.header('Referer') ?? '/');
  } catch (err) {
    console.error('Link error:', err);
    res.status(500).send(`<pre>Error: ${esc(err)}</pre>`);
  }
});

app.post('/task/:id/create-device', async (req: Request, res: Response) => {
  try {
    await createDeviceFromOfferTask(req.params.id as string);
    res.redirect(req.header('Referer') ?? '/');
  } catch (err) {
    console.error('Create device error:', err);
    res.status(500).send(`<pre>Error: ${esc(err)}</pre>`);
  }
});

app.post('/task/:id/merge', async (req: Request, res: Response) => {
  try {
    await mergeDeviceMergeTask(req.params.id as string);
    res.redirect(req.header('Referer') ?? '/');
  } catch (err) {
    console.error('Merge error:', err);
    res.status(500).send(`<pre>Error: ${esc(err)}</pre>`);
  }
});

app.post('/task/:id/set-category', async (req: Request, res: Response) => {
  try {
    const categoryId = asString((req.body as { category_id?: string }).category_id);
    if (!categoryId) {
      res.status(400).send('category_id is required');
      return;
    }
    await setCategoryFromRetailerCategoryTask(req.params.id as string, categoryId);
    res.redirect(req.header('Referer') ?? '/');
  } catch (err) {
    console.error('Set category error:', err);
    res.status(500).send(`<pre>Error: ${esc(err)}</pre>`);
  }
});

app.post('/task/:id/reject', async (req: Request, res: Response) => {
  try {
    await resolveTask(req.params.id as string, 'rejected');
    res.redirect(req.header('Referer') ?? '/');
  } catch (err) {
    console.error('Reject error:', err);
    res.status(500).send(`<pre>Error: ${esc(err)}</pre>`);
  }
});

app.post('/task/:id/resolve', async (req: Request, res: Response) => {
  try {
    await resolveTask(req.params.id as string, 'resolved');
    res.redirect(req.header('Referer') ?? '/');
  } catch (err) {
    console.error('Resolve error:', err);
    res.status(500).send(`<pre>Error: ${esc(err)}</pre>`);
  }
});

app.get('/api/devices/search', async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string) ?? '';
    const category = (req.query.category as string) ?? '';

    if (q.trim().length < 2) {
      res.json([]);
      return;
    }

    let query = supabase
      .from('devices')
      .select('id, name, brand, category_id')
      .ilike('name', `%${q}%`)
      .order('name', { ascending: true })
      .limit(10);

    if (category) {
      query = query.eq('category_id', category);
    }

    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json(data ?? []);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0b1020; color: #e8eef7; line-height: 1.4; }
  a { color: #86b3ff; }
  .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
  h1 { font-size: 22px; margin-bottom: 8px; }
  .sub { color: #9fb0c8; margin-bottom: 14px; }
  .stats { display: flex; gap: 12px; flex-wrap: wrap; margin: 10px 0 18px; }
  .stat { background: #121a33; border: 1px solid #1d2a55; border-radius: 10px; padding: 12px 14px; min-width: 140px; }
  .stat .label { font-size: 11px; color: #9fb0c8; letter-spacing: 0.06em; text-transform: uppercase; }
  .stat .value { font-size: 22px; font-weight: 800; margin-top: 4px; }
  .tabs { display: flex; gap: 8px; flex-wrap: wrap; margin: 14px 0 12px; }
  .tab { display: inline-block; padding: 7px 10px; border-radius: 8px; background: #121a33; border: 1px solid #1d2a55; color: #e8eef7; text-decoration: none; font-weight: 700; font-size: 13px; }
  .tab.active { background: #1a2753; border-color: #2a3e7c; }
  .task { border: 1px solid #1d2a55; background: #10182f; border-radius: 12px; padding: 14px; margin: 10px 0; }
  .task .meta { display: flex; gap: 14px; flex-wrap: wrap; color: #9fb0c8; font-size: 12px; margin-bottom: 8px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #1a2753; border: 1px solid #2a3e7c; font-size: 12px; font-weight: 800; }
  .row { display: grid; grid-template-columns: 1.1fr 1fr; gap: 12px; }
  @media (max-width: 900px) { .row { grid-template-columns: 1fr; } }
  .box { background: #0c1327; border: 1px solid #1d2a55; border-radius: 10px; padding: 10px; }
  .box h3 { font-size: 13px; margin-bottom: 6px; color: #cfe1ff; }
  .kv { font-size: 13px; color: #dbe7f6; }
  .kv b { color: #e8eef7; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .btn { display: inline-block; padding: 6px 10px; border-radius: 8px; border: 1px solid #2a3e7c; background: #1a2753; color: #e8eef7; cursor: pointer; font-weight: 800; font-size: 12px; }
  .btn:hover { filter: brightness(1.1); }
  .btn.danger { border-color: #7c2a2a; background: #3a1616; }
  .btn.good { border-color: #2a7c45; background: #163a22; }
  input[type=text] { width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid #1d2a55; background: #0b1020; color: #e8eef7; }
  pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; color: #b9c7db; }
  .pagination { display: flex; gap: 8px; align-items: center; margin: 16px 0; }
  .pagination a { padding: 6px 10px; border-radius: 8px; border: 1px solid #1d2a55; background: #121a33; color: #86b3ff; text-decoration: none; font-weight: 800; font-size: 12px; }
  .pagination .current { padding: 6px 10px; border-radius: 8px; border: 1px solid #2a3e7c; background: #1a2753; font-weight: 900; }
  .search-results { margin-top: 8px; }
  .result { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 8px; border-radius: 8px; border: 1px solid #1d2a55; background: #0b1020; margin-bottom: 6px; }
  .result .name { font-size: 12px; }
`;

function loginPage(error?: string): string {
  return `<!doctype html>
  <html><head><meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AudioList Admin Login</title>
    <style>${STYLES}</style>
  </head>
  <body>
    <div class="container">
      <h1>AudioList Admin</h1>
      <div class="sub">Retailer-first review tasks</div>
      ${error ? `<div class="task" style="border-color:#7c2a2a;background:#3a1616">${esc(error)}</div>` : ''}
      <div class="task">
        <form method="POST" action="/login">
          <div class="box">
            <h3>Password</h3>
            <input type="text" name="password" autocomplete="current-password" />
            <div class="actions">
              <button class="btn good" type="submit">Login</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </body></html>`;
}

function dashboardPage(props: {
  deviceCount: number;
  offerCount: number;
  openTaskCount: number;
  tasks: ReviewTask[];
  rpMap: Map<string, RetailerProduct>;
  deviceMap: Map<string, Device>;
  type: string;
  page: number;
  totalPages: number;
}): string {
  const { deviceCount, offerCount, openTaskCount, tasks, rpMap, deviceMap, type, page, totalPages } = props;

  const tabs: { id: string; label: string }[] = [
    { id: 'offer_link', label: 'Offer Links' },
    { id: 'retailer_category', label: 'Categories' },
    { id: 'device_merge', label: 'Device Merges' },
    { id: 'measurement_link', label: 'Measurement Links' },
    { id: 'ingest_error', label: 'Errors' },
    { id: 'all', label: 'All' },
  ];

  const tasksHtml = tasks.map((t) => renderTask(t, rpMap, deviceMap)).join('\n');

  return `<!doctype html>
  <html><head><meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AudioList Admin</title>
    <style>${STYLES}</style>
  </head>
  <body>
    <div class="container">
      <h1>AudioList Admin</h1>
      <div class="sub">Retailer-first review tasks (open + in_review)</div>

      <div class="stats">
        <div class="stat"><div class="label">Devices</div><div class="value">${deviceCount}</div></div>
        <div class="stat"><div class="label">Offers</div><div class="value">${offerCount}</div></div>
        <div class="stat"><div class="label">Open Tasks</div><div class="value">${openTaskCount}</div></div>
      </div>

      <div class="tabs">
        ${tabs
          .map((t) => `<a class="tab ${t.id === type ? 'active' : ''}" href="/?type=${encodeURIComponent(t.id)}">${esc(t.label)}</a>`)
          .join('')}
      </div>

      ${tasks.length === 0 ? `<div class="task">No tasks.</div>` : tasksHtml}

      <div class="pagination">
        ${page > 1 ? `<a href="/?type=${encodeURIComponent(type)}&page=${page - 1}">Prev</a>` : ''}
        <div class="current">Page ${page} / ${totalPages}</div>
        ${page < totalPages ? `<a href="/?type=${encodeURIComponent(type)}&page=${page + 1}">Next</a>` : ''}
      </div>
    </div>

    <script>
      function debounce(fn, ms) {
        let t = null;
        return function () {
          const args = arguments;
          if (t) clearTimeout(t);
          t = setTimeout(() => fn.apply(null, args), ms);
        };
      }

      async function doSearch(input) {
        const q = input.value.trim();
        const category = input.getAttribute('data-category') || '';
        const resultsId = input.getAttribute('data-results-id');
        const deviceInputId = input.getAttribute('data-device-input-id');

        const resultsEl = resultsId ? document.getElementById(resultsId) : null;
        const deviceInput = deviceInputId ? document.getElementById(deviceInputId) : null;
        if (!resultsEl) return;

        resultsEl.innerHTML = '';
        if (q.length < 2) return;

        const url = '/api/devices/search?q=' + encodeURIComponent(q) + '&category=' + encodeURIComponent(category);
        const resp = await fetch(url);
        const data = await resp.json();
        if (!Array.isArray(data)) return;

        const wrap = document.createElement('div');
        wrap.className = 'search-results';

        for (const d of data) {
          const row = document.createElement('div');
          row.className = 'result';
          const left = document.createElement('div');
          left.className = 'name';
          left.textContent = String(d.name || '') + (d.brand ? ' (' + d.brand + ')' : '');

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn';
          btn.textContent = 'Use';
          btn.addEventListener('click', () => {
            if (deviceInput) deviceInput.value = d.id;
            resultsEl.innerHTML = '';
          });

          row.appendChild(left);
          row.appendChild(btn);
          wrap.appendChild(row);
        }

        resultsEl.appendChild(wrap);
      }

      const handler = debounce(doSearch, 250);
      for (const input of document.querySelectorAll('[data-device-search]')) {
        input.addEventListener('input', () => handler(input));
      }
    </script>
  </body></html>`;
}

function renderTask(
  task: ReviewTask,
  rpMap: Map<string, RetailerProduct>,
  deviceMap: Map<string, Device>
): string {
  const payload = (task.payload ?? {}) as Record<string, unknown>;
  const rp = task.retailer_product_id ? rpMap.get(task.retailer_product_id) : null;
  const suggestedId = asString(payload.suggested_device_id);
  const suggestedName = asString(payload.suggested_device_name);
  const suggestedScore = payload.score;
  const suggestedDevice = suggestedId ? deviceMap.get(suggestedId) : null;

  const taskHeader = `
    <div class="meta">
      <span class="badge">${esc(task.task_type)}</span>
      <span>Status: <b>${esc(task.status)}</b></span>
      <span>Priority: <b>${esc(task.priority)}</b></span>
      <span>Created: <b>${esc(task.created_at)}</b></span>
      <span>Id: <b>${esc(task.id)}</b></span>
    </div>
    ${task.reason ? `<div class="kv"><b>Reason:</b> ${esc(task.reason)}</div>` : ''}
  `;

  const rpBox = rp
    ? `
      <div class="box">
        <h3>Retailer Product</h3>
        <div class="kv"><b>Retailer:</b> ${esc(rp.retailer_id)} | <b>External:</b> ${esc(rp.external_id)}</div>
        <div class="kv"><b>Title:</b> ${esc(rp.title)}</div>
        <div class="kv"><b>Vendor:</b> ${esc(rp.vendor)}</div>
        <div class="kv"><b>Category:</b> ${esc(rp.source_category_id)}</div>
        <div class="kv"><b>Price:</b> ${esc(rp.price)} | <b>Stock:</b> ${esc(rp.in_stock)} | <b>Sale:</b> ${esc(rp.on_sale)}</div>
        <div class="kv"><b>URL:</b> ${rp.product_url ? `<a href="${esc(rp.product_url)}" target="_blank" rel="noreferrer">open</a>` : 'n/a'}</div>
      </div>
    `
    : `
      <div class="box">
        <h3>Retailer Product</h3>
        <div class="kv">(none)</div>
      </div>
    `;

  const suggestedBox = `
    <div class="box">
      <h3>Suggested Device</h3>
      <div class="kv"><b>Id:</b> ${esc(suggestedId ?? '')}</div>
      <div class="kv"><b>Name:</b> ${esc(suggestedDevice?.name ?? suggestedName ?? '')}</div>
      <div class="kv"><b>Score:</b> ${esc(suggestedScore ?? '')}</div>
    </div>
  `;

  const actions = (() => {
    if (task.task_type === 'offer_link') {
      const category = rp?.source_category_id ?? '';
      const deviceIdInputId = `device_id_${task.id}`;
      const resultsId = `results_${task.id}`;
      const searchId = `search_${task.id}`;

      const linkSuggested = suggestedId
        ? `
          <form method="POST" action="/task/${esc(task.id)}/link">
            <input type="hidden" name="device_id" value="${esc(suggestedId)}" />
            <button class="btn good" type="submit">Link Suggested</button>
          </form>
        `
        : '';

      return `
        <div class="actions">
          ${linkSuggested}

          <form method="POST" action="/task/${esc(task.id)}/link" style="flex:1; min-width: 320px;">
            <div class="box">
              <h3>Link To Device</h3>
              <input id="${esc(deviceIdInputId)}" type="text" name="device_id" placeholder="Device UUID" />
              <div style="height: 8px"></div>
              <input
                id="${esc(searchId)}"
                type="text"
                data-device-search="1"
                data-category="${esc(category)}"
                data-results-id="${esc(resultsId)}"
                data-device-input-id="${esc(deviceIdInputId)}"
                placeholder="Search devices by name..."
              />
              <div id="${esc(resultsId)}"></div>
              <div class="actions">
                <button class="btn good" type="submit">Link</button>
              </div>
            </div>
          </form>

          <form method="POST" action="/task/${esc(task.id)}/create-device">
            <button class="btn" type="submit">Create Device</button>
          </form>

          <form method="POST" action="/task/${esc(task.id)}/reject">
            <button class="btn danger" type="submit">Reject</button>
          </form>
        </div>
      `;
    }

    if (task.task_type === 'retailer_category') {
      const sourceCategory = rp?.source_category_id ?? '';
      const detectedCategory = asString(payload.detected_category_id);
      const selected = detectedCategory ?? sourceCategory;
      const options = CATEGORY_OPTIONS
        .map((id) => `<option value="${esc(id)}" ${id === selected ? 'selected' : ''}>${esc(id)}</option>`)
        .join('');

      return `
        <div class="actions">
          <form method="POST" action="/task/${esc(task.id)}/set-category" style="flex:1; min-width: 320px;">
            <div class="box">
              <h3>Set Category + Reprocess</h3>
              <select name="category_id">${options}</select>
              <div class="actions">
                <button class="btn good" type="submit">Apply</button>
              </div>
            </div>
          </form>

          <form method="POST" action="/task/${esc(task.id)}/resolve">
            <button class="btn" type="submit">Dismiss</button>
          </form>

          <form method="POST" action="/task/${esc(task.id)}/reject">
            <button class="btn danger" type="submit">Reject</button>
          </form>
        </div>
      `;
    }

    if (task.task_type === 'device_merge') {
      return `
        <div class="actions">
          <form method="POST" action="/task/${esc(task.id)}/merge">
            <button class="btn good" type="submit">Merge (Soft)</button>
          </form>
          <form method="POST" action="/task/${esc(task.id)}/resolve">
            <button class="btn" type="submit">Dismiss</button>
          </form>
        </div>
      `;
    }

    if (task.task_type === 'ingest_error') {
      return `
        <div class="actions">
          <form method="POST" action="/task/${esc(task.id)}/resolve">
            <button class="btn good" type="submit">Mark Resolved</button>
          </form>
          <form method="POST" action="/task/${esc(task.id)}/reject">
            <button class="btn danger" type="submit">Reject</button>
          </form>
        </div>
      `;
    }

    return `
      <div class="actions">
        <form method="POST" action="/task/${esc(task.id)}/resolve">
          <button class="btn good" type="submit">Resolve</button>
        </form>
        <form method="POST" action="/task/${esc(task.id)}/reject">
          <button class="btn danger" type="submit">Reject</button>
        </form>
      </div>
    `;
  })();

  const payloadBox = `
    <div class="box">
      <h3>Payload</h3>
      <pre>${esc(JSON.stringify(payload, null, 2))}</pre>
    </div>
  `;

  return `
    <div class="task">
      ${taskHeader}
      <div class="row">
        ${rpBox}
        ${suggestedBox}
      </div>
      ${payloadBox}
      ${actions}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Admin server running on http://localhost:${PORT}`);
});
