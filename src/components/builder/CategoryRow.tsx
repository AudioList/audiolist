import type { Category, CategoryId, BuildSelection, Product } from '../../types';
import { useBuild } from '../../context/BuildContext';
import { getCategoryBorderColor } from '../../lib/categories';
import PriceDisplay from '../shared/PriceDisplay';
import CategoryIcon from '../shared/CategoryIcon';

interface CategoryRowProps {
  category: Category;
  selection: BuildSelection | undefined;
  onChoose: (categoryId: CategoryId) => void;
  onViewDetail: (product: Product) => void;
}

export default function CategoryRow({ category, selection, onChoose, onViewDetail }: CategoryRowProps) {
  const { removeProduct } = useBuild();
  const product = selection?.product;
  const price = selection?.custom_price ?? product?.price ?? null;
  const borderColor = getCategoryBorderColor(category.id);

  return (
    <>
      {/* Desktop: table row */}
      <tr className="hidden md:table-row border-b border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
        {/* Category icon + name */}
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-2.5">
            <CategoryIcon categoryId={category.id} className="w-5 h-5 text-surface-500 dark:text-surface-400" />
            <div>
              <span className={`text-base font-bold text-surface-900 dark:text-surface-100`}>
                {category.name}
              </span>
              {category.description && (
                <span className="block text-[11px] text-surface-500 dark:text-surface-400 font-normal leading-tight">
                  {category.description}
                </span>
              )}
            </div>
          </div>
        </td>

        {product ? (
          <>
            {/* Product name — opens detail modal */}
            <td className="px-4 py-3">
              <button
                type="button"
                onClick={() => onViewDetail(product)}
                className="text-left text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline transition-colors font-semibold"
              >
                {product.name}
              </button>
              {product.brand && (
                <span className="block text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                  {product.brand}
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
              className={`w-full py-2.5 px-4 rounded-lg border-2 border-dashed ${borderColor}/40 text-surface-600 dark:text-surface-300 hover:${borderColor} hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors text-sm font-semibold`}
            >
              + Choose a {category.name}
            </button>
          </td>
        )}
      </tr>

      {/* Mobile: card layout */}
      <div className={`md:hidden rounded-lg border-l-4 ${borderColor} border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4 shadow-sm`}>
        {/* Card header: icon + category name + action buttons */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CategoryIcon categoryId={category.id} className="w-5 h-5 text-surface-500 dark:text-surface-400" />
            <div>
              <span className="text-base font-bold text-surface-900 dark:text-surface-100">
                {category.name}
              </span>
              {category.description && (
                <span className="block text-[11px] text-surface-500 dark:text-surface-400 font-normal leading-tight">
                  {category.description}
                </span>
              )}
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
            <button
              type="button"
              onClick={() => onViewDetail(product)}
              className="text-left text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline transition-colors font-semibold text-sm"
            >
              {product.name}
            </button>
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
            className={`w-full py-2.5 px-4 rounded-lg border-2 border-dashed ${borderColor}/40 text-surface-600 dark:text-surface-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors text-sm font-semibold`}
          >
            + Choose a {category.name}
          </button>
        )}
      </div>
    </>
  );
}
