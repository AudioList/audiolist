/**
 * aliexpress.ts
 *
 * AliExpress Affiliate API client. Handles MD5 signing, HTTP calls,
 * rate limiting, and typed response parsing.
 *
 * Uses the AliExpress Open Platform Affiliate API:
 *   POST http://gw.api.taobao.com/router/rest
 *
 * Authentication: MD5 signing with App Key + App Secret.
 * Rate limit: 5,000 requests/day (affiliate tier).
 *
 * Exports:
 *   - createAliExpressClient(config)  -- factory for the API client
 *   - AliExpressProduct type          -- product data from API responses
 *   - AliExpressConfig type           -- API credentials
 */

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AliExpressConfig = {
  appKey: string;
  appSecret: string;
  trackingId: string;
};

export type AliExpressProduct = {
  product_id: string;
  product_title: string;
  product_url: string;
  sale_price: string;
  sale_price_currency: string;
  original_price: string;
  original_price_currency: string;
  discount: string;
  shop_id: string;
  shop_url: string;
  product_main_image_url: string;
  second_level_category_id: number;
  evaluate_rate: string;
  promotion_link: string;
  relevant_market_commission_rate: string;
  product_video_url?: string;
  lastest_volume?: string;
};

export type AliExpressCategory = {
  category_id: number;
  category_name: string;
  parent_category_id: number;
};

export type AliExpressAffiliateLink = {
  source_url: string;
  promotion_link: string;
};

export type SearchProductsParams = {
  keywords: string;
  categoryIds?: string;
  pageNo?: number;
  pageSize?: number;
  minSalePrice?: number;
  maxSalePrice?: number;
  sort?: 'SALE_PRICE_ASC' | 'SALE_PRICE_DESC' | 'LAST_VOLUME_ASC' | 'LAST_VOLUME_DESC';
  shipToCountry?: string;
};

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class AliExpressApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly subCode?: string,
  ) {
    super(message);
    this.name = 'AliExpressApiError';
  }

  get isRateLimit(): boolean {
    return this.code === '7' || this.subCode === 'OVER_FLOW';
  }

  get isInvalidSign(): boolean {
    return this.code === '25' || this.subCode === 'INVALID_SIGN';
  }

  get isTemporary(): boolean {
    return this.code === '15' || this.subCode === 'ISP_SERVICE_UNAVAILABLE';
  }
}

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

export interface AliExpressClient {
  /** Search products by keyword/category. Returns up to pageSize (max 50) results per page. */
  searchProducts(params: SearchProductsParams): Promise<{
    products: AliExpressProduct[];
    totalCount: number;
    currentPage: number;
  }>;

  /** Get details for specific product IDs. Max 20 per call. */
  getProductDetails(productIds: string[]): Promise<AliExpressProduct[]>;

  /** Generate affiliate tracking links for product URLs. Max 50 per call. */
  generateAffiliateLinks(urls: string[]): Promise<AliExpressAffiliateLink[]>;

  /** Get category tree. Optionally pass parent_cat_id for child categories. */
  getCategories(parentCatId?: number): Promise<AliExpressCategory[]>;

  /** Get remaining API call quota for the day. */
  getRemainingQuota(): number;

  /** Get total API calls made today. */
  getCallCount(): number;

  /** Reset the daily call counter (for testing or new-day rollover). */
  resetCallCounter(): void;
}

// ---------------------------------------------------------------------------
// MD5 signing
// ---------------------------------------------------------------------------

function signRequest(params: Record<string, string>, secret: string): string {
  // Sort parameters alphabetically by key
  const sorted = Object.keys(params).sort();

  // Concatenate: key1value1key2value2...
  const concatenated = sorted.map(key => `${key}${params[key]}`).join('');

  // Wrap with secret and hash
  const toSign = `${secret}${concatenated}${secret}`;
  return crypto.createHash('md5').update(toSign, 'utf8').digest('hex').toUpperCase();
}

function getTimestamp(): string {
  // AliExpress expects timestamp in Asia/Shanghai timezone: "YYYY-MM-DD HH:mm:ss"
  const now = new Date();
  return now.toLocaleString('sv-SE', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  }).replace('T', ' ');
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

const API_ENDPOINT = 'http://gw.api.taobao.com/router/rest';
const DAILY_LIMIT = 5000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createAliExpressClient(config: AliExpressConfig): AliExpressClient {
  let callCount = 0;
  let lastResetDate = new Date().toISOString().slice(0, 10);

  function checkDayRollover(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== lastResetDate) {
      callCount = 0;
      lastResetDate = today;
    }
  }

  async function callApi(
    method: string,
    params: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    checkDayRollover();

    if (callCount >= DAILY_LIMIT) {
      throw new AliExpressApiError('Daily API rate limit reached', '7', 'OVER_FLOW');
    }

    const payload: Record<string, string> = {
      method,
      app_key: config.appKey,
      sign_method: 'md5',
      timestamp: getTimestamp(),
      format: 'json',
      v: '2.0',
      ...params,
    };

    payload.sign = signRequest(payload, config.appSecret);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        callCount++;
        const response = await fetch(API_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
          },
          body: new URLSearchParams(payload),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as Record<string, unknown>;

        // Check for API-level errors
        if (data.error_response) {
          const err = data.error_response as {
            code?: string;
            msg?: string;
            sub_code?: string;
            sub_msg?: string;
          };
          const apiError = new AliExpressApiError(
            err.sub_msg ?? err.msg ?? 'Unknown API error',
            String(err.code ?? ''),
            err.sub_code,
          );

          if (apiError.isTemporary && attempt < MAX_RETRIES - 1) {
            lastError = apiError;
            await delay(RETRY_DELAY_MS * (attempt + 1));
            continue;
          }

          throw apiError;
        }

        return data;
      } catch (err) {
        if (err instanceof AliExpressApiError && !err.isTemporary) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES - 1) {
          await delay(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    throw lastError ?? new Error('Unknown error after retries');
  }

  // ---------------------------------------------------------------------------
  // Method implementations
  // ---------------------------------------------------------------------------

  async function searchProducts(params: SearchProductsParams): Promise<{
    products: AliExpressProduct[];
    totalCount: number;
    currentPage: number;
  }> {
    const apiParams: Record<string, string> = {
      keywords: params.keywords,
      target_currency: 'USD',
      target_language: 'EN',
      tracking_id: config.trackingId,
      page_no: String(params.pageNo ?? 1),
      page_size: String(Math.min(params.pageSize ?? 50, 50)),
      ship_to_country: params.shipToCountry ?? 'US',
    };

    if (params.categoryIds) apiParams.category_ids = params.categoryIds;
    if (params.sort) apiParams.sort = params.sort;
    if (params.minSalePrice != null) {
      // API expects price in cents
      apiParams.min_sale_price = String(Math.round(params.minSalePrice * 100));
    }
    if (params.maxSalePrice != null) {
      apiParams.max_sale_price = String(Math.round(params.maxSalePrice * 100));
    }

    const data = await callApi('aliexpress.affiliate.product.query', apiParams);

    // Navigate the nested response structure
    const resp = data['aliexpress_affiliate_product_query_response'] as Record<string, unknown> | undefined;
    const respData = resp?.['resp_result'] as Record<string, unknown> | undefined;
    const result = respData?.['result'] as Record<string, unknown> | undefined;
    const productsWrapper = result?.['products'] as Record<string, unknown> | undefined;
    const productList = productsWrapper?.['product'] as AliExpressProduct[] | undefined;

    return {
      products: productList ?? [],
      totalCount: Number(result?.['total_record_count'] ?? 0),
      currentPage: Number(result?.['current_page_no'] ?? 1),
    };
  }

  async function getProductDetails(productIds: string[]): Promise<AliExpressProduct[]> {
    if (productIds.length === 0) return [];
    if (productIds.length > 20) {
      throw new Error('getProductDetails accepts max 20 product IDs per call');
    }

    const apiParams: Record<string, string> = {
      product_ids: productIds.join(','),
      target_currency: 'USD',
      target_language: 'EN',
      tracking_id: config.trackingId,
    };

    const data = await callApi('aliexpress.affiliate.productdetail.get', apiParams);

    const resp = data['aliexpress_affiliate_productdetail_get_response'] as Record<string, unknown> | undefined;
    const respData = resp?.['resp_result'] as Record<string, unknown> | undefined;
    const result = respData?.['result'] as Record<string, unknown> | undefined;
    const productsWrapper = result?.['products'] as Record<string, unknown> | undefined;
    const productList = productsWrapper?.['product'] as AliExpressProduct[] | undefined;

    return productList ?? [];
  }

  async function generateAffiliateLinks(urls: string[]): Promise<AliExpressAffiliateLink[]> {
    if (urls.length === 0) return [];
    if (urls.length > 50) {
      throw new Error('generateAffiliateLinks accepts max 50 URLs per call');
    }

    const apiParams: Record<string, string> = {
      promotion_link_type: '0',
      source_values: urls.join(','),
      tracking_id: config.trackingId,
    };

    const data = await callApi('aliexpress.affiliate.link.generate', apiParams);

    const resp = data['aliexpress_affiliate_link_generate_response'] as Record<string, unknown> | undefined;
    const respData = resp?.['resp_result'] as Record<string, unknown> | undefined;
    const result = respData?.['result'] as Record<string, unknown> | undefined;
    const linksWrapper = result?.['promotion_links'] as Record<string, unknown> | undefined;
    const linkList = linksWrapper?.['promotion_link'] as AliExpressAffiliateLink[] | undefined;

    return linkList ?? [];
  }

  async function getCategories(parentCatId?: number): Promise<AliExpressCategory[]> {
    const apiParams: Record<string, string> = {};
    if (parentCatId != null) {
      apiParams.parent_cat_id = String(parentCatId);
    }

    const data = await callApi('aliexpress.affiliate.category.get', apiParams);

    const resp = data['aliexpress_affiliate_category_get_response'] as Record<string, unknown> | undefined;
    const respData = resp?.['resp_result'] as Record<string, unknown> | undefined;
    const result = respData?.['result'] as Record<string, unknown> | undefined;
    const categoriesWrapper = result?.['categories'] as Record<string, unknown> | undefined;
    const categoryList = categoriesWrapper?.['category'] as AliExpressCategory[] | undefined;

    return categoryList ?? [];
  }

  return {
    searchProducts,
    getProductDetails,
    generateAffiliateLinks,
    getCategories,
    getRemainingQuota: () => { checkDayRollover(); return DAILY_LIMIT - callCount; },
    getCallCount: () => { checkDayRollover(); return callCount; },
    resetCallCounter: () => { callCount = 0; },
  };
}
