import type { Category, CategoryId } from '../types';

export const CATEGORIES: Category[] = [
  { id: 'iem', name: 'IEMs', sort_order: 1, icon: 'headphones', has_ppi: true },
  { id: 'headphone', name: 'Headphones', sort_order: 2, icon: 'headphones', has_ppi: true },
  { id: 'dac', name: 'DAC', sort_order: 3, icon: 'cpu', has_ppi: false },
  { id: 'amp', name: 'Amplifier', sort_order: 4, icon: 'zap', has_ppi: false },
  { id: 'speaker', name: 'Speakers', sort_order: 5, icon: 'speaker', has_ppi: false },
  { id: 'cable', name: 'Cables & Accessories', sort_order: 6, icon: 'cable', has_ppi: false },
  { id: 'dap', name: 'DAP', sort_order: 7, icon: 'smartphone', has_ppi: false },
  { id: 'microphone', name: 'Microphone', sort_order: 8, icon: 'mic', has_ppi: false },
];

export const CATEGORY_MAP = new Map<CategoryId, Category>(
  CATEGORIES.map((c) => [c.id, c])
);

export function getCategoryIcon(id: CategoryId): string {
  switch (id) {
    case 'iem': return '\u{1F3A7}';
    case 'headphone': return '\u{1F3A7}';
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
