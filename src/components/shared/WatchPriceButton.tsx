import { useState, useRef, useEffect } from 'react';
import { useWatchlist } from '../../hooks/useWatchlist';
import { useGlassMode } from '../../context/GlassModeContext';

interface WatchPriceButtonProps {
  productId: string;
  productName: string;
  currentPrice: number | null;
}

export default function WatchPriceButton({
  productId,
  productName,
  currentPrice,
}: WatchPriceButtonProps) {
  const isGlass = useGlassMode();
  const { isWatching, addProduct, removeProduct, getWatchItem, updatePrice } = useWatchlist();
  const watching = isWatching(productId);
  const watchItem = getWatchItem(productId);
  const [showPopover, setShowPopover] = useState(false);
  const [targetPrice, setTargetPrice] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Update last known price when component mounts / price changes
  useEffect(() => {
    if (watching && currentPrice !== null) {
      updatePrice(productId, currentPrice);
    }
  }, [watching, currentPrice, productId, updatePrice]);

  // Close on outside click
  useEffect(() => {
    if (!showPopover) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setShowPopover(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPopover]);

  function handleWatch() {
    const price = parseFloat(targetPrice);
    if (isNaN(price) || price <= 0) return;
    addProduct(productId, productName, price);
    setShowPopover(false);
    setTargetPrice('');
  }

  function handleToggle() {
    if (watching) {
      removeProduct(productId);
    } else {
      // Pre-fill with 10% below current price
      if (currentPrice !== null) {
        setTargetPrice(Math.floor(currentPrice * 0.9).toString());
      }
      setShowPopover(true);
    }
  }

  return (
    <div className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
          watching
            ? 'border-amber-500 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30'
            : isGlass
              ? 'border-white/30 bg-white/50 backdrop-blur-sm text-surface-700 hover:bg-white/60 dark:text-surface-300'
              : 'border-surface-300 bg-white text-surface-700 hover:bg-surface-100 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700'
        }`}
        aria-label={watching ? 'Stop watching price' : 'Watch for price drop'}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
          aria-hidden="true"
        >
          {watching ? (
            <path
              fillRule="evenodd"
              d="M10 2a6 6 0 0 0-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 0 .515 1.076 32.91 32.91 0 0 0 3.256.508 3.5 3.5 0 0 0 6.972 0 32.903 32.903 0 0 0 3.256-.508.75.75 0 0 0 .515-1.076A11.448 11.448 0 0 1 16 8a6 6 0 0 0-6-6Zm0 14.5a2 2 0 0 1-1.95-1.557 33.54 33.54 0 0 0 3.9 0A2 2 0 0 1 10 16.5Z"
              clipRule="evenodd"
            />
          ) : (
            <path d="M4.214 3.227a.75.75 0 0 0-1.156.956 8.519 8.519 0 0 1 1.067 3.63A24.945 24.945 0 0 0 10 6.67c2.156 0 4.236.283 6.214.764a.75.75 0 1 0 .372-1.452A26.478 26.478 0 0 0 10 5.17c-2.49 0-4.9.381-7.154 1.086a10.015 10.015 0 0 0-1.157-1.372.75.75 0 0 0-1.06 1.06 8.5 8.5 0 0 1 1.067 1.367A6.003 6.003 0 0 0 4 8c0 1.887-.454 3.665-1.257 5.234a.75.75 0 0 0 .515 1.076 32.91 32.91 0 0 0 3.256.508 3.5 3.5 0 0 0 6.972 0 32.903 32.903 0 0 0 3.256-.508.75.75 0 0 0 .515-1.076A11.448 11.448 0 0 1 16 8a6 6 0 0 0-6-6Z" />
          )}
        </svg>
        {watching
          ? `Watching ($${watchItem?.targetPrice ?? ''})`
          : 'Watch Price'}
      </button>

      {showPopover && (
        <div
          ref={popoverRef}
          className={isGlass
            ? "absolute left-0 top-full z-50 mt-2 w-64 glass-2 rounded-xl p-3 shadow-lg"
            : "absolute left-0 top-full z-50 mt-2 w-64 rounded-lg border border-surface-200 bg-white p-3 shadow-lg dark:border-surface-600 dark:bg-surface-800"
          }
        >
          <p className="mb-2 text-xs font-medium text-surface-600 dark:text-surface-300">
            Alert me when price drops to:
          </p>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-surface-400">
                $
              </span>
              <input
                type="number"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleWatch()}
                className="w-full rounded-md border border-surface-300 bg-white py-1.5 pl-6 pr-2 text-sm text-surface-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/40 dark:border-surface-600 dark:bg-surface-700 dark:text-surface-100"
                placeholder="Target price"
                min="0"
                step="1"
                autoFocus
              />
            </div>
            <button
              type="button"
              onClick={handleWatch}
              className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-500"
            >
              Watch
            </button>
          </div>
          {currentPrice !== null && (
            <p className="mt-1.5 text-[0.6875rem] text-surface-400 dark:text-surface-500">
              Current price: ${currentPrice.toFixed(0)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
