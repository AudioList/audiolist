import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import type { PriceListing } from '../types';

export interface PriceInsight {
  retailer_id: string;
  current_price: number;
  lowest_ever: number;
  lowest_ever_date: string;
  is_all_time_low: boolean;
  price_change_pct: number | null; // vs 30 days ago, negative = price dropped
  trend: 'up' | 'down' | 'stable';
}

interface UsePriceInsightsReturn {
  insights: Map<string, PriceInsight>;
  globalLowest: number | null;
  loading: boolean;
}

export function usePriceInsights(
  productId: string | undefined,
  listings: PriceListing[]
): UsePriceInsightsReturn {
  const [historyData, setHistoryData] = useState<
    { retailer_id: string; price: number; recorded_at: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productId) {
      setHistoryData([]);
      setLoading(false);
      return;
    }

    async function fetchHistory() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('price_history')
          .select('retailer_id, price, recorded_at')
          .eq('product_id', productId!)
          .order('recorded_at', { ascending: true });

        if (error) throw error;
        setHistoryData(
          (data ?? []).map((row: Record<string, unknown>) => ({
            retailer_id: row.retailer_id as string,
            price: Number(row.price),
            recorded_at: row.recorded_at as string,
          }))
        );
      } catch {
        setHistoryData([]);
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, [productId]);

  const { insights, globalLowest } = useMemo(() => {
    const insights = new Map<string, PriceInsight>();

    if (historyData.length === 0 || listings.length === 0) {
      return { insights, globalLowest: null };
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysMs = thirtyDaysAgo.getTime();

    // Group history by retailer
    const byRetailer = new Map<
      string,
      { price: number; recorded_at: string }[]
    >();
    for (const point of historyData) {
      const list = byRetailer.get(point.retailer_id);
      if (list) list.push(point);
      else byRetailer.set(point.retailer_id, [point]);
    }

    let globalMin: number | null = null;

    for (const listing of listings) {
      const history = byRetailer.get(listing.retailer_id) ?? [];
      if (history.length === 0) continue;

      // Find lowest ever price
      let lowestEver = history[0].price;
      let lowestEverDate = history[0].recorded_at;
      for (const point of history) {
        if (point.price < lowestEver) {
          lowestEver = point.price;
          lowestEverDate = point.recorded_at;
        }
      }

      // Find price ~30 days ago (closest point before 30 days)
      let price30DaysAgo: number | null = null;
      for (const point of history) {
        const pointMs = new Date(point.recorded_at).getTime();
        if (pointMs <= thirtyDaysMs) {
          price30DaysAgo = point.price;
        }
      }

      const currentPrice = listing.price;
      const isAllTimeLow = currentPrice <= lowestEver;

      let priceChangePct: number | null = null;
      let trend: 'up' | 'down' | 'stable' = 'stable';

      if (price30DaysAgo !== null && price30DaysAgo > 0) {
        priceChangePct = ((currentPrice - price30DaysAgo) / price30DaysAgo) * 100;
        if (priceChangePct < -2) trend = 'down';
        else if (priceChangePct > 2) trend = 'up';
      }

      if (globalMin === null || currentPrice < globalMin) {
        globalMin = currentPrice;
      }

      insights.set(listing.retailer_id, {
        retailer_id: listing.retailer_id,
        current_price: currentPrice,
        lowest_ever: lowestEver,
        lowest_ever_date: lowestEverDate,
        is_all_time_low: isAllTimeLow,
        price_change_pct: priceChangePct !== null ? Math.round(priceChangePct * 10) / 10 : null,
        trend,
      });
    }

    return { insights, globalLowest: globalMin };
  }, [historyData, listings]);

  return { insights, globalLowest, loading };
}
