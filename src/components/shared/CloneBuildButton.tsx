import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CategoryId, BuildItem, Product } from '../../types';
import { useBuild } from '../../context/BuildContext';
import { useGlassMode } from '../../context/GlassModeContext';
import { supabase } from '../../lib/supabase';

interface CloneBuildButtonProps {
  items: BuildItem[];
  buildName: string;
}

export default function CloneBuildButton({ items, buildName }: CloneBuildButtonProps) {
  const navigate = useNavigate();
  const { setProduct, setName, setDescription, clearBuild } = useBuild();
  const isGlass = useGlassMode();
  const builderPath = isGlass ? '/glass/builder' : '/builder';
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');

  const handleClone = useCallback(async () => {
    setState('loading');
    try {
      // If items already have populated product data, use it directly
      const needsFetch = items.some((item) => !item.product);

      const productMap = new Map<string, Product>();

      if (needsFetch) {
        const productIds = items.map((item) => item.product_id);
        const { data: products, error } = await supabase
          .from('products')
          .select('*')
          .in('id', productIds);

        if (error || !products) {
          console.error('Failed to fetch products for clone:', error?.message);
          setState('idle');
          return;
        }

        for (const p of products) {
          productMap.set(p.id, p as Product);
        }
      } else {
        for (const item of items) {
          if (item.product) {
            productMap.set(item.product_id, item.product);
          }
        }
      }

      clearBuild();
      await new Promise((resolve) => setTimeout(resolve, 50));

      setName(`Copy of ${buildName}`);
      setDescription('');

      for (const item of items) {
        const product = productMap.get(item.product_id);
        if (product) {
          setProduct(item.category_id as CategoryId, product);
        }
      }

      setState('done');
      setTimeout(() => {
        navigate(builderPath);
      }, 1000);
    } catch (err) {
      console.error('Clone error:', err);
      setState('idle');
    }
  }, [items, buildName, setProduct, setName, setDescription, clearBuild, navigate, builderPath]);

  return (
    <button
      type="button"
      onClick={handleClone}
      disabled={state !== 'idle'}
      className={`inline-flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-semibold transition-colors ${
        state === 'done'
          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
          : 'border-primary-500 bg-white text-primary-600 hover:bg-primary-50 dark:border-primary-400 dark:bg-surface-900 dark:text-primary-400 dark:hover:bg-primary-900/20'
      } disabled:opacity-50`}
    >
      {state === 'loading' ? (
        <>
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
            <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
          </svg>
          Loading...
        </>
      ) : state === 'done' ? (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
          </svg>
          Build Loaded! Redirecting...
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z" />
            <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z" />
          </svg>
          Start From This Build
        </>
      )}
    </button>
  );
}
