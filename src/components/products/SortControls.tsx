import type { ProductSort, SortField } from '../../types';
import { useExperienceMode } from '../../context/ExperienceModeContext';

interface SortControlsProps {
  sort: ProductSort;
  onChange: (sort: ProductSort) => void;
  showPPI?: boolean;
  showSinad?: boolean;
  scoreLabel?: string;
}

function ArrowUp() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8 14a.75.75 0 0 1-.75-.75V4.56L4.03 7.78a.75.75 0 0 1-1.06-1.06l4.5-4.5a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1-1.06 1.06L8.75 4.56v8.69A.75.75 0 0 1 8 14Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ArrowDown() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8 2a.75.75 0 0 1 .75.75v8.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.22 3.22V2.75A.75.75 0 0 1 8 2Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

interface SortOption {
  field: SortField;
  label: string;
}

export default function SortControls({ sort, onChange, showPPI = false, showSinad = false, scoreLabel }: SortControlsProps) {
  const { mode } = useExperienceMode();
  const options: SortOption[] = [];

  if (showPPI) {
    options.push({ field: 'ppi_score', label: mode === 'beginner' ? 'Score' : (scoreLabel ?? 'PPI Score') });
  }
  if (showSinad) {
    options.push({ field: 'sinad_db', label: mode === 'beginner' ? 'Score' : 'SINAD' });
  }
  options.push({ field: 'price', label: 'Price' });
  options.push({ field: 'name', label: 'Name' });

  function handleClick(field: SortField) {
    if (sort.field === field) {
      onChange({ field, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      const defaultDir = field === 'name' ? 'asc' : 'desc';
      onChange({ field, direction: defaultDir });
    }
  }

  return (
    <div className="flex items-center gap-0" role="group" aria-label="Sort controls">
      {options.map((opt, index) => {
        const isActive = sort.field === opt.field;
        const isFirst = index === 0;
        const isLast = index === options.length - 1;

        const roundedClass = isFirst
          ? 'rounded-l-lg'
          : isLast
            ? 'rounded-r-lg'
            : '';

        const baseClass =
          'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:z-10';

        const colorClass = isActive
          ? 'bg-primary-600 text-white border-primary-600 dark:bg-primary-600 dark:border-primary-600'
          : 'bg-surface-800 text-surface-300 border-surface-600 hover:bg-surface-700 hover:text-surface-100 dark:bg-surface-800 dark:text-surface-300 dark:border-surface-600 dark:hover:bg-surface-700';

        const marginClass = index > 0 ? '-ml-px' : '';

        return (
          <button
            key={opt.field}
            type="button"
            onClick={() => handleClick(opt.field)}
            className={`${baseClass} ${colorClass} ${roundedClass} ${marginClass}`}
            aria-pressed={isActive}
          >
            {opt.label}
            {isActive && (sort.direction === 'asc' ? <ArrowUp /> : <ArrowDown />)}
          </button>
        );
      })}
    </div>
  );
}
