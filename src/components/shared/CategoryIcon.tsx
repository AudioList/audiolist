import type { CategoryId } from '../../types';

interface CategoryIconProps {
  categoryId: CategoryId;
  className?: string;
}

/**
 * Realistic SVG illustrations for each audio equipment category.
 * Based on real device silhouettes — detailed filled shapes with shading.
 */
export default function CategoryIcon({ categoryId, className = 'w-5 h-5' }: CategoryIconProps) {
  switch (categoryId) {
    // IEM — realistic in-ear monitor with cable nozzle and shell
    case 'iem':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className={className} aria-hidden="true">
          <defs>
            <linearGradient id="iem-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.85" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.55" />
            </linearGradient>
          </defs>
          {/* Cable */}
          <path d="M32 58c0-6 4-10 8-14s6-8 6-14" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.4" strokeLinecap="round" />
          {/* Left shell body */}
          <path d="M10 22c-2 4-3 8-2 13 1 6 5 11 12 13 5 1 10-1 13-5 3-5 3-11 1-17-2-5-6-10-12-12-5-1-9 1-12 4z" fill="url(#iem-g)" />
          {/* Left nozzle */}
          <path d="M8 28c-3-1-5-3-4-6 1-2 3-3 5-2l3 2z" fill="currentColor" fillOpacity="0.7" />
          {/* Shell highlight */}
          <ellipse cx="22" cy="28" rx="6" ry="5" fill="currentColor" fillOpacity="0.12" />
          {/* Driver vent dot */}
          <circle cx="18" cy="32" r="1.5" fill="currentColor" fillOpacity="0.3" />
          {/* Right shell body (smaller, behind) */}
          <path d="M42 18c2 3 3 7 2 12-1 5-4 10-10 12-4 1-8-1-10-4-3-4-3-9-1-14 2-4 5-8 10-10 4-1 7 0 9 3z" fill="currentColor" fillOpacity="0.35" />
          {/* Right nozzle */}
          <path d="M54 24c2-1 4-2 4-5s-2-3-4-3l-3 2z" fill="currentColor" fillOpacity="0.25" />
        </svg>
      );

    // Eartips — silicone ear tip with mushroom shape
    case 'iem_tips':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className={className} aria-hidden="true">
          {/* Stem tube */}
          <rect x="27" y="36" width="10" height="16" rx="2" fill="currentColor" fillOpacity="0.5" />
          {/* Stem bore hole */}
          <rect x="29.5" y="38" width="5" height="14" rx="1.5" fill="currentColor" fillOpacity="0.15" />
          {/* Mushroom dome */}
          <ellipse cx="32" cy="28" rx="18" ry="14" fill="currentColor" fillOpacity="0.6" />
          {/* Dome highlight */}
          <ellipse cx="28" cy="24" rx="8" ry="5" fill="currentColor" fillOpacity="0.12" />
          {/* Inner bore opening */}
          <ellipse cx="32" cy="28" rx="5" ry="4" fill="currentColor" fillOpacity="0.2" />
          {/* Lip ring at base of dome */}
          <ellipse cx="32" cy="36" rx="12" ry="3" fill="currentColor" fillOpacity="0.4" />
        </svg>
      );

    // IEM Cable — 2-pin/MMCX cable with Y-split
    case 'iem_cable':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className={className} aria-hidden="true">
          {/* Left branch */}
          <path d="M16 8c0 4 2 8 6 14s8 10 10 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.6" strokeLinecap="round" />
          {/* Right branch */}
          <path d="M48 8c0 4-2 8-6 14s-8 10-10 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.6" strokeLinecap="round" />
          {/* Main cable below Y-split */}
          <path d="M32 38v18" stroke="currentColor" strokeWidth="3" strokeOpacity="0.5" strokeLinecap="round" />
          {/* Left connector */}
          <rect x="12" y="4" width="8" height="6" rx="2" fill="currentColor" fillOpacity="0.7" />
          <circle cx="14.5" cy="7" r="1" fill="currentColor" fillOpacity="0.3" />
          <circle cx="17.5" cy="7" r="1" fill="currentColor" fillOpacity="0.3" />
          {/* Right connector */}
          <rect x="44" y="4" width="8" height="6" rx="2" fill="currentColor" fillOpacity="0.7" />
          <circle cx="46.5" cy="7" r="1" fill="currentColor" fillOpacity="0.3" />
          <circle cx="49.5" cy="7" r="1" fill="currentColor" fillOpacity="0.3" />
          {/* Y-split housing */}
          <rect x="28" y="35" width="8" height="6" rx="3" fill="currentColor" fillOpacity="0.6" />
          {/* Jack plug */}
          <rect x="29" y="54" width="6" height="6" rx="1.5" fill="currentColor" fillOpacity="0.7" />
          <rect x="31" y="60" width="2" height="2" rx="0.5" fill="currentColor" fillOpacity="0.5" />
        </svg>
      );

    // Filters & Modules — small cylindrical tuning filter
    case 'iem_filter':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className={className} aria-hidden="true">
          {/* Filter body */}
          <rect x="12" y="20" width="40" height="24" rx="4" fill="currentColor" fillOpacity="0.6" />
          {/* Metallic band */}
          <rect x="12" y="28" width="40" height="8" fill="currentColor" fillOpacity="0.3" />
          {/* Nozzle left */}
          <rect x="4" y="27" width="10" height="10" rx="5" fill="currentColor" fillOpacity="0.7" />
          <circle cx="6" cy="32" r="2.5" fill="currentColor" fillOpacity="0.2" />
          {/* Nozzle right */}
          <rect x="50" y="27" width="10" height="10" rx="5" fill="currentColor" fillOpacity="0.7" />
          <circle cx="58" cy="32" r="2.5" fill="currentColor" fillOpacity="0.2" />
          {/* Color identification ring */}
          <rect x="22" y="20" width="4" height="24" rx="1" fill="currentColor" fillOpacity="0.15" />
          {/* Mesh pattern dots */}
          <circle cx="32" cy="32" r="1" fill="currentColor" fillOpacity="0.2" />
          <circle cx="36" cy="32" r="1" fill="currentColor" fillOpacity="0.2" />
          <circle cx="40" cy="32" r="1" fill="currentColor" fillOpacity="0.2" />
        </svg>
      );

    // Headphones — realistic over-ear headphone with headband and cups
    case 'headphone':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className={className} aria-hidden="true">
          <defs>
            <linearGradient id="hp-g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.8" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          {/* Headband */}
          <path d="M10 32C10 16 18 6 32 6s22 10 22 26" fill="none" stroke="currentColor" strokeWidth="4" strokeOpacity="0.7" strokeLinecap="round" />
          {/* Headband padding */}
          <path d="M24 8c2-1 5-1.5 8-1.5s6 .5 8 1.5" fill="none" stroke="currentColor" strokeWidth="6" strokeOpacity="0.25" strokeLinecap="round" />
          {/* Left yoke */}
          <path d="M10 32v6" stroke="currentColor" strokeWidth="3" strokeOpacity="0.5" strokeLinecap="round" />
          {/* Right yoke */}
          <path d="M54 32v6" stroke="currentColor" strokeWidth="3" strokeOpacity="0.5" strokeLinecap="round" />
          {/* Left ear cup */}
          <rect x="2" y="34" width="18" height="22" rx="6" fill="url(#hp-g)" />
          {/* Left pad */}
          <rect x="4" y="36" width="14" height="18" rx="5" fill="currentColor" fillOpacity="0.2" />
          {/* Left driver center */}
          <circle cx="11" cy="45" r="3" fill="currentColor" fillOpacity="0.15" />
          {/* Right ear cup */}
          <rect x="44" y="34" width="18" height="22" rx="6" fill="url(#hp-g)" />
          {/* Right pad */}
          <rect x="46" y="36" width="14" height="18" rx="5" fill="currentColor" fillOpacity="0.2" />
          {/* Right driver center */}
          <circle cx="53" cy="45" r="3" fill="currentColor" fillOpacity="0.15" />
        </svg>
      );

    // Earpads — round earpad cushion
    case 'hp_pads':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className={className} aria-hidden="true">
          {/* Outer pad ring */}
          <ellipse cx="32" cy="32" rx="26" ry="24" fill="currentColor" fillOpacity="0.55" />
          {/* Inner ear opening */}
          <ellipse cx="32" cy="32" rx="14" ry="12" fill="currentColor" fillOpacity="0.15" />
          {/* Pad surface highlight */}
          <ellipse cx="26" cy="26" rx="10" ry="8" fill="currentColor" fillOpacity="0.1" />
          {/* Stitch line */}
          <ellipse cx="32" cy="32" rx="22" ry="20" fill="none" stroke="currentColor" strokeWidth="0.8" strokeOpacity="0.2" strokeDasharray="3 3" />
          {/* Lip edge */}
          <ellipse cx="32" cy="32" rx="26" ry="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
        </svg>
      );

    // Headphone Cable — 3.5mm TRS jack and cable
    case 'hp_cable':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className={className} aria-hidden="true">
          {/* Cable body */}
          <path d="M32 4v22" stroke="currentColor" strokeWidth="3" strokeOpacity="0.4" strokeLinecap="round" />
          {/* Strain relief boot */}
          <path d="M28 4h8l-1 6h-6z" fill="currentColor" fillOpacity="0.5" />
          {/* Plug housing */}
          <rect x="26" y="26" width="12" height="16" rx="3" fill="currentColor" fillOpacity="0.7" />
          {/* Housing grip texture */}
          <line x1="28" y1="30" x2="36" y2="30" stroke="currentColor" strokeWidth="0.8" strokeOpacity="0.2" />
          <line x1="28" y1="33" x2="36" y2="33" stroke="currentColor" strokeWidth="0.8" strokeOpacity="0.2" />
          <line x1="28" y1="36" x2="36" y2="36" stroke="currentColor" strokeWidth="0.8" strokeOpacity="0.2" />
          {/* TRS shaft */}
          <rect x="30" y="42" width="4" height="12" rx="1" fill="currentColor" fillOpacity="0.6" />
          {/* Ring insulator */}
          <rect x="29.5" y="46" width="5" height="1.5" rx="0.5" fill="currentColor" fillOpacity="0.2" />
          {/* Ring insulator 2 */}
          <rect x="29.5" y="50" width="5" height="1.5" rx="0.5" fill="currentColor" fillOpacity="0.2" />
          {/* Tip */}
          <path d="M30 54h4l-1 6h-2z" fill="currentColor" fillOpacity="0.65" />
        </svg>
      );

    // DAC — realistic desktop USB DAC unit
    case 'dac':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className={className} aria-hidden="true">
          <defs>
            <linearGradient id="dac-g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.75" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          {/* Main chassis — angled perspective */}
          <path d="M6 24h52l-4 24H10z" fill="url(#dac-g)" />
          {/* Top face */}
          <path d="M6 24l4-8h44l4 8z" fill="currentColor" fillOpacity="0.35" />
          {/* Front panel */}
          <rect x="10" y="38" width="44" height="10" rx="1" fill="currentColor" fillOpacity="0.25" />
          {/* LED indicator */}
          <circle cx="16" cy="43" r="1.5" fill="currentColor" fillOpacity="0.5" />
          {/* Volume knob */}
          <circle cx="48" cy="43" r="4" fill="currentColor" fillOpacity="0.4" />
          <circle cx="48" cy="43" r="2" fill="currentColor" fillOpacity="0.15" />
          {/* Knob indicator line */}
          <line x1="48" y1="39.5" x2="48" y2="41" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
          {/* USB port */}
          <rect x="24" y="41" width="6" height="3" rx="0.5" fill="currentColor" fillOpacity="0.2" />
          {/* Brand label */}
          <rect x="30" y="20" width="10" height="2" rx="0.5" fill="currentColor" fillOpacity="0.15" />
          {/* Ventilation slots on top */}
          <line x1="14" y1="20" x2="20" y2="20" stroke="currentColor" strokeWidth="0.7" strokeOpacity="0.15" />
          <line x1="14" y1="22" x2="20" y2="22" stroke="currentColor" strokeWidth="0.7" strokeOpacity="0.15" />
        </svg>
      );

    // Amplifier — desktop headphone amp with knob
    case 'amp':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className={className} aria-hidden="true">
          <defs>
            <linearGradient id="amp-g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.8" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.55" />
            </linearGradient>
          </defs>
          {/* Chassis body */}
          <rect x="4" y="18" width="56" height="30" rx="3" fill="url(#amp-g)" />
          {/* Top edge bevel */}
          <rect x="4" y="18" width="56" height="4" rx="2" fill="currentColor" fillOpacity="0.25" />
          {/* Front panel lighter section */}
          <rect x="6" y="24" width="52" height="22" rx="2" fill="currentColor" fillOpacity="0.2" />
          {/* Large volume knob */}
          <circle cx="44" cy="35" r="9" fill="currentColor" fillOpacity="0.45" />
          <circle cx="44" cy="35" r="6" fill="currentColor" fillOpacity="0.2" />
          <circle cx="44" cy="35" r="1.5" fill="currentColor" fillOpacity="0.35" />
          {/* Knob pointer */}
          <line x1="44" y1="27" x2="44" y2="30" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="round" />
          {/* 6.35mm jack */}
          <circle cx="16" cy="35" r="4" fill="currentColor" fillOpacity="0.3" />
          <circle cx="16" cy="35" r="2" fill="currentColor" fillOpacity="0.15" />
          {/* Gain toggle switch */}
          <rect x="26" y="31" width="4" height="8" rx="2" fill="currentColor" fillOpacity="0.35" />
          <circle cx="28" cy="34" r="1.5" fill="currentColor" fillOpacity="0.2" />
          {/* Power LED */}
          <circle cx="10" cy="26" r="1" fill="currentColor" fillOpacity="0.45" />
          {/* Feet */}
          <circle cx="10" cy="50" r="2" fill="currentColor" fillOpacity="0.3" />
          <circle cx="54" cy="50" r="2" fill="currentColor" fillOpacity="0.3" />
        </svg>
      );

    // Speaker — bookshelf speaker front-facing
    case 'speaker':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className={className} aria-hidden="true">
          <defs>
            <linearGradient id="spk-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.75" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.55" />
            </linearGradient>
          </defs>
          {/* Cabinet */}
          <rect x="12" y="4" width="40" height="56" rx="3" fill="url(#spk-g)" />
          {/* Cabinet edge */}
          <rect x="12" y="4" width="40" height="56" rx="3" fill="none" stroke="currentColor" strokeWidth="1" strokeOpacity="0.25" />
          {/* Tweeter */}
          <circle cx="32" cy="16" r="5" fill="currentColor" fillOpacity="0.35" />
          <circle cx="32" cy="16" r="2.5" fill="currentColor" fillOpacity="0.2" />
          <circle cx="32" cy="16" r="1" fill="currentColor" fillOpacity="0.4" />
          {/* Woofer */}
          <circle cx="32" cy="38" r="12" fill="currentColor" fillOpacity="0.3" />
          <circle cx="32" cy="38" r="8" fill="currentColor" fillOpacity="0.2" />
          <circle cx="32" cy="38" r="4" fill="currentColor" fillOpacity="0.3" />
          <circle cx="32" cy="38" r="1.5" fill="currentColor" fillOpacity="0.15" />
          {/* Woofer surround ring */}
          <circle cx="32" cy="38" r="12" fill="none" stroke="currentColor" strokeWidth="1" strokeOpacity="0.15" />
          {/* Port (bass reflex) */}
          <rect x="28" y="54" width="8" height="3" rx="1.5" fill="currentColor" fillOpacity="0.25" />
        </svg>
      );

    // Cable — audio interconnect with RCA/3.5mm connectors
    case 'cable':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className={className} aria-hidden="true">
          {/* Cable body (curved) */}
          <path d="M14 14C20 24 28 36 50 50" fill="none" stroke="currentColor" strokeWidth="3.5" strokeOpacity="0.4" strokeLinecap="round" />
          {/* Left connector housing */}
          <rect x="4" y="4" width="14" height="14" rx="3" fill="currentColor" fillOpacity="0.7" />
          {/* Left connector ring */}
          <circle cx="11" cy="11" r="4" fill="currentColor" fillOpacity="0.3" />
          <circle cx="11" cy="11" r="2" fill="currentColor" fillOpacity="0.15" />
          {/* Left connector pin */}
          <circle cx="11" cy="11" r="0.8" fill="currentColor" fillOpacity="0.5" />
          {/* Right connector housing */}
          <rect x="44" y="42" width="14" height="14" rx="3" fill="currentColor" fillOpacity="0.7" />
          {/* Right connector ring */}
          <circle cx="51" cy="49" r="4" fill="currentColor" fillOpacity="0.3" />
          <circle cx="51" cy="49" r="2" fill="currentColor" fillOpacity="0.15" />
          {/* Right connector pin */}
          <circle cx="51" cy="49" r="0.8" fill="currentColor" fillOpacity="0.5" />
          {/* Cable texture marks */}
          <circle cx="24" cy="22" r="0.6" fill="currentColor" fillOpacity="0.2" />
          <circle cx="32" cy="32" r="0.6" fill="currentColor" fillOpacity="0.2" />
          <circle cx="40" cy="40" r="0.6" fill="currentColor" fillOpacity="0.2" />
        </svg>
      );

    // DAP — portable digital audio player (like Astell&Kern / FiiO)
    case 'dap':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className={className} aria-hidden="true">
          <defs>
            <linearGradient id="dap-g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.75" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          {/* Body */}
          <rect x="14" y="2" width="36" height="60" rx="4" fill="url(#dap-g)" />
          {/* Screen */}
          <rect x="17" y="6" width="30" height="34" rx="2" fill="currentColor" fillOpacity="0.2" />
          {/* Screen content — waveform visualization */}
          <path d="M20 22h4l2-4 3 8 3-6 2 4h4l2-3 3 5 2-4h3" fill="none" stroke="currentColor" strokeWidth="1" strokeOpacity="0.2" strokeLinecap="round" strokeLinejoin="round" />
          {/* Now playing bar */}
          <rect x="20" y="32" width="24" height="2" rx="1" fill="currentColor" fillOpacity="0.15" />
          <rect x="20" y="32" width="14" height="2" rx="1" fill="currentColor" fillOpacity="0.25" />
          {/* Physical volume wheel on side */}
          <rect x="50" y="18" width="3" height="14" rx="1.5" fill="currentColor" fillOpacity="0.4" />
          {/* Playback buttons */}
          <rect x="22" y="44" width="6" height="6" rx="1" fill="currentColor" fillOpacity="0.25" />
          <rect x="30" y="44" width="6" height="6" rx="1" fill="currentColor" fillOpacity="0.3" />
          <rect x="38" y="44" width="6" height="6" rx="1" fill="currentColor" fillOpacity="0.25" />
          {/* 3.5mm jack on top */}
          <circle cx="24" cy="2" r="2" fill="currentColor" fillOpacity="0.3" />
          {/* 4.4mm balanced jack */}
          <circle cx="34" cy="2" r="2.5" fill="currentColor" fillOpacity="0.3" />
        </svg>
      );

    // Microphone — large diaphragm condenser studio mic
    case 'microphone':
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className={className} aria-hidden="true">
          <defs>
            <linearGradient id="mic-g" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.7" />
              <stop offset="50%" stopColor="currentColor" stopOpacity="0.55" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.7" />
            </linearGradient>
          </defs>
          {/* Mic body */}
          <rect x="20" y="6" width="24" height="34" rx="12" fill="url(#mic-g)" />
          {/* Grille mesh pattern */}
          <rect x="22" y="8" width="20" height="20" rx="10" fill="currentColor" fillOpacity="0.15" />
          {/* Grille horizontal lines */}
          <line x1="24" y1="12" x2="40" y2="12" stroke="currentColor" strokeWidth="0.6" strokeOpacity="0.2" />
          <line x1="23" y1="15" x2="41" y2="15" stroke="currentColor" strokeWidth="0.6" strokeOpacity="0.2" />
          <line x1="23" y1="18" x2="41" y2="18" stroke="currentColor" strokeWidth="0.6" strokeOpacity="0.2" />
          <line x1="23" y1="21" x2="41" y2="21" stroke="currentColor" strokeWidth="0.6" strokeOpacity="0.2" />
          <line x1="24" y1="24" x2="40" y2="24" stroke="currentColor" strokeWidth="0.6" strokeOpacity="0.2" />
          {/* Body band / logo area */}
          <rect x="20" y="30" width="24" height="6" fill="currentColor" fillOpacity="0.25" />
          {/* Mount connector */}
          <rect x="26" y="40" width="12" height="4" rx="1" fill="currentColor" fillOpacity="0.5" />
          {/* Stand mount */}
          <path d="M28 44l-6 8h20l-6-8z" fill="currentColor" fillOpacity="0.35" />
          {/* Stand base */}
          <rect x="18" y="52" width="28" height="4" rx="2" fill="currentColor" fillOpacity="0.45" />
          {/* Stand foot */}
          <rect x="14" y="56" width="36" height="3" rx="1.5" fill="currentColor" fillOpacity="0.35" />
        </svg>
      );

    // Fallback — music note
    default:
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className={className} aria-hidden="true">
          <path d="M24 50V18l24-8v28" fill="none" stroke="currentColor" strokeWidth="3" strokeOpacity="0.5" strokeLinecap="round" strokeLinejoin="round" />
          <ellipse cx="18" cy="50" rx="8" ry="6" fill="currentColor" fillOpacity="0.5" />
          <ellipse cx="42" cy="42" rx="8" ry="6" fill="currentColor" fillOpacity="0.5" />
        </svg>
      );
  }
}
