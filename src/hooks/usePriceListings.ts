import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { PriceListing } from '../types';

interface UsePriceListingsReturn {
  listings: PriceListing[];
  loading: boolean;
  error: string | null;
}

export function usePriceListings(
  productId: string | undefined
): UsePriceListingsReturn {
  const [listings, setListings] = useState<PriceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) {
      setListings([]);
      setLoading(false);
      return;
    }

    async function fetchListings() {
      setLoading(true);
      setError(null);

      try {
        const { data, error: queryError } = await supabase
          .from('price_listings')
          .select(
            '*, retailer:retailers!retailer_id(id, name, base_url, is_active, description, ships_from, return_policy, authorized_dealer)'
          )
          .eq('product_id', productId)
          .order('price', { ascending: true });

        if (queryError) throw queryError;

        // Filter to only active retailers
        const active = ((data ?? []) as PriceListing[]).filter(
          (listing) => listing.retailer?.is_active === true
        );

        setListings(active);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load price listings'
        );
      } finally {
        setLoading(false);
      }
    }

    fetchListings();
  }, [productId]);

  return { listings, loading, error };
}
