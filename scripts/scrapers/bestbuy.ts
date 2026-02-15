export type BestBuyProduct = {
  sku: number;
  name: string;
  salePrice: number | null;
  regularPrice: number | null;
  onSale: boolean | null;
  onlineAvailability: boolean | null;
  url: string | null;
  // NOTE: Best Buy's affiliateUrl field may require extra permissions.
  // We do not request it in `show=` to avoid 403 auth errors.
  affiliateUrl: string | null;
  image: string | null;
  manufacturer: string | null;
  modelNumber: string | null;
  department: string | null;
  class: string | null;
  subclass: string | null;
  categoryPath: { id: string; name: string }[];
};

type BestBuyProductsResponse = {
  products?: Record<string, unknown>[];
  from?: number;
  to?: number;
  total?: number;
  currentPage?: number;
  totalPages?: number;
};

export type BestBuyApiErrorKind = 'rate_limit' | 'quota' | 'auth' | 'unknown';

export class BestBuyApiError extends Error {
  public kind: BestBuyApiErrorKind;
  public status: number;
  public bodySnippet: string | null;

  constructor(kind: BestBuyApiErrorKind, status: number, message: string, bodySnippet: string | null) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.bodySnippet = bodySnippet;
  }
}

type SearchOptions = {
  pageSize?: number;
  categoryPathIds?: string[];
  categoryPathNames?: string[];
};

const DEFAULT_PAGE_SIZE = 10;

function encodeFilterValue(v: string): string {
  return encodeURIComponent(v);
}

function tokenizeQuery(query: string): string[] {
  // Best Buy keyword search supports repeated (search=term) which ANDs terms.
  // Keep tokens simple and short to avoid over-constraining.
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean);

  // Drop very short tokens that tend to add noise.
  const filtered = tokens.filter((t) => t.length >= 2);
  return filtered.slice(0, 6);
}

function buildProductsUrl(filter: string, apiKey: string, params: Record<string, string>): string {
  const qp = new URLSearchParams({ format: 'json', apiKey, ...params });
  return `https://api.bestbuy.com/v1/products(${filter})?${qp.toString()}`;
}

function mapBestBuyProduct(p: Record<string, unknown>): BestBuyProduct {
  const categoryPathRaw = Array.isArray(p.categoryPath) ? (p.categoryPath as unknown[]) : [];
  const categoryPath = categoryPathRaw
    .map((x) => x as Record<string, unknown>)
    .filter((x) => typeof x.id === 'string' && typeof x.name === 'string')
    .map((x) => ({ id: x.id as string, name: x.name as string }));

  return {
    sku: p.sku as number,
    name: (p.name as string) ?? '',
    salePrice: typeof p.salePrice === 'number' ? (p.salePrice as number) : null,
    regularPrice: typeof p.regularPrice === 'number' ? (p.regularPrice as number) : null,
    onSale: typeof p.onSale === 'boolean' ? (p.onSale as boolean) : null,
    onlineAvailability: typeof p.onlineAvailability === 'boolean' ? (p.onlineAvailability as boolean) : null,
    url: (p.url as string) ?? null,
    affiliateUrl: (p.affiliateUrl as string) ?? null,
    image: (p.image as string) ?? null,
    manufacturer: (p.manufacturer as string) ?? null,
    modelNumber: (p.modelNumber as string) ?? null,
    department: (p.department as string) ?? null,
    class: (p.class as string) ?? null,
    subclass: (p.subclass as string) ?? null,
    categoryPath,
  };
}

async function fetchBestBuyProductsPage(url: string): Promise<{ products: BestBuyProduct[]; currentPage: number; totalPages: number; total: number }> {
  const response = await fetch(url, {
    headers: { "User-Agent": "AudioList Price Checker/1.0" },
  });

  if (response.status === 403) {
    const body = await response.text().catch(() => '');
    const snippet = body ? body.slice(0, 300) : null;
    const lower = body.toLowerCase();
    const kind: BestBuyApiErrorKind =
      /per\s*second|rate\s*limit|too\s*many|throttle/.test(lower) ? 'rate_limit' :
      /quota|over\s*quota|exceed|daily\s*limit/.test(lower) ? 'quota' :
      /invalid\s*api\s*key|api\s*key|not\s*authorized|forbidden/.test(lower) ? 'auth' :
      'unknown';

    throw new BestBuyApiError(
      kind,
      403,
      `Best Buy API 403 (${kind})`,
      snippet
    );
  }

  if (response.status === 404) {
    return { products: [], currentPage: 1, totalPages: 1, total: 0 };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const snippet = body ? body.slice(0, 300) : null;
    throw new BestBuyApiError('unknown', response.status, `Best Buy API error: HTTP ${response.status} ${response.statusText}`, snippet);
  }

  const data = (await response.json()) as BestBuyProductsResponse;
  const products = (data?.products ?? []).map(mapBestBuyProduct);
  return {
    products,
    currentPage: typeof data.currentPage === 'number' ? data.currentPage : 1,
    totalPages: typeof data.totalPages === 'number' ? data.totalPages : 1,
    total: typeof data.total === 'number' ? data.total : products.length,
  };
}

async function fetchBestBuyProducts(url: string): Promise<BestBuyProduct[]> {
  const page = await fetchBestBuyProductsPage(url);
  return page.products;
}

export async function searchBestBuy(
  query: string,
  apiKey: string,
  options: SearchOptions = {}
): Promise<BestBuyProduct[]> {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];

  const searchFilter = tokens.map((t) => `search=${encodeFilterValue(t)}`).join('&');

  const categoryParts: string[] = [];
  if (options.categoryPathIds && options.categoryPathIds.length > 0) {
    categoryParts.push(
      options.categoryPathIds
        .map((id) => `categoryPath.id=${encodeFilterValue(id)}`)
        .join('|')
    );
  }
  if (options.categoryPathNames && options.categoryPathNames.length > 0) {
    categoryParts.push(
      options.categoryPathNames
        .map((n) => `categoryPath.name=\"${n.replace(/\"/g, '')}\"`)
        .join('|')
    );
  }

  const categoryFilter = categoryParts.length > 0 ? `(${categoryParts.join('|')})` : '';
  const filter = categoryFilter ? `(${searchFilter}&${categoryFilter})` : `(${searchFilter})`;

  const pageSize = String(options.pageSize ?? DEFAULT_PAGE_SIZE);
  const show = [
    'sku',
    'name',
    'salePrice',
    'regularPrice',
    'onSale',
    'onlineAvailability',
    'url',
    'image',
    'manufacturer',
    'modelNumber',
    'department',
    'class',
    'subclass',
    'categoryPath',
  ].join(',');

  const url = buildProductsUrl(filter, apiKey, { show, pageSize });
  return fetchBestBuyProducts(url);
}

export async function getBestBuyProductsBySkus(
  skus: (string | number)[],
  apiKey: string
): Promise<BestBuyProduct[]> {
  const unique = [...new Set(skus.map((s) => String(s)).filter(Boolean))];
  if (unique.length === 0) return [];

  // Best Buy recommends sku in(...) to reduce QPS errors.
  const skuList = unique.join(',');
  // Include inactive products too; otherwise missing SKUs look like "not found".
  const filter = `sku in(${skuList})&active=*`;
  const show = [
    'sku',
    'name',
    'salePrice',
    'regularPrice',
    'onSale',
    'onlineAvailability',
    'url',
    'image',
    'manufacturer',
    'modelNumber',
    'department',
    'class',
    'subclass',
    'categoryPath',
  ].join(',');
  const url = buildProductsUrl(filter, apiKey, { show, pageSize: '100' });
  return fetchBestBuyProducts(url);
}

export async function listBestBuyProductsByCategoryIds(
  categoryPathIds: string[],
  apiKey: string,
  page: number,
  pageSize: number
): Promise<{ products: BestBuyProduct[]; currentPage: number; totalPages: number; total: number }> {
  const ids = [...new Set(categoryPathIds.map((x) => x.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return { products: [], currentPage: 1, totalPages: 1, total: 0 };
  }

  const categoryFilter = ids.map((id) => `categoryPath.id=${encodeFilterValue(id)}`).join('|');
  // Include inactive products too; otherwise some SKUs won't show up.
  const filter = `(${categoryFilter})&active=*`;

  const show = [
    'sku',
    'name',
    'salePrice',
    'regularPrice',
    'onSale',
    'onlineAvailability',
    'url',
    'image',
    'manufacturer',
    'modelNumber',
    'department',
    'class',
    'subclass',
    'categoryPath',
  ].join(',');

  const url = buildProductsUrl(filter, apiKey, {
    show,
    pageSize: String(pageSize),
    page: String(page),
    sort: 'sku.asc',
  });

  return fetchBestBuyProductsPage(url);
}
