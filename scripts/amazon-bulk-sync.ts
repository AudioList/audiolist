/**
 * amazon-bulk-sync.ts
 *
 * High-concurrency Amazon price scraper with priority scoring and daily mode.
 * Discovers new Amazon listings and refreshes existing prices, prioritizing
 * high-PPI (quality) and popular (multi-retailer) products independently.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/amazon-bulk-sync.ts [options]
 *
 * Modes:
 *   --mode=discover    Search Amazon for products with no existing match (default)
 *   --mode=refresh     Re-check existing approved matches for price updates
 *   --mode=daily       Run discover then refresh within a time budget
 *
 * Options:
 *   --concurrency=N    Concurrent browser pages (default: 8)
 *   --delay=N          Per-worker delay in ms (default: 2500)
 *   --time-budget=N    Max runtime in minutes (default: 300 for daily, 0=unlimited)
 *   --category=iem     Filter to a single category
 *   --limit=N          Process only first N products
 *   --dry-run          Preview priority ordering and what would be searched
 *   --no-resume        Start fresh, ignore progress file
 */

import "./lib/env.js";
import {
  getBrowser,
  closeBrowser,
  createAmazonPage,
  searchAmazonWithPage,
  type AmazonProduct,
  type BrowserContext,
  type Page,
} from "./scrapers/amazon.ts";
import {
  getRetailers,
  getSupabase,
  buildAffiliateUrl,
  type Retailer,
} from "./config/retailers.ts";
import { findBestMatch, MATCH_THRESHOLDS, normalizeName } from "./scrapers/matcher.ts";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Amazon false-positive prevention
// ---------------------------------------------------------------------------

/**
 * Amazon department allowlist. Only products from these departments are
 * considered valid audio product matches. Amazon's department badge appears
 * on search result cards (e.g. "in Electronics", "in Board Games").
 * Products without a detected department are allowed through (conservative).
 */
const ALLOWED_DEPARTMENTS = new Set([
  'electronics',
  'headphones',
  'over-ear headphones',
  'on-ear headphones',
  'in-ear headphones',
  'earbud headphones',
  'headphone amplifiers',
  'portable headphone amps',
  'hi-fi headphone amplifiers',
  'audio & video accessories',
  'home audio',
  'home audio accessories',
  'portable audio & video',
  'mp3 & mp4 player accessories',
  'professional audio',
  'microphones',
  'musical instruments',
  'computers & accessories',
  'computer accessories & peripherals',
  'cell phones & accessories',
]);

/** Check if an Amazon department is allowed for audio product matching */
function isAllowedDepartment(department: string | null): boolean {
  // No department detected -- allow through (conservative: don't reject unknowns)
  if (!department) return true;
  return ALLOWED_DEPARTMENTS.has(department.toLowerCase());
}

/** Check if an ASIN looks like an ISBN (book identifier, not audio product) */
function isLikelyISBN(asin: string): boolean {
  if (/^B0[A-Z0-9]{8,}$/i.test(asin)) return false;
  if (/^\d{9}[\dXx]$/.test(asin)) return true;
  if (/^\d{13}$/.test(asin)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Product = {
  id: string;
  name: string;
  brand: string | null;
  category_id: string | null;
  ppi_score: number | null;
  price: number | null;
  affiliate_url: string | null;
  priority_score: number;
};

type ProgressData = {
  completedIds: string[];
  startedAt: string;
  lastUpdated: string;
};

type RunMode = "discover" | "refresh" | "daily";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const MODE: RunMode = (() => {
  const idx = process.argv.findIndex((a) => a.startsWith("--mode="));
  if (idx >= 0) {
    const val = process.argv[idx].split("=")[1];
    if (val === "discover" || val === "refresh" || val === "daily") return val;
  }
  return "discover";
})();

const CONCURRENCY = (() => {
  const idx = process.argv.findIndex((a) => a.startsWith("--concurrency="));
  return idx >= 0 ? parseInt(process.argv[idx].split("=")[1], 10) : 8;
})();

const DELAY_MS = (() => {
  const idx = process.argv.findIndex((a) => a.startsWith("--delay="));
  return idx >= 0 ? parseInt(process.argv[idx].split("=")[1], 10) : 2500;
})();

const CATEGORY_FILTER = (() => {
  const idx = process.argv.findIndex((a) => a.startsWith("--category="));
  return idx >= 0 ? process.argv[idx].split("=")[1] : "";
})();

const PRODUCT_LIMIT = (() => {
  const idx = process.argv.findIndex((a) => a.startsWith("--limit="));
  return idx >= 0 ? parseInt(process.argv[idx].split("=")[1], 10) : 0;
})();

const TIME_BUDGET_MIN = (() => {
  const idx = process.argv.findIndex((a) => a.startsWith("--time-budget="));
  if (idx >= 0) return parseInt(process.argv[idx].split("=")[1], 10);
  return MODE === "daily" ? 300 : 0; // 5 hours for daily, unlimited otherwise
})();

const DRY_RUN = process.argv.includes("--dry-run");
const NO_RESUME = process.argv.includes("--no-resume");

const PROGRESS_FILE = path.join(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")),
  ".amazon-bulk-progress.json"
);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PRODUCT_BATCH_SIZE = 1000;
const UPSERT_BATCH_SIZE = 100;
const PROGRESS_SAVE_INTERVAL = 50;
const PROGRESS_LOG_INTERVAL = 25;

// Adaptive concurrency
const CAPTCHA_WINDOW_MS = 5 * 60 * 1000;
const CAPTCHA_THRESHOLD = 3;
const CLEAR_WINDOW_MS = 10 * 60 * 1000;

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
  const detail =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null
        ? JSON.stringify(err)
        : String(err);
  console.error(`[${timestamp()}] [${phase}] ERROR: ${msg} -- ${detail}`);
}

function jitteredDelay(baseMs: number): number {
  const jitter = 0.3;
  return baseMs * (1 - jitter + Math.random() * 2 * jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Priority scoring
// ---------------------------------------------------------------------------

function computePriorityScore(
  product: { ppi_score: number | null; price: number | null; category_id: string | null },
  listingCount: number
): number {
  let score = 0;

  // Quality points (from PPI)
  const ppi = product.ppi_score;
  if (ppi !== null && ppi >= 70) score += 50;
  else if (ppi !== null && ppi >= 50) score += 30;
  else if (ppi !== null && ppi >= 30) score += 15;
  else if (ppi !== null && ppi > 0) score += 5;

  // Popularity points (from retailer listing count)
  if (listingCount >= 3) score += 40;
  else if (listingCount === 2) score += 25;
  else if (listingCount === 1) score += 10;

  // Purchasability signal
  if (product.price !== null && product.price > 0) score += 5;

  // Category boost for high-demand categories
  if (product.category_id === "iem" || product.category_id === "headphone") score += 3;

  return score;
}

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------

function loadProgress(): ProgressData | null {
  if (NO_RESUME) return null;
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const raw = fs.readFileSync(PROGRESS_FILE, "utf-8");
      return JSON.parse(raw) as ProgressData;
    }
  } catch {
    // Ignore corrupt progress files
  }
  return null;
}

function saveProgress(completedIds: string[]): void {
  const data: ProgressData = {
    completedIds,
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data), "utf-8");
  } catch {
    // Non-fatal
  }
}

function deleteProgress(): void {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE);
    }
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

type RawProduct = {
  id: string;
  name: string;
  brand: string | null;
  category_id: string | null;
  ppi_score: number | null;
  price: number | null;
  affiliate_url: string | null;
};

async function loadAllProducts(): Promise<RawProduct[]> {
  const supabase = getSupabase();
  const allProducts: RawProduct[] = [];
  let offset = 0;

  log("LOAD", "Loading products from Supabase...");

  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, brand, category_id, ppi_score, price, affiliate_url")
      .not("brand", "is", null)
      .order("ppi_score", { ascending: false })
      .range(offset, offset + PRODUCT_BATCH_SIZE - 1);

    if (error) {
      logError("LOAD", `Failed to load products at offset ${offset}`, error);
      break;
    }

    const batch = (data ?? []) as RawProduct[];
    if (batch.length === 0) break;

    allProducts.push(...batch);
    offset += PRODUCT_BATCH_SIZE;
    if (batch.length < PRODUCT_BATCH_SIZE) break;
  }

  log("LOAD", `Total products loaded: ${allProducts.length}`);
  return allProducts;
}

async function loadListingCounts(): Promise<Map<string, number>> {
  const supabase = getSupabase();
  const counts = new Map<string, number>();
  let offset = 0;

  log("LOAD", "Loading retailer listing counts per product...");

  while (true) {
    // Supabase doesn't support GROUP BY via PostgREST, so load all listings
    // and count client-side. We only need product_id.
    const { data, error } = await supabase
      .from("price_listings")
      .select("product_id")
      .range(offset, offset + PRODUCT_BATCH_SIZE - 1);

    if (error) {
      logError("LOAD", "Failed to load price_listings for counting", error);
      break;
    }

    const batch = data ?? [];
    if (batch.length === 0) break;

    for (const row of batch) {
      const pid = (row as { product_id: string }).product_id;
      counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }

    offset += batch.length;
    if (batch.length < PRODUCT_BATCH_SIZE) break;
  }

  log("LOAD", `Listing counts loaded for ${counts.size} products`);
  return counts;
}

async function loadProductsWithPriority(): Promise<Product[]> {
  const [rawProducts, listingCounts] = await Promise.all([
    loadAllProducts(),
    loadListingCounts(),
  ]);

  const products: Product[] = rawProducts.map((p) => ({
    ...p,
    priority_score: computePriorityScore(p, listingCounts.get(p.id) ?? 0),
  }));

  // Sort by priority score DESC, then PPI DESC as tiebreaker
  products.sort((a, b) => {
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
    return (b.ppi_score ?? 0) - (a.ppi_score ?? 0);
  });

  // Log priority distribution
  const tiers = { high: 0, medium: 0, low: 0, zero: 0 };
  for (const p of products) {
    if (p.priority_score >= 50) tiers.high++;
    else if (p.priority_score >= 20) tiers.medium++;
    else if (p.priority_score > 0) tiers.low++;
    else tiers.zero++;
  }
  log("PRIORITY", `Distribution: ${tiers.high} high (50+), ${tiers.medium} medium (20-49), ${tiers.low} low (1-19), ${tiers.zero} zero`);

  return products;
}

async function loadExistingAmazonOfferDeviceIds(amazonRetailerId: string): Promise<Set<string>> {
  const supabase = getSupabase();
  const deviceIds = new Set<string>();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('device_offers')
      .select('device_id')
      .eq('retailer_id', amazonRetailerId)
      .range(offset, offset + PRODUCT_BATCH_SIZE - 1);

    if (error) {
      logError('LOAD', 'Failed to load existing Amazon offers', error);
      break;
    }

    const batch = (data ?? []) as { device_id: string }[];
    if (batch.length === 0) break;

    for (const row of batch) {
      deviceIds.add(row.device_id);
    }

    offset += batch.length;
    if (batch.length < PRODUCT_BATCH_SIZE) break;
  }

  return deviceIds;
}

async function loadStaleListings(amazonRetailerId: string, products: Product[]): Promise<Product[]> {
  const supabase = getSupabase();
  const staleProducts: { product_id: string; last_checked: string | null }[] = [];
  let offset = 0;

  log("LOAD", "Loading stale Amazon listings for refresh...");

  while (true) {
    const { data, error } = await supabase
      .from("price_listings")
      .select("product_id, last_checked")
      .eq("retailer_id", amazonRetailerId)
      .order("last_checked", { ascending: true, nullsFirst: true })
      .range(offset, offset + PRODUCT_BATCH_SIZE - 1);

    if (error) {
      logError("LOAD", "Failed to load stale listings", error);
      break;
    }

    const batch = (data ?? []) as { product_id: string; last_checked: string | null }[];
    if (batch.length === 0) break;

    staleProducts.push(...batch);
    offset += batch.length;
    if (batch.length < PRODUCT_BATCH_SIZE) break;
  }

  // Build a lookup map from products
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Return products in stale order (oldest last_checked first)
  const result: Product[] = [];
  for (const sp of staleProducts) {
    const product = productMap.get(sp.product_id);
    if (product) result.push(product);
  }

  log("LOAD", `Found ${result.length} Amazon listings to refresh`);
  return result;
}

// ---------------------------------------------------------------------------
// Worker Pool
// ---------------------------------------------------------------------------

type LinkDecision = 'auto' | 'pending';

type LinkAttempt = {
  deviceId: string;
  deviceName: string;
  deviceBrand: string | null;
  deviceCategoryId: string;
  asin: string;
  amazonTitle: string;
  department: string | null;
  score: number;
  decision: LinkDecision;
  searchQuery: string;
  price: number | null;
  inStock: boolean;
  imageUrl: string | null;
  productUrl: string;
  affiliateUrl: string;
};

type WorkerResult = {
  productId: string;
  attempt: LinkAttempt | null;
  captcha: boolean;
  error: boolean;
};

class WorkerPool {
  private workers: { context: BrowserContext; page: Page; id: number }[] = [];
  private queue: Product[] = [];
  private queueIndex = 0;
  private completedIds: string[] = [];
  private attempts: LinkAttempt[] = [];
  private stats = { auto: 0, pending: 0, skipped: 0, errors: 0, captchas: 0 };
  private captchaTimestamps: number[] = [];
  private lastCaptchaCheck = Date.now();
  private activeWorkerCount: number;
  private originalConcurrency: number;
  private reduced = false;
  private startTime = Date.now();
  private deadline = 0; // 0 = no deadline
  private amazonRetailer: Retailer;
  public phaseLabel: string;
  private currentDelayMs: number;

  constructor(
    private concurrency: number,
    private delayMs: number,
    amazonRetailer: Retailer,
    phaseLabel: string = "SCRAPE"
  ) {
    this.activeWorkerCount = concurrency;
    this.originalConcurrency = concurrency;
    this.amazonRetailer = amazonRetailer;
    this.phaseLabel = phaseLabel;
    this.currentDelayMs = delayMs;
  }

  async init(): Promise<void> {
    log("POOL", `Creating ${this.concurrency} browser contexts...`);
    for (let i = 0; i < this.concurrency; i++) {
      const { context, page } = await createAmazonPage();
      this.workers.push({ context, page, id: i });
    }
    log("POOL", `${this.workers.length} workers ready`);
  }

  async run(products: Product[], resumeIds: string[], deadlineMs: number = 0): Promise<void> {
    this.queue = products;
    this.completedIds = [...resumeIds];
    this.deadline = deadlineMs;
    this.startTime = Date.now();
    this.queueIndex = 0;
    this.stats = { auto: 0, pending: 0, skipped: 0, errors: 0, captchas: 0 };
    this.attempts = [];

    const workerPromises: Promise<void>[] = [];
    for (let i = 0; i < this.activeWorkerCount; i++) {
      workerPromises.push(this.workerLoop(this.workers[i]));
    }

    await Promise.all(workerPromises);
    await this.flushRows();
  }

  private isExpired(): boolean {
    if (this.deadline === 0) return false;
    return Date.now() >= this.deadline;
  }

  private getNextProduct(): { product: Product; index: number } | null {
    while (this.queueIndex < this.queue.length) {
      const idx = this.queueIndex++;
      const product = this.queue[idx];
      if (this.completedIds.includes(product.id)) continue;
      return { product, index: idx };
    }
    return null;
  }

  private async workerLoop(worker: { context: BrowserContext; page: Page; id: number }): Promise<void> {
    while (true) {
      // Check time budget
      if (this.isExpired()) {
        log(this.phaseLabel, `Worker ${worker.id}: Time budget expired, stopping`);
        break;
      }

      // Check if this worker should be suspended (adaptive concurrency)
      if (worker.id >= this.activeWorkerCount) {
        await sleep(5000);
        if (worker.id >= this.activeWorkerCount) continue;
      }

      const next = this.getNextProduct();
      if (!next) break;

      const { product } = next;

      try {
        const result = await this.processProduct(worker.page, product);

        if (result.captcha) {
          this.handleCaptcha(worker);
          this.stats.captchas++;
          continue;
        }

        if (result.attempt) {
          this.attempts.push(result.attempt);
        } else if (!result.error) {
          this.stats.skipped++;
        }

        this.completedIds.push(product.id);

        // Progress logging
        const completed = this.completedIds.length;
        if (completed % PROGRESS_LOG_INTERVAL === 0) {
          const elapsed = (Date.now() - this.startTime) / 1000;
          const rate = completed / elapsed;
          const remaining = this.queue.length - completed;
          const eta = remaining / rate;
          const etaMin = Math.floor(eta / 60);
          const etaSec = Math.floor(eta % 60);
          const budgetStr = this.deadline > 0
            ? ` | Budget: ${Math.max(0, Math.floor((this.deadline - Date.now()) / 60000))}m left`
            : "";
          log(
            this.phaseLabel,
            `${completed}/${this.queue.length} (${((completed / this.queue.length) * 100).toFixed(1)}%) | ` +
            `Rate: ${rate.toFixed(1)}/s | ETA: ${etaMin}m${etaSec}s | ` +
            `Auto: ${this.stats.auto} Pend: ${this.stats.pending} Skip: ${this.stats.skipped} ` +
            `CAPTCHA: ${this.stats.captchas} Err: ${this.stats.errors} | W: ${this.activeWorkerCount}${budgetStr}`
          );
        }

        // Save progress periodically
        if (completed % PROGRESS_SAVE_INTERVAL === 0) {
          saveProgress(this.completedIds);
        }

        // Flush rows every 200 attempts
        if (this.attempts.length >= 200) {
          await this.flushRows();
        }
      } catch (err) {
        this.stats.errors++;
        logError("WORKER", `Worker ${worker.id} error on "${product.name}"`, err);
      }

      await sleep(jitteredDelay(this.currentDelayMs));
    }
  }

  private async processProduct(page: Page, product: Product): Promise<WorkerResult> {
    let searchQuery = product.name;
    if (product.brand && !product.name.toLowerCase().includes(product.brand.toLowerCase())) {
      searchQuery = `${product.brand} ${product.name}`;
    }

    const { products: azResults, captcha } = await searchAmazonWithPage(page, searchQuery, {
      maxResults: 5,
      affiliateTag: this.amazonRetailer.affiliate_tag ?? undefined,
    });

    if (captcha) {
      return { productId: product.id, attempt: null, captcha: true, error: false };
    }

    if (azResults.length === 0) {
      return { productId: product.id, attempt: null, captcha: false, error: false };
    }

    const candidates = azResults
      .filter((ap) => {
        if (!ap.name || ap.name.length <= 3) return false;
        // Reject ISBN-format ASINs (books, not audio products)
        if (isLikelyISBN(ap.asin)) return false;
        // Reject products from non-audio departments (Board Games, Books, Clothing, etc.)
        if (!isAllowedDepartment(ap.department)) return false;
        return true;
      })
      .map((ap) => ({ name: ap.name, id: ap.asin }));

    if (candidates.length === 0) {
      return { productId: product.id, attempt: null, captcha: false, error: false };
    }

    const match = findBestMatch(product.name, candidates, { productBrand: product.brand });

    if (!match || match.score < MATCH_THRESHOLDS.PENDING_REVIEW) {
      return { productId: product.id, attempt: null, captcha: false, error: false };
    }

    // Additional false-positive guards for auto-approval
    let isAutoApprove = match.score >= MATCH_THRESHOLDS.AUTO_APPROVE;

    if (isAutoApprove) {
      const audioBrand = (product.brand ?? '').toLowerCase();
      const amazonName = match.name.toLowerCase();
      const amazonWords = match.name.trim().split(/\s+/);
      const productWords = product.name.trim().split(/\s+/);

      // Amazon name must mention the audio brand for auto-approval.
      // Prevents generic product name matches (e.g. "Zenith" board game
      // matching "Letshuoer Zenith" IEM) from being auto-approved.
      // These still land in the pending queue for manual review.
      if (audioBrand.length > 2 && !amazonName.includes(audioBrand)) {
        isAutoApprove = false;
      }
    }
    const azProduct = azResults.find((ap) => ap.asin === match.id);
    const price = azProduct?.price ?? null;
    const inStock = azProduct?.inStock ?? false;
    const imageUrl = azProduct?.image ?? null;
    const productUrl = azProduct?.url ?? `https://www.amazon.com/dp/${match.id}`;

    const affiliateUrl = buildAffiliateUrl(
      this.amazonRetailer,
      productUrl,
      match.id,
      match.id
    );

    if (isAutoApprove) {
      this.stats.auto++;
    } else {
      this.stats.pending++;
    }

    const attempt: LinkAttempt = {
      deviceId: product.id,
      deviceName: product.name,
      deviceBrand: product.brand,
      deviceCategoryId: product.category_id ?? 'iem',
      asin: match.id,
      amazonTitle: match.name,
      department: azProduct?.department ?? null,
      score: match.score,
      decision: isAutoApprove ? 'auto' : 'pending',
      searchQuery,
      price,
      inStock,
      imageUrl,
      productUrl,
      affiliateUrl: affiliateUrl ?? `${productUrl}${productUrl.includes('?') ? '&' : '?'}tag=${this.amazonRetailer.affiliate_tag ?? ''}`,
    };

    return { productId: product.id, attempt, captcha: false, error: false };
  }

  private handleCaptcha(worker: { context: BrowserContext; page: Page; id: number }): void {
    const now = Date.now();
    this.captchaTimestamps.push(now);
    this.captchaTimestamps = this.captchaTimestamps.filter((t) => now - t < CAPTCHA_WINDOW_MS);

    log("CAPTCHA", `Worker ${worker.id} hit CAPTCHA (${this.captchaTimestamps.length} in last 5min)`);

    if (this.captchaTimestamps.length >= CAPTCHA_THRESHOLD && !this.reduced) {
      const newCount = Math.max(2, this.activeWorkerCount - 2);
      log("CAPTCHA", `Reducing workers from ${this.activeWorkerCount} to ${newCount} and increasing delay 50%`);
      this.activeWorkerCount = newCount;
      this.currentDelayMs = Math.floor(this.currentDelayMs * 1.5);
      this.reduced = true;
    }

    if (this.reduced && now - this.lastCaptchaCheck > CLEAR_WINDOW_MS) {
      if (this.captchaTimestamps.length === 0) {
        log("CAPTCHA", `Clear for 10min. Restoring to ${this.originalConcurrency} workers`);
        this.activeWorkerCount = this.originalConcurrency;
        this.currentDelayMs = this.delayMs;
        this.reduced = false;
      }
    }
    this.lastCaptchaCheck = now;
  }

  private async flushRows(): Promise<void> {
    if (this.attempts.length === 0) return;

    const supabase = getSupabase();
    const nowIso = new Date().toISOString();

    // Deduplicate by ASIN: keep the highest-signal attempt.
    const bestByAsin = new Map<string, LinkAttempt>();
    for (const a of this.attempts) {
      const existing = bestByAsin.get(a.asin);
      if (!existing) {
        bestByAsin.set(a.asin, a);
        continue;
      }
      const rank = (x: LinkAttempt) => (x.decision === 'auto' ? 2_000 : 1_000) + x.score;
      if (rank(a) > rank(existing)) {
        bestByAsin.set(a.asin, a);
      }
    }
    const dedupedAttempts = [...bestByAsin.values()];

    // Upsert retailer_products so we have stable retailer_product_id values.
    const retailerProductRows = dedupedAttempts.map((a) => ({
      retailer_id: this.amazonRetailer.id,
      external_id: a.asin,
      title: a.amazonTitle,
      normalized_title: normalizeName(a.amazonTitle),
      vendor: null,
      product_type: null,
      tags: [],
      source_category_id: a.deviceCategoryId,
      price: a.price,
      compare_at_price: null,
      on_sale: false,
      in_stock: a.inStock,
      image_url: a.imageUrl,
      product_url: a.productUrl,
      affiliate_url: a.affiliateUrl,
      raw_data: {
        source: 'amazon-bulk-sync',
        matched_device_id: a.deviceId,
        matched_device_name: a.deviceName,
        matched_device_brand: a.deviceBrand,
        match_score: a.score,
        decision: a.decision,
        department: a.department,
        search_query: a.searchQuery,
        scraped_at: nowIso,
      },
      imported_at: nowIso,
      last_seen_at: nowIso,
      processed: true,
    }));

    log('FLUSH', `Upserting ${retailerProductRows.length} retailer_products + resolving offers/tasks...`);

    const rpIdByAsin = new Map<string, string>();

    for (let i = 0; i < retailerProductRows.length; i += UPSERT_BATCH_SIZE) {
      const batch = retailerProductRows.slice(i, i + UPSERT_BATCH_SIZE);
      const { data, error } = await supabase
        .from('retailer_products')
        .upsert(batch, { onConflict: 'retailer_id,external_id' })
        .select('id, external_id');

      if (error) {
        logError('FLUSH', 'retailer_products upsert batch failed', error);
        continue;
      }

      for (const row of (data ?? []) as { id: string; external_id: string }[]) {
        rpIdByAsin.set(row.external_id, row.id);
      }
    }

    // Load existing Amazon offers for these ASINs to avoid overwriting device links.
    const asins = dedupedAttempts.map((a) => a.asin);
    const existingOfferDeviceByAsin = new Map<string, string>();
    for (let i = 0; i < asins.length; i += UPSERT_BATCH_SIZE) {
      const batch = asins.slice(i, i + UPSERT_BATCH_SIZE);
      const { data, error } = await supabase
        .from('device_offers')
        .select('external_id, device_id')
        .eq('retailer_id', this.amazonRetailer.id)
        .in('external_id', batch);

      if (error) {
        logError('FLUSH', 'device_offers load batch failed', error);
        continue;
      }

      for (const row of (data ?? []) as { external_id: string; device_id: string }[]) {
        existingOfferDeviceByAsin.set(row.external_id, row.device_id);
      }
    }

    const offerInsertRows: Record<string, unknown>[] = [];
    const offerUpdateRows: Record<string, unknown>[] = [];
    const reviewTaskRows: Record<string, unknown>[] = [];

    for (const a of dedupedAttempts) {
      const rpId = rpIdByAsin.get(a.asin);
      if (!rpId) continue;

      if (a.decision === 'auto') {
        // If an offer already exists for this ASIN, update price/stock/etc without changing device_id.
        const existingDeviceId = existingOfferDeviceByAsin.get(a.asin);
        const offerFields = {
          retailer_id: this.amazonRetailer.id,
          external_id: a.asin,
          price: a.price,
          compare_at_price: null,
          on_sale: false,
          currency: 'USD',
          in_stock: a.inStock,
          product_url: a.productUrl,
          affiliate_url: a.affiliateUrl,
          image_url: a.imageUrl,
          last_checked: nowIso,
        };

        if (!existingDeviceId) {
          // Insert new offer linked to this device.
          if (a.price != null && a.price > 0) {
            offerInsertRows.push({
              device_id: a.deviceId,
              retailer_product_id: rpId,
              ...offerFields,
            });
          }
        } else {
          // Existing offer: update offer fields only.
          if (a.price != null && a.price > 0) {
            offerUpdateRows.push(offerFields);
          }

          // If our auto-link suggests a different device than the existing offer,
          // queue a manual task instead of overriding.
          if (existingDeviceId !== a.deviceId) {
            reviewTaskRows.push({
              task_type: 'offer_link',
              status: 'open',
              priority: Math.round(a.score * 100),
              retailer_product_id: rpId,
              device_id: a.deviceId,
              payload: {
                suggested_device_id: a.deviceId,
                suggested_device_name: a.deviceName,
                score: a.score,
                current_device_id: existingDeviceId,
                department: a.department,
                search_query: a.searchQuery,
              },
              reason: `Conflicting Amazon offer link (existing device differs)`
            });
          }
        }
      } else {
        // Pending review: queue an offer_link task.
        reviewTaskRows.push({
          task_type: 'offer_link',
          status: 'open',
          priority: Math.round(a.score * 100),
          retailer_product_id: rpId,
          device_id: a.deviceId,
          payload: {
            suggested_device_id: a.deviceId,
            suggested_device_name: a.deviceName,
            score: a.score,
            department: a.department,
            search_query: a.searchQuery,
          },
          reason: `Amazon match needs review (score=${a.score.toFixed(3)})`,
        });
      }
    }

    // Insert new offers (do not overwrite existing device links).
    if (offerInsertRows.length > 0) {
      for (let i = 0; i < offerInsertRows.length; i += UPSERT_BATCH_SIZE) {
        const batch = offerInsertRows.slice(i, i + UPSERT_BATCH_SIZE);
        const { error } = await supabase
          .from('device_offers')
          .upsert(batch, { onConflict: 'retailer_id,external_id', ignoreDuplicates: true });

        if (error) logError('FLUSH', 'device_offers insert batch failed', error);
      }
    }

    // Update existing offers (price/stock/etc) without changing device_id.
    if (offerUpdateRows.length > 0) {
      for (let i = 0; i < offerUpdateRows.length; i += UPSERT_BATCH_SIZE) {
        const batch = offerUpdateRows.slice(i, i + UPSERT_BATCH_SIZE);
        const { error } = await supabase
          .from('device_offers')
          .upsert(batch, { onConflict: 'retailer_id,external_id' });

        if (error) logError('FLUSH', 'device_offers update batch failed', error);
      }
    }

    // Insert review tasks (ignore duplicates).
    if (reviewTaskRows.length > 0) {
      for (let i = 0; i < reviewTaskRows.length; i += UPSERT_BATCH_SIZE) {
        const batch = reviewTaskRows.slice(i, i + UPSERT_BATCH_SIZE);
        const { error } = await supabase
          .from('review_tasks')
          .upsert(batch, { onConflict: 'task_type,retailer_product_id', ignoreDuplicates: true });
        if (error) logError('FLUSH', 'review_tasks upsert batch failed', error);
      }
    }

    this.attempts.length = 0;
  }

  async cleanup(): Promise<void> {
    log("POOL", "Closing browser contexts...");
    for (const worker of this.workers) {
      await worker.context.close().catch(() => {});
    }
    this.workers = [];
  }

  getStats() {
    return { ...this.stats, completed: this.completedIds.length };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();

  console.log("=================================================================");
  console.log("  Amazon Bulk Price Sync");
  console.log("=================================================================");
  console.log(`  Mode:        ${MODE}`);
  console.log(`  Concurrency: ${CONCURRENCY} workers`);
  console.log(`  Delay:       ${DELAY_MS}ms per worker`);
  console.log(`  Time budget: ${TIME_BUDGET_MIN > 0 ? TIME_BUDGET_MIN + "m" : "unlimited"}`);
  console.log(`  Category:    ${CATEGORY_FILTER || "all"}`);
  console.log(`  Limit:       ${PRODUCT_LIMIT || "none"}`);
  console.log(`  Mode:        ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`  Resume:      ${NO_RESUME ? "disabled" : "enabled"}`);
  console.log(`  Started at   ${new Date().toISOString()}`);
  console.log("=================================================================\n");

  // Load retailers
  log("INIT", "Loading retailers...");
  const retailers = await getRetailers();
  const amazonRetailer = retailers.find((r) => r.api_type === "amazon");

  if (!amazonRetailer) {
    log("INIT", "No Amazon retailer found in database. Exiting.");
    return;
  }

  log("INIT", `Amazon retailer: ${amazonRetailer.name} (tag: ${amazonRetailer.affiliate_tag})`);

  // Load products with priority scoring
  let products = await loadProductsWithPriority();

  if (CATEGORY_FILTER) {
    products = products.filter((p) => p.category_id === CATEGORY_FILTER);
    log("INIT", `Filtered to ${products.length} products in category "${CATEGORY_FILTER}"`);
  }

  if (PRODUCT_LIMIT > 0 && products.length > PRODUCT_LIMIT) {
    products = products.slice(0, PRODUCT_LIMIT);
    log("INIT", `Limited to first ${PRODUCT_LIMIT} products`);
  }

  // Load existing Amazon offers
  log("INIT", "Loading existing Amazon offers...");
  const existingAmazonOfferDevices = await loadExistingAmazonOfferDeviceIds(amazonRetailer.id);
  log("INIT", `Existing Amazon offers: ${existingAmazonOfferDevices.size} device(s)`);

  // Build product lists for each mode
  const unmatchedProducts = products.filter((p) => !existingAmazonOfferDevices.has(p.id));
  log("INIT", `Unmatched products for discovery: ${unmatchedProducts.length}`);

  if (DRY_RUN) {
    console.log("\n--- Priority Ordering (top 30 for discovery) ---\n");
    for (const p of unmatchedProducts.slice(0, 30)) {
      console.log(`  [${p.priority_score.toString().padStart(3)}] ${p.name} (PPI: ${p.ppi_score ?? "null"}, cat: ${p.category_id})`);
    }

    if (MODE === "daily" || MODE === "refresh") {
      const staleProducts = await loadStaleListings(amazonRetailer.id, products);
      console.log(`\n--- Refresh: ${staleProducts.length} existing listings to re-check ---\n`);
      for (const p of staleProducts.slice(0, 10)) {
        console.log(`  ${p.name} (PPI: ${p.ppi_score ?? "null"})`);
      }
    }

    const totalDiscover = unmatchedProducts.length;
    const estDiscoverTime = (totalDiscover * (DELAY_MS + 2000)) / (CONCURRENCY * 1000 * 60);
    log("DRY-RUN", `Would search ${totalDiscover} unmatched products. Est: ${estDiscoverTime.toFixed(1)}min`);
    return;
  }

  // Load resume progress
  const progress = loadProgress();
  let resumeIds: string[] = [];
  if (progress) {
    resumeIds = progress.completedIds;
    log("INIT", `Resuming from progress: ${resumeIds.length} products already completed`);
  }

  // Calculate deadlines
  const timeBudgetMs = TIME_BUDGET_MIN * 60 * 1000;

  // Create worker pool
  const pool = new WorkerPool(CONCURRENCY, DELAY_MS, amazonRetailer, "DISCOVER");
  await pool.init();

  let totalStats = { auto: 0, pending: 0, skipped: 0, errors: 0, captchas: 0, completed: 0 };

  try {
    if (MODE === "discover") {
      // -- DISCOVER MODE --
      if (unmatchedProducts.length === 0) {
        log("DISCOVER", "All products already have Amazon matches. Nothing to do.");
      } else {
        const deadline = timeBudgetMs > 0 ? Date.now() + timeBudgetMs : 0;
        await pool.run(unmatchedProducts, resumeIds, deadline);
        totalStats = pool.getStats();
      }

    } else if (MODE === "refresh") {
      // -- REFRESH MODE --
      const staleProducts = await loadStaleListings(amazonRetailer.id, products);
      if (staleProducts.length === 0) {
        log("REFRESH", "No existing Amazon listings to refresh.");
      } else {
        const deadline = timeBudgetMs > 0 ? Date.now() + timeBudgetMs : 0;
        pool.phaseLabel = "REFRESH";
        await pool.run(staleProducts, [], deadline);
        totalStats = pool.getStats();
      }

    } else if (MODE === "daily") {
      // -- DAILY MODE: discover then refresh --
      const discoverBudgetMs = timeBudgetMs > 0 ? Math.floor(timeBudgetMs * 0.7) : 0;
      const refreshBudgetMs = timeBudgetMs > 0 ? timeBudgetMs - discoverBudgetMs : 0;

      // Phase 1: Discover
      console.log("\n--- Phase 1: Discover New Matches ---\n");
      if (unmatchedProducts.length > 0) {
        const discoverDeadline = discoverBudgetMs > 0 ? Date.now() + discoverBudgetMs : 0;
        log("DISCOVER", `Budget: ${discoverBudgetMs > 0 ? Math.floor(discoverBudgetMs / 60000) + "m" : "unlimited"} | ${unmatchedProducts.length} products`);
        await pool.run(unmatchedProducts, resumeIds, discoverDeadline);
        const discoverStats = pool.getStats();
        totalStats.auto += discoverStats.auto;
        totalStats.pending += discoverStats.pending;
        totalStats.skipped += discoverStats.skipped;
        totalStats.errors += discoverStats.errors;
        totalStats.captchas += discoverStats.captchas;
        totalStats.completed += discoverStats.completed;
        log("DISCOVER", `Completed: ${discoverStats.completed} | Auto: ${discoverStats.auto} | Pending: ${discoverStats.pending}`);
      } else {
        log("DISCOVER", "All products already matched. Skipping discovery.");
      }

      // Phase 2: Refresh
      console.log("\n--- Phase 2: Refresh Existing Prices ---\n");
      const staleProducts = await loadStaleListings(amazonRetailer.id, products);
      if (staleProducts.length > 0) {
        const refreshDeadline = refreshBudgetMs > 0 ? Date.now() + refreshBudgetMs : 0;
        log("REFRESH", `Budget: ${refreshBudgetMs > 0 ? Math.floor(refreshBudgetMs / 60000) + "m" : "unlimited"} | ${staleProducts.length} listings`);
        pool.phaseLabel = "REFRESH";
        await pool.run(staleProducts, [], refreshDeadline);
        const refreshStats = pool.getStats();
        totalStats.auto += refreshStats.auto;
        totalStats.pending += refreshStats.pending;
        totalStats.skipped += refreshStats.skipped;
        totalStats.errors += refreshStats.errors;
        totalStats.captchas += refreshStats.captchas;
        totalStats.completed += refreshStats.completed;
        log("REFRESH", `Refreshed: ${refreshStats.completed} listings`);
      } else {
        log("REFRESH", "No existing listings to refresh.");
      }
    }
  } finally {
    await pool.cleanup();
    await closeBrowser();
  }

  // Clean up progress file on success
  deleteProgress();

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);

  console.log("\n=================================================================");
  console.log("  AMAZON BULK SYNC COMPLETE");
  console.log("=================================================================");
  console.log(`  Mode:               ${MODE}`);
  console.log(`  Duration:           ${elapsed}s (${elapsedMin}m)`);
  console.log(`  Products processed: ${totalStats.completed}`);
  console.log(`  Auto-approved:      ${totalStats.auto}`);
  console.log(`  Pending review:     ${totalStats.pending}`);
  console.log(`  Skipped (no match): ${totalStats.skipped}`);
  console.log(`  CAPTCHAs hit:       ${totalStats.captchas}`);
  console.log(`  Errors:             ${totalStats.errors}`);
  console.log("=================================================================\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
