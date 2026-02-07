import type { CategoryId } from '../../types';

interface CategoryIconProps {
  categoryId: CategoryId;
  className?: string;
}

/**
 * Professional SVG icons for each audio equipment category.
 * Replaces emoji icons with clean, monochrome line/fill icons.
 */
export default function CategoryIcon({ categoryId, className = 'w-5 h-5' }: CategoryIconProps) {
  const props = {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true as const,
  };

  switch (categoryId) {
    // IEM — small earbud shape
    case 'iem':
      return (
        <svg {...props}>
          <path d="M2 14a4 4 0 0 1 4-4h1a3 3 0 0 1 3 3v3a4 4 0 0 1-4 4h0a4 4 0 0 1-4-4v-2Z" />
          <path d="M7 10V6a5 5 0 0 1 10 0v4" />
          <path d="M17 10h1a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h0a4 4 0 0 1-4-4v-3a3 3 0 0 1 3-3Z" />
        </svg>
      );

    // Eartips — small rounded tip shape
    case 'iem_tips':
      return (
        <svg {...props}>
          <ellipse cx="12" cy="14" rx="5" ry="6" />
          <path d="M9 9c0-2 1.5-4 3-4s3 2 3 4" />
          <line x1="12" y1="5" x2="12" y2="3" />
        </svg>
      );

    // IEM Cable — cable with connector
    case 'iem_cable':
      return (
        <svg {...props}>
          <path d="M8 3v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V3" />
          <line x1="12" y1="9" x2="12" y2="15" />
          <path d="M8 15a4 4 0 0 0 8 0" />
          <line x1="8" y1="15" x2="8" y2="21" />
          <line x1="16" y1="15" x2="16" y2="21" />
        </svg>
      );

    // Filters & Modules — tuning knob / gear
    case 'iem_filter':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
        </svg>
      );

    // Headphones — over-ear headphone shape
    case 'headphone':
      return (
        <svg {...props}>
          <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3v5Z" />
          <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3v5Z" />
        </svg>
      );

    // Earpads — cushion shape
    case 'hp_pads':
      return (
        <svg {...props}>
          <rect x="4" y="6" width="16" height="12" rx="6" />
          <ellipse cx="12" cy="12" rx="4" ry="3" />
        </svg>
      );

    // Headphone Cable — cable with 3.5mm jack
    case 'hp_cable':
      return (
        <svg {...props}>
          <line x1="12" y1="2" x2="12" y2="10" />
          <path d="M8 10h8v3a4 4 0 0 1-8 0v-3Z" />
          <line x1="12" y1="17" x2="12" y2="22" />
          <line x1="10" y1="5" x2="14" y2="5" />
          <line x1="10" y1="8" x2="14" y2="8" />
        </svg>
      );

    // DAC — chip / circuit board
    case 'dac':
      return (
        <svg {...props}>
          <rect x="5" y="5" width="14" height="14" rx="2" />
          <rect x="9" y="9" width="6" height="6" rx="1" />
          <line x1="9" y1="2" x2="9" y2="5" />
          <line x1="15" y1="2" x2="15" y2="5" />
          <line x1="9" y1="19" x2="9" y2="22" />
          <line x1="15" y1="19" x2="15" y2="22" />
          <line x1="2" y1="9" x2="5" y2="9" />
          <line x1="2" y1="15" x2="5" y2="15" />
          <line x1="19" y1="9" x2="22" y2="9" />
          <line x1="19" y1="15" x2="22" y2="15" />
        </svg>
      );

    // Amplifier — amp with power symbol
    case 'amp':
      return (
        <svg {...props}>
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="8" cy="12" r="2" />
          <circle cx="16" cy="12" r="2" />
          <line x1="12" y1="9" x2="12" y2="15" />
          <line x1="9" y1="12" x2="15" y2="12" />
        </svg>
      );

    // Speaker — speaker driver cone
    case 'speaker':
      return (
        <svg {...props}>
          <path d="M6 3h4l6 5v8l-6 5H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M19 7c1.5 1.5 2 3.5 2 5s-.5 3.5-2 5" />
          <path d="M16.5 9.5c.75.75 1 1.75 1 2.5s-.25 1.75-1 2.5" />
        </svg>
      );

    // Cable — audio cable with plug
    case 'cable':
      return (
        <svg {...props}>
          <line x1="4" y1="20" x2="10" y2="14" />
          <path d="M10 14l-2-2 6-6 2 2" />
          <path d="M16 8l2-2c1-1 1-3 0-4s-3-1-4 0l-2 2" />
          <line x1="8" y1="16" x2="3" y2="21" />
        </svg>
      );

    // DAP — portable music player
    case 'dap':
      return (
        <svg {...props}>
          <rect x="6" y="2" width="12" height="20" rx="2" />
          <rect x="8" y="4" width="8" height="8" rx="1" />
          <circle cx="12" cy="16.5" r="2" />
        </svg>
      );

    // Microphone — studio condenser mic
    case 'microphone':
      return (
        <svg {...props}>
          <rect x="9" y="2" width="6" height="11" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <line x1="12" y1="17" x2="12" y2="21" />
          <line x1="8" y1="21" x2="16" y2="21" />
        </svg>
      );

    // Fallback — music note
    default:
      return (
        <svg {...props}>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
  }
}
