import type { Product } from '../../types';
import { isSpinormaCategory, sinadToScore } from '../../lib/categories';
import { useExperienceMode } from '../../context/ExperienceModeContext';
import { useGlassMode } from '../../context/GlassModeContext';
import PPIBadge from '../shared/PPIBadge';
import PriceDisplay from '../shared/PriceDisplay';
import BestValueBadge from '../shared/BestValueBadge';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  onViewDetail?: (product: Product) => void;
  isSelected?: boolean;
  showPPI?: boolean;
  showSinad?: boolean;
}

export default function ProductCard({
  product,
  onSelect,
  onViewDetail,
  isSelected = false,
  showPPI = false,
  showSinad = false,
}: ProductCardProps) {
  const { mode } = useExperienceMode();
  const isGlass = useGlassMode();

  return (
    <div
      className={`group relative flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all ${
        isSelected
          ? isGlass
            ? 'glass-1 border-primary-400/50 bg-primary-500/15 rounded-xl ring-1 ring-primary-400/30'
            : 'border-primary-500 bg-primary-950/30 shadow-md shadow-primary-500/10'
          : isGlass
            ? 'glass-1 glass-inner-glow glass-hover-lift rounded-xl hover:border-white/25'
            : 'border-surface-700 bg-surface-800 hover:border-surface-500 hover:shadow-lg hover:shadow-black/20'
      }`}
    >
      {/* Product thumbnail */}
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-700 ${onViewDetail ? 'cursor-pointer' : ''}`}
        onClick={onViewDetail ? () => onViewDetail(product) : undefined}
      >
        {product.image_url ? (
          <img
            src={product.image_url}
            alt=""
            className="h-full w-full object-contain p-0.5"
            loading="lazy"
          />
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5 text-surface-500"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909-4.22-4.22a.75.75 0 0 0-1.06 0L2.5 11.06Zm6-3.06a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>

      {/* Clickable info area */}
      <div
        className={`min-w-0 flex-1 ${onViewDetail ? 'cursor-pointer' : ''}`}
        onClick={onViewDetail ? () => onViewDetail(product) : undefined}
      >
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-bold text-surface-100">{product.name}</h3>
          {/* Badges inline */}
          {mode !== 'beginner' && product.rig_type && (
            <span className="inline-flex shrink-0 items-center rounded-md bg-surface-700 px-1.5 py-0.5 text-[0.625rem] font-semibold text-surface-300 ring-1 ring-surface-600">
              {product.rig_type}
            </span>
          )}
          {mode === 'advanced' && product.asr_recommended && (
            <span className="inline-flex shrink-0 items-center rounded-md bg-green-900/50 px-1.5 py-0.5 text-[0.625rem] font-semibold text-green-400 ring-1 ring-green-500/30">
              ASR
            </span>
          )}
          {product.asr_device_type && product.asr_device_type.toUpperCase().includes('AMP') && (
            <span className="inline-flex shrink-0 items-center rounded-md bg-violet-900/40 px-1.5 py-0.5 text-[0.625rem] font-bold text-violet-300 ring-1 ring-violet-500/40">
              DAC/Amp
            </span>
          )}
        </div>
        {product.brand && (
          <div className="mt-0.5 text-xs text-surface-400">
            <span className="truncate">{product.brand}</span>
            {mode === 'advanced' && product.source_domain && (
              <span className="ml-1.5 text-surface-500">({product.source_domain})</span>
            )}
          </div>
        )}
      </div>

      {/* PPI Badge */}
      {showPPI && (
        <div className="shrink-0">
          <PPIBadge score={product.ppi_score} size="sm" label={isSpinormaCategory(product.category_id) ? 'Spinorama' : undefined} />
        </div>
      )}

      {/* SINAD Badge */}
      {showSinad && product.sinad_db !== null && (
        <div className="shrink-0 flex items-center gap-1.5">
          <PPIBadge score={sinadToScore(product.sinad_db)} size="sm" label="SINAD" />
          {mode !== 'beginner' && (
            <span className="text-[0.625rem] font-medium text-surface-400">{product.sinad_db} dB</span>
          )}
        </div>
      )}

      {/* Price + Value */}
      <div className="shrink-0 flex items-center gap-1.5">
        <BestValueBadge
          score={showSinad && product.sinad_db !== null ? sinadToScore(product.sinad_db) : product.ppi_score}
          price={product.price}
        />
        <PriceDisplay price={product.price} affiliateUrl={product.affiliate_url} inStock={product.in_stock} discontinued={product.discontinued} />
      </div>

      {/* Action button */}
      <div className="shrink-0">
        {isSelected ? (
          <button
            type="button"
            disabled
            className="rounded-md bg-primary-600/30 px-3 py-1.5 text-sm font-medium text-primary-300 cursor-not-allowed"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSelect(product)}
            className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          >
            Add
          </button>
        )}
      </div>
    </div>
  );
}
