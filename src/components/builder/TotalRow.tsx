import { useBuild } from '../../context/BuildContext';

export default function TotalRow() {
  const { totalPrice, itemCount } = useBuild();

  return (
    <>
      {/* Desktop: table footer row */}
      <tr className="hidden md:table-row border-t-2 border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/80">
        <td className="px-4 py-4" colSpan={2}>
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-surface-900 dark:text-surface-100">
              Total:
            </span>
            <span className="text-sm text-surface-500 dark:text-surface-400">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </span>
          </div>
        </td>
        <td className="px-4 py-4 text-right">
          <span className="text-lg font-bold text-surface-900 dark:text-surface-100">
            ${totalPrice.toFixed(2)}
          </span>
        </td>
        <td className="px-4 py-4">{/* Remove column spacer */}</td>
      </tr>

      {/* Mobile: total card */}
      <div className="md:hidden rounded-lg border-2 border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/80 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-surface-900 dark:text-surface-100">
              Total:
            </span>
            <span className="text-sm text-surface-500 dark:text-surface-400">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </span>
          </div>
          <span className="text-lg font-bold text-surface-900 dark:text-surface-100">
            ${totalPrice.toFixed(2)}
          </span>
        </div>
      </div>
    </>
  );
}
