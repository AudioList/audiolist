import { useGlassMode } from '../../context/GlassModeContext';
import { getPPILabel } from '../../lib/categories';

interface BestValueBadgeProps {
  score: number | null;
  price: number | null;
}

/**
 * Shows a "Great Value" badge when a product has a high score at a low price.
 * Simple static threshold for MVP: score >= 70 (B- or higher) and price <= $200.
 */
export default function BestValueBadge({ score, price }: BestValueBadgeProps) {
  const isGlass = useGlassMode();

  if (score === null || price === null || price <= 0) return null;
  if (score < 70 || price > 200) return null;

  return (
    <span
      className={isGlass
        ? "inline-flex items-center gap-1 rounded-full border border-green-400/30 bg-green-50/60 backdrop-blur-sm px-2 py-0.5 text-xs font-semibold text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-400"
        : "inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-400"
      }
      title={`High performance (${getPPILabel(score)}) at a great price ($${price.toFixed(0)})`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        fill="currentColor"
        className="h-3 w-3"
        aria-hidden="true"
      >
        <path fillRule="evenodd" d="M2.75 2a.75.75 0 0 0-.75.75v10.5c0 .414.336.75.75.75h10.5a.75.75 0 0 0 .75-.75V2.75a.75.75 0 0 0-.75-.75H2.75ZM8 5a.75.75 0 0 1 .75.75v1.5h1.5a.75.75 0 0 1 0 1.5h-1.5v1.5a.75.75 0 0 1-1.5 0v-1.5h-1.5a.75.75 0 0 1 0-1.5h1.5v-1.5A.75.75 0 0 1 8 5Z" clipRule="evenodd" />
      </svg>
      Great Value
    </span>
  );
}
