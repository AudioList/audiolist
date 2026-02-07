import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  useCommunityBuilds,
  upvoteBuild,
  type CommunitySortOption,
} from '../hooks/useCommunityBuilds';
import type { CategoryId, Product } from '../types';
import { useBuild } from '../context/BuildContext';
import { supabase } from '../lib/supabase';

const SORT_OPTIONS: { value: CommunitySortOption; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'popular', label: 'Popular' },
  { value: 'budget_asc', label: 'Budget: Low' },
  { value: 'budget_desc', label: 'Budget: High' },
];

export default function CommunityBuildsPage() {
  const { builds, loading, error, sort, setSort, hasMore, loadMore } = useCommunityBuilds();
  const { setProduct, setName, setDescription, clearBuild } = useBuild();
  const [votingId, setVotingId] = useState<string | null>(null);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [cloneLoadingId, setCloneLoadingId] = useState<string | null>(null);
  // Track local upvote adjustments
  const [voteAdjustments, setVoteAdjustments] = useState<Record<string, number>>({});

  const handleVote = useCallback(
    async (buildId: string) => {
      setVotingId(buildId);
      const result = await upvoteBuild(buildId);
      if (result.success) {
        setVotedIds((prev) => {
          const next = new Set(prev);
          if (next.has(buildId)) {
            next.delete(buildId);
          } else {
            next.add(buildId);
          }
          return next;
        });
        if (result.newCount !== undefined) {
          // Update the local state to reflect the new count
          const build = builds.find((b) => b.id === buildId);
          if (build) {
            setVoteAdjustments((prev) => ({
              ...prev,
              [buildId]: result.newCount! - build.upvotes,
            }));
          }
        }
      }
      setVotingId(null);
    },
    [builds]
  );

  const handleClone = useCallback(
    async (buildId: string, buildName: string) => {
      setCloneLoadingId(buildId);
      try {
        // Fetch full build items with product data
        const { data: items, error: fetchErr } = await supabase
          .from('build_items')
          .select('*, product:products!product_id(*)')
          .eq('build_id', buildId);

        if (fetchErr || !items) {
          console.error('Failed to fetch build items:', fetchErr?.message);
          return;
        }

        clearBuild();
        await new Promise((resolve) => setTimeout(resolve, 50));
        setName(`Copy of ${buildName}`);
        setDescription('');

        for (const item of items) {
          if (item.product) {
            setProduct(item.category_id as CategoryId, item.product as Product);
          }
        }

        // Brief success indicator then could navigate
        setTimeout(() => setCloneLoadingId(null), 500);
      } catch (err) {
        console.error('Clone error:', err);
        setCloneLoadingId(null);
      }
    },
    [setProduct, setName, setDescription, clearBuild]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-surface-900 dark:text-surface-50">
            Community Builds
          </h1>
          <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
            Discover setups shared by other audio enthusiasts.
          </p>
        </div>

        {/* Sort controls */}
        <div className="flex items-center gap-1 rounded-lg bg-surface-100 p-1 dark:bg-surface-800">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSort(opt.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                sort === opt.value
                  ? 'bg-white text-surface-900 shadow-sm dark:bg-surface-700 dark:text-surface-100'
                  : 'text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          Failed to load builds: {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && builds.length === 0 && !error && (
        <div className="py-16 text-center">
          <p className="text-lg font-medium text-surface-600 dark:text-surface-400">
            No community builds yet.
          </p>
          <p className="mt-1 text-sm text-surface-400 dark:text-surface-500">
            Be the first to share a build! Go to the{' '}
            <Link to="/" className="text-primary-600 hover:underline dark:text-primary-400">
              Builder
            </Link>{' '}
            and click Share.
          </p>
        </div>
      )}

      {/* Build cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {builds.map((build) => {
          const isVoting = votingId === build.id;
          const hasVoted = votedIds.has(build.id);
          const displayUpvotes = build.upvotes + (voteAdjustments[build.id] ?? 0);
          const isCloning = cloneLoadingId === build.id;

          return (
            <div
              key={build.id}
              className="flex flex-col rounded-xl border border-surface-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-surface-700 dark:bg-surface-900"
            >
              {/* Header */}
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    to={`/build/${build.share_code}`}
                    className="text-base font-bold text-surface-900 hover:text-primary-600 dark:text-surface-100 dark:hover:text-primary-400"
                  >
                    {build.name || 'Untitled Build'}
                  </Link>
                  {build.author_name && (
                    <p className="text-xs text-surface-400 dark:text-surface-500">
                      by {build.author_name}
                    </p>
                  )}
                </div>

                {/* Upvote button */}
                <button
                  type="button"
                  onClick={() => handleVote(build.id)}
                  disabled={isVoting}
                  className={`flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    hasVoted
                      ? 'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-900/20 dark:text-primary-400'
                      : 'border-surface-200 text-surface-500 hover:border-surface-300 hover:text-surface-700 dark:border-surface-700 dark:text-surface-400 dark:hover:border-surface-600 dark:hover:text-surface-200'
                  }`}
                  aria-label={hasVoted ? 'Remove upvote' : 'Upvote build'}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  >
                    <path fillRule="evenodd" d="M10 17a.75.75 0 0 1-.75-.75V5.612L5.29 9.77a.75.75 0 0 1-1.08-1.04l5.25-5.5a.75.75 0 0 1 1.08 0l5.25 5.5a.75.75 0 1 1-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0 1 10 17Z" clipRule="evenodd" />
                  </svg>
                  {displayUpvotes}
                </button>
              </div>

              {/* Description */}
              {build.description && (
                <p className="mb-3 text-sm text-surface-600 dark:text-surface-300 line-clamp-2">
                  {build.description}
                </p>
              )}

              {/* Items preview */}
              <div className="mb-3 flex-1 space-y-1">
                {build.build_items.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="shrink-0 rounded bg-surface-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-surface-500 dark:bg-surface-800 dark:text-surface-400">
                      {item.product?.category_id === 'headphone'
                        ? 'HP'
                        : (item.product?.category_id ?? item.category_id).toUpperCase().slice(0, 3)}
                    </span>
                    <span className="truncate text-surface-700 dark:text-surface-300">
                      {item.product?.name ?? 'Unknown'}
                    </span>
                  </div>
                ))}
                {build.build_items.length > 4 && (
                  <p className="text-xs text-surface-400 dark:text-surface-500">
                    +{build.build_items.length - 4} more
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-surface-100 pt-3 dark:border-surface-800">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-surface-900 dark:text-surface-100">
                    ${build.totalPrice.toFixed(0)}
                  </span>
                  <span className="text-xs text-surface-400 dark:text-surface-500">
                    {build.build_items.length} items
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleClone(build.id, build.name)}
                    disabled={isCloning}
                    className="rounded-md border border-surface-200 px-2.5 py-1.5 text-xs font-medium text-surface-600 transition-colors hover:bg-surface-50 dark:border-surface-700 dark:text-surface-400 dark:hover:bg-surface-800"
                  >
                    {isCloning ? 'Cloning...' : 'Clone'}
                  </button>
                  <Link
                    to={`/build/${build.share_code}`}
                    className="rounded-md bg-primary-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-500"
                  >
                    View
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-8">
          <svg className="h-6 w-6 animate-spin text-primary-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
            <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
          </svg>
        </div>
      )}

      {/* Load more */}
      {!loading && hasMore && builds.length > 0 && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            className="rounded-lg border border-surface-300 px-6 py-2 text-sm font-medium text-surface-700 transition-colors hover:bg-surface-100 dark:border-surface-600 dark:text-surface-300 dark:hover:bg-surface-800"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
