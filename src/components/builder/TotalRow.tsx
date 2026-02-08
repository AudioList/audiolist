import { useBuild } from '../../context/BuildContext';
import { useGlassMode } from '../../context/GlassModeContext';

export default function TotalRow() {
  const { totalPrice, itemCount } = useBuild();
  const isGlass = useGlassMode();

  return (
    <>
      {/* Desktop: table footer row */}
      <tr className={`hidden md:table-row border-t-2 ${
        isGlass
          ? 'border-white/20 dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.04]'
          : 'border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/80'
      }`}>
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
      <div className={`md:hidden p-4 shadow-sm ${
        isGlass
          ? 'glass-1 rounded-2xl border-2 border-white/20 dark:border-white/[0.06]'
          : 'rounded-lg border-2 border-surface-300 dark:border-surface-600 bg-surface-50 dark:bg-surface-800/80'
      }`}>
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
