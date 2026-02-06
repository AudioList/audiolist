import { useState } from 'react';
import type { ProductFilters, CategoryId } from '../../types';

interface FilterSidebarProps {
  filters: ProductFilters;
  onChange: (filters: ProductFilters) => void;
  category: CategoryId;
  brands: string[];
}

const BRAND_LIMIT = 20;

function hasPPI(category: CategoryId): boolean {
  return category === 'iem' || category === 'headphone';
}

export default function FilterSidebar({
  filters,
  onChange,
  category,
  brands,
}: FilterSidebarProps) {
  const [expanded, setExpanded] = useState(false);
  const [showAllBrands, setShowAllBrands] = useState(false);

  const showPPI = hasPPI(category);
  const visibleBrands = showAllBrands ? brands : brands.slice(0, BRAND_LIMIT);

  function update(partial: Partial<ProductFilters>) {
    onChange({ ...filters, ...partial });
  }

  function clearFilters() {
    onChange({
      search: filters.search,
      brands: [],
      priceMin: null,
      priceMax: null,
      ppiMin: null,
      ppiMax: null,
      quality: null,
      rigType: null,
    });
  }

  function toggleBrand(brand: string) {
    const next = filters.brands.includes(brand)
      ? filters.brands.filter((b) => b !== brand)
      : [...filters.brands, brand];
    update({ brands: next });
  }

  const hasActiveFilters =
    filters.brands.length > 0 ||
    filters.priceMin !== null ||
    filters.priceMax !== null ||
    filters.ppiMin !== null ||
    filters.ppiMax !== null ||
    filters.quality !== null ||
    filters.rigType !== null;

  const content = (
    <div className="space-y-5">
      {/* Price Range */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-400">
          Price Range
        </h4>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min"
            value={filters.priceMin ?? ''}
            onChange={(e) =>
              update({ priceMin: e.target.value ? Number(e.target.value) : null })
            }
            min={0}
            className="w-full rounded-md border border-surface-600 bg-surface-800 px-2 py-1.5 text-sm text-surface-100 placeholder-surface-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/40 dark:border-surface-600 dark:bg-surface-800"
          />
          <span className="text-surface-500 text-sm">-</span>
          <input
            type="number"
            placeholder="Max"
            value={filters.priceMax ?? ''}
            onChange={(e) =>
              update({ priceMax: e.target.value ? Number(e.target.value) : null })
            }
            min={0}
            className="w-full rounded-md border border-surface-600 bg-surface-800 px-2 py-1.5 text-sm text-surface-100 placeholder-surface-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/40 dark:border-surface-600 dark:bg-surface-800"
          />
        </div>
      </div>

      {/* PPI Range */}
      {showPPI && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-400">
            PPI Range
          </h4>
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="Min"
              value={filters.ppiMin ?? ''}
              onChange={(e) =>
                update({ ppiMin: e.target.value ? Number(e.target.value) : null })
              }
              min={0}
              max={100}
              className="w-full rounded-md border border-surface-600 bg-surface-800 px-2 py-1.5 text-sm text-surface-100 placeholder-surface-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/40 dark:border-surface-600 dark:bg-surface-800"
            />
            <span className="text-surface-500 text-sm">-</span>
            <input
              type="number"
              placeholder="Max"
              value={filters.ppiMax ?? ''}
              onChange={(e) =>
                update({ ppiMax: e.target.value ? Number(e.target.value) : null })
              }
              min={0}
              max={100}
              className="w-full rounded-md border border-surface-600 bg-surface-800 px-2 py-1.5 text-sm text-surface-100 placeholder-surface-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/40 dark:border-surface-600 dark:bg-surface-800"
            />
          </div>
        </div>
      )}

      {/* Quality */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-400">
          Quality
        </h4>
        <select
          value={filters.quality ?? ''}
          onChange={(e) => update({ quality: e.target.value || null })}
          className="w-full rounded-md border border-surface-600 bg-surface-800 px-2 py-1.5 text-sm text-surface-100 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/40 dark:border-surface-600 dark:bg-surface-800"
        >
          <option value="">All</option>
          <option value="high">High</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Rig Type */}
      {showPPI && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-400">
            Rig Type
          </h4>
          <select
            value={filters.rigType ?? ''}
            onChange={(e) => update({ rigType: e.target.value || null })}
            className="w-full rounded-md border border-surface-600 bg-surface-800 px-2 py-1.5 text-sm text-surface-100 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/40 dark:border-surface-600 dark:bg-surface-800"
          >
            <option value="">All</option>
            <option value="711">711</option>
            <option value="5128">5128</option>
          </select>
        </div>
      )}

      {/* Brand */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-400">
          Brand
          {filters.brands.length > 0 && (
            <span className="ml-1.5 text-primary-400">({filters.brands.length})</span>
          )}
        </h4>
        <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
          {visibleBrands.map((brand) => (
            <label
              key={brand}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-surface-200 hover:bg-surface-700"
            >
              <input
                type="checkbox"
                checked={filters.brands.includes(brand)}
                onChange={() => toggleBrand(brand)}
                className="h-3.5 w-3.5 rounded border-surface-500 bg-surface-700 text-primary-500 focus:ring-primary-500/40 focus:ring-offset-0"
              />
              <span className="truncate">{brand}</span>
            </label>
          ))}
          {brands.length === 0 && (
            <p className="text-xs text-surface-500 italic">No brands available</p>
          )}
        </div>
        {brands.length > BRAND_LIMIT && (
          <button
            type="button"
            onClick={() => setShowAllBrands(!showAllBrands)}
            className="mt-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors"
          >
            {showAllBrands ? 'Show less' : `Show all (${brands.length})`}
          </button>
        )}
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="w-full rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-surface-300 transition-colors hover:bg-surface-700 hover:text-surface-100"
        >
          Clear Filters
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 md:block">{content}</aside>

      {/* Mobile collapsible */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm font-medium text-surface-200 transition-colors hover:bg-surface-700"
        >
          <span className="flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 0 1 .628.74v2.288a2.25 2.25 0 0 1-.659 1.59l-4.682 4.683a2.25 2.25 0 0 0-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 0 1 8 18.25v-5.757a2.25 2.25 0 0 0-.659-1.591L2.659 6.22A2.25 2.25 0 0 1 2 4.629V2.34a.75.75 0 0 1 .628-.74Z"
                clipRule="evenodd"
              />
            </svg>
            Filters
            {hasActiveFilters && (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-xs text-white">
                !
              </span>
            )}
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        {expanded && <div className="mt-3 rounded-lg border border-surface-700 bg-surface-850 p-3">{content}</div>}
      </div>
    </>
  );
}
