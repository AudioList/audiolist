import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { CategoryId, ProductFilters, ProductSort, Product } from '../types';
import { CATEGORIES, CATEGORY_MAP, getScoreBandOptions, getScoreLabel, isSpinormaCategory, isSinadCategory, scoreToSinad, sinadToScore } from '../lib/categories';
import { useExperienceMode } from '../context/ExperienceModeContext';
import { useGlassMode } from '../context/GlassModeContext';
import { useProducts, useFilterOptions } from '../hooks/useProducts';
import SearchBar from '../components/products/SearchBar';
import SortControls from '../components/products/SortControls';
import PPIBadge from '../components/shared/PPIBadge';
import PriceDisplay from '../components/shared/PriceDisplay';
import BestValueBadge from '../components/shared/BestValueBadge';
import { getDisplayName, getBestModeLabel } from '../lib/productUtils';

const DEFAULT_CATEGORY: CategoryId = 'iem';

const SESSION_KEY = 'audiolist_product_list_state';
const SCORE_BANDS = getScoreBandOptions();

function getBandFromThreshold(
  minValue: number | null,
  maxValue: number | null,
  toThreshold: (bandMin: number) => number = (bandMin) => bandMin,
): string | null {
  if (minValue === null || maxValue !== null) return null;
  for (const band of SCORE_BANDS) {
    const threshold = toThreshold(band.min);
    if (Math.abs(minValue - threshold) < 0.2) {
      return band.band;
    }
  }
  return null;
}

function getSinadThresholdForBand(bandMin: number): number {
  return Number(scoreToSinad(bandMin).toFixed(1));
}

function getDefaultFilters(): ProductFilters {
  return {
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
    headphoneDesigns: [],
    headphoneTypes: [],
    iemTypes: [],
    driverTypes: [],
    micConnections: [],
    micTypes: [],
    micPatterns: [],
  };
}

function getDefaultSort(catId: CategoryId): ProductSort {
  const cat = CATEGORY_MAP.get(catId);
  return {
    field: cat?.has_ppi ? 'ppi_score' : isSinadCategory(catId) ? 'sinad_db' : 'price',
    direction: 'desc',
  };
}

/** Save filters/sort/scroll for a category so they survive navigation to product detail. */
function saveListState(catId: CategoryId, filters: ProductFilters, sort: ProductSort, scrollY: number) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ catId, filters, sort, scrollY }));
  } catch { /* quota exceeded or private mode -- ignore */ }
}

/** Restore saved state, only if it matches the current category. */
function loadListState(catId: CategoryId): { filters: ProductFilters; sort: ProductSort; scrollY: number } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (state.catId !== catId) return null;
    // Merge with defaults so newly-added filter fields don't crash the page
    if (state.filters) {
      state.filters = { ...getDefaultFilters(), ...state.filters };
    }
    return state;
  } catch { /* corrupt JSON -- ignore */ }
  return null;
}

function clearListState() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

export default function ProductListPage() {
  const { category: categoryParam } = useParams<{ category: string }>();
  const navigate = useNavigate();
  const { mode } = useExperienceMode();

  const isGlass = useGlassMode();

  const categoryId = (
    CATEGORY_MAP.has(categoryParam as CategoryId)
      ? categoryParam
      : DEFAULT_CATEGORY
  ) as CategoryId;

  const category = CATEGORY_MAP.get(categoryId)!;

  // On mount, try to restore saved state for this category
  const initialState = loadListState(categoryId);

  const [filters, setFilters] = useState<ProductFilters>(
    initialState?.filters ?? getDefaultFilters(),
  );

  const [sort, setSort] = useState<ProductSort>(
    initialState?.sort ?? getDefaultSort(categoryId),
  );
  const [brandSearch, setBrandSearch] = useState('');

  // Restore scroll position after products render
  const pendingScrollY = useRef(initialState?.scrollY ?? 0);

  // Track previous categoryId to detect actual category changes vs. remounts
  const prevCategoryId = useRef(categoryId);

  // Reset filters, sort, and brand search when categoryId actually changes
  // (user clicked a different category tab, NOT when returning from product detail)
  useEffect(() => {
    if (prevCategoryId.current !== categoryId) {
      prevCategoryId.current = categoryId;
      clearListState();
      pendingScrollY.current = 0;
      const timer = window.setTimeout(() => {
        setFilters(getDefaultFilters());
        setBrandSearch('');
        setSort(getDefaultSort(categoryId));
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [categoryId]);

  // Persist filters/sort to sessionStorage so they survive product detail navigation
  useEffect(() => {
    saveListState(categoryId, filters, sort, window.scrollY);
  }, [categoryId, filters, sort]);

  // Also save scroll position on scroll (debounced via the beforeunload-style approach)
  useEffect(() => {
    const handleScroll = () => {
      saveListState(categoryId, filters, sort, window.scrollY);
    };
    // Save on any navigation away (link click triggers this component unmounting)
    return () => {
      handleScroll();
    };
  }, [categoryId, filters, sort]);

  const hookOptions = useMemo(
    () => ({ category: categoryId, filters, sort }),
    [categoryId, filters, sort],
  );

  const { products, loading, error, hasMore, total, loadMore } = useProducts(hookOptions);
  const { brands, retailers, speakerTypes, headphoneDesigns, headphoneTypes, iemTypes, driverTypes, micConnections, micTypes, micPatterns } = useFilterOptions(categoryId);

  // Restore scroll position after products load (only once, on initial mount)
  const scrollRestored = useRef(false);
  useEffect(() => {
    if (!scrollRestored.current && !loading && products.length > 0 && pendingScrollY.current > 0) {
      scrollRestored.current = true;
      // Use rAF to ensure DOM has rendered before scrolling
      requestAnimationFrame(() => {
        window.scrollTo(0, pendingScrollY.current);
      });
    }
  }, [loading, products.length]);

  const visibleBrands = brandSearch
    ? brands.filter((b) => b.toLowerCase().includes(brandSearch.toLowerCase()))
    : brands;

  const activePpiBand = useMemo(
    () => getBandFromThreshold(filters.ppiMin, filters.ppiMax),
    [filters.ppiMin, filters.ppiMax],
  );

  const activeSinadBand = useMemo(
    () => getBandFromThreshold(filters.sinadMin, filters.sinadMax, getSinadThresholdForBand),
    [filters.sinadMin, filters.sinadMax],
  );

  function handleCategoryChange(id: CategoryId) {
    // Navigate only -- the categoryId useEffect handles filter/sort reset
    navigate(`/products/${id}`);
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
                ? (isGlass ? 'bg-primary-500/90 shadow-lg shadow-primary-500/25 backdrop-blur-sm text-white' : 'bg-primary-600 text-white shadow-md ring-2 ring-primary-400/30')
                : (isGlass ? 'bg-white/50 hover:bg-white/70 text-surface-700 dark:bg-white/[0.05] dark:text-surface-200 dark:hover:bg-white/[0.1]' : 'bg-surface-100 text-surface-700 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-200 dark:hover:bg-surface-700')
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
        <SortControls sort={sort} onChange={setSort} showPPI={category.has_ppi} showSinad={isSinadCategory(categoryId)} scoreLabel={getScoreLabel(categoryId, mode)} />
      </div>

      {/* Filter sidebar + grid layout */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Filter sidebar */}
        <aside className="w-full shrink-0 lg:w-56">
          <div className={isGlass ? 'glass-1 rounded-2xl p-4' : 'rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-900'}>
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

            {/* Headphone Design (only for headphone/IEM categories) */}
            {headphoneDesigns.length > 0 && (
              <div className="mb-3 space-y-2">
                <label className="block text-xs font-semibold text-surface-700 dark:text-surface-300">
                  Design
                  {filters.headphoneDesigns.length > 0 && (
                    <span className="ml-1.5 text-primary-400">({filters.headphoneDesigns.length})</span>
                  )}
                </label>
                <div className="space-y-1">
                  {headphoneDesigns.map((hd) => (
                    <label
                      key={hd.value}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700"
                    >
                      <input
                        type="checkbox"
                        checked={filters.headphoneDesigns.includes(hd.value)}
                        onChange={() => {
                          const next = filters.headphoneDesigns.includes(hd.value)
                            ? filters.headphoneDesigns.filter((d) => d !== hd.value)
                            : [...filters.headphoneDesigns, hd.value];
                          setFilters((prev) => ({ ...prev, headphoneDesigns: next }));
                        }}
                        className="h-3.5 w-3.5 rounded border-surface-300 text-primary-500 focus:ring-primary-500/40 dark:border-surface-500 dark:bg-surface-700"
                      />
                      <span className="truncate">{hd.label}</span>
                      <span className="ml-auto text-xs text-surface-400">{hd.count}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Headphone Type (only for headphone category) */}
            {categoryId === 'headphone' && headphoneTypes.length > 0 && (
              <div className="mb-3 space-y-2">
                <label className="block text-xs font-semibold text-surface-700 dark:text-surface-300">
                  Headphone Type
                  {filters.headphoneTypes.length > 0 && (
                    <span className="ml-1.5 text-primary-400">({filters.headphoneTypes.length})</span>
                  )}
                </label>
                <div className="space-y-1">
                  {headphoneTypes.map((ht) => (
                    <label
                      key={ht.value}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700"
                    >
                      <input
                        type="checkbox"
                        checked={filters.headphoneTypes.includes(ht.value)}
                        onChange={() => {
                          const next = filters.headphoneTypes.includes(ht.value)
                            ? filters.headphoneTypes.filter((t) => t !== ht.value)
                            : [...filters.headphoneTypes, ht.value];
                          setFilters((prev) => ({ ...prev, headphoneTypes: next }));
                        }}
                        className="h-3.5 w-3.5 rounded border-surface-300 text-primary-500 focus:ring-primary-500/40 dark:border-surface-500 dark:bg-surface-700"
                      />
                      <span className="truncate">{ht.label}</span>
                      <span className="ml-auto text-xs text-surface-400">{ht.count}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* IEM Type (only for IEM category) */}
            {iemTypes.length > 0 && (
              <div className="mb-3 space-y-2">
                <label className="block text-xs font-semibold text-surface-700 dark:text-surface-300">
                  IEM Type
                  {filters.iemTypes.length > 0 && (
                    <span className="ml-1.5 text-primary-400">({filters.iemTypes.length})</span>
                  )}
                </label>
                <div className="space-y-1">
                  {iemTypes.map((it) => (
                    <label
                      key={it.value}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700"
                    >
                      <input
                        type="checkbox"
                        checked={filters.iemTypes.includes(it.value)}
                        onChange={() => {
                          const next = filters.iemTypes.includes(it.value)
                            ? filters.iemTypes.filter((t) => t !== it.value)
                            : [...filters.iemTypes, it.value];
                          setFilters((prev) => ({ ...prev, iemTypes: next }));
                        }}
                        className="h-3.5 w-3.5 rounded border-surface-300 text-primary-500 focus:ring-primary-500/40 dark:border-surface-500 dark:bg-surface-700"
                      />
                      <span className="truncate">{it.label}</span>
                      <span className="ml-auto text-xs text-surface-400">{it.count}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Driver Type (IEM and headphone categories) */}
            {driverTypes.length > 0 && (
              <div className="mb-3 space-y-2">
                <label className="block text-xs font-semibold text-surface-700 dark:text-surface-300">
                  Driver Type
                  {filters.driverTypes.length > 0 && (
                    <span className="ml-1.5 text-primary-400">({filters.driverTypes.length})</span>
                  )}
                </label>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {driverTypes.map((dt) => (
                    <label
                      key={dt.value}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700"
                    >
                      <input
                        type="checkbox"
                        checked={filters.driverTypes.includes(dt.value)}
                        onChange={() => {
                          const next = filters.driverTypes.includes(dt.value)
                            ? filters.driverTypes.filter((t) => t !== dt.value)
                            : [...filters.driverTypes, dt.value];
                          setFilters((prev) => ({ ...prev, driverTypes: next }));
                        }}
                        className="h-3.5 w-3.5 rounded border-surface-300 text-primary-500 focus:ring-primary-500/40 dark:border-surface-500 dark:bg-surface-700"
                      />
                      <span className="truncate">{dt.label}</span>
                      <span className="ml-auto text-xs text-surface-400">{dt.count}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Mic Connection (only for microphone category) */}
            {categoryId === 'microphone' && micConnections.length > 0 && (
              <div className="mb-3 space-y-2">
                <label className="block text-xs font-semibold text-surface-700 dark:text-surface-300">
                  Connection
                  {filters.micConnections.length > 0 && (
                    <span className="ml-1.5 text-primary-400">({filters.micConnections.length})</span>
                  )}
                </label>
                <div className="space-y-1">
                  {micConnections.map((mc) => (
                    <label
                      key={mc.value}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700"
                    >
                      <input
                        type="checkbox"
                        checked={filters.micConnections.includes(mc.value)}
                        onChange={() => {
                          const next = filters.micConnections.includes(mc.value)
                            ? filters.micConnections.filter((t) => t !== mc.value)
                            : [...filters.micConnections, mc.value];
                          setFilters((prev) => ({ ...prev, micConnections: next }));
                        }}
                        className="h-3.5 w-3.5 rounded border-surface-300 text-primary-500 focus:ring-primary-500/40 dark:border-surface-500 dark:bg-surface-700"
                      />
                      <span className="truncate">{mc.label}</span>
                      <span className="ml-auto text-xs text-surface-400">{mc.count}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Mic Type / Transducer (only for microphone category) */}
            {categoryId === 'microphone' && micTypes.length > 0 && (
              <div className="mb-3 space-y-2">
                <label className="block text-xs font-semibold text-surface-700 dark:text-surface-300">
                  Transducer
                  {filters.micTypes.length > 0 && (
                    <span className="ml-1.5 text-primary-400">({filters.micTypes.length})</span>
                  )}
                </label>
                <div className="space-y-1">
                  {micTypes.map((mt) => (
                    <label
                      key={mt.value}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700"
                    >
                      <input
                        type="checkbox"
                        checked={filters.micTypes.includes(mt.value)}
                        onChange={() => {
                          const next = filters.micTypes.includes(mt.value)
                            ? filters.micTypes.filter((t) => t !== mt.value)
                            : [...filters.micTypes, mt.value];
                          setFilters((prev) => ({ ...prev, micTypes: next }));
                        }}
                        className="h-3.5 w-3.5 rounded border-surface-300 text-primary-500 focus:ring-primary-500/40 dark:border-surface-500 dark:bg-surface-700"
                      />
                      <span className="truncate">{mt.label}</span>
                      <span className="ml-auto text-xs text-surface-400">{mt.count}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Mic Polar Pattern (only for microphone category) */}
            {categoryId === 'microphone' && micPatterns.length > 0 && (
              <div className="mb-3 space-y-2">
                <label className="block text-xs font-semibold text-surface-700 dark:text-surface-300">
                  Polar Pattern
                  {filters.micPatterns.length > 0 && (
                    <span className="ml-1.5 text-primary-400">({filters.micPatterns.length})</span>
                  )}
                </label>
                <div className="space-y-1">
                  {micPatterns.map((mp) => (
                    <label
                      key={mp.value}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700"
                    >
                      <input
                        type="checkbox"
                        checked={filters.micPatterns.includes(mp.value)}
                        onChange={() => {
                          const next = filters.micPatterns.includes(mp.value)
                            ? filters.micPatterns.filter((t) => t !== mp.value)
                            : [...filters.micPatterns, mp.value];
                          setFilters((prev) => ({ ...prev, micPatterns: next }));
                        }}
                        className="h-3.5 w-3.5 rounded border-surface-300 text-primary-500 focus:ring-primary-500/40 dark:border-surface-500 dark:bg-surface-700"
                      />
                      <span className="truncate">{mp.label}</span>
                      <span className="ml-auto text-xs text-surface-400">{mp.count}</span>
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

            {/* Score band (only for categories with score-based ranking) */}
            {category.has_ppi && (
              <div className="mt-4 space-y-2">
                <label className="block text-xs font-semibold text-surface-700 dark:text-surface-300">
                  {getScoreLabel(categoryId, mode)} Band
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFilters((prev) => ({ ...prev, ppiMin: null, ppiMax: null }))}
                    className={`rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${
                      activePpiBand === null
                        ? 'border-primary-500 bg-primary-500 text-white'
                        : 'border-surface-300 bg-white text-surface-700 hover:bg-surface-100 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700'
                    }`}
                  >
                    Any
                  </button>
                  {SCORE_BANDS.map((band) => {
                    const selected = activePpiBand === band.band;
                    return (
                      <button
                        key={band.band}
                        type="button"
                        onClick={() =>
                          setFilters((prev) =>
                            selected
                              ? { ...prev, ppiMin: null, ppiMax: null }
                              : { ...prev, ppiMin: band.min, ppiMax: null }
                          )
                        }
                        className={`rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${
                          selected
                            ? 'border-primary-500 bg-primary-500 text-white'
                            : 'border-surface-300 bg-white text-surface-700 hover:bg-surface-100 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700'
                        }`}
                      >
                        {band.band}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-surface-500 dark:text-surface-400">Shows this band and higher.</p>
              </div>
            )}

            {/* SINAD band (DAC/Amp only; stored as numeric dB in filters) */}
            {isSinadCategory(categoryId) && (
              <div className="mt-4 space-y-2">
                <label className="block text-xs font-semibold text-surface-700 dark:text-surface-300">
                  {mode === 'beginner' ? 'Score' : 'SINAD'} Band
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFilters((prev) => ({ ...prev, sinadMin: null, sinadMax: null }))}
                    className={`rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${
                      activeSinadBand === null
                        ? 'border-primary-500 bg-primary-500 text-white'
                        : 'border-surface-300 bg-white text-surface-700 hover:bg-surface-100 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700'
                    }`}
                  >
                    Any
                  </button>
                  {SCORE_BANDS.map((band) => {
                    const threshold = getSinadThresholdForBand(band.min);
                    const selected = activeSinadBand === band.band;
                    return (
                      <button
                        key={band.band}
                        type="button"
                        onClick={() =>
                          setFilters((prev) =>
                            selected
                              ? { ...prev, sinadMin: null, sinadMax: null }
                              : { ...prev, sinadMin: threshold, sinadMax: null }
                          )
                        }
                        className={`rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${
                          selected
                            ? 'border-primary-500 bg-primary-500 text-white'
                            : 'border-surface-300 bg-white text-surface-700 hover:bg-surface-100 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700'
                        }`}
                      >
                        {band.band}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-surface-500 dark:text-surface-400">Backend filter remains numeric dB; bands are a UI shortcut.</p>
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
                  headphoneDesigns: [],
                  headphoneTypes: [],
                  iemTypes: [],
                  driverTypes: [],
                  micConnections: [],
                  micTypes: [],
                  micPatterns: [],
                })
              }
              className={isGlass ? 'glass-btn-secondary mt-4 w-full rounded-md px-3 py-1.5 text-xs font-medium' : 'mt-4 w-full rounded-md border border-surface-300 bg-white px-3 py-1.5 text-xs font-medium text-surface-600 transition-colors hover:bg-surface-100 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-400 dark:hover:bg-surface-700'}
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
              <button
                type="button"
                onClick={() => setFilters(getDefaultFilters())}
                className={isGlass ? 'glass-btn-primary mt-4 rounded-lg px-5 py-2 text-sm font-semibold' : 'mt-4 rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-500'}
              >
                Clear All Filters
              </button>
            </div>
          )}

          {/* Load more */}
          {hasMore && products.length > 0 && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loading}
                className={isGlass ? 'glass-btn-secondary rounded-lg px-6 py-2 text-sm font-medium disabled:opacity-50' : 'rounded-lg border border-surface-300 bg-white px-6 py-2 text-sm font-medium text-surface-700 transition-colors hover:bg-surface-100 disabled:opacity-50 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700'}
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
  const { mode } = useExperienceMode();
  const isGlass = useGlassMode();

  return (
    <Link
      to={`/product/${product.id}`}
      className={isGlass ? 'group flex flex-col glass-1 glass-inner-glow glass-hover-lift rounded-2xl p-4 transition-all hover:border-primary-400/50' : 'group flex flex-col rounded-xl border border-surface-200 bg-white p-4 shadow-sm transition-all hover:border-primary-400 hover:shadow-md dark:border-surface-700 dark:bg-surface-900 dark:hover:border-primary-500'}
    >
      {/* Image placeholder */}
      {product.image_url ? (
        <div className="mb-3 flex h-32 items-center justify-center overflow-hidden rounded-lg bg-surface-100 dark:bg-surface-800">
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="max-h-full max-w-full object-contain"
          />
        </div>
      ) : (
        <div className={isGlass ? 'mb-3 flex h-32 items-center justify-center bg-white/30 rounded-xl' : 'mb-3 flex h-32 items-center justify-center rounded-lg bg-surface-100 dark:bg-surface-800'}>
          <span className="text-3xl text-surface-300 dark:text-surface-600" aria-hidden="true">
            ?
          </span>
        </div>
      )}

      {/* Brand */}
      {product.brand && (
        <span className="text-xs font-semibold uppercase tracking-wide text-surface-600 dark:text-surface-300">
          {product.brand}
          {mode === 'advanced' && product.source_domain && (
            <span className="ml-1.5 font-normal normal-case text-surface-400">({product.source_domain})</span>
          )}
        </span>
      )}

      {/* Name + badges */}
      <div className="mt-1 flex items-start gap-1.5">
        <h3 className="text-base font-bold text-surface-900 group-hover:text-primary-600 dark:text-surface-100 dark:group-hover:text-primary-400 line-clamp-2">
          {getDisplayName(product)}
        </h3>
        {product.iem_type === 'tws' && (
          <span className="mt-0.5 inline-flex shrink-0 items-center rounded-full bg-cyan-100 px-1.5 py-0.5 text-[0.625rem] font-bold text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
            TWS
          </span>
        )}
        {getBestModeLabel(product) && (
          <span className="mt-0.5 inline-flex shrink-0 items-center rounded-full bg-green-100 px-1.5 py-0.5 text-[0.625rem] font-bold text-green-700 dark:bg-green-900/30 dark:text-green-300">
            {getBestModeLabel(product)}
          </span>
        )}
      </div>

      {/* Score + Price row */}
      <div className="mt-auto flex items-center justify-between pt-3">
        <div>
          {showPPI && <PPIBadge score={product.ppi_score} size="sm" label={mode === 'beginner' ? 'Score' : (isSpinormaCategory(product.category_id) ? 'Spinorama' : undefined)} />}
          {showSinad && product.sinad_db !== null && (
            <span className="inline-flex items-center gap-1.5">
              <PPIBadge score={sinadToScore(product.sinad_db)} size="sm" label={mode === 'beginner' ? 'Score' : 'SINAD'} />
              {mode !== 'beginner' && (
                <span className="text-xs font-medium text-surface-500 dark:text-surface-400">{product.sinad_db} dB</span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <PriceDisplay price={product.price} affiliateUrl={product.affiliate_url} inStock={product.in_stock} discontinued={product.discontinued} />
          <BestValueBadge
            score={showSinad && product.sinad_db !== null ? sinadToScore(product.sinad_db) : product.ppi_score}
            price={product.price}
          />
        </div>
      </div>
    </Link>
  );
}
