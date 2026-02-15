import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CATEGORIES } from '../lib/categories';
import { isDevDeployment } from '../lib/env';
import type { CategoryId } from '../types';

interface TriageProduct {
  id: string;
  name: string;
  brand: string | null;
  category_id: string;
  image_url: string | null;
  price: number | null;
}

type TriageAction = CategoryId | 'DELETE' | '';

export default function TriagePage() {
  const [products, setProducts] = useState<TriageProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [changes, setChanges] = useState<Map<string, TriageAction>>(new Map());
  const [savedCount, setSavedCount] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('microphone');
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);

  const isDev = isDevDeployment();

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('id, name, brand, category_id, image_url, price')
      .eq('category_id', filterCategory)
      .order('name');

    if (error) {
      console.error('Failed to load products:', error.message);
    } else {
      setProducts(data ?? []);
    }
    setHiddenIds(new Set());
    setShowHidden(false);
    setLoading(false);
  }, [filterCategory]);

  useEffect(() => {
    if (!isDev) return;
    const timer = window.setTimeout(() => {
      void fetchProducts();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isDev, fetchProducts]);

  if (!isDev) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4">
        <h1 className="text-2xl font-bold text-surface-100">Access Denied</h1>
        <p className="text-surface-400">This page is only available on the dev deployment.</p>
        <Link to="/" className="text-primary-400 underline hover:text-primary-300">
          Go home
        </Link>
      </div>
    );
  }

  const handleChange = (productId: string, action: TriageAction) => {
    setChanges(prev => {
      const next = new Map(prev);
      if (action === '') {
        next.delete(productId);
      } else {
        next.set(productId, action);
      }
      return next;
    });
  };

  const handleSave = async (productId: string) => {
    const action = changes.get(productId);
    if (!action) return;

    setSaving(productId);

    if (action === 'DELETE') {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);
      if (error) {
        console.error('Delete failed:', error.message);
        setSaving(null);
        return;
      }
      setProducts(prev => prev.filter(p => p.id !== productId));
    } else {
      const { error } = await supabase
        .from('products')
        .update({ category_id: action })
        .eq('id', productId);
      if (error) {
        console.error('Update failed:', error.message);
        setSaving(null);
        return;
      }
      setProducts(prev => prev.map(p =>
        p.id === productId ? { ...p, category_id: action } : p
      ));
      setHiddenIds(prev => {
        const next = new Set(prev);
        next.add(productId);
        return next;
      });
    }

    setChanges(prev => {
      const next = new Map(prev);
      next.delete(productId);
      return next;
    });
    setSavedCount(prev => prev + 1);
    setSaving(null);
  };

  const handleUnhide = (productId: string) => {
    setHiddenIds(prev => {
      const next = new Set(prev);
      next.delete(productId);
      return next;
    });
  };

  const filtered = products.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.brand?.toLowerCase().includes(q) ?? false);
  });

  const visible = showHidden ? filtered : filtered.filter(p => !hiddenIds.has(p.id));

  const pendingCount = changes.size;
  const hiddenCount = hiddenIds.size;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-100">Product Triage</h1>
        <p className="mt-1 text-sm text-surface-400">
          Dev-only tool. Reassign product categories or delete junk items.
        </p>
      </div>

      {/* Stats bar */}
      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-surface-300">
        <span>{visible.length} products shown</span>
        {pendingCount > 0 && (
          <span className="text-amber-400">{pendingCount} unsaved changes</span>
        )}
        {savedCount > 0 && (
          <span className="text-green-400">{savedCount} saved this session</span>
        )}
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowHidden(prev => !prev)}
            className="text-surface-400 underline hover:text-surface-200"
          >
            {showHidden ? `Hide ${hiddenCount} sorted` : `Show ${hiddenCount} hidden`}
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
          aria-label="Filter by current category"
        >
          {CATEGORIES.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search by name or brand..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-surface-100 placeholder-surface-500 focus:border-primary-500 focus:outline-none"
          aria-label="Search products"
        />
      </div>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-primary-400" />
        </div>
      ) : visible.length === 0 ? (
        <p className="py-12 text-center text-surface-400">No products found.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map(product => {
            const currentAction = changes.get(product.id) ?? '';
            const isSaving = saving === product.id;
            const isHidden = hiddenIds.has(product.id);

            return (
              <div
                key={product.id}
                className={`flex items-center gap-4 rounded-xl border p-4 ${
                  isHidden
                    ? 'border-surface-700/50 bg-surface-800/30 opacity-50'
                    : 'border-surface-700 bg-surface-800/60'
                }`}
              >
                {/* Thumbnail */}
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-700">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt=""
                      className="h-full w-full object-contain p-1"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-xl text-surface-500" aria-hidden="true">?</span>
                  )}
                </div>

                {/* Product info */}
                <div className="min-w-0 flex-1">
                  <a
                    href={`/product/${product.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-semibold text-surface-100 hover:text-primary-400 hover:underline"
                  >
                    {product.name}
                  </a>
                  <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-surface-400">
                    {product.brand && <span>{product.brand}</span>}
                    <span className="rounded bg-surface-700 px-1.5 py-0.5">{product.category_id}</span>
                    {product.price != null && <span>${product.price.toFixed(2)}</span>}
                  </div>
                </div>

                {/* Action controls */}
                <div className="flex shrink-0 items-center gap-2">
                  {isHidden ? (
                    <button
                      onClick={() => handleUnhide(product.id)}
                      className="rounded-lg border border-surface-600 px-3 py-1.5 text-sm text-surface-400 hover:text-surface-200"
                      aria-label={`Unhide ${product.name}`}
                    >
                      Unhide
                    </button>
                  ) : (
                    <>
                      <select
                        value={currentAction}
                        onChange={e => handleChange(product.id, e.target.value as TriageAction)}
                        className="rounded-lg border border-surface-600 bg-surface-700 px-2 py-1.5 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                        aria-label={`Reassign category for ${product.name}`}
                      >
                        <option value="">-- no change --</option>
                        <option value="DELETE" className="text-red-400">Delete</option>
                        {CATEGORIES.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>

                      <button
                        onClick={() => handleSave(product.id)}
                        disabled={!currentAction || isSaving}
                        className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Save changes for ${product.name}`}
                      >
                        {isSaving ? '...' : 'Save'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
