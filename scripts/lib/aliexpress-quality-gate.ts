/**
 * aliexpress-quality-gate.ts
 *
 * AliExpress-specific junk filtering and title cleaning.
 * AliExpress product titles are notoriously noisy with marketing language,
 * year prefixes, and spam patterns that degrade fuzzy matching quality.
 *
 * Exports:
 *   - isAliExpressJunk(title)       -- returns true if the listing should be skipped
 *   - cleanAliExpressTitle(title)   -- strips noise for better matching
 */

import { isJunkProduct } from '../scrapers/matcher.ts';

// ---------------------------------------------------------------------------
// Junk detection patterns specific to AliExpress listings
// ---------------------------------------------------------------------------

/** Patterns indicating a non-genuine, accessory, or wholesale listing */
const ALIEXPRESS_JUNK_PATTERNS: RegExp[] = [
  // Counterfeit / clone indicators
  /\bcopy\b/i,
  /\breplica\b/i,
  /\bclone\b/i,
  /\bfake\b/i,
  /\bimitation\b/i,
  /\bOEM\b(?!\s+(?:driver|diaphragm))/i,

  // Accessory / non-product listings
  /\bcase\s+only\b/i,
  /\bsilicone\s+(?:cover|case|sleeve)\b/i,
  /\bprotective\s+case\b/i,
  /\bscreen\s+protector\b/i,
  /\bsticker\b/i,
  /\bwrist\s*(?:band|strap)\b/i,
  /\bcleaning\s+kit\b/i,
  /\bwall\s+(?:mount|charger)\b/i,
  /\bphone\s+holder\b/i,
  /\bcar\s+charger\b/i,
  /\bpower\s+bank\b/i,
  /\bselfie\s+stick\b/i,

  // Wholesale / bulk patterns
  /\bfactory\s+direct\b/i,
  /\bwholesale\b/i,
  /\blot\s+of\s+\d+\b/i,
  /\b\d+\s*(?:pcs|pieces|pack|sets)\b/i,

  // Spam title patterns
  /\b(?:20\d{2})\s+NEW\s+UPGRADED\b/i,
  /\bbest\s+(?:price|deal|offer)\b/i,
  /\bfree\s+gift\b/i,
  /\bbuy\s+\d+\s+get\b/i,
  /\bflash\s+sale\b/i,
  /\bclearance\s+sale\b/i,

  // Non-audio products that slip through keyword searches
  /\bbluetooth\s+speaker\s+(?:light|lamp|clock)\b/i,
  /\bkaraoke\b/i,
  /\bhearing\s+aid\b/i,
  /\bwalkie\s+talkie\b/i,
  /\btranslator\b/i,
  /\bsmart\s*watch\b/i,
  /\bbone\s+conduction\s+(?:glasses|sunglasses)\b/i,
];

/**
 * Check if an AliExpress listing is junk and should be skipped.
 * Combines general junk detection (from matcher.ts) with AliExpress-specific patterns.
 */
export function isAliExpressJunk(title: string): boolean {
  // First check general junk patterns from matcher.ts
  if (isJunkProduct(title)) return true;

  // Then check AliExpress-specific patterns
  return ALIEXPRESS_JUNK_PATTERNS.some(rx => rx.test(title));
}

// ---------------------------------------------------------------------------
// Title cleaning for better fuzzy matching
// ---------------------------------------------------------------------------

/** Marketing/noise words commonly found in AliExpress titles */
const ALIEXPRESS_NOISE_RE = /\b(?:20\d{2}|NEW|NEWEST|LATEST|UPGRADED?|HOT\s+SALE|BEST\s+SELLING|TOP\s+QUALITY|ORIGINAL|GENUINE|AUTHENTIC|OFFICIAL|HIGH\s+QUALITY|BRAND\s+NEW|IN\s+STOCK|FAST\s+SHIPPING|FREE\s+SHIPPING|100%|SUPER|FASHION)\b/gi;

/** Trailing connector/variant descriptors that belong in variant selectors */
const TRAILING_VARIANT_RE = /\s*[-\/]\s*(?:with\s+mic|without\s+mic|type[\s-]?c|3\.5mm|usb[\s-]?c|bluetooth|wired|wireless|black|white|silver|gold|red|blue|green|pink|purple|grey|gray)\s*$/gi;

/** Parenthesized marketing noise at end of title */
const PAREN_NOISE_RE = /\s*\((?:New|Upgraded|Latest|Official|Original|20\d{2})[^)]*\)\s*$/gi;

/**
 * Clean up AliExpress title noise for better fuzzy matching.
 * The original title is preserved in store_products.title; this cleaned
 * version is used only for the matching step.
 */
export function cleanAliExpressTitle(title: string): string {
  let result = title;

  // Remove year + marketing prefixes: "2024 NEW UPGRADED"
  result = result.replace(/^\s*(?:20\d{2})\s+(?:NEW|NEWEST|LATEST|UPGRADED?)\s+/gi, '');

  // Remove marketing noise words throughout
  result = result.replace(ALIEXPRESS_NOISE_RE, '');

  // Remove trailing variant descriptors
  result = result.replace(TRAILING_VARIANT_RE, '');

  // Remove parenthesized marketing at end
  result = result.replace(PAREN_NOISE_RE, '');

  // Remove "Hi-Fi" / "HiFi" as standalone marketing term (keep in brand names like HiFiGo)
  result = result.replace(/\bHi-?Fi\b(?!\s*(?:Audio|Go|Man|MAN))/gi, '');

  // Collapse whitespace and trim
  return result.replace(/\s{2,}/g, ' ').trim();
}
