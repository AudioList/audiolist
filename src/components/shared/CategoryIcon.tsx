import type { CategoryId } from '../../types';

interface CategoryIconProps {
  categoryId: CategoryId;
  className?: string;
}

/** Map each category to its photo file in /icons/ */
function getImagePath(categoryId: CategoryId): string {
  switch (categoryId) {
    case 'iem':
    case 'iem_tips':
    case 'iem_cable':
    case 'iem_filter':
      return '/icons/iem.png';
    case 'headphone':
    case 'hp_pads':
    case 'hp_cable':
    case 'hp_accessory':
      return '/icons/headphone.png';
    case 'dac':
      return '/icons/dac.png';
    case 'amp':
      return '/icons/amp.png';
    case 'speaker':
      return '/icons/speaker.png';
    case 'cable':
      return '/icons/cable.png';
    case 'dap':
      return '/icons/dap.png';
    case 'microphone':
      return '/icons/microphone.png';
    default:
      return '/icons/headphone.png';
  }
}

/**
 * Real product photo icons for each audio equipment category.
 * Uses small product photos with rounded corners.
 */
export default function CategoryIcon({ categoryId, className = 'w-5 h-5' }: CategoryIconProps) {
  return (
    <img
      src={getImagePath(categoryId)}
      alt=""
      aria-hidden="true"
      className={`${className} rounded object-cover`}
      loading="lazy"
    />
  );
}
