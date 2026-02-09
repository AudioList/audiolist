import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { RetailerCoupon } from '../types';

interface UseCouponsReturn {
  coupons: Map<string, RetailerCoupon[]>;
  loading: boolean;
}

export function useCoupons(retailerIds: string[]): UseCouponsReturn {
  const [coupons, setCoupons] = useState<Map<string, RetailerCoupon[]>>(new Map());
  const [loading, setLoading] = useState(true);

  // Stable key for dependency
  const idsKey = retailerIds.sort().join(',');

  useEffect(() => {
    if (retailerIds.length === 0) {
      setCoupons(new Map());
      setLoading(false);
      return;
    }

    async function fetchCoupons() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('retailer_coupons')
          .select('id, retailer_id, code, description, discount_type, discount_value, min_purchase, auto_apply_url, is_active, expires_at')
          .in('retailer_id', retailerIds)
          .eq('is_active', true)
          .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());

        if (error) throw error;

        const map = new Map<string, RetailerCoupon[]>();
        for (const row of (data ?? []) as RetailerCoupon[]) {
          const list = map.get(row.retailer_id);
          if (list) list.push(row);
          else map.set(row.retailer_id, [row]);
        }
        setCoupons(map);
      } catch {
        setCoupons(new Map());
      } finally {
        setLoading(false);
      }
    }

    fetchCoupons();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return { coupons, loading };
}
