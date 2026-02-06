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
        let query = supabase
          .from('products')
          .select('*', { count: 'exact' })
          .eq('category_id', category);

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

        // Sort
        const ascending = sort.direction === 'asc';
        query = query.order(sort.field, {
          ascending,
          nullsFirst: false,
        });

        // Secondary sort by name for stability
        if (sort.field !== 'name') {
          query = query.order('name', { ascending: true });
        }

        // Pagination
        const from = pageNum * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        query = query.range(from, to);

        const { data, error: queryError, count } = await query;

        if (queryError) throw queryError;

        const newProducts = (data ?? []) as Product[];

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

export function useProductBrands(category: CategoryId): string[] {
  const [brands, setBrands] = useState<string[]>([]);

  useEffect(() => {
    async function fetchBrands() {
      const { data } = await supabase
        .from('products')
        .select('brand')
        .eq('category_id', category)
        .not('brand', 'is', null)
        .order('brand');

      if (data) {
        const unique = [...new Set(data.map((d) => d.brand as string))];
        setBrands(unique);
      }
    }
    fetchBrands();
  }, [category]);

  return brands;
}
