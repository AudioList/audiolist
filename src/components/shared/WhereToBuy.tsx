import { Fragment, useMemo } from 'react';
import { usePriceListings } from '../../hooks/usePriceListings';
import { useBundleListings } from '../../hooks/useBundleListings';
import { usePriceInsights } from '../../hooks/usePriceInsights';
import { useCoupons } from '../../hooks/useCoupons';
import { useGlassMode } from '../../context/GlassModeContext';
import { extractBundleDescription } from '../../lib/bundleUtils';
import RetailerTrustInfo from './RetailerTrustInfo';
import DealBadge from './DealBadge';
import CouponChip from './CouponChip';
import type { StoreProductBundle } from '../../types';

interface WhereToBuyProps {
  productId: string;
  productName?: string;
  discontinued?: boolean;
}

function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(price);
  } catch {
    return `$${price.toFixed(2)}`;
  }
}

function relativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  return 'just now';
}

function isOlderThanHours(dateString: string, hours: number): boolean {
  const then = new Date(dateString).getTime();
  if (Number.isNaN(then)) return false;
  const ageMs = Date.now() - then;
  return ageMs > hours * 60 * 60 * 1000;
}

function BundleRow({
  bundle,
  productName,
  isGlass,
}: {
  bundle: StoreProductBundle;
  productName: string;
  isGlass: boolean;
}) {
  const description = extractBundleDescription(bundle.title, productName);
  const buyUrl = bundle.affiliate_url ?? bundle.product_url;
  const hasUrl = buyUrl !== null;

  return (
    <tr
      className={
        isGlass
          ? 'border-b border-white/[0.06] last:border-b-0 bg-white/[0.02]'
          : 'border-b border-surface-100 last:border-b-0 dark:border-surface-800 bg-surface-50/50 dark:bg-surface-800/30'
      }
    >
      <td className="py-2 pr-4 pl-6">
        <div className="flex items-start gap-1.5">
          <span
            className="mt-0.5 text-surface-300 dark:text-surface-600 select-none"
            aria-hidden="true"
          >
            &#x2514;
          </span>
          <div className="min-w-0">
            <span className="inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[0.6rem] font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 mr-1.5">
              Bundle
            </span>
            <span className="text-xs text-surface-600 dark:text-surface-400">
              {description}
            </span>
          </div>
        </div>
      </td>
      <td className="py-2 pr-4 font-mono text-xs text-surface-700 dark:text-surface-300">
        {bundle.price ? formatPrice(bundle.price, 'USD') : '--'}
      </td>
      <td className="py-2 pr-4">
        {bundle.in_stock ? (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[0.625rem] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            In Stock
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[0.625rem] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
            Out of Stock
          </span>
        )}
      </td>
      <td className="py-2 text-right">
        {hasUrl ? (
          <a
            href={buyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={
              isGlass
                ? 'inline-flex items-center gap-1 rounded-xl bg-violet-600 px-3 py-1 text-[0.625rem] font-medium text-white transition-colors hover:bg-violet-500 shadow-sm shadow-violet-500/20'
                : 'inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1 text-[0.625rem] font-medium text-white transition-colors hover:bg-violet-500'
            }
          >
            Buy Bundle
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-2.5 w-2.5"
              aria-hidden="true"
            >
              <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z" />
              <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z" />
            </svg>
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex cursor-not-allowed items-center rounded-lg bg-surface-200 px-3 py-1 text-[0.625rem] font-medium text-surface-400 dark:bg-surface-700 dark:text-surface-500"
          >
            Buy Bundle
          </button>
        )}
      </td>
    </tr>
  );
}

export default function WhereToBuy({ productId, productName, discontinued }: WhereToBuyProps) {
  const isGlass = useGlassMode();
  const { listings, loading, error } = usePriceListings(productId);
  const { bundles } = useBundleListings(productId, productName);
  const { insights } = usePriceInsights(productId, listings);
  const retailerIds = useMemo(() => listings.map(l => l.retailer_id), [listings]);
  const { coupons } = useCoupons(retailerIds);

  // Group bundles by retailer_id
  const bundlesByRetailer = useMemo(() => {
    const map = new Map<string, StoreProductBundle[]>();
    for (const bundle of bundles) {
      const list = map.get(bundle.retailer_id);
      if (list) list.push(bundle);
      else map.set(bundle.retailer_id, [bundle]);
    }
    return map;
  }, [bundles]);

  // Find bundle retailers not represented in price_listings
  const orphanRetailerIds = useMemo(() => {
    const listingRetailers = new Set(listings.map((l) => l.retailer_id));
    return [...bundlesByRetailer.keys()].filter(
      (rid) => !listingRetailers.has(rid),
    );
  }, [listings, bundlesByRetailer]);

  // Find the most recent last_checked across all listings
  const lastChecked = listings.length > 0
    ? listings.reduce((latest, l) =>
        new Date(l.last_checked) > new Date(latest) ? l.last_checked : latest,
      listings[0].last_checked)
    : null;
  const pricesStale = lastChecked ? isOlderThanHours(lastChecked, 72) : false;

  const hasAnyContent = listings.length > 0 || bundles.length > 0;

  return (
    <div className={isGlass ? "glass-1 rounded-2xl" : "rounded-xl border border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-900"}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-surface-200 px-5 py-4 dark:border-surface-700">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="h-5 w-5 text-primary-600 dark:text-primary-400"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
          />
        </svg>
        <h2 className="text-lg font-bold text-surface-900 dark:text-surface-50">
          Where to Buy
        </h2>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between"
              >
                <div className="h-4 w-28 animate-pulse rounded bg-surface-200 dark:bg-surface-700" />
                <div className="h-4 w-16 animate-pulse rounded bg-surface-200 dark:bg-surface-700" />
                <div className="h-4 w-20 animate-pulse rounded bg-surface-200 dark:bg-surface-700" />
                <div className="h-8 w-16 animate-pulse rounded bg-surface-200 dark:bg-surface-700" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {!loading && !error && !hasAnyContent && (
          <p className="text-sm text-surface-500 dark:text-surface-400">
            No retailer prices available yet
          </p>
        )}

        {!loading && !error && hasAnyContent && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 text-left text-surface-500 dark:border-surface-700 dark:text-surface-400">
                    <th className="pb-2 pr-4 font-medium">Retailer</th>
                    <th className="pb-2 pr-4 font-medium">Price</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((listing) => {
                    const buyUrl = listing.affiliate_url ?? listing.product_url;
                    const hasUrl = buyUrl !== null;
                    const retailerBundles = bundlesByRetailer.get(listing.retailer_id) ?? [];

                    return (
                      <Fragment key={listing.id}>
                        <tr
                          className="border-b border-surface-100 last:border-b-0 dark:border-surface-800"
                        >
                          <td className="py-3 pr-4">
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex items-center gap-1 font-semibold text-surface-900 dark:text-surface-100">
                                {listing.retailer?.name ?? 'Unknown'}
                                {listing.retailer && <RetailerTrustInfo retailer={listing.retailer} />}
                              </span>
                              {coupons.get(listing.retailer_id)?.map((coupon) => (
                                <CouponChip
                                  key={coupon.id}
                                  coupon={coupon}
                                  productHandle={listing.product_url?.split('/products/')[1]?.split('?')[0]}
                                  storeDomain={listing.retailer?.base_url?.replace('https://', '')}
                                />
                              ))}
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-surface-900 dark:text-surface-100">
                                  {formatPrice(listing.price, listing.currency)}
                                </span>
                                {listing.compare_at_price != null && listing.compare_at_price > listing.price && (
                                  <span className="font-mono text-xs text-surface-400 line-through dark:text-surface-500">
                                    {formatPrice(listing.compare_at_price, listing.currency)}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-1">
                                {listing.compare_at_price != null && listing.compare_at_price > listing.price && (
                                  <DealBadge
                                    type="discount"
                                    value={Math.round(((listing.compare_at_price - listing.price) / listing.compare_at_price) * 100)}
                                  />
                                )}
                                {(() => {
                                  const insight = insights.get(listing.retailer_id);
                                  if (!insight) return null;
                                  return (
                                    <>
                                      {insight.is_all_time_low && <DealBadge type="all-time-low" />}
                                      {!insight.is_all_time_low && insight.trend === 'down' && insight.price_change_pct != null && (
                                        <DealBadge type="price-drop" value={insight.price_change_pct} />
                                      )}
                                    </>
                                  );
                                })()}
                                {listing.on_sale && !listing.compare_at_price && (
                                  <DealBadge type="on-sale" />
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            {listing.in_stock ? (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                In Stock
                              </span>
                            ) : discontinued ? (
                              <span className="inline-flex items-center rounded-full bg-surface-200 px-2 py-0.5 text-xs font-medium text-surface-600 dark:bg-surface-700 dark:text-surface-400">
                                Discontinued
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                Out of Stock
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-right">
                            {hasUrl ? (
                              <a
                                href={buyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={isGlass
                                  ? "inline-flex items-center gap-1 rounded-xl bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-500 shadow-sm shadow-primary-500/20"
                                  : "inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-500"
                                }
                              >
                                Buy
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 16 16"
                                  fill="currentColor"
                                  className="h-3 w-3"
                                  aria-hidden="true"
                                >
                                  <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z" />
                                  <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z" />
                                </svg>
                              </a>
                            ) : (
                              <button
                                type="button"
                                disabled
                                className="inline-flex cursor-not-allowed items-center rounded-lg bg-surface-200 px-3 py-1.5 text-xs font-medium text-surface-400 dark:bg-surface-700 dark:text-surface-500"
                              >
                                Buy
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Bundle rows nested under this retailer */}
                        {productName && retailerBundles.map((bundle) => (
                          <BundleRow
                            key={bundle.id}
                            bundle={bundle}
                            productName={productName}
                            isGlass={isGlass}
                          />
                        ))}
                      </Fragment>
                    );
                  })}

                  {/* Orphan bundles: from retailers not in price_listings */}
                  {productName && orphanRetailerIds.map((retailerId) => {
                    const retailerBundles = bundlesByRetailer.get(retailerId) ?? [];
                    if (retailerBundles.length === 0) return null;
                    const retailerName = retailerBundles[0].retailer?.name ?? 'Unknown';

                    return (
                      <Fragment key={`orphan-${retailerId}`}>
                        {/* Retailer header row for orphan bundles */}
                        <tr className="border-b border-surface-100 dark:border-surface-800">
                          <td
                            colSpan={4}
                            className="py-2 pt-3 text-xs font-semibold text-surface-500 dark:text-surface-400"
                          >
                            {retailerName}
                            {retailerBundles[0].retailer && (
                              <RetailerTrustInfo retailer={retailerBundles[0].retailer} />
                            )}
                          </td>
                        </tr>
                        {retailerBundles.map((bundle) => (
                          <BundleRow
                            key={bundle.id}
                            bundle={bundle}
                            productName={productName}
                            isGlass={isGlass}
                          />
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {lastChecked && (
              <p className={`mt-3 text-xs ${pricesStale ? 'text-amber-600 dark:text-amber-400' : 'text-surface-400 dark:text-surface-500'}`}>
                Prices updated {relativeTime(lastChecked)}{pricesStale ? ' (data may be stale)' : ''}
              </p>
            )}
            <p className="mt-2 text-xs text-surface-500 dark:text-surface-400">
              Rankings are based on measurements. Retailer links may be affiliate links and do not influence ranking.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
