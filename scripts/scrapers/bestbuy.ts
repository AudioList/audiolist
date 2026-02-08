export type BestBuyProduct = {
  sku: number;
  name: string;
  salePrice: number;
  regularPrice: number;
  onlineAvailability: boolean;
  url: string;
  affiliateUrl: string | null;
  image: string | null;
  manufacturer: string | null;
  modelNumber: string | null;
};

export async function searchBestBuy(
  query: string,
  apiKey: string
): Promise<BestBuyProduct[]> {
  const encodedQuery = encodeURIComponent(query);
  const filter = `(search=${encodedQuery}&categoryPath.name="Headphones"|categoryPath.name="Portable Audio"|categoryPath.name="Microphones")`;
  const fields =
    "show=sku,name,salePrice,regularPrice,onlineAvailability,url,affiliateUrl,image,manufacturer,modelNumber";
  const url = `https://api.bestbuy.com/v1/products${filter}?${fields}&pageSize=10&format=json&apiKey=${apiKey}`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "AudioList Price Checker/1.0" },
    });

    if (response.status === 403) {
      console.log("Best Buy API: invalid or expired API key (403 Forbidden)");
      return [];
    }

    if (response.status === 404) {
      console.log("Best Buy API: no results found (404)");
      return [];
    }

    if (!response.ok) {
      console.log(
        `Best Buy API error: HTTP ${response.status} ${response.statusText}`
      );
      return [];
    }

    const data = await response.json();
    const products = data?.products ?? [];

    return products.map(
      (p: Record<string, unknown>): BestBuyProduct => ({
        sku: p.sku as number,
        name: p.name as string,
        salePrice: p.salePrice as number,
        regularPrice: p.regularPrice as number,
        onlineAvailability: p.onlineAvailability as boolean,
        url: p.url as string,
        affiliateUrl: (p.affiliateUrl as string) ?? null,
        image: (p.image as string) ?? null,
        manufacturer: (p.manufacturer as string) ?? null,
        modelNumber: (p.modelNumber as string) ?? null,
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`Best Buy API request failed: ${message}`);
    return [];
  }
}
