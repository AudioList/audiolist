import { useExperienceMode, type ExperienceMode } from '../../context/ExperienceModeContext';

const modes: { value: ExperienceMode; label: string }[] = [
  { value: 'beginner', label: 'Simple' },
  { value: 'default', label: 'Default' },
  { value: 'advanced', label: 'Advanced' },
];

export default function ExperienceModeToggle() {
  const { mode, setMode } = useExperienceMode();

  return (
    <div className="flex items-center gap-0" role="radiogroup" aria-label="Experience mode">
      {modes.map((m, index) => {
        const isActive = mode === m.value;
        const isFirst = index === 0;
        const isLast = index === modes.length - 1;

        const roundedClass = isFirst ? 'rounded-l-md' : isLast ? 'rounded-r-md' : '';
        const marginClass = index > 0 ? '-ml-px' : '';

        const colorClass = isActive
          ? 'bg-primary-600 text-white border-primary-600 z-10'
          : 'bg-surface-100 text-surface-600 border-surface-300 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:border-surface-600 dark:hover:bg-surface-700';

        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => setMode(m.value)}
            className={`relative px-2.5 py-1 text-xs font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:z-10 ${roundedClass} ${marginClass} ${colorClass}`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
