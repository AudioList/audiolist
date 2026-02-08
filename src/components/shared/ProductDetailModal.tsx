import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { Product } from '../../types';
import { supabase } from '../../lib/supabase';
import { CATEGORY_MAP, getScoreLabel } from '../../lib/categories';
import { useExperienceMode } from '../../context/ExperienceModeContext';
import { useGlassMode } from '../../context/GlassModeContext';
import PPIBadge from './PPIBadge';
import PriceDisplay from './PriceDisplay';
import WhereToBuy from './WhereToBuy';
import ScoreExplainer from './ScoreExplainer';
import BestValueBadge from './BestValueBadge';
import { buildSourceUrl, formatSourceLabel } from '../../lib/sourceUrl';

interface ProductDetailModalProps {
  product: Product | null;
  categoryHasPpi: boolean;
  onClose: () => void;
  onSwap: () => void;
}

export default function ProductDetailModal({
  product,
  categoryHasPpi,
  onClose,
  onSwap,
}: ProductDetailModalProps) {
  const [entered, setEntered] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Entrance animation
  useEffect(() => {
    if (product) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true));
      });
    } else {
      setEntered(false);
    }
  }, [product]);

  // ESC to close
  useEffect(() => {
    if (!product) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [product, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (!product) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [product]);

  // Backdrop click
  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose();
  }

  const { mode } = useExperienceMode();
  const isGlass = useGlassMode();
  const [isBestMode, setIsBestMode] = useState(false);

  // Check if this product is the best-scoring variant in a DSP/ANC family
  useEffect(() => {
    if (!product?.product_family_id || !['dsp', 'anc'].includes(product.variant_type ?? '')) {
      setIsBestMode(false);
      return;
    }

    async function checkBestMode() {
      const { data } = await supabase
        .from('products')
        .select('id, ppi_score')
        .eq('product_family_id', product!.product_family_id!)
        .in('variant_type', ['dsp', 'anc'])
        .order('ppi_score', { ascending: false })
        .limit(1)
        .single();

      if (data && data.id === product!.id) {
        setIsBestMode(true);
      } else {
        setIsBestMode(false);
      }
    }

    checkBestMode();
  }, [product?.id, product?.product_family_id, product?.variant_type]);

  if (!product) return null;

  const category = CATEGORY_MAP.get(product.category_id);

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className={`fixed inset-0 z-[60] flex items-center justify-center p-4 transition-all duration-150 ${
        entered
          ? isGlass ? 'bg-black/40 backdrop-blur-md' : 'bg-black/60 backdrop-blur-sm'
          : 'bg-black/0'
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-detail-title"
        className={`relative w-full max-w-2xl shadow-2xl transition-all duration-150 ease-out ${
          isGlass
            ? 'rounded-2xl border border-white/[0.10] bg-surface-900/90 backdrop-blur-2xl'
            : 'rounded-xl border border-surface-700 bg-surface-900'
        } ${entered ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-surface-700 px-6 py-4">
          <div className="min-w-0">
            {/* Brand + category breadcrumb */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-surface-400">
              {category && <span>{category.name}</span>}
              {product.brand && (
                <>
                  <span>/</span>
                  <span>{product.brand}</span>
                </>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <h2
                id="product-detail-title"
                className="text-lg font-bold text-surface-50"
              >
                {product.name}
              </h2>
              {product.asr_device_type && product.asr_device_type.toUpperCase().includes('AMP') && (
                <span className="inline-flex shrink-0 items-center rounded-md bg-violet-900/40 px-2 py-0.5 text-xs font-bold text-violet-300 ring-1 ring-violet-500/40">
                  DAC/Amp
                </span>
              )}
              {mode === 'advanced' && product.asr_recommended && (
                <span className="inline-flex shrink-0 items-center rounded-md bg-green-900/50 px-2 py-0.5 text-xs font-semibold text-green-400 ring-1 ring-green-500/30">
                  ASR Recommended
                </span>
              )}
              {isBestMode && (
                <span className="inline-flex shrink-0 items-center rounded-md bg-green-900/40 px-2 py-0.5 text-xs font-bold text-green-300 ring-1 ring-green-500/30">
                  Best Tuning Mode
                </span>
              )}
              {product.iem_type === 'tws' && (
                <span className="inline-flex shrink-0 items-center rounded-md bg-cyan-900/40 px-2 py-0.5 text-xs font-bold text-cyan-300 ring-1 ring-cyan-500/30">
                  TWS
                </span>
              )}
            </div>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-surface-400 transition-colors hover:bg-surface-800 hover:text-surface-200"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-5">
          {/* Editorial blurb */}
          {product.editorial_blurb && (
            <div className="rounded-lg border-l-4 border-primary-500 bg-primary-50/50 px-4 py-3 dark:border-primary-400 dark:bg-primary-900/10">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-400">
                Why This Product
              </p>
              <p className="mt-1 text-sm leading-relaxed text-surface-700 dark:text-surface-300">
                {product.editorial_blurb}
              </p>
            </div>
          )}

          {/* Price + value badge */}
          <div className="flex items-center gap-3 text-xl">
            <PriceDisplay price={product.price} affiliateUrl={product.affiliate_url} />
            <BestValueBadge score={product.ppi_score} price={product.price} />
          </div>

          {/* PPI badge (large) */}
          {categoryHasPpi && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-surface-400">
                {getScoreLabel(product.category_id, mode)}:
              </span>
              <PPIBadge score={product.ppi_score} size="lg" />
            </div>
          )}

          {/* Score explainer (beginner/default) */}
          {mode !== 'advanced' && categoryHasPpi && product.ppi_score !== null && (
            <ScoreExplainer scoreType="ppi" score={product.ppi_score} />
          )}

          {/* PPI breakdown table */}
          {mode !== 'beginner' && categoryHasPpi && product.ppi_score !== null && (
            <div className={isGlass ? "rounded-xl border border-white/[0.08] bg-white/[0.04]" : "rounded-lg border border-surface-700 bg-surface-800"}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-700 text-left text-surface-400">
                    <th className="px-4 py-2 font-medium">Metric</th>
                    <th className="px-4 py-2 text-right font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-surface-700">
                    <td className="px-4 py-2 text-surface-300">Std Deviation</td>
                    <td className="px-4 py-2 text-right font-mono text-surface-100">
                      {product.ppi_stdev !== null ? product.ppi_stdev.toFixed(2) : 'N/A'}
                    </td>
                  </tr>
                  <tr className="border-b border-surface-700">
                    <td className="px-4 py-2 text-surface-300">Slope</td>
                    <td className="px-4 py-2 text-right font-mono text-surface-100">
                      {product.ppi_slope !== null ? product.ppi_slope.toFixed(3) : 'N/A'}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-surface-300">Avg Error</td>
                    <td className="px-4 py-2 text-right font-mono text-surface-100">
                      {product.ppi_avg_error !== null ? product.ppi_avg_error.toFixed(2) : 'N/A'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Metadata badges */}
          <div className="flex flex-wrap gap-2">
            {mode !== 'beginner' && product.source_domain && (() => {
              const sourceUrl = buildSourceUrl(product.source_domain, product.source_id);
              return sourceUrl ? (
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 transition-colors" title="View original measurement graph">
                  Source: {formatSourceLabel(product.source_domain)}
                </a>
              ) : (
                <span className="inline-flex items-center rounded-full bg-surface-800 px-2.5 py-1 text-xs font-medium text-surface-400">
                  Source: {formatSourceLabel(product.source_domain)}
                </span>
              );
            })()}
            {mode !== 'beginner' && product.rig_type && (
              <span className="inline-flex items-center rounded-full bg-surface-800 px-2.5 py-1 text-xs font-medium text-surface-400">
                Rig: {product.rig_type}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Swap product */}
            <button
              type="button"
              onClick={onSwap}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-500"
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
                  d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H4.558a.75.75 0 0 0-.75.75v3.674a.75.75 0 0 0 1.5 0v-2.394l.312.311a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm-11.23-3.15a.75.75 0 0 0 1.449.39A5.5 5.5 0 0 1 14.7 6.2l.312.311h-2.433a.75.75 0 0 0 0 1.5h3.674a.75.75 0 0 0 .75-.75V3.587a.75.75 0 0 0-1.5 0v2.394l-.312-.311a7 7 0 0 0-11.712 3.138.75.75 0 0 0 .604.866Z"
                  clipRule="evenodd"
                />
              </svg>
              Swap Product
            </button>

            {/* Buy Now */}
            {product.affiliate_url && (
              <a
                href={product.affiliate_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-surface-600 bg-surface-800 px-4 py-2 text-sm font-medium text-surface-300 transition-colors hover:bg-surface-700"
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

            {/* View full page */}
            <Link
              to={`/product/${product.id}`}
              onClick={onClose}
              className="text-sm font-medium text-surface-400 transition-colors hover:text-surface-200"
            >
              View Full Page &rarr;
            </Link>
          </div>

          {/* Where to Buy */}
          <WhereToBuy productId={product.id} />
        </div>
      </div>
    </div>
  );
}
