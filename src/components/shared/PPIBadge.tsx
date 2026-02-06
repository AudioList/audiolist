import { getPPIColor, getPPILabel } from '../../lib/categories';

interface PPIBadgeProps {
  score: number | null;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-sm px-2 py-1',
  lg: 'text-base px-3 py-1.5',
};

export default function PPIBadge({ score, size = 'md' }: PPIBadgeProps) {
  if (score === null) {
    return null;
  }

  const colorClasses = getPPIColor(score);
  const label = getPPILabel(score);
  const display = score.toFixed(1);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${colorClasses} ${sizeClasses[size]}`}
      title={`PPI: ${display} - ${label}`}
    >
      <span>{display}</span>
      <span className="opacity-80">{label}</span>
    </span>
  );
}
