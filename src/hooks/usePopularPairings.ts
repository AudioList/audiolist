import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Product } from '../types';

interface PairingResult {
  product: Product;
  count: number;
}

export function usePopularPairings(productId: string | null, maxResults = 5) {
  const [pairings, setPairings] = useState<PairingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) {
      setPairings([]);
      return;
    }

    let cancelled = false;

    async function fetchPairings() {
      setLoading(true);
      setError(null);

      try {
        // Call the RPC function
        const { data: pairingData, error: rpcError } = await supabase
          .rpc('get_popular_pairings', {
            target_product_id: productId,
            max_results: maxResults,
          });

        if (rpcError) {
          setError(rpcError.message);
          setLoading(false);
          return;
        }

        if (!pairingData || pairingData.length === 0) {
          setPairings([]);
          setLoading(false);
          return;
        }

        // Fetch full product data for the paired product IDs
        const pairedIds = pairingData.map(
          (p: { paired_product_id: string }) => p.paired_product_id
        );

        const { data: products, error: productError } = await supabase
          .from('products')
          .select('*')
          .in('id', pairedIds);

        if (productError || !products) {
          setError(productError?.message ?? 'Failed to fetch paired products');
          setLoading(false);
          return;
        }

        if (cancelled) return;

        // Map products to results with counts
        const productMap = new Map<string, Product>();
        for (const p of products) {
          productMap.set(p.id, p as Product);
        }

        const results: PairingResult[] = [];
        for (const pairing of pairingData) {
          const product = productMap.get(pairing.paired_product_id);
          if (product) {
            results.push({
              product,
              count: Number(pairing.pair_count),
            });
          }
        }

        setPairings(results);
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchPairings();

    return () => {
      cancelled = true;
    };
  }, [productId, maxResults]);

  return { pairings, loading, error };
}
