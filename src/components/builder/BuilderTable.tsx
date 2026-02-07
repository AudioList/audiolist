import type { CategoryId, Product } from '../../types';
import { CATEGORIES } from '../../lib/categories';
import { useBuild } from '../../context/BuildContext';
import CategoryRow from './CategoryRow';
import TotalRow from './TotalRow';

interface BuilderTableProps {
  onChooseProduct: (categoryId: CategoryId) => void;
  onViewDetail: (product: Product) => void;
}

export default function BuilderTable({ onChooseProduct, onViewDetail }: BuilderTableProps) {
  const { getSelection } = useBuild();

  return (
    <div>
      {/* Desktop: HTML table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-200 text-left border-b-2 border-surface-300 dark:border-surface-600">
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider w-56">Component</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">Selection</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-right w-28">Price</th>
              <th className="px-4 py-3 w-20">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                selection={getSelection(category.id)}
                onChoose={onChooseProduct}
                onViewDetail={onViewDetail}
              />
            ))}
          </tbody>
          <tfoot>
            <TotalRow />
          </tfoot>
        </table>
      </div>

      {/* Mobile: card list */}
      <div className="md:hidden flex flex-col gap-3">
        {CATEGORIES.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            selection={getSelection(category.id)}
            onChoose={onChooseProduct}
            onViewDetail={onViewDetail}
          />
        ))}
        <TotalRow />
      </div>

      {/* Compatibility note */}
      <div className="mt-4 rounded-lg border border-ppi-excellent/30 bg-ppi-excellent/5 dark:bg-ppi-excellent/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-5 h-5 text-ppi-excellent flex-shrink-0"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-sm font-medium text-ppi-excellent">
            No compatibility issues found
          </span>
        </div>
      </div>
    </div>
  );
}
