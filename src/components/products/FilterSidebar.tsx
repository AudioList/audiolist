import { useState, useEffect } from 'react';
import type { ProductFilters, CategoryId } from '../../types';
import { isSpinormaCategory, isSinadCategory } from '../../lib/categories';
import { useExperienceMode } from '../../context/ExperienceModeContext';

interface FilterSidebarProps {
  filters: ProductFilters;
  onChange: (filters: ProductFilters) => void;
  category: CategoryId;
  brands: string[];
  retailers: { id: string; name: string }[];
  speakerTypes?: { value: string; label: string; count: number }[];
  headphoneDesigns?: { value: string; label: string; count: number }[];
  iemTypes?: { value: string; label: string; count: number }[];
}

const BRAND_SEARCH_MIN = 10; // Show search box when there are this many brands

function hasPPI(category: CategoryId): boolean {
  return category === 'iem' || category === 'headphone' || category === 'speaker';
}

export default function FilterSidebar({
  filters,
  onChange,
  category,
  brands,
  retailers,
  speakerTypes = [],
  headphoneDesigns = [],
  iemTypes = [],
}: FilterSidebarProps) {
  const { mode } = useExperienceMode();
  const [expanded, setExpanded] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  const [measurementOpen, setMeasurementOpen] = useState(mode === 'advanced');

  // Sync measurement section expand state when mode changes
  useEffect(() => {
    if (mode === 'advanced') setMeasurementOpen(true);
  }, [mode]);

  const showPPI = hasPPI(category);
  const visibleBrands = brandSearch
    ? brands.filter((b) => b.toLowerCase().includes(brandSearch.toLowerCase()))
    : brands;

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
      retailers: [],
      hideOutOfStock: false,
      speakerTypes: [],
      sinadMin: null,
      sinadMax: null,
      headphoneDesigns: [],
      iemTypes: [],
    });
  }

  function toggleBrand(brand: string) {
    const next = filters.brands.includes(brand)
      ? filters.brands.filter((b) => b !== brand)
      : [...filters.brands, brand];
    update({ brands: next });
  }

  function toggleRetailer(retailerId: string) {
    const next = filters.retailers.includes(retailerId)
      ? filters.retailers.filter((r) => r !== retailerId)
      : [...filters.retailers, retailerId];
    update({ retailers: next });
  }

  function toggleSpeakerType(type: string) {
    const next = filters.speakerTypes.includes(type)
      ? filters.speakerTypes.filter((t) => t !== type)
      : [...filters.speakerTypes, type];
    update({ speakerTypes: next });
  }

  function toggleHeadphoneDesign(design: string) {
    const next = filters.headphoneDesigns.includes(design)
      ? filters.headphoneDesigns.filter((d) => d !== design)
      : [...filters.headphoneDesigns, design];
    update({ headphoneDesigns: next });
  }

  function toggleIemType(type: string) {
    const next = filters.iemTypes.includes(type)
      ? filters.iemTypes.filter((t) => t !== type)
      : [...filters.iemTypes, type];
    update({ iemTypes: next });
  }

  const showSinad = isSinadCategory(category);

  const hasActiveFilters =
    filters.brands.length > 0 ||
    filters.retailers.length > 0 ||
    filters.speakerTypes.length > 0 ||
    filters.headphoneDesigns.length > 0 ||
    filters.iemTypes.length > 0 ||
    filters.priceMin !== null ||
    filters.priceMax !== null ||
    filters.ppiMin !== null ||
    filters.ppiMax !== null ||
    filters.sinadMin !== null ||
    filters.sinadMax !== null ||
    filters.quality !== null ||
    filters.rigType !== null ||
    filters.hideOutOfStock;

  const content = (
    <div className="space-y-5">
      {/* Hide out of stock */}
      <label className="flex cursor-pointer items-center gap-2 text-sm text-surface-200 hover:text-surface-100">
        <input
          type="checkbox"
          checked={filters.hideOutOfStock}
          onChange={(e) => update({ hideOutOfStock: e.target.checked })}
          className="h-3.5 w-3.5 rounded border-surface-500 bg-surface-700 text-primary-500 focus:ring-primary-500/40 focus:ring-offset-0"
        />
        <span>Hide out of stock</span>
      </label>

      {/* Speaker Type (speaker category only) */}
      {category === 'speaker' && speakerTypes.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-400">
            Speaker Type
            {filters.speakerTypes.length > 0 && (
              <span className="ml-1.5 text-primary-400">({filters.speakerTypes.length})</span>
            )}
          </h4>
          <div className="max-h-48 space-y-1 overflow-y-auto pr-1" role="group" aria-label="Filter by speaker type">
            {speakerTypes.map((st) => (
              <label
                key={st.value}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-surface-200 hover:bg-surface-700"
              >
                <input
                  type="checkbox"
                  checked={filters.speakerTypes.includes(st.value)}
                  onChange={() => toggleSpeakerType(st.value)}
                  className="h-3.5 w-3.5 rounded border-surface-500 bg-surface-700 text-primary-500 focus:ring-primary-500/40 focus:ring-offset-0"
                />
                <span className="truncate">{st.label}</span>
                <span className="ml-auto text-xs text-surface-500">{st.count}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Headphone Design (headphone/IEM only) */}
      {headphoneDesigns.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-400">
            Design
            {filters.headphoneDesigns.length > 0 && (
              <span className="ml-1.5 text-primary-400">({filters.headphoneDesigns.length})</span>
            )}
          </h4>
          <div className="space-y-1" role="group" aria-label="Filter by headphone design">
            {headphoneDesigns.map((hd) => (
              <label
                key={hd.value}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-surface-200 hover:bg-surface-700"
              >
                <input
                  type="checkbox"
                  checked={filters.headphoneDesigns.includes(hd.value)}
                  onChange={() => toggleHeadphoneDesign(hd.value)}
                  className="h-3.5 w-3.5 rounded border-surface-500 bg-surface-700 text-primary-500 focus:ring-primary-500/40 focus:ring-offset-0"
                />
                <span className="truncate">{hd.label}</span>
                <span className="ml-auto text-xs text-surface-500">{hd.count}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* IEM Type (IEM category only) */}
      {iemTypes.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-400">
            IEM Type
            {filters.iemTypes.length > 0 && (
              <span className="ml-1.5 text-primary-400">({filters.iemTypes.length})</span>
            )}
          </h4>
          <div className="space-y-1" role="group" aria-label="Filter by IEM type">
            {iemTypes.map((it) => (
              <label
                key={it.value}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-surface-200 hover:bg-surface-700"
              >
                <input
                  type="checkbox"
                  checked={filters.iemTypes.includes(it.value)}
                  onChange={() => toggleIemType(it.value)}
                  className="h-3.5 w-3.5 rounded border-surface-500 bg-surface-700 text-primary-500 focus:ring-primary-500/40 focus:ring-offset-0"
                />
                <span className="truncate">{it.label}</span>
                <span className="ml-auto text-xs text-surface-500">{it.count}</span>
              </label>
            ))}
          </div>
        </div>
      )}

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

      {/* Measurement Filters — collapsible, collapsed by default, hidden in beginner mode */}
      {mode !== 'beginner' && showPPI && (
        <div>
          <button
            type="button"
            onClick={() => setMeasurementOpen(!measurementOpen)}
            className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-surface-400 hover:text-surface-300 transition-colors"
          >
            <span>Measurement Filters</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`h-3.5 w-3.5 transition-transform ${measurementOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {measurementOpen && (
            <div className="mt-3 space-y-4">
              {/* Score Range */}
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-400">
                  {isSpinormaCategory(category) ? 'Spinorama Range' : 'PPI Range'}
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

              {/* Rig Type (IEM/headphone only) */}
              {!isSpinormaCategory(category) && (
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
            </div>
          )}
        </div>
      )}

      {/* SINAD Filter (DAC/Amp only, hidden in beginner mode) */}
      {mode !== 'beginner' && showSinad && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-400">
            SINAD Range (dB)
          </h4>
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="Min"
              value={filters.sinadMin ?? ''}
              onChange={(e) =>
                update({ sinadMin: e.target.value ? Number(e.target.value) : null })
              }
              min={0}
              className="w-full rounded-md border border-surface-600 bg-surface-800 px-2 py-1.5 text-sm text-surface-100 placeholder-surface-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/40 dark:border-surface-600 dark:bg-surface-800"
            />
            <span className="text-surface-500 text-sm">-</span>
            <input
              type="number"
              placeholder="Max"
              value={filters.sinadMax ?? ''}
              onChange={(e) =>
                update({ sinadMax: e.target.value ? Number(e.target.value) : null })
              }
              min={0}
              className="w-full rounded-md border border-surface-600 bg-surface-800 px-2 py-1.5 text-sm text-surface-100 placeholder-surface-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/40 dark:border-surface-600 dark:bg-surface-800"
            />
          </div>
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
        {brands.length >= BRAND_SEARCH_MIN && (
          <input
            type="text"
            placeholder="Search brands..."
            value={brandSearch}
            onChange={(e) => setBrandSearch(e.target.value)}
            className="mb-2 w-full rounded-md border border-surface-600 bg-surface-800 px-2 py-1 text-sm text-surface-100 placeholder-surface-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/40"
          />
        )}
        <div className="max-h-80 space-y-1 overflow-y-auto pr-1" role="group" aria-label="Filter by brand">
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
          {brands.length > 0 && visibleBrands.length === 0 && (
            <p className="text-xs text-surface-500 italic">No matching brands</p>
          )}
        </div>
      </div>

      {/* Retailer */}
      {retailers.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-400">
            Retailer
            {filters.retailers.length > 0 && (
              <span className="ml-1.5 text-primary-400">({filters.retailers.length})</span>
            )}
          </h4>
          <div className="max-h-60 space-y-1 overflow-y-auto pr-1" role="group" aria-label="Filter by retailer">
            {retailers.map((retailer) => (
              <label
                key={retailer.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-surface-200 hover:bg-surface-700"
              >
                <input
                  type="checkbox"
                  checked={filters.retailers.includes(retailer.id)}
                  onChange={() => toggleRetailer(retailer.id)}
                  className="h-3.5 w-3.5 rounded border-surface-500 bg-surface-700 text-primary-500 focus:ring-primary-500/40 focus:ring-offset-0"
                />
                <span className="truncate">{retailer.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

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
