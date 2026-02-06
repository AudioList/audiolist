import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Product, CategoryId } from '../types';
import { supabase } from '../lib/supabase';
import { CATEGORY_MAP } from '../lib/categories';
import { useBuild } from '../context/BuildContext';
import PPIBadge from '../components/shared/PPIBadge';
import PriceDisplay from '../components/shared/PriceDisplay';
import WhereToBuy from '../components/shared/WhereToBuy';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { setProduct } = useBuild();

  const [product, setProductData] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addedCategory, setAddedCategory] = useState<CategoryId | null>(null);

  useEffect(() => {
    if (!id) return;

    async function fetchProduct() {
      setLoading(true);
      setError(null);

      try {
        const { data, error: queryError } = await supabase
          .from('products')
          .select('*')
          .eq('id', id)
          .single();

        if (queryError || !data) {
          setError('Product not found');
          return;
        }

        setProductData(data as Product);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load product');
      } finally {
        setLoading(false);
      }
    }

    fetchProduct();
  }, [id]);

  function handleAddToBuild(categoryId: CategoryId) {
    if (!product) return;
    setProduct(categoryId, product);
    setAddedCategory(categoryId);
    setTimeout(() => setAddedCategory(null), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          <p className="mt-4 text-sm text-surface-500 dark:text-surface-400">
            Loading product...
          </p>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="rounded-xl border border-surface-200 bg-white p-8 text-center dark:border-surface-700 dark:bg-surface-900">
          <h2 className="text-xl font-bold text-surface-900 dark:text-surface-100">
            Product not found
          </h2>
          <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
            This product may have been removed or the link is invalid.
          </p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mt-6 inline-block rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-500"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const category = CATEGORY_MAP.get(product.category_id);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-sm text-surface-500 transition-colors hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
              clipRule="evenodd"
            />
          </svg>
          Back
        </button>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Left: Image / placeholder */}
        <div className="flex h-64 w-full shrink-0 items-center justify-center rounded-xl border border-surface-200 bg-surface-100 dark:border-surface-700 dark:bg-surface-800 lg:h-80 lg:w-80">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="max-h-full max-w-full object-contain p-4"
            />
          ) : (
            <span className="text-5xl text-surface-300 dark:text-surface-600" aria-hidden="true">
              ?
            </span>
          )}
        </div>

        {/* Right: Details */}
        <div className="flex-1 space-y-5">
          {/* Brand + category breadcrumb */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-surface-500 dark:text-surface-400">
            {category && (
              <Link
                to={`/products/${product.category_id}`}
                className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                {category.name}
              </Link>
            )}
            {product.brand && (
              <>
                <span>/</span>
                <span>{product.brand}</span>
              </>
            )}
          </div>

          {/* Product name */}
          <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-50">
            {product.name}
          </h1>

          {/* Price */}
          <div className="text-xl">
            <PriceDisplay price={product.price} affiliateUrl={product.affiliate_url} />
          </div>

          {/* PPI badge (large) */}
          {category?.has_ppi && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-surface-500 dark:text-surface-400">
                PPI Score:
              </span>
              <PPIBadge score={product.ppi_score} size="lg" />
            </div>
          )}

          {/* PPI breakdown table */}
          {category?.has_ppi && product.ppi_score !== null && (
            <div className="rounded-lg border border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 text-left text-surface-500 dark:border-surface-700 dark:text-surface-400">
                    <th className="px-4 py-2 font-medium">Metric</th>
                    <th className="px-4 py-2 text-right font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-surface-200 dark:border-surface-700">
                    <td className="px-4 py-2 text-surface-700 dark:text-surface-300">
                      Std Deviation
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-surface-900 dark:text-surface-100">
                      {product.ppi_stdev !== null ? product.ppi_stdev.toFixed(2) : 'N/A'}
                    </td>
                  </tr>
                  <tr className="border-b border-surface-200 dark:border-surface-700">
                    <td className="px-4 py-2 text-surface-700 dark:text-surface-300">
                      Slope
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-surface-900 dark:text-surface-100">
                      {product.ppi_slope !== null ? product.ppi_slope.toFixed(3) : 'N/A'}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-surface-700 dark:text-surface-300">
                      Avg Error
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-surface-900 dark:text-surface-100">
                      {product.ppi_avg_error !== null
                        ? product.ppi_avg_error.toFixed(2)
                        : 'N/A'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Additional info */}
          <div className="flex flex-wrap gap-3">
            {product.source_domain && (
              <span className="inline-flex items-center rounded-full bg-surface-100 px-2.5 py-1 text-xs font-medium text-surface-600 dark:bg-surface-800 dark:text-surface-400">
                Source: {product.source_domain}
              </span>
            )}
            {product.rig_type && (
              <span className="inline-flex items-center rounded-full bg-surface-100 px-2.5 py-1 text-xs font-medium text-surface-600 dark:bg-surface-800 dark:text-surface-400">
                Rig: {product.rig_type}
              </span>
            )}
            {product.quality && (
              <span className="inline-flex items-center rounded-full bg-primary-100 px-2.5 py-1 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                {product.quality}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 pt-2">
            {/* Add to build */}
            <button
              type="button"
              onClick={() => handleAddToBuild(product.category_id)}
              className={`rounded-lg px-5 py-2.5 text-sm font-medium transition-colors ${
                addedCategory === product.category_id
                  ? 'bg-ppi-excellent text-white'
                  : 'bg-primary-600 text-white hover:bg-primary-500'
              }`}
            >
              {addedCategory === product.category_id
                ? 'Added to Build!'
                : `Add to Build (${category?.name ?? product.category_id})`}
            </button>

            {/* Affiliate / buy link */}
            {product.affiliate_url && (
              <a
                href={product.affiliate_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-surface-300 bg-white px-5 py-2.5 text-sm font-medium text-surface-700 transition-colors hover:bg-surface-100 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700"
              >
                Buy Now
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z" />
                  <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z" />
                </svg>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Where to Buy */}
      <WhereToBuy productId={product.id} />
    </div>
  );
}
