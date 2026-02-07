import type { Category, CategoryId } from '../types';

export const CATEGORIES: Category[] = [
  // Main categories
  { id: 'iem', name: 'In-Ear Monitors', description: 'Earbuds that sit inside your ear canal', sort_order: 1, icon: 'headphones', has_ppi: true, parent_category: null },
  // In-ear monitor accessories
  { id: 'iem_tips', name: 'Eartips', description: 'Silicone or foam tips for IEMs', sort_order: 10, icon: 'circle-dot', has_ppi: false, parent_category: 'iem' },
  { id: 'iem_cable', name: 'In-Ear Cables', description: 'Replacement cables for IEMs', sort_order: 11, icon: 'cable', has_ppi: false, parent_category: 'iem' },
  { id: 'iem_filter', name: 'Filters & Modules', description: 'Tuning filters and sound modules', sort_order: 12, icon: 'filter', has_ppi: false, parent_category: 'iem' },
  // Main categories continued
  { id: 'headphone', name: 'Headphones', description: 'Over-ear and on-ear headphones', sort_order: 2, icon: 'headphones', has_ppi: true, parent_category: null },
  // Headphone accessories
  { id: 'hp_pads', name: 'Earpads', description: 'Replacement pads for headphones', sort_order: 20, icon: 'disc', has_ppi: false, parent_category: 'headphone' },
  { id: 'hp_cable', name: 'Headphone Cables', description: 'Replacement headphone cables', sort_order: 21, icon: 'cable', has_ppi: false, parent_category: 'headphone' },
  // Main categories continued
  { id: 'dac', name: 'Digital-to-Analog Converter', description: 'Converts digital audio to analog signal', sort_order: 3, icon: 'cpu', has_ppi: false, parent_category: null },
  { id: 'amp', name: 'Amplifier', description: 'Powers headphones or speakers', sort_order: 4, icon: 'zap', has_ppi: false, parent_category: null },
  { id: 'speaker', name: 'Speakers', description: 'Bookshelf, floor, and powered speakers', sort_order: 5, icon: 'speaker', has_ppi: true, parent_category: null },
  { id: 'cable', name: 'Cables & Accessories', description: 'Audio cables and adapters', sort_order: 6, icon: 'cable', has_ppi: false, parent_category: null },
  { id: 'dap', name: 'Digital Audio Player', description: 'Portable music players', sort_order: 7, icon: 'smartphone', has_ppi: false, parent_category: null },
  { id: 'microphone', name: 'Microphone', description: 'Recording and streaming mics', sort_order: 8, icon: 'mic', has_ppi: false, parent_category: null },
];

export const CATEGORY_MAP = new Map<CategoryId, Category>(
  CATEGORIES.map((c) => [c.id, c])
);

/** Get child (accessory) categories for a parent category. */
export function getChildCategories(parentId: CategoryId): Category[] {
  return CATEGORIES.filter((c) => c.parent_category === parentId);
}

/** Get only top-level categories (no parent). */
export function getTopLevelCategories(): Category[] {
  return CATEGORIES.filter((c) => c.parent_category === null);
}

/** @deprecated Use <CategoryIcon categoryId={id} /> component instead */
export function getCategoryIcon(_id: CategoryId): string {
  return '';
}

export function getPPIColor(score: number): string {
  if (score >= 85) return 'bg-ppi-excellent text-white';
  if (score >= 70) return 'bg-ppi-great text-white';
  if (score >= 55) return 'bg-ppi-good text-surface-900';
  if (score >= 40) return 'bg-ppi-fair text-white';
  return 'bg-ppi-poor text-white';
}

export function getPPILabel(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Great';
  if (score >= 55) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Poor';
}

/** Get the measurement score label for a category */
export function getScoreLabel(categoryId: CategoryId): string {
  if (categoryId === 'speaker') return 'Spinorama';
  if (isSinadCategory(categoryId)) return 'SINAD';
  return 'PPI Score';
}

/** Check if a category uses spinorama scoring instead of PPI */
export function isSpinormaCategory(categoryId: CategoryId): boolean {
  return categoryId === 'speaker';
}

/** Check if a category uses SINAD scoring (DAC/Amp) */
export function isSinadCategory(categoryId: CategoryId): boolean {
  return categoryId === 'dac' || categoryId === 'amp';
}

/** Get the Tailwind accent color class for a category */
export function getCategoryAccentColor(id: CategoryId): string {
  switch (id) {
    case 'iem':
    case 'iem_tips':
    case 'iem_cable':
    case 'iem_filter':
      return 'text-accent-iem';
    case 'headphone':
    case 'hp_pads':
    case 'hp_cable':
      return 'text-accent-headphone';
    case 'dac': return 'text-accent-dac';
    case 'amp': return 'text-accent-amp';
    case 'speaker': return 'text-accent-speaker';
    case 'cable': return 'text-accent-cable';
    case 'dap': return 'text-accent-dap';
    case 'microphone': return 'text-accent-mic';
    default: return 'text-primary-400';
  }
}

/** Get the Tailwind accent border color class for a category */
export function getCategoryBorderColor(id: CategoryId): string {
  switch (id) {
    case 'iem':
    case 'iem_tips':
    case 'iem_cable':
    case 'iem_filter':
      return 'border-accent-iem';
    case 'headphone':
    case 'hp_pads':
    case 'hp_cable':
      return 'border-accent-headphone';
    case 'dac': return 'border-accent-dac';
    case 'amp': return 'border-accent-amp';
    case 'speaker': return 'border-accent-speaker';
    case 'cable': return 'border-accent-cable';
    case 'dap': return 'border-accent-dap';
    case 'microphone': return 'border-accent-mic';
    default: return 'border-primary-400';
  }
}

/** Get the Tailwind accent bg color class for a category */
export function getCategoryBgColor(id: CategoryId): string {
  switch (id) {
    case 'iem':
    case 'iem_tips':
    case 'iem_cable':
    case 'iem_filter':
      return 'bg-accent-iem/10';
    case 'headphone':
    case 'hp_pads':
    case 'hp_cable':
      return 'bg-accent-headphone/10';
    case 'dac': return 'bg-accent-dac/10';
    case 'amp': return 'bg-accent-amp/10';
    case 'speaker': return 'bg-accent-speaker/10';
    case 'cable': return 'bg-accent-cable/10';
    case 'dap': return 'bg-accent-dap/10';
    case 'microphone': return 'bg-accent-mic/10';
    default: return 'bg-primary-400/10';
  }
}

/** Get beginner-friendly tooltip text for a PPI/Spinorama/SINAD score */
export function getPPITooltip(score: number, isSpinorama: boolean): string {
  const type = isSpinorama ? 'Spinorama Score' : 'Predicted Preference Index';
  if (score >= 85) return `${type}: ${score.toFixed(1)} — Excellent. Top-tier measured audio quality.`;
  if (score >= 70) return `${type}: ${score.toFixed(1)} — Great. Above-average sound quality.`;
  if (score >= 55) return `${type}: ${score.toFixed(1)} — Good. Solid performer for the price.`;
  if (score >= 40) return `${type}: ${score.toFixed(1)} — Fair. Noticeable tuning deviations.`;
  return `${type}: ${score.toFixed(1)} — Poor. Significant tuning issues.`;
}

/**
 * Convert raw SINAD dB to a 0-100 normalized score for display consistency.
 * Range: 60 dB -> 0, 120 dB -> 100.
 * Below 60 dB is poor; above 120 dB is exceptional.
 */
export function sinadToScore(sinadDb: number): number {
  return Math.max(0, Math.min(100, Math.round(((sinadDb - 60) / 60) * 100)));
}

/** Check if a category is a dedicated amplifier (supports power output display) */
export function isAmpCategory(categoryId: CategoryId): boolean {
  return categoryId === 'amp';
}

/** Standard load impedances for amplifier power output (ohms) */
export const AMP_LOAD_IMPEDANCES = [4, 8, 16, 32, 50, 300, 600] as const;
export type AmpLoadOhms = (typeof AMP_LOAD_IMPEDANCES)[number];

/** Map load impedance to the corresponding product column name */
export function getPowerColumnForLoad(ohms: AmpLoadOhms): string {
  return `power_${ohms}ohm_mw`;
}

/** Format power in milliwatts for display — shows W for >= 1000 mW, mW otherwise */
export function formatPowerMw(mw: number): string {
  if (mw >= 1000) {
    const watts = mw / 1000;
    return watts % 1 === 0 ? `${watts} W` : `${watts.toFixed(1)} W`;
  }
  return `${Math.round(mw)} mW`;
}

/** Get tooltip text for a SINAD score */
export function getSinadTooltip(sinadDb: number): string {
  if (sinadDb >= 110) return `SINAD: ${sinadDb} dB — Excellent. Transparent, inaudible distortion.`;
  if (sinadDb >= 98) return `SINAD: ${sinadDb} dB — Great. Very clean signal, exceeds audibility threshold.`;
  if (sinadDb >= 85) return `SINAD: ${sinadDb} dB — Good. Clean enough for most listening.`;
  if (sinadDb >= 70) return `SINAD: ${sinadDb} dB — Fair. Measurable distortion, may be audible in some cases.`;
  return `SINAD: ${sinadDb} dB — Poor. Significant distortion present.`;
}
