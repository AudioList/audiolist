import { Link } from 'react-router-dom';
import type { CategoryId, Product } from '../../types';
import { useBuild } from '../../context/BuildContext';
import { usePopularPairings } from '../../hooks/usePopularPairings';
import { CATEGORY_MAP } from '../../lib/categories';

interface PopularPairingsProps {
  productId: string;
}

function PairingCard({ product, count }: { product: Product; count: number }) {
  const { setProduct, getSelection } = useBuild();
  const category = CATEGORY_MAP.get(product.category_id);
  const isInBuild = !!getSelection(product.category_id);

  function handleAdd() {
    setProduct(product.category_id as CategoryId, product);
  }

  return (
    <div className="flex w-48 shrink-0 flex-col rounded-lg border border-surface-200 bg-white p-3 dark:border-surface-700 dark:bg-surface-900">
      {/* Category tag */}
      <span className="mb-1.5 self-start rounded bg-surface-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-surface-500 dark:bg-surface-800 dark:text-surface-400">
        {category?.name ?? product.category_id}
      </span>

      {/* Product name */}
      <Link
        to={`/product/${product.id}`}
        className="text-sm font-semibold text-surface-900 hover:text-primary-600 dark:text-surface-100 dark:hover:text-primary-400 line-clamp-2 leading-tight"
      >
        {product.name}
      </Link>

      {/* Brand */}
      {product.brand && (
        <span className="mt-0.5 text-xs text-surface-400 dark:text-surface-500">
          {product.brand}
        </span>
      )}

      {/* Price + pairing count */}
      <div className="mt-auto flex items-end justify-between pt-2">
        <div>
          {product.price !== null && (
            <span className="text-sm font-bold text-surface-900 dark:text-surface-100">
              ${product.price.toFixed(0)}
            </span>
          )}
          <span className="ml-1 text-[10px] text-surface-400 dark:text-surface-500">
            {count} {count === 1 ? 'build' : 'builds'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={isInBuild}
          className="shrink-0 rounded-md bg-primary-600 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-primary-500 disabled:bg-surface-300 disabled:text-surface-500 dark:disabled:bg-surface-700 dark:disabled:text-surface-500"
        >
          {isInBuild ? 'Added' : 'Add'}
        </button>
      </div>
    </div>
  );
}

export default function PopularPairings({ productId }: PopularPairingsProps) {
  const { pairings, loading } = usePopularPairings(productId);

  // Only render if there are at least 2 pairings
  if (loading || pairings.length < 2) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold text-surface-900 dark:text-surface-100">
        Frequently Paired With
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {pairings.map((p) => (
          <PairingCard key={p.product.id} product={p.product} count={p.count} />
        ))}
      </div>
    </div>
  );
}
