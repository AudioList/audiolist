import type { Category, CategoryId } from '../types';

export const CATEGORIES: Category[] = [
  // Main categories
  { id: 'iem', name: 'In-Ear Monitors', sort_order: 1, icon: 'headphones', has_ppi: true, parent_category: null },
  // In-ear monitor accessories
  { id: 'iem_tips', name: 'Eartips', sort_order: 10, icon: 'circle-dot', has_ppi: false, parent_category: 'iem' },
  { id: 'iem_cable', name: 'In-Ear Cables', sort_order: 11, icon: 'cable', has_ppi: false, parent_category: 'iem' },
  { id: 'iem_filter', name: 'Filters & Modules', sort_order: 12, icon: 'filter', has_ppi: false, parent_category: 'iem' },
  // Main categories continued
  { id: 'headphone', name: 'Headphones', sort_order: 2, icon: 'headphones', has_ppi: true, parent_category: null },
  // Headphone accessories
  { id: 'hp_pads', name: 'Earpads', sort_order: 20, icon: 'disc', has_ppi: false, parent_category: 'headphone' },
  { id: 'hp_cable', name: 'Headphone Cables', sort_order: 21, icon: 'cable', has_ppi: false, parent_category: 'headphone' },
  // Main categories continued
  { id: 'dac', name: 'Digital-to-Analog Converter', sort_order: 3, icon: 'cpu', has_ppi: false, parent_category: null },
  { id: 'amp', name: 'Amplifier', sort_order: 4, icon: 'zap', has_ppi: false, parent_category: null },
  { id: 'speaker', name: 'Speakers', sort_order: 5, icon: 'speaker', has_ppi: true, parent_category: null },
  { id: 'cable', name: 'Cables & Accessories', sort_order: 6, icon: 'cable', has_ppi: false, parent_category: null },
  { id: 'dap', name: 'Digital Audio Player', sort_order: 7, icon: 'smartphone', has_ppi: false, parent_category: null },
  { id: 'microphone', name: 'Microphone', sort_order: 8, icon: 'mic', has_ppi: false, parent_category: null },
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
