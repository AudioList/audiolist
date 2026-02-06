export type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  tags: string[];
  variants: Array<{
    id: number;
    title: string;
    price: string;
    available: boolean;
    sku: string | null;
  }>;
  images: Array<{ src: string }>;
};

const USER_AGENT = "AudioList Price Checker/1.0";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Simple in-memory cache keyed by domain
const catalogCache = new Map<string, ShopifyProduct[]>();

export async function fetchShopifyCatalog(
  domain: string,
  options?: { maxPages?: number; delayMs?: number }
): Promise<ShopifyProduct[]> {
  const maxPages = options?.maxPages ?? 100;
  const delayMs = options?.delayMs ?? 600;
  const allProducts: ShopifyProduct[] = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://${domain}/products.json?limit=250&page=${page}`;
      console.log(
        `Fetching ${domain} page ${page}... (${allProducts.length} products)`
      );

      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      });

      if (!response.ok) {
        console.log(
          `HTTP ${response.status} fetching page ${page} from ${domain}, stopping pagination`
        );
        break;
      }

      const data = await response.json();
      const products: ShopifyProduct[] = data?.products ?? [];

      if (products.length === 0) {
        console.log(
          `No more products on page ${page} from ${domain}, done`
        );
        break;
      }

      allProducts.push(...products);

      if (page < maxPages && products.length > 0) {
        await delay(delayMs);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(
        `Error fetching page ${page} from ${domain}: ${message}. Returning ${allProducts.length} products collected so far.`
      );
      break;
    }
  }

  // Cache the catalog for later search fallback
  catalogCache.set(domain, allProducts);

  console.log(
    `Finished fetching ${domain}: ${allProducts.length} total products`
  );
  return allProducts;
}

export async function fetchShopifyCollection(
  domain: string,
  collectionHandle: string,
  options?: { maxPages?: number; delayMs?: number; limit?: number }
): Promise<ShopifyProduct[]> {
  const maxPages = options?.maxPages ?? 100;
  const delayMs = options?.delayMs ?? 600;
  const limit = options?.limit ?? 250;
  const allProducts: ShopifyProduct[] = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = `https://${domain}/collections/${collectionHandle}/products.json?limit=${limit}&page=${page}`;
      console.log(
        `Fetching ${domain}/collections/${collectionHandle} page ${page}... (${allProducts.length} products)`
      );

      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
      });

      if (!response.ok) {
        console.log(
          `HTTP ${response.status} fetching collection ${collectionHandle} page ${page} from ${domain}, stopping`
        );
        break;
      }

      const data = await response.json();
      const products: ShopifyProduct[] = data?.products ?? [];

      if (products.length === 0) {
        console.log(
          `No more products in collection ${collectionHandle} page ${page} from ${domain}, done`
        );
        break;
      }

      allProducts.push(...products);

      if (page < maxPages && products.length >= limit) {
        await delay(delayMs);
      } else {
        break; // Last partial page
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(
        `Error fetching collection ${collectionHandle} page ${page} from ${domain}: ${message}. Returning ${allProducts.length} products collected so far.`
      );
      break;
    }
  }

  console.log(
    `Finished fetching ${domain}/collections/${collectionHandle}: ${allProducts.length} total products`
  );
  return allProducts;
}

export async function searchShopifyCatalog(
  domain: string,
  query: string
): Promise<ShopifyProduct[]> {
  // Try the suggest endpoint first
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://${domain}/search/suggest.json?q=${encodedQuery}&resources[type]=product&resources[limit]=10`;

    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (response.ok) {
      const data = await response.json();
      const products: ShopifyProduct[] =
        data?.resources?.results?.products ?? [];
      if (products.length > 0) {
        return products;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(
      `Suggest endpoint failed for ${domain}: ${message}, falling back to cached catalog`
    );
  }

  // Fallback: filter from cached catalog
  const cached = catalogCache.get(domain);
  if (!cached) {
    console.log(
      `No cached catalog for ${domain}, fetching full catalog for search fallback`
    );
    const catalog = await fetchShopifyCatalog(domain);
    return filterCatalog(catalog, query);
  }

  return filterCatalog(cached, query);
}

function filterCatalog(
  products: ShopifyProduct[],
  query: string
): ShopifyProduct[] {
  const lowerQuery = query.toLowerCase();
  const terms = lowerQuery.split(/\s+/).filter(Boolean);

  return products.filter((product) => {
    const text =
      `${product.title} ${product.vendor} ${product.product_type} ${product.tags.join(" ")}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
