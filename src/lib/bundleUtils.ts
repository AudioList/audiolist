/**
 * bundleUtils.ts
 *
 * Utilities for detecting and describing product bundles/deals
 * from store_products titles.
 */

/** Regex patterns that indicate a bundle/deal in the title */
const BUNDLE_PATTERNS: RegExp[] = [
  /\bbundle\b/i,
  /\bkit\b/i,
  /\bpackage\b/i,
  /\bcombo\b/i,
  /\bwith\s+(?:free\s+)?(?:\d+[''']?\s*)?(?:xlr|usb|cable|arm|stand|mount|filter|shock|case|bag|headphone)/i,
  /\bwith\s+(?:free\s+)?\w+\s+(?:cable|arm|stand|mount|filter|shock|case|bag)/i,
  /\bwith\s+free\b/i,
  /\bincludes?\b/i,
  /\bfull\s+system\b/i,
  /\+\s*\w+/,
  /\bfree\s+\d/i,
  /\bstereo\s+pair\b/i,
  /\bpodcasting\s+(?:bundle|kit|ultimate|savings|interview)\b/i,
  /\bbroadcasting\s+bundle\b/i,
  /\bstreaming\s+bundle\b/i,
  /\brecording\s+bundle\b/i,
];

/** Keywords that appear in bundles but not in base product names */
const BUNDLE_KEYWORDS = [
  'bundle', 'kit', 'package', 'combo',
  'with free', 'free',
  'includes', 'including',
  'complete', 'full system',
  'upgrade cable', 'upgrade',
  'cloudlifter', 'dynamite',
  'podcasting', 'podcast',
  'streaming', 'broadcasting',
  'premium package', 'starter',
  'stereo pair',
  'savings bundle', 'ultimate bundle',
];

/**
 * Normalize a product name for comparison purposes.
 */
function simplify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\|.*$/, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Determine if a store_products title represents a bundle/deal
 * rather than the base product listing.
 */
export function isBundleTitle(storeTitle: string, productName: string): boolean {
  const simpleStore = simplify(storeTitle);
  const simpleProduct = simplify(productName);

  // If titles are essentially the same, not a bundle
  if (simpleStore === simpleProduct) return false;

  // Bundles always add content — if store title isn't meaningfully longer, skip
  if (simpleStore.length <= simpleProduct.length + 5) return false;

  // Check for explicit bundle patterns in the store title
  for (const pattern of BUNDLE_PATTERNS) {
    if (pattern.test(storeTitle)) return true;
  }

  // Check for bundle keywords in title that aren't in the product name
  const lowerTitle = storeTitle.toLowerCase();
  const lowerProduct = productName.toLowerCase();
  for (const keyword of BUNDLE_KEYWORDS) {
    if (lowerTitle.includes(keyword) && !lowerProduct.includes(keyword)) {
      return true;
    }
  }

  return false;
}

/**
 * Extract a human-readable description of what the bundle adds,
 * given the base product name.
 *
 * Examples:
 *   "EV RE20 Microphone with FREE 20' XLR Cable" -> "with FREE 20' XLR Cable"
 *   "Rode Procaster (Complete Podcasting Bundle)" -> "Complete Podcasting Bundle"
 *   "Focal Clear + Upgrade Cable Bundle" -> "+ Upgrade Cable Bundle"
 */
export function extractBundleDescription(
  storeTitle: string,
  productName: string,
): string {
  const lowerTitle = storeTitle.toLowerCase();
  const lowerProduct = productName.toLowerCase();

  // Strategy 1: Find the product name in the store title and take what follows
  const idx = lowerTitle.indexOf(lowerProduct);
  if (idx !== -1) {
    const rawSuffix = storeTitle.slice(idx + productName.length).trim();
    if (rawSuffix.length > 0) {
      // Find where the bundle-specific content starts
      const bundleStart = rawSuffix.search(
        /\b(?:with|and|\+|bundle|kit|package|combo|set|free|includes?|including|complete|full system|upgrade|stereo)\b|\(/i,
      );
      if (bundleStart !== -1) {
        let desc = rawSuffix.slice(bundleStart).trim();
        // Clean leading separators
        desc = desc.replace(/^[-–—:\s|]+/, '').trim();
        // Strip wrapping parens
        if (desc.startsWith('(') && desc.endsWith(')')) {
          desc = desc.slice(1, -1).trim();
        }
        if (desc.length > 0) return desc;
      }
      // No indicator found, just clean up the suffix
      const cleaned = rawSuffix.replace(/^[-–—:\s|,]+/, '').trim();
      if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
        return cleaned.slice(1, -1).trim();
      }
      if (cleaned.length > 0) return cleaned;
    }
  }

  // Strategy 2: Pattern-based extraction
  const withMatch = storeTitle.match(/\b(with\s+.+)$/i);
  if (withMatch) return withMatch[1];

  const plusMatch = storeTitle.match(/(\+\s*.+)$/);
  if (plusMatch) return plusMatch[1];

  const parenMatch = storeTitle.match(
    /\(([^)]*(?:bundle|kit|package|combo|set|pair)[^)]*)\)/i,
  );
  if (parenMatch) return parenMatch[1];

  // Strategy 3: Return the full title as fallback
  return storeTitle;
}
