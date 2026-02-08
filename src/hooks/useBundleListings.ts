import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { StoreProductBundle, Retailer } from '../types';
import { isBundleTitle } from '../lib/bundleUtils';

interface UseBundleListingsReturn {
  bundles: StoreProductBundle[];
  loading: boolean;
  error: string | null;
}

// Supabase PostgREST returns the joined retailer as an array (non-unique FK).
// We flatten it to a single Retailer object.
interface RawStoreProduct {
  id: string;
  retailer_id: string;
  title: string;
  price: number | null;
  in_stock: boolean;
  product_url: string | null;
  affiliate_url: string | null;
  image_url: string | null;
  retailer: Retailer[] | Retailer | null;
}

function flattenRetailer(raw: RawStoreProduct): StoreProductBundle {
  const retailer = Array.isArray(raw.retailer) ? raw.retailer[0] ?? undefined : raw.retailer ?? undefined;
  return { ...raw, retailer };
}

export function useBundleListings(
  productId: string | undefined,
  productName: string | undefined,
): UseBundleListingsReturn {
  const [bundles, setBundles] = useState<StoreProductBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId || !productName) {
      setBundles([]);
      setLoading(false);
      return;
    }

    async function fetchBundles() {
      setLoading(true);
      setError(null);

      try {
        const { data, error: queryError } = await supabase
          .from('store_products')
          .select(
            'id, retailer_id, title, price, in_stock, product_url, affiliate_url, image_url, retailer:retailers!retailer_id(id, name, base_url, is_active, description, ships_from, return_policy, authorized_dealer)',
          )
          .eq('canonical_product_id', productId)
          .order('price', { ascending: true });

        if (queryError) throw queryError;

        const mapped = ((data ?? []) as RawStoreProduct[]).map(flattenRetailer);

        const filtered = mapped.filter((sp) => {
          if (sp.retailer?.is_active !== true) return false;
          if (!sp.price || sp.price <= 0) return false;
          return isBundleTitle(sp.title, productName!);
        });

        setBundles(filtered);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load bundle listings',
        );
      } finally {
        setLoading(false);
      }
    }

    fetchBundles();
  }, [productId, productName]);

  return { bundles, loading, error };
}
