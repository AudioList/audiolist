import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Product, CategoryId, ProductFilters, ProductSort } from '../types';

const PAGE_SIZE = 50;

interface UseProductsOptions {
  category: CategoryId;
  filters?: ProductFilters;
  sort?: ProductSort;
}

interface UseProductsReturn {
  products: Product[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  total: number;
  loadMore: () => void;
  refresh: () => void;
}

const defaultFilters: ProductFilters = {
  search: '',
  brands: [],
  priceMin: null,
  priceMax: null,
  ppiMin: null,
  ppiMax: null,
  quality: null,
  rigType: null,
  retailers: [],
  hideOutOfStock: false,
  speakerTypes: [],
};

const defaultSort: ProductSort = {
  field: 'ppi_score',
  direction: 'desc',
};

export function useProducts({
  category,
  filters = defaultFilters,
  sort = defaultSort,
}: UseProductsOptions): UseProductsReturn {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);

  const fetchProducts = useCallback(
    async (pageNum: number, append: boolean) => {
      setLoading(true);
      setError(null);

      try {
        const hasRetailerFilter = filters.retailers.length > 0;
        const selectStr = hasRetailerFilter
          ? '*, price_listings!inner(retailer_id, price, affiliate_url, product_url, in_stock)'
          : '*';

        let query = supabase
          .from('products')
          .select(selectStr, { count: 'exact' })
          .eq('category_id', category);

        // Retailer filter (via inner join on price_listings)
        if (hasRetailerFilter) {
          query = query.in('price_listings.retailer_id', filters.retailers);
        }

        // Search
        if (filters.search) {
          query = query.ilike('name', `%${filters.search}%`);
        }

        // Brand filter
        if (filters.brands.length > 0) {
          query = query.in('brand', filters.brands);
        }

        // Price range
        if (filters.priceMin !== null) {
          query = query.gte('price', filters.priceMin);
        }
        if (filters.priceMax !== null) {
          query = query.lte('price', filters.priceMax);
        }

        // PPI range
        if (filters.ppiMin !== null) {
          query = query.gte('ppi_score', filters.ppiMin);
        }
        if (filters.ppiMax !== null) {
          query = query.lte('ppi_score', filters.ppiMax);
        }

        // Quality
        if (filters.quality) {
          query = query.eq('quality', filters.quality);
        }

        // Rig type
        if (filters.rigType) {
          query = query.eq('rig_type', filters.rigType);
        }

        // Speaker type
        if (filters.speakerTypes.length > 0) {
          query = query.in('speaker_type', filters.speakerTypes);
        }

        // Hide out of stock (DB-level only when no retailer filter;
        // with retailer filter we post-process after overriding in_stock)
        if (filters.hideOutOfStock && !hasRetailerFilter) {
          query = query.eq('in_stock', true);
        }

        // Sort: in_stock first (purchasable products above measurement-only)
        query = query.order('in_stock', { ascending: false, nullsFirst: false });

        // Primary sort field
        const ascending = sort.direction === 'asc';
        query = query.order(sort.field, {
          ascending,
          nullsFirst: false,
        });

        // Tertiary sort by name for stability
        if (sort.field !== 'name') {
          query = query.order('name', { ascending: true });
        }

        // Pagination
        const from = pageNum * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        query = query.range(from, to);

        const { data, error: queryError, count } = await query;

        if (queryError) throw queryError;

        // When retailer filter is active, override product price/link/in_stock
        // with the best listing from the matched retailers
        if (hasRetailerFilter && data) {
          for (const raw of data as any[]) {
            const listings = raw.price_listings as {
              retailer_id: string;
              price: number | null;
              affiliate_url: string | null;
              product_url: string | null;
              in_stock: boolean;
            }[];
            if (!listings?.length) continue;

            // Pick the lowest-priced listing from the filtered retailers
            let best: (typeof listings)[0] | null = null;
            for (const l of listings) {
              if (l.price === null) continue;
              if (!best || l.price < best.price!) best = l;
            }
            if (best) {
              raw.price = best.price;
              raw.affiliate_url = best.affiliate_url ?? best.product_url;
              raw.in_stock = best.in_stock;
            }
          }
        }

        let newProducts = (data ?? []) as unknown as Product[];

        // Client-side OOS filter when retailer filter is active
        // (in_stock was overridden above from price_listings)
        if (filters.hideOutOfStock && hasRetailerFilter) {
          newProducts = newProducts.filter((p) => p.in_stock);
        }

        if (append) {
          setProducts((prev) => [...prev, ...newProducts]);
        } else {
          setProducts(newProducts);
        }

        setTotal(count ?? 0);
        setHasMore(newProducts.length === PAGE_SIZE);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load products');
      } finally {
        setLoading(false);
      }
    },
    [category, filters, sort]
  );

  // Reset and fetch on filter/sort/category change
  useEffect(() => {
    setPage(0);
    fetchProducts(0, false);
  }, [fetchProducts]);

  const loadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchProducts(nextPage, true);
  }, [page, fetchProducts]);

  const refresh = useCallback(() => {
    setPage(0);
    fetchProducts(0, false);
  }, [fetchProducts]);

  return { products, loading, error, hasMore, total, loadMore, refresh };
}

export function useRetailers(category: CategoryId): { id: string; name: string }[] {
  const [retailers, setRetailers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    async function fetchRetailers() {
      // Get distinct retailer IDs that have price listings for products in this category
      const PAGE = 1000;
      const retailerIds = new Set<string>();
      let offset = 0;

      while (true) {
        const { data } = await supabase
          .from('price_listings')
          .select('retailer_id, products!inner(category_id)')
          .eq('products.category_id', category)
          .range(offset, offset + PAGE - 1);

        if (!data || data.length === 0) break;
        for (const d of data) retailerIds.add((d as any).retailer_id);
        if (data.length < PAGE) break;
        offset += PAGE;
      }

      if (retailerIds.size === 0) {
        setRetailers([]);
        return;
      }

      // Fetch retailer names for those IDs
      const { data: retData } = await supabase
        .from('retailers')
        .select('id, name')
        .eq('is_active', true)
        .in('id', [...retailerIds])
        .order('name');

      setRetailers((retData ?? []) as { id: string; name: string }[]);
    }
    fetchRetailers();
  }, [category]);

  return retailers;
}

/** Display labels for speaker_type values */
const SPEAKER_TYPE_LABELS: Record<string, string> = {
  bookshelf: 'Bookshelf',
  floorstanding: 'Floorstanding',
  center: 'Center',
  portable: 'Portable',
  toursound: 'Tour Sound',
  inwall: 'In-Wall',
  cinema: 'Cinema',
  surround: 'Surround',
  omnidirectional: 'Omnidirectional',
  columns: 'Columns',
  outdoor: 'Outdoor',
  soundbar: 'Soundbar',
  cbt: 'CBT',
  panel: 'Panel',
};

export function getSpeakerTypeLabel(type: string): string {
  return SPEAKER_TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

export function useSpeakerTypes(): { value: string; label: string; count: number }[] {
  const [types, setTypes] = useState<{ value: string; label: string; count: number }[]>([]);

  useEffect(() => {
    async function fetchTypes() {
      const PAGE = 1000;
      const counts = new Map<string, number>();
      let offset = 0;

      while (true) {
        const { data } = await supabase
          .from('products')
          .select('speaker_type')
          .eq('category_id', 'speaker')
          .not('speaker_type', 'is', null)
          .range(offset, offset + PAGE - 1);

        if (!data || data.length === 0) break;

        for (const d of data) {
          const t = d.speaker_type as string;
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }

        if (data.length < PAGE) break;
        offset += PAGE;
      }

      const result = [...counts.entries()]
        .map(([value, count]) => ({
          value,
          label: getSpeakerTypeLabel(value),
          count,
        }))
        .sort((a, b) => b.count - a.count);

      setTypes(result);
    }
    fetchTypes();
  }, []);

  return types;
}

export function useProductBrands(category: CategoryId): string[] {
  const [brands, setBrands] = useState<string[]>([]);

  useEffect(() => {
    async function fetchBrands() {
      // Supabase defaults to 1000 rows per request, so we paginate
      // to collect ALL brands for categories with many products.
      const PAGE = 1000;
      const allBrands = new Set<string>();
      let offset = 0;

      while (true) {
        const { data } = await supabase
          .from('products')
          .select('brand')
          .eq('category_id', category)
          .not('brand', 'is', null)
          .order('brand')
          .range(offset, offset + PAGE - 1);

        if (!data || data.length === 0) break;

        for (const d of data) {
          allBrands.add(d.brand as string);
        }

        if (data.length < PAGE) break;
        offset += PAGE;
      }

      setBrands([...allBrands].sort((a, b) => a.localeCompare(b)));
    }
    fetchBrands();
  }, [category]);

  return brands;
}
