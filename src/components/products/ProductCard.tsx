import type { Product } from '../../types';
import PPIBadge from '../shared/PPIBadge';
import PriceDisplay from '../shared/PriceDisplay';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  isSelected?: boolean;
  showPPI?: boolean;
}

export default function ProductCard({
  product,
  onSelect,
  isSelected = false,
  showPPI = false,
}: ProductCardProps) {
  return (
    <div
      className={`group relative flex flex-col rounded-lg border p-4 transition-all ${
        isSelected
          ? 'border-primary-500 bg-primary-950/30 shadow-md shadow-primary-500/10'
          : 'border-surface-700 bg-surface-800 hover:border-surface-500 hover:shadow-lg hover:shadow-black/20'
      }`}
    >
      {/* Top row: name + badges */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-surface-100">{product.name}</h3>
          {product.brand && (
            <p className="truncate text-xs text-surface-400">{product.brand}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Quality badge */}
          {product.quality === 'high' && (
            <span className="inline-flex items-center rounded-md bg-green-900/50 px-1.5 py-0.5 text-[10px] font-semibold text-green-400 ring-1 ring-green-500/30">
              HQ
            </span>
          )}

          {/* Rig type badge */}
          {product.rig_type && (
            <span className="inline-flex items-center rounded-md bg-surface-700 px-1.5 py-0.5 text-[10px] font-semibold text-surface-300 ring-1 ring-surface-600">
              {product.rig_type}
            </span>
          )}
        </div>
      </div>

      {/* PPI Badge */}
      {showPPI && (
        <div className="mb-2">
          <PPIBadge score={product.ppi_score} size="sm" />
        </div>
      )}

      {/* Price + source */}
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <PriceDisplay price={product.price} affiliateUrl={product.affiliate_url} />
        {product.source_domain && (
          <span className="truncate text-[11px] text-surface-500">{product.source_domain}</span>
        )}
      </div>

      {/* Action button */}
      <div className="mt-auto">
        {isSelected ? (
          <button
            type="button"
            disabled
            className="w-full rounded-md bg-primary-600/30 px-3 py-1.5 text-sm font-medium text-primary-300 cursor-not-allowed"
          >
            <span className="inline-flex items-center gap-1.5">
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
              Selected
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSelect(product)}
            className="w-full rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          >
            Add to Build
          </button>
        )}
      </div>
    </div>
  );
}
