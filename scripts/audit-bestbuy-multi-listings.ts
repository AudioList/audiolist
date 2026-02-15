/**
 * audit-bestbuy-multi-listings.ts
 *
 * Generates a report of products/devices that have multiple Best Buy offers
 * (multiple SKUs) linked to the same canonical device.
 *
 * Output:
 *   - docs/audits/multiple-bestbuy-listings.md (human-friendly)
 *   - docs/audits/multiple-bestbuy-listings.json (machine-friendly)
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=... npx tsx scripts/audit-bestbuy-multi-listings.ts [--check-discontinued]
 *
 * Options:
 *   --check-discontinued   Fetch BestBuy pages for out-of-stock offers and
 *                          exclude listings that show the "no longer available
 *                          in new condition" banner.
 *   --include-discontinued Include discontinued-new listings in the report.
 *   --max-checks=N         Safety cap for page checks (default: 200)
 */

import './lib/env.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { getSupabase } from './config/retailers.ts';

type OfferRow = {
  device_id: string;
  retailer_product_id: string;
  external_id: string;
  price: number;
  in_stock: boolean;
  product_url: string | null;
  affiliate_url: string | null;
  last_checked: string;
};

type ProductRow = {
  id: string;
  name: string;
  brand: string | null;
  category_id: string;
};

type RetailerProductRow = {
  id: string;
  title: string;
  source_category_id: string | null;
  product_url: string | null;
  raw_data?: unknown;
};

const RETAILER_ID = 'bestbuy';
const PAGE_SIZE = 1000;

const AUDIT_DIR = resolve('docs/audits');
const OUT_JSON = resolve(AUDIT_DIR, 'multiple-bestbuy-listings.json');
const OUT_MD = resolve(AUDIT_DIR, 'multiple-bestbuy-listings.md');

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function log(msg: string): void {
  console.log(`[${timestamp()}] ${msg}`);
}

const args = process.argv.slice(2);
const CHECK_DISCONTINUED = args.includes('--check-discontinued');
const INCLUDE_DISCONTINUED = args.includes('--include-discontinued');
const MAX_CHECKS = (() => {
  const raw = args.find((a) => a.startsWith('--max-checks='))?.split('=')[1];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 200;
})();

const PRIORITY_SKUS = (() => {
  const raw = args.find((a) => a.startsWith('--priority-skus='))?.split('=')[1];
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
})();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isBestBuyPageDiscontinued(url: string): Promise<boolean> {
  // Best effort: HTML text match.
  // Example banner: "This item is no longer available in new condition."
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'AudioList Audit Bot/1.0',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!resp.ok) return false;
    const html = (await resp.text()).toLowerCase();
    return html.includes('no longer available in new condition');
  } catch {
    return false;
  }
}

async function filterDiscontinuedOffers(offers: OfferRow[]): Promise<{ offers: OfferRow[]; discontinued: Set<string> }> {
  const discontinued = new Set<string>();

  // Only check out-of-stock offers; in-stock should never show the banner.
  const candidates = offers
    .filter((o) => !o.in_stock)
    .map((o) => ({
      external_id: String(o.external_id),
      url: o.product_url ?? `https://www.bestbuy.com/site/${String(o.external_id)}.p`,
    }));

  const uniqueAll = (() => {
    const seen = new Set<string>();
    const out: { external_id: string; url: string }[] = [];
    for (const c of candidates) {
      if (seen.has(c.external_id)) continue;
      seen.add(c.external_id);
      out.push(c);
    }
    return out;
  })();

  // Ensure priority SKUs are checked first when provided.
  const prioritySet = new Set(PRIORITY_SKUS);
  const unique = [
    ...uniqueAll.filter((u) => prioritySet.has(u.external_id)),
    ...uniqueAll.filter((u) => !prioritySet.has(u.external_id)),
  ].slice(0, MAX_CHECKS);

  if (unique.length === 0) return { offers, discontinued };

  log(`Checking BestBuy pages for discontinued banner (out-of-stock only): ${unique.length}/${candidates.length} (cap=${MAX_CHECKS})`);

  // Low concurrency to be polite.
  const CONCURRENCY = 5;
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const chunk = unique.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (c) => {
        const hit = await isBestBuyPageDiscontinued(c.url);
        // Add a small delay between fetches.
        await sleep(250);
        return { ...c, discontinued: hit };
      })
    );
    for (const r of results) {
      if (r.discontinued) discontinued.add(r.external_id);
    }
  }

  if (discontinued.size === 0) return { offers, discontinued };

  const filtered = offers.filter((o) => !discontinued.has(String(o.external_id)));
  log(`Excluded ${offers.length - filtered.length} offer(s) due to discontinued banner (unique SKUs flagged=${discontinued.size}).`);
  return { offers: filtered, discontinued };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function escapeMd(text: string): string {
  return text.replace(/[\\`*_{}\[\]()#+\-.!|>]/g, (m) => `\\${m}`);
}

function splitTitleSegments(title: string): string[] {
  // Best Buy titles often use " - " separators.
  // Keep it simple: normalize whitespace, split on " - ", drop empties.
  return title
    .replace(/\s+/g, ' ')
    .trim()
    .split(' - ')
    .map((s) => s.trim())
    .filter(Boolean);
}

const COLOR_WORDS = new Set([
  'black', 'white', 'gray', 'grey', 'silver', 'gold', 'red', 'blue', 'green', 'pink', 'purple', 'orange', 'yellow',
  'brown', 'tan', 'beige', 'cream', 'ivory',
  'navy', 'teal', 'cyan', 'magenta',
  'clear', 'transparent',
]);

function looksLikeColorSegment(seg: string): boolean {
  const tokens = seg
    .toLowerCase()
    .split(/[^a-z]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return false;
  const hasColor = tokens.some((t) => COLOR_WORDS.has(t));
  if (!hasColor) return false;
  return tokens.every((t) => COLOR_WORDS.has(t) || t === 'and');
}

function baseAndVariantFromTitle(title: string): { baseTitle: string; variant: string | null } {
  const segs = splitTitleSegments(title);
  if (segs.length >= 2) {
    const last = segs[segs.length - 1];
    if (looksLikeColorSegment(last)) {
      return { baseTitle: segs.slice(0, -1).join(' - '), variant: last };
    }
  }
  return { baseTitle: title, variant: null };
}

async function loadAllBestBuyOffers(): Promise<OfferRow[]> {
  const supabase = getSupabase();
  const all: OfferRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('device_offers')
      .select('device_id, retailer_product_id, external_id, price, in_stock, product_url, affiliate_url, last_checked')
      .eq('retailer_id', RETAILER_ID)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to load device_offers: ${error.message}`);
    const batch = (data ?? []) as unknown as OfferRow[];
    if (batch.length === 0) break;
    all.push(...batch);
    offset += batch.length;
    if (batch.length < PAGE_SIZE) break;
  }

  return all;
}

async function loadProductsByIds(ids: string[]): Promise<Map<string, ProductRow>> {
  const supabase = getSupabase();
  const map = new Map<string, ProductRow>();

  for (const batch of chunk(ids, 200)) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, brand, category_id')
      .in('id', batch);

    if (error) throw new Error(`Failed to load products: ${error.message}`);
    for (const row of (data ?? []) as unknown as ProductRow[]) {
      map.set(row.id, row);
    }
  }

  return map;
}

async function loadRetailerProductsByIds(ids: string[]): Promise<Map<string, RetailerProductRow>> {
  const supabase = getSupabase();
  const map = new Map<string, RetailerProductRow>();

  for (const batch of chunk(ids, 200)) {
    const { data, error } = await supabase
      .from('retailer_products')
      .select('id, title, source_category_id, product_url, raw_data')
      .in('id', batch);

    if (error) throw new Error(`Failed to load retailer_products: ${error.message}`);
    for (const row of (data ?? []) as unknown as RetailerProductRow[]) {
      map.set(row.id, row);
    }
  }

  return map;
}

async function main(): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_KEY) {
    throw new Error('Missing SUPABASE_SERVICE_KEY. This script needs service role access to read device_offers.');
  }

  log('Loading Best Buy offers...');
  let offers = await loadAllBestBuyOffers();
  let discontinuedSkus = new Set<string>();
  if (CHECK_DISCONTINUED) {
    const filtered = await filterDiscontinuedOffers(offers);
    offers = filtered.offers;
    discontinuedSkus = filtered.discontinued;
  }
  log(`Loaded ${offers.length} offer row(s).`);

  const byDevice = new Map<string, OfferRow[]>();
  for (const o of offers) {
    const id = String(o.device_id);
    const list = byDevice.get(id);
    if (list) list.push(o);
    else byDevice.set(id, [o]);
  }

  const affectedDeviceIds = [...byDevice.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([id]) => id);

  log(`Found ${affectedDeviceIds.length} product(s) with multiple Best Buy listings.`);

  log('Loading product metadata...');
  const productById = await loadProductsByIds(affectedDeviceIds);

  const retailerProductIds = [...new Set(
    affectedDeviceIds.flatMap((id) => (byDevice.get(id) ?? []).map((o) => o.retailer_product_id))
  )];
  log('Loading retailer product titles...');
  const rpById = await loadRetailerProductsByIds(retailerProductIds);

  const products = affectedDeviceIds
    .map((deviceId) => {
      const p = productById.get(deviceId);
      const list = (byDevice.get(deviceId) ?? []).slice();
      list.sort((a, b) => {
        if (a.in_stock !== b.in_stock) return a.in_stock ? -1 : 1;
        const pa = asNumber(a.price) ?? Number.POSITIVE_INFINITY;
        const pb = asNumber(b.price) ?? Number.POSITIVE_INFINITY;
        if (pa !== pb) return pa - pb;
        return String(b.last_checked).localeCompare(String(a.last_checked));
      });

      const offersSlim = list
        .map((o) => {
          const rp = rpById.get(o.retailer_product_id);
          const raw = (rp?.raw_data ?? null) as Record<string, unknown> | null;
          const discontinuedNew = raw?.discontinued_new === true || raw?.discontinued_banner === true || raw?.discontinued === true;
          return {
            title: rp?.title ?? '(missing title)',
            url: (o.product_url ?? rp?.product_url ?? o.affiliate_url) ?? null,
            source_category_id: rp?.source_category_id ?? null,
            discontinued_new: discontinuedNew,
          };
        })
        .filter((o) => !!o.url)
        .filter((o) => INCLUDE_DISCONTINUED || o.discontinued_new !== true);

      const groupsMap = new Map<string, { baseTitle: string; variants: { label: string; url: string }[] }>();
      for (const o of offersSlim) {
        const { baseTitle, variant } = baseAndVariantFromTitle(o.title);
        const label = variant ?? '(default)';
        const g = groupsMap.get(baseTitle);
        if (g) g.variants.push({ label, url: o.url as string });
        else groupsMap.set(baseTitle, { baseTitle, variants: [{ label, url: o.url as string }] });
      }

      const groups = [...groupsMap.values()]
        .map((g) => ({
          base_title: g.baseTitle,
          variants: g.variants,
        }))
        .sort((a, b) => b.variants.length - a.variants.length);

      return {
        product_id: deviceId,
        audiolist_url: `https://dev.audiolist.pages.dev/product/${deviceId}`,
        name: p?.name ?? '(missing from products view)',
        brand: p?.brand ?? null,
        category_id: p?.category_id ?? null,
        listings_count: offersSlim.length,
        groups_count: groups.length,
        groups,
      };
    })
    .sort((a, b) => {
      if (a.listings_count !== b.listings_count) return b.listings_count - a.listings_count;
      return String(a.name).localeCompare(String(b.name));
    });

  const out = {
    generated_at: new Date().toISOString(),
    retailer_id: RETAILER_ID,
    total_offers_loaded: offers.length,
    affected_products: products.length,
    discontinued_skus_excluded: CHECK_DISCONTINUED ? [...discontinuedSkus].sort() : null,
    products,
  };

  mkdirSync(AUDIT_DIR, { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(out, null, 2) + '\n', 'utf-8');

  // Human-readable Markdown report (no price/SKU focus, just links + how they differ).
  const mdLines: string[] = [];
  mdLines.push(`# Multiple Best Buy Listings Report`);
  mdLines.push('');
  mdLines.push(`- Generated: ${out.generated_at}`);
  mdLines.push(`- Retailer: ${out.retailer_id}`);
  mdLines.push(`- BestBuy offers scanned: ${out.total_offers_loaded}`);
  mdLines.push(`- Products affected: ${out.affected_products}`);
  mdLines.push('');
  mdLines.push('This lists AudioList products that have multiple Best Buy listings linked to the same product.');
  mdLines.push('Each entry includes a link to the AudioList product page plus the Best Buy listing links, with a simple variant summary derived from the listing titles.');
  mdLines.push('');

  for (const prod of products) {
    mdLines.push(`## [${escapeMd(prod.name)}](${prod.audiolist_url})`);
    mdLines.push('');
    mdLines.push(`- Category: ${prod.category_id ?? 'unknown'}`);
    if (prod.brand) mdLines.push(`- Brand: ${escapeMd(prod.brand)}`);
    mdLines.push(`- Best Buy listings: ${prod.listings_count}`);
    if (prod.groups_count > 1) mdLines.push(`- Groups: ${prod.groups_count} (likely multiple models / colors)`);
    mdLines.push('');

    if (prod.groups.length === 0) {
      mdLines.push(`- Listings: (no URLs found)`);
      mdLines.push('');
      continue;
    }

    for (const g of prod.groups) {
      mdLines.push(`### ${escapeMd(g.base_title)}`);
      mdLines.push('');
      mdLines.push('Listings:');
      for (const v of g.variants) {
        mdLines.push(`- [${escapeMd(v.label)}](${v.url})`);
      }
      mdLines.push('');
    }
    mdLines.push('');
  }

  writeFileSync(OUT_MD, mdLines.join('\n') + '\n', 'utf-8');
  log(`Wrote ${OUT_JSON}`);
  log(`Wrote ${OUT_MD}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
