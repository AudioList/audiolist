import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Build, BuildItem } from '../types';

export type CommunitySortOption = 'recent' | 'popular' | 'budget_asc' | 'budget_desc';

interface CommunityBuild extends Build {
  build_items: (BuildItem & { product: { id: string; name: string; brand: string | null; price: number | null; category_id: string; image_url: string | null } })[];
  totalPrice: number;
}

const PAGE_SIZE = 20;

export function useCommunityBuilds() {
  const [builds, setBuilds] = useState<CommunityBuild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<CommunitySortOption>('recent');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchBuilds = useCallback(
    async (pageNum: number, append: boolean) => {
      setLoading(true);
      setError(null);

      try {
        let query = supabase
          .from('builds')
          .select(
            '*, build_items(*, product:products!product_id(id, name, brand, price, category_id, image_url))'
          )
          .eq('is_public', true)
          .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

        switch (sort) {
          case 'popular':
            query = query.order('upvotes', { ascending: false });
            break;
          case 'budget_asc':
            query = query.order('created_at', { ascending: false });
            break;
          case 'budget_desc':
            query = query.order('created_at', { ascending: false });
            break;
          case 'recent':
          default:
            query = query.order('created_at', { ascending: false });
            break;
        }

        const { data, error: fetchError } = await query;

        if (fetchError) {
          setError(fetchError.message);
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const processed = (data ?? []).map((b: any) => {
          const totalPrice = (b.build_items ?? []).reduce(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sum: number, item: any) => sum + (item.product?.price ?? 0),
            0
          );
          return { ...b, totalPrice } as CommunityBuild;
        });

        // Sort by budget client-side for budget sorts
        if (sort === 'budget_asc') {
          processed.sort((a: CommunityBuild, b: CommunityBuild) => a.totalPrice - b.totalPrice);
        } else if (sort === 'budget_desc') {
          processed.sort((a: CommunityBuild, b: CommunityBuild) => b.totalPrice - a.totalPrice);
        }

        setHasMore(processed.length === PAGE_SIZE);

        if (append) {
          setBuilds((prev) => [...prev, ...processed]);
        } else {
          setBuilds(processed);
        }
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [sort]
  );

  useEffect(() => {
    setPage(0);
    fetchBuilds(0, false);
  }, [sort, fetchBuilds]);

  const loadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchBuilds(nextPage, true);
  }, [page, fetchBuilds]);

  return { builds, loading, error, sort, setSort, hasMore, loadMore };
}

/** Generate a stable voter hash from localStorage */
export function getVoterHash(): string {
  const KEY = 'audiolist_voter_hash';
  let hash = localStorage.getItem(KEY);
  if (!hash) {
    hash = crypto.randomUUID();
    localStorage.setItem(KEY, hash);
  }
  return hash;
}

export async function upvoteBuild(buildId: string): Promise<{ success: boolean; newCount?: number }> {
  const voterHash = getVoterHash();

  // Insert vote (will fail silently on duplicate due to unique constraint)
  const { error: voteError } = await supabase
    .from('build_votes')
    .insert({ build_id: buildId, voter_hash: voterHash });

  if (voteError) {
    // Unique violation means already voted - let them unvote
    if (voteError.code === '23505') {
      // Delete the existing vote
      await supabase
        .from('build_votes')
        .delete()
        .eq('build_id', buildId)
        .eq('voter_hash', voterHash);

      // Decrement upvotes
      const { data } = await supabase
        .rpc('decrement_upvotes', { build_uuid: buildId });
      return { success: true, newCount: data ?? undefined };
    }
    return { success: false };
  }

  // Increment upvotes on the build
  const { data } = await supabase
    .rpc('increment_upvotes', { build_uuid: buildId });
  return { success: true, newCount: data ?? undefined };
}
