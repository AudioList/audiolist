import { useState, useCallback, useEffect } from 'react';

export interface WatchlistItem {
  productId: string;
  productName: string;
  targetPrice: number;
  addedAt: string;
  lastPrice: number | null;
}

const STORAGE_KEY = 'audiolist_watchlist';

function loadWatchlist(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as WatchlistItem[];
  } catch {
    return [];
  }
}

function saveWatchlist(items: WatchlistItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(loadWatchlist);

  // Sync across tabs
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        setWatchlist(loadWatchlist());
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const addProduct = useCallback(
    (productId: string, productName: string, targetPrice: number) => {
      setWatchlist((prev) => {
        const filtered = prev.filter((item) => item.productId !== productId);
        const next = [
          ...filtered,
          {
            productId,
            productName,
            targetPrice,
            addedAt: new Date().toISOString(),
            lastPrice: null,
          },
        ];
        saveWatchlist(next);
        return next;
      });
    },
    []
  );

  const removeProduct = useCallback((productId: string) => {
    setWatchlist((prev) => {
      const next = prev.filter((item) => item.productId !== productId);
      saveWatchlist(next);
      return next;
    });
  }, []);

  const isWatching = useCallback(
    (productId: string) => watchlist.some((item) => item.productId === productId),
    [watchlist]
  );

  const getWatchItem = useCallback(
    (productId: string) => watchlist.find((item) => item.productId === productId) ?? null,
    [watchlist]
  );

  const updatePrice = useCallback(
    (productId: string, currentPrice: number) => {
      setWatchlist((prev) => {
        const next = prev.map((item) =>
          item.productId === productId ? { ...item, lastPrice: currentPrice } : item
        );
        saveWatchlist(next);
        return next;
      });
    },
    []
  );

  const alerts = watchlist.filter(
    (item) => item.lastPrice !== null && item.lastPrice <= item.targetPrice
  );

  const dismissAlert = useCallback((productId: string) => {
    setWatchlist((prev) => {
      // Remove the alert by updating target to below current price
      const next = prev.filter((item) => item.productId !== productId);
      saveWatchlist(next);
      return next;
    });
  }, []);

  return {
    watchlist,
    addProduct,
    removeProduct,
    isWatching,
    getWatchItem,
    updatePrice,
    alerts,
    dismissAlert,
  };
}
