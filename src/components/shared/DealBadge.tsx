interface DealBadgeProps {
  type: 'discount' | 'all-time-low' | 'on-sale' | 'price-drop' | 'open-box';
  value?: number; // percentage for discount, negative pct for price-drop
}

export default function DealBadge({ type, value }: DealBadgeProps) {
  switch (type) {
    case 'discount':
      if (value == null || value <= 0) return null;
      return (
        <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[0.6rem] font-bold text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {Math.round(value)}% OFF
        </span>
      );

    case 'all-time-low':
      return (
        <span className="inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-[0.6rem] font-bold text-green-700 dark:bg-green-900/30 dark:text-green-400">
          ALL-TIME LOW
        </span>
      );

    case 'on-sale':
      return (
        <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[0.6rem] font-bold text-red-700 dark:bg-red-900/30 dark:text-red-400">
          ON SALE
        </span>
      );

    case 'price-drop':
      if (value == null) return null;
      return (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[0.6rem] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5" aria-hidden="true">
            <path fillRule="evenodd" d="M8 1.75a.75.75 0 0 1 .75.75v8.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.22 3.22V2.5A.75.75 0 0 1 8 1.75Z" clipRule="evenodd" />
          </svg>
          {Math.abs(Math.round(value))}%
        </span>
      );

    case 'open-box':
      return (
        <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.6rem] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          OPEN BOX
        </span>
      );
  }
}
