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

export function getCategoryIcon(id: CategoryId): string {
  switch (id) {
    case 'iem': return '\u{1F3A7}';
    case 'iem_tips': return '\u{1F534}';
    case 'iem_cable': return '\u{1F50C}';
    case 'iem_filter': return '\u2699\uFE0F';
    case 'headphone': return '\u{1F3A7}';
    case 'hp_pads': return '\u{1F94F}';
    case 'hp_cable': return '\u{1F50C}';
    case 'dac': return '\u{1F4FB}';
    case 'amp': return '\u26A1';
    case 'speaker': return '\u{1F50A}';
    case 'cable': return '\u{1F50C}';
    case 'dap': return '\u{1F4F1}';
    case 'microphone': return '\u{1F3A4}';
    default: return '\u{1F3B5}';
  }
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
  return categoryId === 'speaker' ? 'Spinorama' : 'PPI Score';
}

/** Check if a category uses spinorama scoring instead of PPI */
export function isSpinormaCategory(categoryId: CategoryId): boolean {
  return categoryId === 'speaker';
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

/** Get beginner-friendly tooltip text for a PPI/Spinorama score */
export function getPPITooltip(score: number, isSpinorama: boolean): string {
  const type = isSpinorama ? 'Spinorama Score' : 'Predicted Preference Index';
  if (score >= 85) return `${type}: ${score.toFixed(1)} — Excellent. Top-tier measured audio quality.`;
  if (score >= 70) return `${type}: ${score.toFixed(1)} — Great. Above-average sound quality.`;
  if (score >= 55) return `${type}: ${score.toFixed(1)} — Good. Solid performer for the price.`;
  if (score >= 40) return `${type}: ${score.toFixed(1)} — Fair. Noticeable tuning deviations.`;
  return `${type}: ${score.toFixed(1)} — Poor. Significant tuning issues.`;
}
