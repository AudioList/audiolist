import { useMemo } from 'react';
import type { CategoryId, Product, Category } from '../../types';
import { CATEGORIES, getChildCategories } from '../../lib/categories';
import { useBuild } from '../../context/BuildContext';
import { useGlassMode } from '../../context/GlassModeContext';
import CategoryRow from './CategoryRow';
import TotalRow from './TotalRow';

interface BuilderTableProps {
  onChooseProduct: (categoryId: CategoryId) => void;
  onViewDetail: (product: Product) => void;
}

interface TreeRow {
  category: Category;
  isChild: boolean;
  childPosition?: 'mid' | 'last';
}

export default function BuilderTable({ onChooseProduct, onViewDetail }: BuilderTableProps) {
  const { getSelection } = useBuild();

  /** Build a flat list of categories with tree metadata for rendering. */
  const treeRows = useMemo<TreeRow[]>(() => {
    const rows: TreeRow[] = [];

    for (const cat of CATEGORIES) {
      if (cat.parent_category !== null) continue;

      rows.push({ category: cat, isChild: false });

      const children = getChildCategories(cat.id);
      children.forEach((child, idx) => {
        rows.push({
          category: child,
          isChild: true,
          childPosition: idx === children.length - 1 ? 'last' : 'mid',
        });
      });
    }

    return rows;
  }, []);

  const isGlass = useGlassMode();

  return (
    <div>
      {/* Desktop: HTML table */}
      <div className={`hidden md:block overflow-x-auto shadow-sm ${
        isGlass
          ? 'glass-1 rounded-2xl'
          : 'rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900'
      }`}>
        <table className="w-full text-sm">
          <thead>
            <tr className={isGlass
              ? 'bg-white/40 dark:bg-white/[0.04] text-surface-700 dark:text-surface-200 text-left border-b-2 border-white/20 dark:border-white/[0.06]'
              : 'bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-200 text-left border-b-2 border-surface-300 dark:border-surface-600'
            }>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider w-64">Component</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider">Selection</th>
              <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-right w-28">Price</th>
              <th className="px-4 py-3 w-20">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {treeRows.map((row) => (
              <CategoryRow
                key={row.category.id}
                category={row.category}
                selection={getSelection(row.category.id)}
                onChoose={onChooseProduct}
                onViewDetail={onViewDetail}
                isChild={row.isChild}
                childPosition={row.childPosition}
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
        {treeRows.map((row) => (
          <CategoryRow
            key={row.category.id}
            category={row.category}
            selection={getSelection(row.category.id)}
            onChoose={onChooseProduct}
            onViewDetail={onViewDetail}
            isChild={row.isChild}
            childPosition={row.childPosition}
          />
        ))}
        <TotalRow />
      </div>

      {/* Compatibility note */}
      <div className={`mt-4 rounded-lg border px-4 py-3 ${
        isGlass
          ? 'border-ppi-excellent/30 bg-ppi-excellent/5 dark:bg-ppi-excellent/10 backdrop-blur-sm'
          : 'border-ppi-excellent/30 bg-ppi-excellent/5 dark:bg-ppi-excellent/10'
      }`}>
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
