import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface DealListing {
  product_id: string;
  product_name: string;
  product_brand: string | null;
  product_category: string;
  product_image: string | null;
  retailer_id: string;
  retailer_name: string;
  price: number;
  compare_at_price: number | null;
  on_sale: boolean;
  in_stock: boolean;
  product_url: string | null;
  affiliate_url: string | null;
  discount_pct: number | null;
}

interface UseDealsReturn {
  deals: DealListing[];
  loading: boolean;
  error: string | null;
}

export function useDeals(): UseDealsReturn {
  const [deals, setDeals] = useState<DealListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDeals() {
      setLoading(true);
      setError(null);

      try {
        // Fetch price_listings that are on sale or have compare_at_price
        const { data, error: queryError } = await supabase
          .from('price_listings')
          .select(`
            product_id,
            retailer_id,
            price,
            compare_at_price,
            on_sale,
            in_stock,
            product_url,
            affiliate_url,
            retailer:retailers!retailer_id(name),
            product:products!product_id(name, brand, category_id, image_url)
          `)
          .eq('in_stock', true)
          .or('on_sale.eq.true,compare_at_price.not.is.null')
          .order('price', { ascending: true });

        if (queryError) throw queryError;

        const listings: DealListing[] = (data ?? [])
          .map((row: Record<string, unknown>) => {
            const product = row.product as { name: string; brand: string | null; category_id: string; image_url: string | null } | null;
            const retailer = row.retailer as { name: string } | null;
            const price = Number(row.price);
            const compareAt = row.compare_at_price ? Number(row.compare_at_price) : null;
            const discountPct = compareAt && compareAt > price
              ? Math.round(((compareAt - price) / compareAt) * 100)
              : null;

            return {
              product_id: row.product_id as string,
              product_name: product?.name ?? 'Unknown',
              product_brand: product?.brand ?? null,
              product_category: product?.category_id ?? '',
              product_image: product?.image_url ?? null,
              retailer_id: row.retailer_id as string,
              retailer_name: retailer?.name ?? 'Unknown',
              price,
              compare_at_price: compareAt,
              on_sale: row.on_sale as boolean,
              in_stock: row.in_stock as boolean,
              product_url: row.product_url as string | null,
              affiliate_url: row.affiliate_url as string | null,
              discount_pct: discountPct,
            };
          })
          // Sort by discount percentage (highest first), then by price
          .sort((a: DealListing, b: DealListing) => {
            if (a.discount_pct !== null && b.discount_pct !== null) {
              return b.discount_pct - a.discount_pct;
            }
            if (a.discount_pct !== null) return -1;
            if (b.discount_pct !== null) return 1;
            return a.price - b.price;
          });

        setDeals(listings);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load deals');
      } finally {
        setLoading(false);
      }
    }

    fetchDeals();
  }, []);

  return { deals, loading, error };
}
