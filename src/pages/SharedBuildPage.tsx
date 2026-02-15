import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { BuildItem } from '../types';
import { supabase } from '../lib/supabase';
import { CATEGORY_MAP } from '../lib/categories';
import { useGlassMode } from '../context/GlassModeContext';
import PPIBadge from '../components/shared/PPIBadge';
import PriceDisplay from '../components/shared/PriceDisplay';
import CloneBuildButton from '../components/shared/CloneBuildButton';

interface SharedBuild {
  id: string;
  share_code: string;
  name: string;
  description: string;
  items: BuildItem[];
}

export default function SharedBuildPage() {
  const { shareCode } = useParams<{ shareCode: string }>();
  const isGlass = useGlassMode();
  const builderPath = isGlass ? '/glass/builder' : '/builder';
  const [build, setBuild] = useState<SharedBuild | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareCode) return;

    async function fetchBuild() {
      setLoading(true);
      setError(null);

      try {
        // Fetch build by share_code
        const { data: buildData, error: buildError } = await supabase
          .from('builds')
          .select('id, share_code, name, description')
          .eq('share_code', shareCode)
          .single();

        if (buildError || !buildData) {
          setError('Build not found');
          setLoading(false);
          return;
        }

        // Fetch build items with joined product data
        const { data: itemsData, error: itemsError } = await supabase
          .from('build_items')
          .select('id, build_id, category_id, product_id, custom_price, quantity, products(*)')
          .eq('build_id', buildData.id)
          .order('category_id');

        if (itemsError) {
          throw new Error(itemsError.message);
        }

        const items: BuildItem[] = (itemsData ?? []).map((item) => ({
          id: item.id,
          build_id: item.build_id,
          category_id: item.category_id,
          product_id: item.product_id,
          custom_price: item.custom_price,
          quantity: item.quantity,
          product: (item.products ?? undefined) as unknown as BuildItem['product'],
        }));

        setBuild({
          id: buildData.id,
          share_code: buildData.share_code,
          name: buildData.name,
          description: buildData.description ?? '',
          items,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load build');
      } finally {
        setLoading(false);
      }
    }

    fetchBuild();
  }, [shareCode]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          <p className="mt-4 text-sm text-surface-500 dark:text-surface-400">
            Loading build...
          </p>
        </div>
      </div>
    );
  }

  if (error || !build) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="rounded-xl border border-surface-200 bg-white p-8 text-center dark:border-surface-700 dark:bg-surface-900">
          <h2 className="text-xl font-bold text-surface-900 dark:text-surface-100">
            Build not found
          </h2>
          <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
            This build link may have expired or is invalid.
          </p>
          <Link
            to={builderPath}
            className="mt-6 inline-block rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-500"
          >
            Create Your Own Build
          </Link>
        </div>
      </div>
    );
  }

  const totalPrice = build.items.reduce((sum, item) => {
    const price = item.custom_price ?? item.product?.price ?? 0;
    return sum + price * item.quantity;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50">
          {build.name}
        </h1>
        {build.description && (
          <p className="mt-1 text-sm text-surface-600 dark:text-surface-300">
            {build.description}
          </p>
        )}
        <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
          Shared build &mdash; {build.items.length}{' '}
          {build.items.length === 1 ? 'component' : 'components'}
        </p>
      </div>

      {/* Read-only build items */}
      <div className={isGlass ? 'overflow-hidden glass-1 glass-inner-glow rounded-2xl' : 'overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm dark:border-surface-700 dark:bg-surface-900'}>
        <table className="hidden w-full text-sm md:table">
          <thead>
            <tr className={isGlass ? 'bg-white/40 text-left text-surface-600 dark:bg-white/[0.04] dark:text-surface-300' : 'bg-surface-200 text-left text-surface-600 dark:bg-surface-800 dark:text-surface-300'}>
              <th className="px-4 py-3 font-semibold w-48">Component</th>
              <th className="px-4 py-3 font-semibold">Selection</th>
              <th className="px-4 py-3 font-semibold text-right w-28">Price</th>
            </tr>
          </thead>
          <tbody>
            {build.items.map((item) => {
              const category = CATEGORY_MAP.get(item.category_id);
              const product = item.product;
              const price = item.custom_price ?? product?.price ?? null;

              return (
                <tr
                  key={item.id}
                  className="border-b border-surface-200 dark:border-surface-700"
                >
                  <td className="px-4 py-3">
                    <span className="font-bold text-surface-900 dark:text-surface-100">
                      {category?.name ?? item.category_id}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-surface-700 dark:text-surface-300">
                    {product ? (
                      <Link
                        to={`/product/${product.id}`}
                        className="text-primary-600 hover:text-primary-500 hover:underline dark:text-primary-400 dark:hover:text-primary-300"
                      >
                        {product.name}
                      </Link>
                    ) : (
                      <span className="italic text-surface-400">Unknown product</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <PriceDisplay price={price} affiliateUrl={product?.affiliate_url} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-surface-300 bg-surface-50 dark:border-surface-600 dark:bg-surface-800/80">
              <td className="px-4 py-4" colSpan={2}>
                <span className="text-lg font-bold text-surface-900 dark:text-surface-100">
                  Total
                </span>
              </td>
              <td className="px-4 py-4 text-right">
                <span className="text-lg font-bold text-surface-900 dark:text-surface-100">
                  ${totalPrice.toFixed(2)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Mobile cards */}
        <div className="flex flex-col gap-3 p-4 md:hidden">
          {build.items.map((item) => {
            const category = CATEGORY_MAP.get(item.category_id);
            const product = item.product;
            const price = item.custom_price ?? product?.price ?? null;

            return (
              <div
                key={item.id}
                className={isGlass ? 'bg-white/30 rounded-xl p-4' : 'rounded-lg border border-surface-200 bg-surface-50 p-4 dark:border-surface-700 dark:bg-surface-800'}
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-surface-900 dark:text-surface-100">
                  {category?.name ?? item.category_id}
                </div>
                <div className="mt-1 font-medium text-surface-900 dark:text-surface-100">
                  {product ? (
                    <Link
                      to={`/product/${product.id}`}
                      className="text-primary-600 hover:underline dark:text-primary-400"
                    >
                      {product.name}
                    </Link>
                  ) : (
                    'Unknown product'
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div>
                    {category?.has_ppi && product && (
                      <PPIBadge score={product.ppi_score} size="sm" />
                    )}
                  </div>
                  <PriceDisplay price={price} affiliateUrl={product?.affiliate_url} />
                </div>
              </div>
            );
          })}

          {/* Mobile total */}
          <div className="rounded-lg border-2 border-surface-300 bg-surface-50 p-4 dark:border-surface-600 dark:bg-surface-800/80">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-surface-900 dark:text-surface-100">
                Total
              </span>
              <span className="text-lg font-bold text-surface-900 dark:text-surface-100">
                ${totalPrice.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Clone + CTA */}
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <CloneBuildButton items={build.items} buildName={build.name} />
        <Link
          to={builderPath}
          className={isGlass ? 'glass-btn-secondary inline-block rounded-lg px-6 py-2.5 text-sm font-medium' : 'inline-block rounded-lg border border-surface-300 bg-white px-6 py-2.5 text-sm font-medium text-surface-700 transition-colors hover:bg-surface-100 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700'}
        >
          Create From Scratch
        </Link>
      </div>
    </div>
  );
}
