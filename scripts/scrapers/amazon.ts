/**
 * Amazon product search scraper using Playwright.
 *
 * Searches Amazon for audio products and extracts ASIN, name, price,
 * and availability from search result pages.
 *
 * Rate limited to ~1 request per 3 seconds to be respectful.
 */

import { chromium, type Browser, type Page } from "playwright";

export type AmazonProduct = {
  asin: string;
  name: string;
  price: number | null;
  inStock: boolean;
  url: string;
  image: string | null;
  manufacturer: string | null;
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

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

    // Set realistic browser context
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    });

    // Navigate to Amazon search
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

    // Wait for search results to render, then let lazy content load
    await page
      .waitForSelector('[data-component-type="s-search-result"]', {
        timeout: 8000,
      })
      .catch(() => {});

    // Scroll through the entire page to trigger lazy loading of all product names
    // Amazon lazy-loads product titles as they enter the viewport
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = 800;
    for (let y = 0; y < pageHeight; y += viewportHeight) {
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    // Scroll back to top and wait for any remaining network requests
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Extract product data from search results
    const products = await page.evaluate(
      ({ maxRes }) => {
        const results: {
          asin: string;
          name: string;
          price: number | null;
          inStock: boolean;
          url: string;
          image: string | null;
        }[] = [];

        const items = document.querySelectorAll(
          '[data-component-type="s-search-result"]'
        );

        for (const item of items) {
          if (results.length >= maxRes) break;

          const asin = item.getAttribute("data-asin");
          if (!asin || asin.length !== 10) continue;

          // Product name — try multiple sources in order of reliability:
          // 1. h2 > a textContent (usually the full product title)
          // 2. aria-label on the h2 link
          // 3. h2 textContent directly
          // 4. img.s-image alt text (Amazon images often have full product name)
          // 5. Any span with data-attribute containing the title
          const h2Link = item.querySelector("h2 a");
          const imgEl = item.querySelector("img.s-image");
          const h2Text = h2Link?.textContent?.trim() ?? "";
          const ariaLabel = h2Link?.getAttribute("aria-label")?.trim() ?? "";
          const h2Direct = item.querySelector("h2")?.textContent?.trim() ?? "";
          const imgAlt = imgEl?.getAttribute("alt")?.trim() ?? "";

          // Pick the longest name — longer usually means more complete
          let name = "";
          for (const candidate of [h2Text, ariaLabel, h2Direct, imgAlt]) {
            if (candidate.length > name.length) {
              name = candidate;
            }
          }
          if (!name) continue;

          // Price - look for the whole and fraction parts
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

          // Image (imgEl already queried above for alt-text name extraction)
          const image = imgEl?.getAttribute("src") ?? null;

          // URL
          const linkEl = item.querySelector("h2 a");
          const href = linkEl?.getAttribute("href") ?? "";
          const url = href.startsWith("http")
            ? href
            : `https://www.amazon.com${href}`;

          // In stock - if it has a price, assume it's available
          // (Amazon doesn't show out-of-stock products in search results typically)
          const inStock = price !== null && price > 0;

          results.push({ asin, name, price, inStock, url, image });
        }

        return results;
      },
      { maxRes: maxResults }
    );

    // Build affiliate URLs if tag provided
    return products.map((p) => ({
      ...p,
      manufacturer: null, // Amazon search doesn't expose manufacturer separately
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

    // Rate limit between requests
    if (i < queries.length - 1) {
      await delay(delayMs);
    }
  }

  return results;
}
