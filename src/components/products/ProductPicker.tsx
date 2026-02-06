import { useState, useEffect, useCallback, useRef } from 'react';
import type { CategoryId, ProductFilters, ProductSort, Product } from '../../types';
import { useProducts, useProductBrands, useRetailers } from '../../hooks/useProducts';
import { useBuild } from '../../context/BuildContext';
import { CATEGORY_MAP } from '../../lib/categories';
import SearchBar from './SearchBar';
import SortControls from './SortControls';
import FilterSidebar from './FilterSidebar';
import ProductCard from './ProductCard';

interface ProductPickerProps {
  categoryId: CategoryId;
  isOpen: boolean;
  onClose: () => void;
  onViewDetail?: (product: Product) => void;
}

const emptyFilters: ProductFilters = {
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
};

export default function ProductPicker({ categoryId, isOpen, onClose, onViewDetail }: ProductPickerProps) {
  const category = CATEGORY_MAP.get(categoryId);
  const showPPI = category?.has_ppi ?? false;

  const [filters, setFilters] = useState<ProductFilters>(emptyFilters);
  const [sort, setSort] = useState<ProductSort>({
    field: showPPI ? 'ppi_score' : 'price',
    direction: 'desc',
  });

  const { products, loading, error, hasMore, total, loadMore } = useProducts({
    category: categoryId,
    filters,
    sort,
  });

  const brands = useProductBrands(categoryId);
  const retailers = useRetailers();
  const { setProduct, getSelection } = useBuild();
  const currentSelection = getSelection(categoryId);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setFilters(emptyFilters);
      setSort({
        field: showPPI ? 'ppi_score' : 'price',
        direction: 'desc',
      });
    }
  }, [isOpen, showPPI]);

  // ESC key handler
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === backdropRef.current) {
        onClose();
      }
    },
    [onClose]
  );

  const handleSelect = useCallback(
    (product: Product) => {
      setProduct(categoryId, product);
      onClose();
    },
    [categoryId, setProduct, onClose]
  );

  function handleSearchChange(value: string) {
    setFilters((prev) => ({ ...prev, search: value }));
  }

  if (!isOpen) return null;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4 sm:p-6 md:p-8"
    >
      <div className="relative w-full max-w-5xl rounded-xl border border-surface-700 bg-surface-900 shadow-2xl dark:bg-surface-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-700 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-surface-100">
              {category?.name ?? 'Products'}
            </h2>
            <p className="text-sm text-surface-400">
              {total} product{total !== 1 ? 's' : ''} found
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-surface-400 transition-colors hover:bg-surface-700 hover:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            aria-label="Close picker"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Search + Sort row */}
        <div className="flex flex-col gap-3 border-b border-surface-700 px-5 py-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <SearchBar
              value={filters.search}
              onChange={handleSearchChange}
              placeholder={`Search ${category?.name ?? 'products'}...`}
            />
          </div>
          <SortControls sort={sort} onChange={setSort} showPPI={showPPI} />
        </div>

        {/* Body: sidebar + grid */}
        <div className="flex flex-col gap-4 p-5 md:flex-row">
          <FilterSidebar
            filters={filters}
            onChange={setFilters}
            category={categoryId}
            brands={brands}
            retailers={retailers}
          />

          <div className="min-w-0 flex-1">
            {/* Error state */}
            {error && (
              <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Product grid */}
            {products.length > 0 && (
              <div className="flex flex-col gap-2">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onSelect={handleSelect}
                    onViewDetail={onViewDetail}
                    isSelected={currentSelection?.product.id === product.id}
                    showPPI={showPPI}
                  />
                ))}
              </div>
            )}

            {/* Loading spinner */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <svg
                  className="h-6 w-6 animate-spin text-primary-500"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647Z"
                  />
                </svg>
              </div>
            )}

            {/* Empty state */}
            {!loading && products.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="mb-3 h-10 w-10 text-surface-600"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 14.59 5.28l4.69 4.69a.75.75 0 1 1-1.06 1.06l-4.69-4.69A8.25 8.25 0 0 1 2.25 10.5Z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-sm font-medium text-surface-300">No products found</p>
                <p className="mt-1 text-xs text-surface-500">
                  Try adjusting your search or filter criteria
                </p>
              </div>
            )}

            {/* Load More button */}
            {!loading && hasMore && products.length > 0 && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={loadMore}
                  className="rounded-lg border border-surface-600 bg-surface-800 px-5 py-2 text-sm font-medium text-surface-200 transition-colors hover:bg-surface-700 hover:text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                >
                  Load More
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
