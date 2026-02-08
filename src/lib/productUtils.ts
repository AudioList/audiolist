import type { Product } from '../types';

/**
 * Variant types that get display name truncation and "Best Mode" badges.
 * These are variants where a single product represents the "best" configuration.
 */
const MERGEABLE_VARIANT_TYPES = ['dsp', 'anc', 'switch'];

/**
 * Returns a display-friendly product name.
 *
 * For best variants of DSP/ANC/switch families, strips the variant_value
 * suffix from the name to show the base product name.
 *
 * For all other products, returns the full name unchanged.
 */
export function getDisplayName(product: Product): string {
  if (
    !product.variant_type ||
    !product.variant_value ||
    !product.is_best_variant ||
    !MERGEABLE_VARIANT_TYPES.includes(product.variant_type)
  ) {
    return product.name;
  }

  // Try to strip the variant_value from the end of the name
  const name = product.name.trim();
  const suffix = product.variant_value.trim();

  // Case-insensitive suffix check
  if (name.toLowerCase().endsWith(suffix.toLowerCase())) {
    const truncated = name.slice(0, name.length - suffix.length).trim();
    // Safety: don't return empty string if something weird happened
    return truncated || name;
  }

  // If variant_value isn't at the end of the name (edge case), return full name
  return name;
}

/**
 * Returns a label for the "Best Mode" badge, or null if the product
 * shouldn't show one.
 *
 * Examples:
 * - switch variant "DDDU" -> "Best Dip Switch Mode: DDDU"
 * - dsp variant "Reference" -> "Best Tuning Mode: Reference"
 * - anc variant "ANC on" -> "Best ANC Mode: ANC on"
 * - non-variant product -> null
 */
export function getBestModeLabel(product: Product): string | null {
  if (
    !product.variant_type ||
    !product.variant_value ||
    !product.is_best_variant ||
    !MERGEABLE_VARIANT_TYPES.includes(product.variant_type)
  ) {
    return null;
  }

  switch (product.variant_type) {
    case 'switch':
      return `Best Dip Switch Mode: ${product.variant_value}`;
    case 'dsp':
      return `Best Tuning Mode: ${product.variant_value}`;
    case 'anc':
      return `Best ANC Mode: ${product.variant_value}`;
    default:
      return null;
  }
}
