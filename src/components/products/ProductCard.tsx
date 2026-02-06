import type { Product } from '../../types';
import PPIBadge from '../shared/PPIBadge';
import PriceDisplay from '../shared/PriceDisplay';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  onViewDetail?: (product: Product) => void;
  isSelected?: boolean;
  showPPI?: boolean;
}

export default function ProductCard({
  product,
  onSelect,
  onViewDetail,
  isSelected = false,
  showPPI = false,
}: ProductCardProps) {
  return (
    <div
      className={`group relative flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all ${
        isSelected
          ? 'border-primary-500 bg-primary-950/30 shadow-md shadow-primary-500/10'
          : 'border-surface-700 bg-surface-800 hover:border-surface-500 hover:shadow-lg hover:shadow-black/20'
      }`}
    >
      {/* Clickable info area */}
      <div
        className={`min-w-0 flex-1 ${onViewDetail ? 'cursor-pointer' : ''}`}
        onClick={onViewDetail ? () => onViewDetail(product) : undefined}
      >
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-bold text-surface-100">{product.name}</h3>
          {/* Badges inline */}
          {product.quality === 'high' && (
            <span className="inline-flex shrink-0 items-center rounded-md bg-green-900/50 px-1.5 py-0.5 text-[10px] font-semibold text-green-400 ring-1 ring-green-500/30">
              HQ
            </span>
          )}
          {product.rig_type && (
            <span className="inline-flex shrink-0 items-center rounded-md bg-surface-700 px-1.5 py-0.5 text-[10px] font-semibold text-surface-300 ring-1 ring-surface-600">
              {product.rig_type}
            </span>
          )}
        </div>
        {product.brand && (
          <div className="mt-0.5 text-xs text-surface-400">
            <span className="truncate">{product.brand}</span>
          </div>
        )}
      </div>

      {/* PPI Badge */}
      {showPPI && (
        <div className="shrink-0">
          <PPIBadge score={product.ppi_score} size="sm" />
        </div>
      )}

      {/* Price */}
      <div className="shrink-0 text-right">
        <PriceDisplay price={product.price} affiliateUrl={product.affiliate_url} inStock={product.in_stock} />
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
