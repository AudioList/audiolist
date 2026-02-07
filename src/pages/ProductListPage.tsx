import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { CategoryId, ProductFilters, ProductSort, Product } from '../types';
import { CATEGORIES, CATEGORY_MAP, getScoreLabel, isSpinormaCategory, isSinadCategory, sinadToScore } from '../lib/categories';
import { useProducts, useProductBrands, useRetailers, useSpeakerTypes } from '../hooks/useProducts';
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
    speakerTypes: [],
    sinadMin: null,
    sinadMax: null,
  });

  const [sort, setSort] = useState<ProductSort>({
    field: category.has_ppi ? 'ppi_score' : isSinadCategory(categoryId) ? 'sinad_db' : 'price',
    direction: 'desc',
  });

  const hookOptions = useMemo(
    () => ({ category: categoryId, filters, sort }),
    [categoryId, filters, sort],
  );

  const { products, loading, error, hasMore, total, loadMore } = useProducts(hookOptions);
  const brands = useProductBrands(categoryId);
  const retailers = useRetailers(categoryId);
  const speakerTypes = useSpeakerTypes();
  const [brandSearch, setBrandSearch] = useState('');

  const visibleBrands = brandSearch
    ? brands.filter((b) => b.toLowerCase().includes(brandSearch.toLowerCase()))
    : brands;

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
      speakerTypes: [],
      sinadMin: null,
      sinadMax: null,
    });
    setBrandSearch('');
    const cat = CATEGORY_MAP.get(id);
    setSort({
      field: cat?.has_ppi ? 'ppi_score' : isSinadCategory(id) ? 'sinad_db' : 'price',
      direction: 'desc',
    });
  }

  return (
    <div className="space-y-6">
      {/* Category tabs */}
      <nav className="flex flex-wrap gap-2" role="tablist" aria-label="Product categories">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            role="tab"
            aria-selected={cat.id === categoryId}
            onClick={() => handleCategoryChange(cat.id)}
            title={cat.description}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              cat.id === categoryId
                ? 'bg-primary-600 text-white shadow-md ring-2 ring-primary-400/30'
                : 'bg-surface-100 text-surface-700 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-200 dark:hover:bg-surface-700'
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
        <SortControls sort={sort} onChange={setSort} showPPI={category.has_ppi} showSinad={isSinadCategory(categoryId)} scoreLabel={getScoreLabel(categoryId)} />
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

            {/* Speaker Type (only for speaker category) */}
            {categoryId === 'speaker' && speakerTypes.length > 0 && (
              <div className="mb-3 space-y-2">
                <label className="block text-xs font-semibold text-surface-700 dark:text-surface-300">
                  Speaker Type
                  {filters.speakerTypes.length > 0 && (
                    <span className="ml-1.5 text-primary-400">({filters.speakerTypes.length})</span>
                  )}
                </label>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {speakerTypes.map((st) => (
                    <label
                      key={st.value}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700"
                    >
                      <input
                        type="checkbox"
                        checked={filters.speakerTypes.includes(st.value)}
                        onChange={() => {
                          const next = filters.speakerTypes.includes(st.value)
                            ? filters.speakerTypes.filter((t) => t !== st.value)
                            : [...filters.speakerTypes, st.value];
                          setFilters((prev) => ({ ...prev, speakerTypes: next }));
                        }}
                        className="h-3.5 w-3.5 rounded border-surface-300 text-primary-500 focus:ring-primary-500/40 dark:border-surface-500 dark:bg-surface-700"
                      />
                      <span className="truncate">{st.label}</span>
                      <span className="ml-auto text-xs text-surface-400">{st.count}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Price range */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-surface-700 dark:text-surface-300">
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
                <label className="block text-xs font-semibold text-surface-700 dark:text-surface-300">
                  {getScoreLabel(categoryId)} Range
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

            {/* SINAD range (only for DAC/Amp categories) */}
            {isSinadCategory(categoryId) && (
              <div className="mt-4 space-y-2">
                <label className="block text-xs font-semibold text-surface-700 dark:text-surface-300">
                  SINAD Range (dB)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    value={filters.sinadMin ?? ''}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        sinadMin: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    className="w-full rounded-md border border-surface-300 bg-white px-2 py-1.5 text-sm text-surface-900 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
                  />
                  <span className="text-surface-400">-</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={filters.sinadMax ?? ''}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        sinadMax: e.target.value ? Number(e.target.value) : null,
                      }))
                    }
                    className="w-full rounded-md border border-surface-300 bg-white px-2 py-1.5 text-sm text-surface-900 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
                  />
                </div>
              </div>
            )}

            {/* Brand filter */}
            {brands.length > 0 && (
              <div className="mt-4 space-y-2">
                <label className="block text-xs font-semibold text-surface-700 dark:text-surface-300">
                  Brand
                  {filters.brands.length > 0 && (
                    <span className="ml-1.5 text-primary-400">({filters.brands.length})</span>
                  )}
                </label>
                {brands.length >= 10 && (
                  <input
                    type="text"
                    placeholder="Search brands..."
                    value={brandSearch}
                    onChange={(e) => setBrandSearch(e.target.value)}
                    className="w-full rounded-md border border-surface-300 bg-white px-2 py-1 text-sm text-surface-900 placeholder-surface-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/40 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100 dark:placeholder-surface-500"
                  />
                )}
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {visibleBrands.map((brand) => (
                    <label
                      key={brand}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700"
                    >
                      <input
                        type="checkbox"
                        checked={filters.brands.includes(brand)}
                        onChange={() => {
                          const next = filters.brands.includes(brand)
                            ? filters.brands.filter((b) => b !== brand)
                            : [...filters.brands, brand];
                          setFilters((prev) => ({ ...prev, brands: next }));
                        }}
                        className="h-3.5 w-3.5 rounded border-surface-300 text-primary-500 focus:ring-primary-500/40 dark:border-surface-500 dark:bg-surface-700"
                      />
                      <span className="truncate">{brand}</span>
                    </label>
                  ))}
                  {brands.length > 0 && visibleBrands.length === 0 && (
                    <p className="text-xs text-surface-400 italic">No matching brands</p>
                  )}
                </div>
              </div>
            )}

            {/* Retailer filter */}
            {retailers.length > 0 && (
              <div className="mt-4 space-y-2">
                <label className="block text-xs font-semibold text-surface-700 dark:text-surface-300">
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
                  speakerTypes: [],
                  sinadMin: null,
                  sinadMax: null,
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
          <div className="mb-4 text-sm font-medium text-surface-700 dark:text-surface-300">
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
              <ProductCard key={product.id} product={product} showPPI={category.has_ppi} showSinad={isSinadCategory(categoryId)} />
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

function ProductCard({ product, showPPI, showSinad = false }: { product: Product; showPPI: boolean; showSinad?: boolean }) {
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
        <span className="text-xs font-semibold uppercase tracking-wide text-surface-600 dark:text-surface-300">
          {product.brand}
        </span>
      )}

      {/* Name */}
      <h3 className="mt-1 text-base font-bold text-surface-900 group-hover:text-primary-600 dark:text-surface-100 dark:group-hover:text-primary-400 line-clamp-2">
        {product.name}
      </h3>

      {/* Score + Price row */}
      <div className="mt-auto flex items-center justify-between pt-3">
        <div>
          {showPPI && <PPIBadge score={product.ppi_score} size="sm" label={isSpinormaCategory(product.category_id) ? 'Spinorama' : undefined} />}
          {showSinad && product.sinad_db !== null && (
            <span className="inline-flex items-center gap-1.5">
              <PPIBadge score={sinadToScore(product.sinad_db)} size="sm" label="SINAD" />
              <span className="text-xs font-medium text-surface-500 dark:text-surface-400">{product.sinad_db} dB</span>
            </span>
          )}
        </div>
        <PriceDisplay price={product.price} affiliateUrl={product.affiliate_url} inStock={product.in_stock} />
      </div>
    </Link>
  );
}
