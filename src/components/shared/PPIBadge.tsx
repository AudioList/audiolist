import { getPPIColor, getPPILabel, getPPITooltip } from '../../lib/categories';
import { useGlassMode } from '../../context/GlassModeContext';

interface PPIBadgeProps {
  score: number | null;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const sizeClasses: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'text-xs px-1.5 py-0.5',
  md: 'text-sm px-2 py-1',
  lg: 'text-base px-3 py-1.5',
};

export default function PPIBadge({ score, size = 'md', label: scoreLabel }: PPIBadgeProps) {
  const isGlass = useGlassMode();

  if (score === null) {
    return null;
  }

  const colorClasses = getPPIColor(score);
  const band = getPPILabel(score);
  const numericScore = score.toFixed(1);
  const isSpinorama = scoreLabel === 'Spinorama';
  const isSinad = scoreLabel === 'SINAD';
  const tooltip = isSinad
    ? `SINAD Score: ${numericScore} (${band}) — Normalized from raw dB measurement.`
    : getPPITooltip(score, isSpinorama);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold shadow-sm ${colorClasses} ${sizeClasses[size]}${isGlass ? ' backdrop-blur-sm' : ''}`}
      title={tooltip}
    >
      <span>{band}</span>
    </span>
  );
}
