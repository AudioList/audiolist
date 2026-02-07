import { Link } from 'react-router-dom';
import { useWatchlist } from '../../hooks/useWatchlist';

export default function PriceAlertBanner() {
  const { alerts, dismissAlert } = useWatchlist();

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((item) => (
        <div
          key={item.productId}
          className="flex items-center gap-3 rounded-lg border border-green-300 bg-green-50 px-4 py-3 dark:border-green-700 dark:bg-green-900/20"
        >
          {/* Bell icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 2a6 6 0 0 0-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 0 .515 1.076 32.91 32.91 0 0 0 3.256.508 3.5 3.5 0 0 0 6.972 0 32.903 32.903 0 0 0 3.256-.508.75.75 0 0 0 .515-1.076A11.448 11.448 0 0 1 16 8a6 6 0 0 0-6-6Zm0 14.5a2 2 0 0 1-1.95-1.557 33.54 33.54 0 0 0 3.9 0A2 2 0 0 1 10 16.5Z"
              clipRule="evenodd"
            />
          </svg>

          {/* Message */}
          <div className="min-w-0 flex-1 text-sm text-green-800 dark:text-green-200">
            <span className="font-semibold">Price drop!</span>{' '}
            <Link
              to={`/product/${item.productId}`}
              className="font-medium underline hover:text-green-900 dark:hover:text-green-100"
            >
              {item.productName}
            </Link>{' '}
            is now{' '}
            <span className="font-bold">${item.lastPrice?.toFixed(0)}</span>{' '}
            <span className="text-green-600 dark:text-green-400">
              (your target: ${item.targetPrice.toFixed(0)})
            </span>
          </div>

          {/* Dismiss */}
          <button
            type="button"
            onClick={() => dismissAlert(item.productId)}
            className="shrink-0 rounded p-1 text-green-500 transition-colors hover:bg-green-100 hover:text-green-700 dark:text-green-400 dark:hover:bg-green-800/50 dark:hover:text-green-200"
            aria-label="Dismiss alert"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
