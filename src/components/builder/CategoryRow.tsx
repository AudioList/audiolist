import type { Category, CategoryId, BuildSelection, Product } from '../../types';
import { useBuild } from '../../context/BuildContext';
import { useExperienceMode } from '../../context/ExperienceModeContext';
import { useGlassMode } from '../../context/GlassModeContext';
import { CATEGORY_EXPLAINERS } from '../../lib/categoryExplainers';
import PriceDisplay from '../shared/PriceDisplay';
import { getDisplayName, getBestModeLabel } from '../../lib/productUtils';

/** Returns true when a product functions as both DAC and Amplifier */
function isDacAmpCombo(product: Product): boolean {
  const dt = product.asr_device_type;
  return !!dt && dt.toUpperCase().includes('AMP');
}

interface CategoryRowProps {
  category: Category;
  selection: BuildSelection | undefined;
  onChoose: (categoryId: CategoryId) => void;
  onViewDetail: (product: Product) => void;
  /** Whether this is a child (accessory) category */
  isChild?: boolean;
  /** Position in the child list: 'mid' has a continuing line, 'last' has an elbow */
  childPosition?: 'mid' | 'last';
}

export default function CategoryRow({ category, selection, onChoose, onViewDetail, isChild = false, childPosition }: CategoryRowProps) {
  const { removeProduct } = useBuild();
  const { mode } = useExperienceMode();
  const isGlass = useGlassMode();
  const product = selection?.product;
  const price = selection?.custom_price ?? product?.price ?? null;

  return (
    <>
      {/* Desktop: table row */}
      <tr className={`hidden md:table-row transition-colors ${
        isGlass
          ? 'border-b border-white/15 dark:border-white/[0.06] hover:bg-white/30 dark:hover:bg-white/[0.03]'
          : 'border-b border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800/50'
      }`}>
        {/* Category name with optional tree connector */}
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center">
            {isChild && childPosition && (
              <div className="flex items-center self-stretch shrink-0" style={{ width: '28px' }}>
                {/* Tree connector: vertical line + horizontal branch */}
                <div className="relative h-full w-full">
                  {/* Vertical line — full height for 'mid', half height for 'last' */}
                  <div
                    className={`absolute left-[10px] top-0 w-px bg-surface-300 dark:bg-surface-600 ${
                      childPosition === 'last' ? 'h-1/2' : 'h-full'
                    }`}
                  />
                  {/* Horizontal branch */}
                  <div className="absolute left-[10px] top-1/2 h-px w-[14px] bg-surface-300 dark:bg-surface-600" />
                </div>
              </div>
            )}
            <div>
              <span
                className={`font-bold text-surface-900 dark:text-surface-100 ${isChild ? 'text-sm' : 'text-base'}`}
              >
                {category.name}
              </span>
              {mode === 'beginner' ? (
                CATEGORY_EXPLAINERS[category.id]?.shortBlurb && (
                  <span className="block text-[0.6875rem] text-surface-500 dark:text-surface-400 font-normal leading-tight">
                    {CATEGORY_EXPLAINERS[category.id].shortBlurb}
                  </span>
                )
              ) : mode !== 'advanced' && category.description ? (
                <span className="block text-[0.6875rem] text-surface-500 dark:text-surface-400 font-normal leading-tight">
                  {category.description}
                </span>
              ) : null}
            </div>
          </div>
        </td>

        {product ? (
          <>
            {/* Product name — opens detail modal */}
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onViewDetail(product)}
                  className="text-left text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline transition-colors font-semibold"
                >
                  {getDisplayName(product)}
                </button>
                {isDacAmpCombo(product) && (
                  <span className="inline-flex shrink-0 items-center rounded-md bg-violet-100 px-1.5 py-0.5 text-[0.625rem] font-bold text-violet-700 ring-1 ring-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:ring-violet-500/40">
                    DAC/Amp
                  </span>
                )}
              </div>
              {product.brand && (
                <span className="block text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                  {product.brand}
                </span>
              )}
              {getBestModeLabel(product) && (
                <span className="block text-[0.625rem] font-medium text-green-600 dark:text-green-400 mt-0.5">
                  {getBestModeLabel(product)}
                </span>
              )}
            </td>

            {/* Price */}
            <td className="px-4 py-3 text-right">
              <PriceDisplay price={price} affiliateUrl={product.affiliate_url} />
            </td>

            {/* Swap + Remove buttons */}
            <td className="px-4 py-3 text-center">
              <div className="flex items-center justify-center gap-1">
                {/* Swap */}
                <button
                  type="button"
                  onClick={() => onChoose(category.id)}
                  className="p-1.5 rounded-md text-surface-400 hover:text-primary-500 dark:text-surface-500 dark:hover:text-primary-400 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
                  aria-label={`Swap ${product.name}`}
                  title="Swap"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H4.558a.75.75 0 0 0-.75.75v3.674a.75.75 0 0 0 1.5 0v-2.394l.312.311a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm-11.23-3.15a.75.75 0 0 0 1.449.39A5.5 5.5 0 0 1 14.7 6.2l.312.311h-2.433a.75.75 0 0 0 0 1.5h3.674a.75.75 0 0 0 .75-.75V3.587a.75.75 0 0 0-1.5 0v2.394l-.312-.311a7 7 0 0 0-11.712 3.138.75.75 0 0 0 .604.866Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                {/* Remove */}
                <button
                  type="button"
                  onClick={() => removeProduct(category.id)}
                  className="p-1.5 rounded-md text-surface-400 hover:text-red-500 dark:text-surface-500 dark:hover:text-red-400 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
                  aria-label={`Remove ${product.name}`}
                  title="Remove"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                  </svg>
                </button>
              </div>
            </td>
          </>
        ) : (
          /* No product selected: "Choose" button spanning middle columns */
          <td colSpan={3} className="px-4 py-3">
            <button
              type="button"
              onClick={() => onChoose(category.id)}
              className={`w-full py-2.5 px-4 rounded-lg border-2 border-dashed text-sm font-semibold transition-colors ${
                isGlass
                  ? 'border-white/30 dark:border-white/[0.12] text-surface-600 dark:text-surface-300 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50/50 dark:hover:bg-primary-900/20'
                  : 'border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20'
              }`}
            >
              + Choose a {category.name}
            </button>
          </td>
        )}
      </tr>

      {/* Mobile: card layout */}
      <div className={`md:hidden shadow-sm ${
        isGlass
          ? isChild
            ? 'ml-6 glass-1 rounded-2xl p-3'
            : 'glass-1 rounded-2xl p-4'
          : isChild
            ? 'ml-6 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-3'
            : 'rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4'
      }`}>
        {/* Card header: category name + action buttons */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isChild && (
              <div className="w-4 flex items-center justify-center shrink-0">
                <svg width="12" height="12" viewBox="0 0 12 12" className="text-surface-400 dark:text-surface-500" aria-hidden="true">
                  <path d="M0 0 L0 6 L12 6" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>
            )}
            <div>
              <span
                className={`font-bold text-surface-900 dark:text-surface-100 ${isChild ? 'text-sm' : 'text-base'}`}
              >
                {category.name}
              </span>
              {mode === 'beginner' ? (
                CATEGORY_EXPLAINERS[category.id]?.shortBlurb && (
                  <span className="block text-[0.6875rem] text-surface-500 dark:text-surface-400 font-normal leading-tight">
                    {CATEGORY_EXPLAINERS[category.id].shortBlurb}
                  </span>
                )
              ) : mode !== 'advanced' && category.description ? (
                <span className="block text-[0.6875rem] text-surface-500 dark:text-surface-400 font-normal leading-tight">
                  {category.description}
                </span>
              ) : null}
            </div>
          </div>
          {product && (
            <div className="flex items-center gap-1">
              {/* Swap */}
              <button
                type="button"
                onClick={() => onChoose(category.id)}
                className="p-1.5 rounded-md text-surface-400 hover:text-primary-500 dark:text-surface-500 dark:hover:text-primary-400 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
                aria-label={`Swap ${product.name}`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H4.558a.75.75 0 0 0-.75.75v3.674a.75.75 0 0 0 1.5 0v-2.394l.312.311a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm-11.23-3.15a.75.75 0 0 0 1.449.39A5.5 5.5 0 0 1 14.7 6.2l.312.311h-2.433a.75.75 0 0 0 0 1.5h3.674a.75.75 0 0 0 .75-.75V3.587a.75.75 0 0 0-1.5 0v2.394l-.312-.311a7 7 0 0 0-11.712 3.138.75.75 0 0 0 .604.866Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              {/* Remove */}
              <button
                type="button"
                onClick={() => removeProduct(category.id)}
                className="p-1.5 rounded-md text-surface-400 hover:text-red-500 dark:text-surface-500 dark:hover:text-red-400 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
                aria-label={`Remove ${product.name}`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4"
                  aria-hidden="true"
                >
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {product ? (
          <div className="space-y-2">
            {/* Product name — opens detail modal */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => onViewDetail(product)}
                className="text-left text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline transition-colors font-semibold text-sm"
              >
                {product.name}
              </button>
              {isDacAmpCombo(product) && (
                <span className="inline-flex shrink-0 items-center rounded-md bg-violet-100 px-1.5 py-0.5 text-[0.625rem] font-bold text-violet-700 ring-1 ring-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:ring-violet-500/40">
                  DAC/Amp
                </span>
              )}
            </div>
            {product.brand && (
              <span className="block text-xs text-surface-500 dark:text-surface-400">
                {product.brand}
              </span>
            )}

            {/* Price */}
            <div className="flex items-center justify-end">
              <PriceDisplay price={price} affiliateUrl={product.affiliate_url} />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onChoose(category.id)}
            className={`w-full py-2.5 px-4 rounded-lg border-2 border-dashed text-sm font-semibold transition-colors ${
              isGlass
                ? 'border-white/30 dark:border-white/[0.12] text-surface-600 dark:text-surface-300 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50/50 dark:hover:bg-primary-900/20'
                : 'border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-300 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20'
            }`}
          >
            + Choose a {category.name}
          </button>
        )}
      </div>
    </>
  );
}
