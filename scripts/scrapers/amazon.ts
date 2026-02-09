/**
 * Amazon product search scraper using Playwright.
 *
 * Searches Amazon for audio products and extracts ASIN, name, price,
 * and availability from search result pages.
 *
 * Exports:
 *   - searchAmazon()          — single search, creates/closes its own page
 *   - searchAmazonWithPage()  — search using a pre-existing page (for bulk)
 *   - createAmazonPage()      — create an isolated page with its own context
 *   - getBrowser/closeBrowser  — manage shared Chromium instance
 *   - batchSearchAmazon()     — sequential batch with rate limiting
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export type { Page, BrowserContext };

export type AmazonProduct = {
  asin: string;
  name: string;
  price: number | null;
  inStock: boolean;
  url: string;
  image: string | null;
  manufacturer: string | null;
  /** Amazon department/category badge text (e.g. "Electronics", "Board Games") */
  department: string | null;
};

// ---------------------------------------------------------------------------
// User-Agent rotation pool
// ---------------------------------------------------------------------------

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
];

let uaIndex = 0;
function nextUserAgent(): string {
  const ua = USER_AGENTS[uaIndex % USER_AGENTS.length];
  uaIndex++;
  return ua;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let browserInstance: Browser | null = null;

/**
 * Get or create a shared browser instance for Amazon scraping.
 * Call closeBrowser() when done to free resources.
 */
export async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) return browserInstance;

  browserInstance = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}

// ---------------------------------------------------------------------------
// Shared extraction logic
// ---------------------------------------------------------------------------

type RawProduct = {
  asin: string;
  name: string;
  price: number | null;
  inStock: boolean;
  url: string;
  image: string | null;
  department: string | null;
};

/**
 * Extract product data from a page that has Amazon search results loaded.
 * Runs page.evaluate() to parse the DOM.
 */
async function extractSearchResults(page: Page, maxResults: number): Promise<RawProduct[]> {
  return page.evaluate(
    ({ maxRes }) => {
      const results: {
        asin: string;
        name: string;
        price: number | null;
        inStock: boolean;
        url: string;
        image: string | null;
        department: string | null;
      }[] = [];

      const items = document.querySelectorAll(
        '[data-component-type="s-search-result"]'
      );

      for (const item of items) {
        if (results.length >= maxRes) break;

        const asin = item.getAttribute("data-asin");
        if (!asin || asin.length !== 10) continue;

        const h2Link = item.querySelector("h2 a");
        const imgEl = item.querySelector("img.s-image");
        const h2Text = h2Link?.textContent?.trim() ?? "";
        const ariaLabel = h2Link?.getAttribute("aria-label")?.trim() ?? "";
        const h2Direct = item.querySelector("h2")?.textContent?.trim() ?? "";
        const imgAlt = imgEl?.getAttribute("alt")?.trim() ?? "";

        let name = "";
        for (const candidate of [h2Text, ariaLabel, h2Direct, imgAlt]) {
          if (candidate.length > name.length) {
            name = candidate;
          }
        }
        if (!name) continue;

        let price: number | null = null;
        const wholePart = item.querySelector(".a-price-whole");
        const fractionPart = item.querySelector(".a-price-fraction");
        if (wholePart) {
          const whole = wholePart.textContent?.replace(/[^0-9]/g, "") ?? "0";
          const fraction =
            fractionPart?.textContent?.replace(/[^0-9]/g, "") ?? "00";
          price = parseFloat(`${whole}.${fraction}`);
          if (isNaN(price)) price = null;
        }

        const image = imgEl?.getAttribute("src") ?? null;

        const linkEl = item.querySelector("h2 a");
        const href = linkEl?.getAttribute("href") ?? "";
        const url = href.startsWith("http")
          ? href
          : `https://www.amazon.com${href}`;

        const inStock = price !== null && price > 0;

        // Extract department/category badge.
        // Amazon shows "in Electronics", "in Board Games", etc. as a link below the title.
        let department: string | null = null;
        const deptCandidates = Array.from(
          item.querySelectorAll('a.a-link-normal.s-underline-text, a.a-size-base.a-link-normal, span.a-size-base')
        );
        for (let di = 0; di < deptCandidates.length; di++) {
          const deptText = deptCandidates[di].textContent?.trim() ?? '';
          const deptMatch = deptText.match(/^in\s+(.+)$/i);
          if (deptMatch) {
            department = deptMatch[1].trim();
            break;
          }
        }

        results.push({ asin, name, price, inStock, url, image, department });
      }

      return results;
    },
    { maxRes: maxResults }
  );
}

// ---------------------------------------------------------------------------
// Create isolated Amazon page (for bulk workers)
// ---------------------------------------------------------------------------

/**
 * Create a new browser context with isolated cookies/session and a page
 * within it. Each worker should get its own context for anti-detection.
 * Returns { context, page } — caller must close context when done.
 */
export async function createAmazonPage(): Promise<{ context: BrowserContext; page: Page }> {
  const browser = await getBrowser();
  const ua = nextUserAgent();

  // Randomized viewport dimensions
  const width = 1280 + Math.floor(Math.random() * 200);
  const height = 800 + Math.floor(Math.random() * 200);

  const context = await browser.newContext({
    userAgent: ua,
    viewport: { width, height },
    locale: "en-US",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    },
  });

  const page = await context.newPage();
  return { context, page };
}

// ---------------------------------------------------------------------------
// searchAmazonWithPage — uses an existing page (no create/close overhead)
// ---------------------------------------------------------------------------

/**
 * Search Amazon using a pre-existing Page. Does NOT close the page.
 * Optimized for bulk: faster scroll (2 steps), shorter post-scroll wait.
 * Returns true if CAPTCHA was detected (caller should handle backoff).
 */
export async function searchAmazonWithPage(
  page: Page,
  query: string,
  options?: { maxResults?: number; affiliateTag?: string }
): Promise<{ products: AmazonProduct[]; captcha: boolean }> {
  const maxResults = options?.maxResults ?? 5;
  const affiliateTag = options?.affiliateTag ?? null;

  try {
    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `https://www.amazon.com/s?k=${encodedQuery}&i=electronics`;

    const response = await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    if (!response || response.status() !== 200) {
      return { products: [], captcha: false };
    }

    // Check for CAPTCHA
    const title = await page.title();
    if (title.toLowerCase().includes("robot") || title.toLowerCase().includes("captcha")) {
      return { products: [], captcha: true };
    }

    // Wait for search results
    await page
      .waitForSelector('[data-component-type="s-search-result"]', { timeout: 6000 })
      .catch(() => {});

    // Optimized scroll: 2 big jumps to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await delay(150);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(150);
    await page.evaluate(() => window.scrollTo(0, 0));
    await delay(500);

    // Extract results using shared logic
    const raw = await extractSearchResults(page, maxResults);

    const products: AmazonProduct[] = raw.map((p) => ({
      ...p,
      manufacturer: null,
      department: p.department,
      url: affiliateTag
        ? `https://www.amazon.com/dp/${p.asin}?tag=${affiliateTag}`
        : p.url,
    }));

    return { products, captcha: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Check if this might be a CAPTCHA/block scenario
    const isCaptcha = message.includes("net::ERR_") || message.includes("Navigation timeout");
    return { products: [], captcha: isCaptcha };
  }
}

// ---------------------------------------------------------------------------
// searchAmazon — original single-search API (creates/closes its own page)
// ---------------------------------------------------------------------------

/**
 * Search Amazon for a product query and return up to `maxResults` results.
 * Parses the search results page HTML to extract product data.
 */
export async function searchAmazon(
  query: string,
  options?: { maxResults?: number; affiliateTag?: string }
): Promise<AmazonProduct[]> {
  const maxResults = options?.maxResults ?? 10;
  const affiliateTag = options?.affiliateTag ?? null;

  const browser = await getBrowser();
  let page: Page | null = null;

  try {
    page = await browser.newPage();

    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    });

    const encodedQuery = encodeURIComponent(query);
    const searchUrl = `https://www.amazon.com/s?k=${encodedQuery}&i=electronics`;

    const response = await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    if (!response || response.status() !== 200) {
      console.log(
        `Amazon search returned HTTP ${response?.status() ?? "no response"} for "${query}"`
      );
      return [];
    }

    await page
      .waitForSelector('[data-component-type="s-search-result"]', {
        timeout: 8000,
      })
      .catch(() => {});

    // Full scroll for single-search mode (more thorough)
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = 800;
    for (let y = 0; y < pageHeight; y += viewportHeight) {
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const raw = await extractSearchResults(page, maxResults);

    return raw.map((p) => ({
      ...p,
      manufacturer: null,
      url: affiliateTag
        ? `https://www.amazon.com/dp/${p.asin}?tag=${affiliateTag}`
        : p.url,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`Amazon search failed for "${query}": ${message}`);
    return [];
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

/**
 * Search Amazon for multiple product queries in sequence with rate limiting.
 * Returns a Map from query string to results array.
 */
export async function batchSearchAmazon(
  queries: string[],
  options?: {
    maxResults?: number;
    affiliateTag?: string;
    delayMs?: number;
    onProgress?: (completed: number, total: number) => void;
  }
): Promise<Map<string, AmazonProduct[]>> {
  const delayMs = options?.delayMs ?? 3000;
  const results = new Map<string, AmazonProduct[]>();

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];

    if (options?.onProgress) {
      options.onProgress(i, queries.length);
    }

    const products = await searchAmazon(query, {
      maxResults: options?.maxResults,
      affiliateTag: options?.affiliateTag,
    });

    results.set(query, products);

    if (i < queries.length - 1) {
      await delay(delayMs);
    }
  }

  return results;
}
