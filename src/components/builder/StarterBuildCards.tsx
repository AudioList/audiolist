import { useState, useCallback } from 'react';
import type { CategoryId, Product } from '../../types';
import { useBuild } from '../../context/BuildContext';
import { supabase } from '../../lib/supabase';
import { STARTER_BUILDS, type StarterBuild } from '../../lib/starterBuilds';

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  '$50': {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    text: 'text-emerald-700 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-800',
  },
  '$150': {
    bg: 'bg-sky-50 dark:bg-sky-900/20',
    text: 'text-sky-700 dark:text-sky-400',
    border: 'border-sky-200 dark:border-sky-800',
  },
  '$500': {
    bg: 'bg-violet-50 dark:bg-violet-900/20',
    text: 'text-violet-700 dark:text-violet-400',
    border: 'border-violet-200 dark:border-violet-800',
  },
  '$1000': {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-800',
  },
};

function TierBadge({ tier }: { tier: string }) {
  const colors = TIER_COLORS[tier] ?? TIER_COLORS['$50'];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${colors.bg} ${colors.text} ${colors.border}`}
    >
      Sub {tier}
    </span>
  );
}

interface StarterBuildCardProps {
  build: StarterBuild;
  onLoad: (build: StarterBuild) => Promise<void>;
  loading: string | null;
}

function StarterBuildCard({ build, onLoad, loading }: StarterBuildCardProps) {
  const isLoading = loading === build.id;
  const isOtherLoading = loading !== null && loading !== build.id;

  return (
    <div
      className={`flex flex-col rounded-xl border border-surface-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-surface-700 dark:bg-surface-900 ${
        isOtherLoading ? 'opacity-50' : ''
      }`}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-surface-900 dark:text-surface-100">
            {build.name}
          </h3>
          <p className="mt-0.5 text-xs text-surface-500 dark:text-surface-400">
            {build.useCase}
          </p>
        </div>
        <TierBadge tier={build.tier} />
      </div>

      {/* Description */}
      <p className="mb-4 text-sm leading-relaxed text-surface-600 dark:text-surface-300">
        {build.description}
      </p>

      {/* Items list */}
      <div className="mb-4 flex-1 space-y-2">
        {build.items.map((item) => (
          <div
            key={`${item.categoryId}-${item.productId}`}
            className="flex items-start gap-2 rounded-lg bg-surface-50 px-3 py-2 dark:bg-surface-800/50"
          >
            <span className="mt-0.5 shrink-0 rounded bg-surface-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-surface-500 dark:bg-surface-700 dark:text-surface-400">
              {item.categoryId === 'headphone' ? 'HP' : item.categoryId.toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-surface-800 dark:text-surface-200 truncate">
                {item.productName}
              </p>
              <p className="text-xs text-surface-500 dark:text-surface-400 line-clamp-1">
                {item.reason}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-surface-100 pt-3 dark:border-surface-800">
        <div>
          <span className="text-lg font-bold text-surface-900 dark:text-surface-100">
            ~${build.budget}
          </span>
          <span className="ml-1.5 text-xs text-surface-400 dark:text-surface-500">
            {build.items.length} {build.items.length === 1 ? 'item' : 'items'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onLoad(build)}
          disabled={isLoading || isOtherLoading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path
                  d="M4 12a8 8 0 018-8"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="opacity-75"
                />
              </svg>
              Loading...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.25a.75.75 0 0 0-1.5 0v2.5h-2.5a.75.75 0 0 0 0 1.5h2.5v2.5a.75.75 0 0 0 1.5 0v-2.5h2.5a.75.75 0 0 0 0-1.5h-2.5v-2.5Z" clipRule="evenodd" />
              </svg>
              Use This Build
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function StarterBuildCards() {
  const { setProduct, setName, setDescription, clearBuild } = useBuild();
  const [loading, setLoading] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleLoad = useCallback(
    async (build: StarterBuild) => {
      setLoading(build.id);

      try {
        // Fetch all products by their IDs
        const productIds = build.items.map((item) => item.productId);
        const { data: products, error } = await supabase
          .from('products')
          .select('*')
          .in('id', productIds);

        if (error) {
          console.error('Failed to fetch starter build products:', error.message);
          setLoading(null);
          return;
        }

        if (!products || products.length === 0) {
          console.error('No products found for starter build');
          setLoading(null);
          return;
        }

        // Build a map of productId -> Product
        const productMap = new Map<string, Product>();
        for (const p of products) {
          productMap.set(p.id, p as Product);
        }

        // Clear existing build first
        clearBuild();

        // Small delay to let clear propagate
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Set the build name and description
        setName(build.name);
        setDescription(build.description);

        // Set each product into the build
        for (const item of build.items) {
          const product = productMap.get(item.productId);
          if (product) {
            setProduct(item.categoryId as CategoryId, product);
          }
        }

        setLoaded(true);
        setTimeout(() => setLoaded(false), 3000);
      } catch (err) {
        console.error('Error loading starter build:', err);
      } finally {
        setLoading(null);
      }
    },
    [setProduct, setName, setDescription, clearBuild]
  );

  const toggleButton = (
    <button
      type="button"
      onClick={() => setExpanded((prev) => !prev)}
      className="group flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-surface-300 bg-surface-50 px-5 py-4 text-sm font-semibold text-surface-600 transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-600 dark:border-surface-600 dark:bg-surface-800/50 dark:text-surface-300 dark:hover:border-primary-500 dark:hover:bg-primary-900/20 dark:hover:text-primary-400"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
        <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
      </svg>
      Not sure where to start? Browse curated starter builds
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : 'group-hover:translate-y-0.5'}`}
        aria-hidden="true"
      >
        <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
      </svg>
    </button>
  );

  if (!expanded) {
    return toggleButton;
  }

  return (
    <div className="space-y-4">
      {toggleButton}

      {loaded && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-center text-sm font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
          Build loaded! Scroll down to see your setup, or keep browsing builds.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STARTER_BUILDS.map((build) => (
          <StarterBuildCard
            key={build.id}
            build={build}
            onLoad={handleLoad}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
}
