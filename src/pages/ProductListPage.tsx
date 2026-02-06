import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { CategoryId, ProductFilters, ProductSort, Product } from '../types';
import { CATEGORIES, CATEGORY_MAP } from '../lib/categories';
import { useProducts, useRetailers } from '../hooks/useProducts';
import SearchBar from '../components/products/SearchBar';
import SortControls from '../components/products/SortControls';
import PPIBadge from '../components/shared/PPIBadge';
import PriceDisplay from '../components/shared/PriceDisplay';

const DEFAULT_CATEGORY: CategoryId = 'iem';

export default function ProductListPage() {
  const { category: categoryParam } = useParams<{ category: string }>();
  const navigate = useNavigate();

  const categoryId = (
    CATEGORY_MAP.has(categoryParam as CategoryId)
      ? categoryParam
      : DEFAULT_CATEGORY
  ) as CategoryId;

  const category = CATEGORY_MAP.get(categoryId)!;

  const [filters, setFilters] = useState<ProductFilters>({
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
  });

  const [sort, setSort] = useState<ProductSort>({
    field: category.has_ppi ? 'ppi_score' : 'price',
    direction: 'desc',
  });

  const hookOptions = useMemo(
    () => ({ category: categoryId, filters, sort }),
    [categoryId, filters, sort],
  );

  const { products, loading, error, hasMore, total, loadMore } = useProducts(hookOptions);
  const retailers = useRetailers(categoryId);

  function handleCategoryChange(id: CategoryId) {
    navigate(`/products/${id}`);
    setFilters({
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
    });
    const cat = CATEGORY_MAP.get(id);
    setSort({
      field: cat?.has_ppi ? 'ppi_score' : 'price',
      direction: 'desc',
    });
  }

  return (
    <div className="space-y-6">
      {/* Category tabs */}
      <nav className="flex flex-wrap gap-1" role="tablist" aria-label="Product categories">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={cat.id === categoryId}
            onClick={() => handleCategoryChange(cat.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              cat.id === categoryId
                ? 'bg-primary-600 text-white'
                : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </nav>

      {/* Search and sort controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-sm">
          <SearchBar
            value={filters.search}
            onChange={(value) => setFilters((prev) => ({ ...prev, search: value }))}
            placeholder={`Search ${category.name}...`}
          />
        </div>
        <SortControls sort={sort} onChange={setSort} showPPI={category.has_ppi} />
      </div>

      {/* Filter sidebar + grid layout */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Filter sidebar */}
        <aside className="w-full shrink-0 lg:w-56">
          <div className="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-900">
            <h3 className="mb-3 text-sm font-semibold text-surface-900 dark:text-surface-100">
              Filters
            </h3>

            {/* Hide out of stock */}
            <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-surface-700 dark:text-surface-200 hover:text-surface-900 dark:hover:text-surface-100">
              <input
                type="checkbox"
                checked={filters.hideOutOfStock}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, hideOutOfStock: e.target.checked }))
                }
                className="h-3.5 w-3.5 rounded border-surface-300 text-primary-500 focus:ring-primary-500/40 dark:border-surface-500 dark:bg-surface-700"
              />
              <span>Hide out of stock</span>
            </label>

            {/* Price range */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-surface-500 dark:text-surface-400">
                Price Range
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.priceMin ?? ''}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      priceMin: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="w-full rounded-md border border-surface-300 bg-white px-2 py-1.5 text-sm text-surface-900 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
                />
                <span className="text-surface-400">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.priceMax ?? ''}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      priceMax: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="w-full rounded-md border border-surface-300 bg-white px-2 py-1.5 text-sm text-surface-900 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
                />
              </div>
            </div>

            {/* PPI range (only for categories with PPI) */}
            {category.has_ppi && (
              <div className="mt-4 space-y-2">
                <label className="block text-xs font-medium text-surface-500 dark:text-surface-400">
                  PPI Score Range
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={filters.ppiMin ?? ''}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        ppiMin: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    className="w-full rounded-md border border-surface-300 bg-white px-2 py-1.5 text-sm text-surface-900 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
                  />
                  <span className="text-surface-400">-</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={filters.ppiMax ?? ''}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        ppiMax: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    className="w-full rounded-md border border-surface-300 bg-white px-2 py-1.5 text-sm text-surface-900 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
                  />
                </div>
              </div>
            )}

            {/* Retailer filter */}
            {retailers.length > 0 && (
              <div className="mt-4 space-y-2">
                <label className="block text-xs font-medium text-surface-500 dark:text-surface-400">
                  Retailer
                  {filters.retailers.length > 0 && (
                    <span className="ml-1.5 text-primary-400">({filters.retailers.length})</span>
                  )}
                </label>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {retailers.map((retailer) => (
                    <label
                      key={retailer.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700"
                    >
                      <input
                        type="checkbox"
                        checked={filters.retailers.includes(retailer.id)}
                        onChange={() => {
                          const next = filters.retailers.includes(retailer.id)
                            ? filters.retailers.filter((r) => r !== retailer.id)
                            : [...filters.retailers, retailer.id];
                          setFilters((prev) => ({ ...prev, retailers: next }));
                        }}
                        className="h-3.5 w-3.5 rounded border-surface-300 text-primary-500 focus:ring-primary-500/40 dark:border-surface-500 dark:bg-surface-700"
                      />
                      <span className="truncate">{retailer.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Clear filters */}
            <button
              type="button"
              onClick={() =>
                setFilters({
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
                })
              }
              className="mt-4 w-full rounded-md border border-surface-300 bg-white px-3 py-1.5 text-xs font-medium text-surface-600 transition-colors hover:bg-surface-100 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-400 dark:hover:bg-surface-700"
            >
              Clear Filters
            </button>
          </div>
        </aside>

        {/* Product grid */}
        <div className="flex-1">
          {/* Results count */}
          <div className="mb-4 text-sm text-surface-500 dark:text-surface-400">
            {loading && products.length === 0
              ? 'Loading...'
              : `${total} ${total === 1 ? 'product' : 'products'} found`}
          </div>

          {error && (
            <div className="rounded-lg border border-ppi-poor/30 bg-ppi-poor/5 px-4 py-3 text-sm text-ppi-poor">
              {error}
            </div>
          )}

          {/* Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} showPPI={category.has_ppi} />
            ))}
          </div>

          {/* Empty state */}
          {!loading && products.length === 0 && !error && (
            <div className="py-16 text-center">
              <p className="text-surface-500 dark:text-surface-400">
                No products match your filters.
              </p>
            </div>
          )}

          {/* Load more */}
          {hasMore && products.length > 0 && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loading}
                className="rounded-lg border border-surface-300 bg-white px-6 py-2 text-sm font-medium text-surface-700 transition-colors hover:bg-surface-100 disabled:opacity-50 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700"
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----- ProductCard (local component) ----- */

function ProductCard({ product, showPPI }: { product: Product; showPPI: boolean }) {
  return (
    <Link
      to={`/product/${product.id}`}
      className="group flex flex-col rounded-xl border border-surface-200 bg-white p-4 shadow-sm transition-all hover:border-primary-400 hover:shadow-md dark:border-surface-700 dark:bg-surface-900 dark:hover:border-primary-500"
    >
      {/* Image placeholder */}
      {product.image_url ? (
        <div className="mb-3 flex h-32 items-center justify-center overflow-hidden rounded-lg bg-surface-100 dark:bg-surface-800">
          <img
            src={product.image_url}
            alt={product.name}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      ) : (
        <div className="mb-3 flex h-32 items-center justify-center rounded-lg bg-surface-100 dark:bg-surface-800">
          <span className="text-3xl text-surface-300 dark:text-surface-600" aria-hidden="true">
            ?
          </span>
        </div>
      )}

      {/* Brand */}
      {product.brand && (
        <span className="text-xs font-medium uppercase tracking-wide text-surface-500 dark:text-surface-400">
          {product.brand}
        </span>
      )}

      {/* Name */}
      <h3 className="mt-1 text-sm font-semibold text-surface-900 group-hover:text-primary-600 dark:text-surface-100 dark:group-hover:text-primary-400 line-clamp-2">
        {product.name}
      </h3>

      {/* PPI + Price row */}
      <div className="mt-auto flex items-center justify-between pt-3">
        <div>{showPPI && <PPIBadge score={product.ppi_score} size="sm" />}</div>
        <PriceDisplay price={product.price} affiliateUrl={product.affiliate_url} inStock={product.in_stock} />
      </div>
    </Link>
  );
}
