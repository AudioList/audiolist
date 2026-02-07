import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface PriceHistoryPoint {
  recorded_at: string;
  price: number;
  in_stock: boolean;
  retailer_id: string;
  retailer_name: string;
}

interface UsePriceHistoryReturn {
  history: PriceHistoryPoint[];
  loading: boolean;
  error: string | null;
}

export function usePriceHistory(
  productId: string | undefined,
  days: number = 90
): UsePriceHistoryReturn {
  const [history, setHistory] = useState<PriceHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) {
      setHistory([]);
      setLoading(false);
      return;
    }

    async function fetchHistory() {
      setLoading(true);
      setError(null);

      try {
        const since = new Date();
        since.setDate(since.getDate() - days);

        const { data, error: queryError } = await supabase
          .from('price_history')
          .select('recorded_at, price, in_stock, retailer_id, retailer:retailers!retailer_id(name)')
          .eq('product_id', productId)
          .gte('recorded_at', since.toISOString())
          .order('recorded_at', { ascending: true });

        if (queryError) throw queryError;

        const points: PriceHistoryPoint[] = (data ?? []).map((row: Record<string, unknown>) => ({
          recorded_at: row.recorded_at as string,
          price: Number(row.price),
          in_stock: row.in_stock as boolean,
          retailer_id: row.retailer_id as string,
          retailer_name: (row.retailer as { name: string } | null)?.name ?? 'Unknown',
        }));

        setHistory(points);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load price history');
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, [productId, days]);

  return { history, loading, error };
}
