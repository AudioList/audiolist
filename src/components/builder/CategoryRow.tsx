import type { Category, CategoryId, BuildSelection } from '../../types';
import { getCategoryIcon } from '../../lib/categories';
import { useBuild } from '../../context/BuildContext';
import PPIBadge from '../shared/PPIBadge';
import PriceDisplay from '../shared/PriceDisplay';

interface CategoryRowProps {
  category: Category;
  selection: BuildSelection | undefined;
  onChoose: (categoryId: CategoryId) => void;
}

export default function CategoryRow({ category, selection, onChoose }: CategoryRowProps) {
  const { removeProduct } = useBuild();
  const icon = getCategoryIcon(category.id);
  const product = selection?.product;
  const price = selection?.custom_price ?? product?.price ?? null;

  return (
    <>
      {/* Desktop: table row */}
      <tr className="hidden md:table-row border-b border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
        {/* Category icon + name */}
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">{icon}</span>
            <span className="font-medium text-surface-900 dark:text-surface-100">
              {category.name}
            </span>
          </div>
        </td>

        {product ? (
          <>
            {/* Product name */}
            <td className="px-4 py-3">
              <button
                type="button"
                onClick={() => onChoose(category.id)}
                className="text-left text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline transition-colors font-medium"
              >
                {product.name}
              </button>
            </td>

            {/* PPI badge */}
            <td className="px-4 py-3 text-center">
              {category.has_ppi ? (
                <PPIBadge score={product.ppi_score} size="sm" />
              ) : (
                <span className="text-surface-400 dark:text-surface-500 text-sm">--</span>
              )}
            </td>

            {/* Price */}
            <td className="px-4 py-3 text-right">
              <PriceDisplay price={price} affiliateUrl={product.affiliate_url} />
            </td>

            {/* Remove button */}
            <td className="px-4 py-3 text-center">
              <button
                type="button"
                onClick={() => removeProduct(category.id)}
                className="p-1 rounded text-surface-400 hover:text-red-500 dark:text-surface-500 dark:hover:text-red-400 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
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
            </td>
          </>
        ) : (
          /* No product selected: "Choose" button spanning middle columns */
          <td colSpan={4} className="px-4 py-3">
            <button
              type="button"
              onClick={() => onChoose(category.id)}
              className="w-full py-2 px-4 rounded-lg border-2 border-dashed border-surface-300 dark:border-surface-600 text-surface-500 dark:text-surface-400 hover:border-primary-400 dark:hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors text-sm font-medium"
            >
              Choose a {category.name}
            </button>
          </td>
        )}
      </tr>

      {/* Mobile: card layout */}
      <div className="md:hidden rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4 shadow-sm">
        {/* Card header: icon + category name */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">{icon}</span>
            <span className="font-medium text-surface-900 dark:text-surface-100">
              {category.name}
            </span>
          </div>
          {product && (
            <button
              type="button"
              onClick={() => removeProduct(category.id)}
              className="p-1 rounded text-surface-400 hover:text-red-500 dark:text-surface-500 dark:hover:text-red-400 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
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
          )}
        </div>

        {product ? (
          <div className="space-y-2">
            {/* Product name */}
            <button
              type="button"
              onClick={() => onChoose(category.id)}
              className="text-left text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline transition-colors font-medium text-sm"
            >
              {product.name}
            </button>

            {/* PPI + Price row */}
            <div className="flex items-center justify-between">
              <div>
                {category.has_ppi && (
                  <PPIBadge score={product.ppi_score} size="sm" />
                )}
              </div>
              <PriceDisplay price={price} affiliateUrl={product.affiliate_url} />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onChoose(category.id)}
            className="w-full py-2.5 px-4 rounded-lg border-2 border-dashed border-surface-300 dark:border-surface-600 text-surface-500 dark:text-surface-400 hover:border-primary-400 dark:hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors text-sm font-medium"
          >
            Choose a {category.name}
          </button>
        )}
      </div>
    </>
  );
}
