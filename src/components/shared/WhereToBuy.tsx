import { usePriceListings } from '../../hooks/usePriceListings';
import { useGlassMode } from '../../context/GlassModeContext';
import RetailerTrustInfo from './RetailerTrustInfo';

interface WhereToBuyProps {
  productId: string;
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

export default function WhereToBuy({ productId, discontinued }: WhereToBuyProps) {
  const isGlass = useGlassMode();
  const { listings, loading, error } = usePriceListings(productId);

  // Find the most recent last_checked across all listings
  const lastChecked = listings.length > 0
    ? listings.reduce((latest, l) =>
        new Date(l.last_checked) > new Date(latest) ? l.last_checked : latest,
      listings[0].last_checked)
    : null;

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

        {!loading && !error && listings.length === 0 && (
          <p className="text-sm text-surface-500 dark:text-surface-400">
            No retailer prices available yet
          </p>
        )}

        {!loading && !error && listings.length > 0 && (
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

                    return (
                      <tr
                        key={listing.id}
                        className="border-b border-surface-100 last:border-b-0 dark:border-surface-800"
                      >
                        <td className="py-3 pr-4 font-semibold text-surface-900 dark:text-surface-100">
                          <span className="inline-flex items-center gap-1">
                            {listing.retailer?.name ?? 'Unknown'}
                            {listing.retailer && <RetailerTrustInfo retailer={listing.retailer} />}
                          </span>
                        </td>
                        <td className="py-3 pr-4 font-mono text-surface-900 dark:text-surface-100">
                          {formatPrice(listing.price, listing.currency)}
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
                    );
                  })}
                </tbody>
              </table>
            </div>

            {lastChecked && (
              <p className="mt-3 text-xs text-surface-400 dark:text-surface-500">
                Prices updated {relativeTime(lastChecked)}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
