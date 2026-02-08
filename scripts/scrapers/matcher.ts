// ---------------------------------------------------------------------------
// Noise parentheticals to strip (non-meaningful for matching)
// ---------------------------------------------------------------------------
const NOISE_PARENS_RE =
  /\s*\((pre-production|custom|universal|demo|sample|prototype|review unit|loaner)\)/gi;

// ---------------------------------------------------------------------------
// Retail noise words to strip
// ---------------------------------------------------------------------------
const RETAIL_NOISE_RE =
  /\b(official|authentic|genuine|free shipping|new arrival|in stock|hot sale|latest|original)\b/gi;

// ---------------------------------------------------------------------------
// Category suffixes to strip
// ---------------------------------------------------------------------------
const SUFFIX_TERMS = [
  "in-ear monitor",
  "in-ear monitors",
  "in ear monitor",
  "in ear monitors",
  "iem",
  "iems",
  "headphone",
  "headphones",
  "earphone",
  "earphones",
  "earbuds",
  "earbud",
  "over-ear",
  "on-ear",
  "open-back",
  "closed-back",
];

const SUFFIX_RE = new RegExp(
  `\\b(${SUFFIX_TERMS.map((t) => t.replace(/-/g, "[-\\s]?")).join("|")})\\b`,
  "gi"
);

// ---------------------------------------------------------------------------
// Roman numeral to Arabic numeral conversion
// ---------------------------------------------------------------------------

const ROMAN_MAP: [RegExp, string][] = [
  [/\bxiii\b/g, "13"],
  [/\bxii\b/g, "12"],
  [/\bxi\b/g, "11"],
  [/\bviii\b/g, "8"],
  [/\bvii\b/g, "7"],
  [/\bvi\b/g, "6"],
  [/\biv\b/g, "4"],
  [/\bix\b/g, "9"],
  [/\biii\b/g, "3"],
  [/\bii\b/g, "2"],
  // Single-letter Roman numerals only when they look like version numbers
  // (preceded by a space/start and followed by end/space/non-alpha)
  // Skip "v" and "x" as standalone since they're too ambiguous
];

/**
 * Convert Roman numeral tokens to Arabic numerals in a lowercased string.
 * Order matters: longer numerals must be matched first (e.g., "viii" before "vi").
 */
function romanToArabic(str: string): string {
  let result = str;
  for (const [pattern, replacement] of ROMAN_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Ordinal normalization (1st -> 1, 2nd -> 2, etc.)
// ---------------------------------------------------------------------------

function normalizeOrdinals(str: string): string {
  return str.replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1");
}

// ---------------------------------------------------------------------------
// "Mark" / "Mk" normalization (Mk2 -> 2, Mark II -> 2, MkIII -> 3)
// ---------------------------------------------------------------------------

function normalizeMark(str: string): string {
  // "mk2", "mark 2", "mk ii", "mark ii" etc. -> just the number
  return str
    .replace(/\b(?:mark|mk)\s*(\d+)\b/g, "$1")
    .replace(/\b(?:mark|mk)\s*(i{1,4}v?i{0,3})\b/g, (_match, roman) => {
      const temp = romanToArabic(roman);
      return temp;
    });
}

// ---------------------------------------------------------------------------
// Name normalization
// ---------------------------------------------------------------------------

export function normalizeName(name: string): string {
  let result = name.toLowerCase();
  // Strip everything after a pipe character (Bloom Audio format:
  // "Product Name | Open-Back Dynamic Headphones").
  // Also handles " - " style suffixes that some retailers use for category descriptions.
  result = result.replace(/\s*\|.*$/, "");
  // Remove only noise parentheticals (keep model variants like Pro, SE, MK2, years)
  result = result.replace(NOISE_PARENS_RE, "");
  // Remove retail noise words
  result = result.replace(RETAIL_NOISE_RE, "");
  // Remove common category suffixes
  result = result.replace(SUFFIX_RE, "");
  // Normalize dashes and special chars to spaces
  result = result.replace(/[-–—]/g, " ");
  // Remove non-alphanumeric except spaces
  result = result.replace(/[^a-z0-9\s]/g, "");
  // Split letter-digit boundaries: "chu2" -> "chu 2", "hd600" -> "hd 600"
  // This normalizes concatenated model numbers so "Chu2" matches "Chu 2"
  result = result.replace(/([a-z])(\d)/g, "$1 $2");
  result = result.replace(/(\d)([a-z])/g, "$1 $2");
  // Collapse multiple spaces
  result = result.replace(/\s{2,}/g, " ");
  // Normalize "Mark"/"Mk" prefixes before Roman numeral conversion
  result = normalizeMark(result);
  // Convert Roman numerals to Arabic (ii->2, iii->3, iv->4, etc.)
  result = romanToArabic(result);
  // Normalize ordinals (1st->1, 2nd->2, etc.)
  result = normalizeOrdinals(result);
  // Final whitespace cleanup
  result = result.replace(/\s{2,}/g, " ");
  return result.trim();
}

/**
 * Extract headphone design type from a product name.
 * Returns 'open' or 'closed' if detected, otherwise null.
 * Checks both the base name and pipe-separated description.
 */
export function extractHeadphoneDesign(name: string): 'open' | 'closed' | null {
  const lower = name.toLowerCase();
  if (/\bopen[\s-]?back\b/.test(lower)) return 'open';
  if (/\bclosed[\s-]?back\b/.test(lower)) return 'closed';
  if (/\bopen\b/.test(lower) && /\bheadphone/.test(lower)) return 'open';
  if (/\bclosed\b/.test(lower) && /\bheadphone/.test(lower)) return 'closed';
  return null;
}

/**
 * Extract IEM connectivity type from a product name.
 * Returns 'tws' or 'active' if detected, otherwise null.
 * 'passive' is the default for IEMs and assigned during backfill.
 */
export function extractIemType(name: string): 'tws' | 'active' | null {
  const lower = name.toLowerCase();
  if (/\btws\b/.test(lower)) return 'tws';
  if (/\btruly[\s-]?wireless\b/.test(lower)) return 'tws';
  if (/\btrue[\s-]?wireless\b/.test(lower)) return 'tws';
  return null;
}

/**
 * Extract microphone connection type from a product name/description.
 */
export function extractMicConnection(name: string): 'usb' | 'xlr' | 'usb_xlr' | 'wireless' | '3.5mm' | null {
  const lower = name.toLowerCase();
  if (/\busb\b.*\bxlr\b|\bxlr\b.*\busb\b/.test(lower)) return 'usb_xlr';
  if (/\busb\b/.test(lower)) return 'usb';
  if (/\bxlr\b/.test(lower)) return 'xlr';
  if (/\bwireless\b|\bbluetooth\b/.test(lower)) return 'wireless';
  if (/\b3\.5\s?mm\b/.test(lower)) return '3.5mm';
  return null;
}

/**
 * Extract microphone transducer type from a product name/description.
 */
export function extractMicType(name: string): 'dynamic' | 'condenser' | 'ribbon' | null {
  const lower = name.toLowerCase();
  if (/\bcondenser\b/.test(lower)) return 'condenser';
  if (/\bdynamic\b/.test(lower)) return 'dynamic';
  if (/\bribbon\b/.test(lower)) return 'ribbon';
  return null;
}

/**
 * Extract microphone polar pattern from a product name/description.
 * Note: patterns tested from most-specific to least-specific since
 * "supercardioid" and "multipattern" contain "cardioid" / "pattern".
 */
export function extractMicPattern(
  name: string
): 'cardioid' | 'omnidirectional' | 'bidirectional' | 'supercardioid' | 'hypercardioid' | 'multipattern' | 'shotgun' | null {
  const lower = name.toLowerCase();
  if (/\bmulti[\s-]?pattern\b/.test(lower)) return 'multipattern';
  if (/\bshotgun\b/.test(lower)) return 'shotgun';
  if (/\bhypercardioid\b/.test(lower)) return 'hypercardioid';
  if (/\bsupercardioid\b/.test(lower)) return 'supercardioid';
  if (/\bomnidirectional\b|\bomni\b/.test(lower)) return 'omnidirectional';
  if (/\bbidirectional\b|\bfigure[\s-]?8\b/.test(lower)) return 'bidirectional';
  if (/\bcardioid\b/.test(lower)) return 'cardioid';
  return null;
}

/**
 * Extract microphone connection type from the Shopify product_type field.
 * Examples: "USB Microphone" -> 'usb', "XLR Microphone" -> 'xlr'
 */
export function extractMicConnectionFromProductType(
  productType: string | null
): 'usb' | 'xlr' | 'usb_xlr' | 'wireless' | '3.5mm' | null {
  if (!productType) return null;
  const lower = productType.toLowerCase();
  if (/\busb\b.*\bxlr\b|\bxlr\b.*\busb\b|usb\/xlr/.test(lower)) return 'usb_xlr';
  if (/\busb\b/.test(lower)) return 'usb';
  if (/\bxlr\b/.test(lower)) return 'xlr';
  if (/\bwireless\b|\bbluetooth\b|\blavalier\b/.test(lower)) return 'wireless';
  if (/\b3\.5\s?mm\b/.test(lower)) return '3.5mm';
  return null;
}

// ---------------------------------------------------------------------------
// Product category detection (headphone vs IEM)
// ---------------------------------------------------------------------------

import type { CategoryId } from '../config/store-collections.ts';
import { BRAND_ALIASES } from '../brand-config.ts';
import {
  HEADPHONE_ONLY_BRANDS,
  HEADPHONE_BRAND_IEM_EXCEPTIONS,
  BRAND_RULE_MAP,
  HEADPHONE_NAME_INDICATORS,
  HEADPHONE_NAME_INDICATORS_GUARDED,
  GUARDED_INDICATOR_BLOCKERS,
  IEM_NAME_INDICATORS,
  // Cable rules
  IEM_CABLE_BRANDS,
  IEM_CABLE_INDICATORS,
  IEM_CABLE_MODEL_PATTERNS,
  HP_CABLE_INDICATORS,
  HP_CABLE_MODEL_PATTERNS,
  GENERAL_CABLE_INDICATORS,
  // Speaker rules
  SPEAKER_GUARD_INDICATORS,
  SPEAKER_TO_CABLE_INDICATORS,
  SPEAKER_ACCESSORY_INDICATORS,
  // DAP rules
  DAP_PRODUCT_OVERRIDES,
  STATIONARY_INDICATORS,
  DAP_GUARD_INDICATORS,
  // DAC/Amp rules
  DAC_INDICATORS,
  AMP_ONLY_INDICATORS,
  // Microphone rules
  MICROPHONE_JUNK_INDICATORS,
  MICROPHONE_GUARD_INDICATORS,
  // Junk & misplaced
  JUNK_PRODUCT_PATTERNS,
  MISPLACED_OVERRIDES,
} from '../config/category-rules.ts';

/**
 * Detect whether a product should be categorized as 'iem' or 'headphone'.
 * Uses a three-tier classification system:
 *   Tier 1: Headphone-only brands (with IEM exceptions)
 *   Tier 2: Brand + model regex patterns
 *   Tier 3: Name keyword fallback
 *
 * Returns null if the category cannot be determined with confidence.
 */
export function detectProductCategory(
  name: string,
  brand: string | null
): 'iem' | 'headphone' | null {
  const brandLower = brand?.toLowerCase().trim() ?? '';

  // --- Tier 1: Headphone-only brands ---
  if (brandLower && HEADPHONE_ONLY_BRANDS.has(brandLower)) {
    // Check exceptions (e.g. STAX SR-001/002/003 are genuine IEMs)
    for (const exRx of HEADPHONE_BRAND_IEM_EXCEPTIONS) {
      if (exRx.test(name)) return 'iem';
    }
    return 'headphone';
  }

  // --- Tier 2: Brand + model regex ---
  if (brandLower) {
    const rule = BRAND_RULE_MAP.get(brandLower);
    if (rule) {
      // Check IEM patterns first (higher specificity prevents false reclassification)
      for (const rx of rule.iemPatterns) {
        if (rx.test(name)) return 'iem';
      }
      for (const rx of rule.headphonePatterns) {
        if (rx.test(name)) return 'headphone';
      }
    }
  }

  // --- Tier 3: Name keyword fallback ---
  // IEM indicators take priority
  for (const rx of IEM_NAME_INDICATORS) {
    if (rx.test(name)) return 'iem';
  }
  for (const rx of HEADPHONE_NAME_INDICATORS) {
    if (rx.test(name)) return 'headphone';
  }

  // Guarded indicators: only trigger if no blocker words are present
  const hasBlocker = GUARDED_INDICATOR_BLOCKERS.some((rx) => rx.test(name));
  if (!hasBlocker) {
    for (const rx of HEADPHONE_NAME_INDICATORS_GUARDED) {
      if (rx.test(name)) return 'headphone';
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Cable sub-category detection
// ---------------------------------------------------------------------------

/**
 * Detect the correct sub-category for a cable product.
 * Returns the detected cable sub-category, or null if it should stay.
 */
export function detectCableSubCategory(
  name: string,
  brand: string | null,
  currentCategory: CategoryId
): 'iem_cable' | 'hp_cable' | 'cable' | null {
  const brandLower = brand?.toLowerCase().trim() ?? '';

  // 1. IEM-cable-only brands (highest confidence)
  if (brandLower && IEM_CABLE_BRANDS.has(brandLower)) {
    return currentCategory === 'iem_cable' ? null : 'iem_cable';
  }

  // 2. Explicit "IEM cable" or "earphone cable" in name -> iem_cable (high confidence guard)
  if (/\bIEM\s+(cable|upgrade)\b/i.test(name) || /\bearphone\s+(cable|upgrade)\b/i.test(name)) {
    return currentCategory === 'iem_cable' ? null : 'iem_cable';
  }

  // 3. IEM cable model patterns
  for (const rx of IEM_CABLE_MODEL_PATTERNS) {
    if (rx.test(name)) return currentCategory === 'iem_cable' ? null : 'iem_cable';
  }

  // 4. HP cable model patterns
  for (const rx of HP_CABLE_MODEL_PATTERNS) {
    if (rx.test(name)) return currentCategory === 'hp_cable' ? null : 'hp_cable';
  }

  // 5. General cable indicators (power, interconnect, USB, etc.)
  // Check BEFORE connector indicators so "USB cable" doesn't match as IEM cable
  for (const rx of GENERAL_CABLE_INDICATORS) {
    if (rx.test(name)) return currentCategory === 'cable' ? null : 'cable';
  }

  // 6. IEM connector indicators (2-pin, MMCX, etc.)
  for (const rx of IEM_CABLE_INDICATORS) {
    if (rx.test(name)) return currentCategory === 'iem_cable' ? null : 'iem_cable';
  }

  // 7. HP cable indicators
  for (const rx of HP_CABLE_INDICATORS) {
    if (rx.test(name)) return currentCategory === 'hp_cable' ? null : 'hp_cable';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Speaker category detection
// ---------------------------------------------------------------------------

/**
 * Detect whether a speaker product is actually a different category.
 * Returns 'cable' if it should be moved, or null if it stays as speaker.
 */
export function detectSpeakerCategory(
  name: string,
): CategoryId | null {
  // Guard: if any speaker indicator matches, it stays
  for (const rx of SPEAKER_GUARD_INDICATORS) {
    if (rx.test(name)) return null;
  }

  // Cable indicators
  for (const rx of SPEAKER_TO_CABLE_INDICATORS) {
    if (rx.test(name)) return 'cable';
  }

  // Accessory indicators
  for (const rx of SPEAKER_ACCESSORY_INDICATORS) {
    if (rx.test(name)) return 'cable'; // "cable" category = "Cables & Accessories"
  }

  return null;
}

// ---------------------------------------------------------------------------
// DAP category detection
// ---------------------------------------------------------------------------

/**
 * Detect whether a DAP product is actually a different category.
 * Returns the correct category, or null if it should stay as DAP.
 */
export function detectDapCategory(
  name: string,
): CategoryId | null {
  // 1. Specific product overrides first
  for (const override of DAP_PRODUCT_OVERRIDES) {
    if (override.pattern.test(name)) return override.targetCategory;
  }

  // 2. Check guard indicators -- if portable/DAP, keep it
  for (const rx of DAP_GUARD_INDICATORS) {
    if (rx.test(name)) return null;
  }

  // 3. Check stationary indicators
  for (const rx of STATIONARY_INDICATORS) {
    if (rx.test(name)) {
      // Determine target based on what the product actually is
      if (/\bintegrated\s+amplifier\b/i.test(name)) return 'amp';
      if (/\bactive\s+speaker\b/i.test(name)) return 'speaker';
      // Default: streamers, servers, transports, CD/SACD players -> dac
      return 'dac';
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// DAC / Amp detection
// ---------------------------------------------------------------------------

/**
 * Detect whether a DAC or Amp product should be in the other category.
 * Policy: All combos (mentioning both DAC and amp) -> 'dac'.
 * Pure amps with no DAC reference stay in 'amp'.
 * Pure DACs with no amp reference and only amp keywords -> 'amp'.
 */
export function detectDacAmpCategory(
  name: string,
  currentCategory: CategoryId
): 'dac' | 'amp' | null {
  const hasDac = DAC_INDICATORS.some((rx) => rx.test(name));
  const hasAmp = AMP_ONLY_INDICATORS.some((rx) => rx.test(name));

  if (currentCategory === 'amp') {
    // If the product mentions DAC at all, it should be in 'dac' (combos -> dac policy)
    if (hasDac) return 'dac';
  }

  if (currentCategory === 'dac') {
    // If the product mentions ONLY amp indicators and NO DAC indicators, move to 'amp'
    if (hasAmp && !hasDac) return 'amp';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Junk & misplaced product detection
// ---------------------------------------------------------------------------

/**
 * Check if a product name matches junk/test item patterns.
 */
export function isJunkProduct(name: string): boolean {
  return JUNK_PRODUCT_PATTERNS.some((rx) => rx.test(name));
}

/**
 * Check if a product in the microphone category is NOT actually a microphone.
 * Returns true for karaoke machines, sound bars, boom arms, audio interfaces, etc.
 * Guard patterns prevent false positives on legitimate mics that mention accessories
 * (e.g. "USB Condenser Microphone with Boom Arm" should NOT be excluded).
 *
 * "karaoke" is an unconditional exclusion -- even if the product name contains
 * mic guard words like "dynamic microphone", karaoke products are always excluded.
 */
export function isMicrophoneJunk(name: string): boolean {
  // Unconditional exclusions (override guards)
  if (/\bkaraoke\b/i.test(name)) return true;
  // If a guard indicator matches, the product IS a real microphone
  if (MICROPHONE_GUARD_INDICATORS.some((rx) => rx.test(name))) return false;
  // Generic guard: if the name contains "Microphone" (but NOT "Microphone Boom/Handle/Arm/Stand/Cable"),
  // it's almost certainly a real microphone even if it mentions accessories
  if (/\bmicrophone\b/i.test(name) && !/\bmicrophone\s+(boom|handle|arm|stand|cable|adapter)/i.test(name)) return false;
  // Otherwise check junk indicators
  return MICROPHONE_JUNK_INDICATORS.some((rx) => rx.test(name));
}

/**
 * Check for misplaced products using explicit override lists.
 * Returns the correct target category, or null if no override matched.
 */
export function detectMisplacedProduct(
  name: string,
  currentCategory: CategoryId
): CategoryId | null {
  for (const override of MISPLACED_OVERRIDES) {
    if (override.sourceCategory === currentCategory && override.pattern.test(name)) {
      return override.targetCategory;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Master detection function
// ---------------------------------------------------------------------------

/**
 * Given a product name, brand, and current category, returns the correct category
 * or null if no reclassification is needed.
 * Delegates to the appropriate sub-detector based on currentCategory.
 */
export function detectCorrectCategory(
  name: string,
  brand: string | null,
  currentCategory: CategoryId
): CategoryId | null {
  // 1. Check explicit misplaced overrides first (highest priority)
  const overrideResult = detectMisplacedProduct(name, currentCategory);
  if (overrideResult) return overrideResult;

  // 2. Category-specific detection
  switch (currentCategory) {
    case 'iem':
    case 'headphone': {
      const detected = detectProductCategory(name, brand);
      return (detected && detected !== currentCategory) ? detected : null;
    }
    case 'cable':
    case 'hp_cable':
    case 'iem_cable': {
      const detected = detectCableSubCategory(name, brand, currentCategory);
      return (detected && detected !== currentCategory) ? detected : null;
    }
    case 'dap': {
      return detectDapCategory(name);
    }
    case 'speaker': {
      return detectSpeakerCategory(name);
    }
    case 'dac':
    case 'amp': {
      return detectDacAmpCategory(name, currentCategory);
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Character-bigram Dice coefficient
// ---------------------------------------------------------------------------

export function getBigrams(str: string): Set<string> {
  const bigrams = new Set<string>();
  for (let i = 0; i < str.length - 1; i++) {
    bigrams.add(str.substring(i, i + 2));
  }
  return bigrams;
}

export function diceCoefficient(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  if (a === b) return 1;

  const bigramsA = getBigrams(a);
  const bigramsB = getBigrams(b);

  if (bigramsA.size === 0 && bigramsB.size === 0) {
    return a === b ? 1 : 0;
  }

  let intersectionCount = 0;
  for (const bigram of bigramsA) {
    if (bigramsB.has(bigram)) {
      intersectionCount++;
    }
  }

  return (2 * intersectionCount) / (bigramsA.size + bigramsB.size);
}

// ---------------------------------------------------------------------------
// Token-level Dice coefficient (word overlap)
// ---------------------------------------------------------------------------

export function tokenDice(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/).filter((t) => t.length > 0));
  const tokensB = new Set(b.split(/\s+/).filter((t) => t.length > 0));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }

  return (2 * intersection) / (tokensA.size + tokensB.size);
}

// ---------------------------------------------------------------------------
// Common audio-domain words (inflate bigram scores without model-level signal)
// ---------------------------------------------------------------------------

const COMMON_AUDIO_WORDS = new Set([
  'audio', 'acoustics', 'acoustic', 'sound', 'sounds',
  'electronics', 'technology', 'technologies',
  'hifi', 'studio', 'pro', 'labs', 'music', 'digital',
]);

// ---------------------------------------------------------------------------
// Brand removal helpers
// ---------------------------------------------------------------------------

export function removeBrand(normalized: string): string {
  const spaceIdx = normalized.indexOf(" ");
  if (spaceIdx === -1) return normalized;
  return normalized.substring(spaceIdx + 1).trim();
}

/**
 * Smart brand removal: uses the known brand field to strip the correct prefix.
 * Falls back to simple first-word removal when brand is unavailable.
 */
export function removeBrandSmart(normalized: string, brand?: string | null): string {
  if (brand) {
    const normalizedBrand = normalizeName(brand);
    if (normalizedBrand && normalized.startsWith(normalizedBrand)) {
      const rest = normalized.slice(normalizedBrand.length).trim();
      if (rest.length > 0) return rest;
    }
    // Also try the raw lowercase brand (handles cases where normalizeName
    // transforms the brand differently than expected)
    const brandLower = brand.toLowerCase().trim();
    if (brandLower && normalized.startsWith(brandLower)) {
      const rest = normalized.slice(brandLower.length).trim();
      if (rest.length > 0) return rest;
    }
  }
  return removeBrand(normalized);
}

// ---------------------------------------------------------------------------
// Brand similarity comparison
// ---------------------------------------------------------------------------

/**
 * Known sub-brand relationships: child brand -> parent brand (lowercase).
 * If both brands resolve to the same parent, they are 'related'.
 */
const SUB_BRAND_MAP: Record<string, string> = {
  'jadeaudio': 'fiio',
  'salnotes': '7hz',
  '7hz-salnotes': '7hz',
  'mrspeakers': 'dan clark audio',
  'mr speakers': 'dan clark audio',
  'celest': 'kinera',
  'mangird': 'xenns',
  'massdrop': 'drop',
};

// Build alias lookup from BRAND_ALIASES (lowercase key -> canonical lowercase)
const BRAND_ALIAS_LOOKUP = new Map<string, string>();
for (const [alias, canonical] of Object.entries(BRAND_ALIASES)) {
  BRAND_ALIAS_LOOKUP.set(alias.toLowerCase(), canonical.toLowerCase());
}

/**
 * Resolve a brand name to its canonical form via aliases.
 */
function resolveCanonicalBrand(brand: string): string {
  const lower = brand.toLowerCase().trim();
  return BRAND_ALIAS_LOOKUP.get(lower) ?? lower;
}

/**
 * Compare two brand names and determine their relationship.
 *
 * Returns:
 * - 'same'      — brands are identical or aliases of each other
 * - 'related'   — brands are sub-brands of the same parent (e.g. JadeAudio / FiiO)
 * - 'unknown'   — one or both brands are null (cannot determine)
 * - 'different'  — brands are completely unrelated
 */
export function brandsSimilar(
  brandA: string | null | undefined,
  brandB: string | null | undefined
): 'same' | 'related' | 'unknown' | 'different' {
  if (!brandA || !brandB) return 'unknown';

  const a = resolveCanonicalBrand(brandA);
  const b = resolveCanonicalBrand(brandB);

  // Exact match after alias resolution
  if (a === b) return 'same';

  // Prefix check: handles "moondrop" vs "moondrop audio" or casing differences
  if (a.startsWith(b) || b.startsWith(a)) return 'same';

  // Sub-brand relationship check
  const parentA = SUB_BRAND_MAP[a] ?? a;
  const parentB = SUB_BRAND_MAP[b] ?? b;
  if (parentA === parentB) return 'related';

  return 'different';
}

// ---------------------------------------------------------------------------
// Hybrid scoring: penalize high bigram scores with weak model-token overlap
// ---------------------------------------------------------------------------

/**
 * When bigram Dice is high but the only overlapping tokens are common
 * audio-domain words (not model-specific), apply a penalty to prevent
 * false matches like "7th Acoustics Asteria" ~ "Warwick Acoustics Aperio".
 */
function penalizeWeakModelOverlap(
  bigramScore: number,
  tokensA: Set<string>,
  tokensB: Set<string>,
): number {
  if (bigramScore < 0.6) return bigramScore;

  let modelOverlap = 0;
  let commonOverlap = 0;
  let shortTokenOverlap = 0; // tokens with length <= 2 (e.g., "sm", "1")
  for (const t of tokensA) {
    if (tokensB.has(t)) {
      if (COMMON_AUDIO_WORDS.has(t)) commonOverlap++;
      else {
        modelOverlap++;
        if (t.length <= 2) shortTokenOverlap++;
      }
    }
  }

  if (modelOverlap === 0 && commonOverlap > 0) {
    return bigramScore * 0.5; // Only common words match -- heavy penalty
  }
  if (modelOverlap === 0 && commonOverlap === 0) {
    return bigramScore * 0.6; // No tokens match at all -- moderate penalty
  }
  // All model overlap is from short tokens only (e.g., "sm" + "1") -- penalize
  if (modelOverlap > 0 && modelOverlap === shortTokenOverlap) {
    return bigramScore * 0.65;
  }
  return bigramScore;
}

// ---------------------------------------------------------------------------
// Find best match
// ---------------------------------------------------------------------------

export function findBestMatch(
  productName: string,
  candidates: Array<{ name: string; id: string; brand?: string | null }>,
  options?: { productBrand?: string | null },
): { id: string; name: string; score: number } | null {
  if (candidates.length === 0) return null;

  const normalizedProduct = normalizeName(productName);
  const productNoBrand = removeBrandSmart(normalizedProduct, options?.productBrand);
  const productNoBrandTokens = new Set(productNoBrand.split(/\s+/).filter((t) => t.length > 0));

  let bestScore = -1;
  let bestCandidate: { id: string; name: string } | null = null;

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeName(candidate.name);

    // 1) Full name character-bigram Dice (penalize if only common audio words overlap)
    const rawFullScore = diceCoefficient(normalizedProduct, normalizedCandidate);
    const productFullTokens = new Set(normalizedProduct.split(/\s+/).filter((t) => t.length > 0));
    const candidateFullTokens = new Set(normalizedCandidate.split(/\s+/).filter((t) => t.length > 0));
    const fullScore = penalizeWeakModelOverlap(rawFullScore, productFullTokens, candidateFullTokens);

    // 2) Brand-removed character-bigram Dice
    const candidateNoBrand = removeBrand(normalizedCandidate);
    const candidateNoBrandTokens = new Set(candidateNoBrand.split(/\s+/).filter((t) => t.length > 0));
    const rawNoBrandScore = diceCoefficient(productNoBrand, candidateNoBrand);
    // Penalize if high bigram score is driven by common words, not model names
    const noBrandScore = penalizeWeakModelOverlap(rawNoBrandScore, productNoBrandTokens, candidateNoBrandTokens);

    // 3) Token-level Dice (word overlap)
    const tokenFullScore = tokenDice(normalizedProduct, normalizedCandidate);
    const tokenNoBrandScore = tokenDice(productNoBrand, candidateNoBrand);

    // Take the best of all approaches
    const score = Math.max(fullScore, noBrandScore, tokenFullScore, tokenNoBrandScore);

    // Brand mismatch penalty: heavily penalize when brands are completely different
    let finalScore = score;
    if (options?.productBrand && candidate.brand) {
      const brandRelation = brandsSimilar(options.productBrand, candidate.brand);
      if (brandRelation === 'different') {
        finalScore *= 0.35;
      }
    }

    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestCandidate = candidate;
    }
  }

  if (!bestCandidate) return null;

  return {
    id: bestCandidate.id,
    name: bestCandidate.name,
    score: bestScore,
  };
}

// ---------------------------------------------------------------------------
// Pre-indexed matching (avoids recomputing normalization per candidate)
// ---------------------------------------------------------------------------

export interface IndexedCandidate {
  id: string;
  name: string;
  brand?: string | null;
  normalized: string;
  noBrand: string;
  bigrams: Set<string>;
  noBrandBigrams: Set<string>;
  tokens: Set<string>;
  noBrandTokens: Set<string>;
}

/**
 * Build a pre-computed index of candidates. Call once per category,
 * then reuse for all queries against that category.
 */
export function buildCandidateIndex(
  candidates: Array<{ name: string; id: string; brand?: string | null }>
): IndexedCandidate[] {
  return candidates.map((c) => {
    const normalized = normalizeName(c.name);
    const noBrand = removeBrandSmart(normalized, c.brand);
    return {
      id: c.id,
      name: c.name,
      brand: c.brand,
      normalized,
      noBrand,
      bigrams: getBigrams(normalized),
      noBrandBigrams: getBigrams(noBrand),
      tokens: new Set(normalized.split(/\s+/).filter((t) => t.length > 0)),
      noBrandTokens: new Set(noBrand.split(/\s+/).filter((t) => t.length > 0)),
    };
  });
}

/**
 * Like findBestMatch but uses pre-computed index to avoid redundant normalization.
 */
export function findBestMatchIndexed(
  productName: string,
  index: IndexedCandidate[],
  options?: { productBrand?: string | null },
): { id: string; name: string; score: number } | null {
  if (index.length === 0) return null;

  const normalizedProduct = normalizeName(productName);
  const productNoBrand = removeBrandSmart(normalizedProduct, options?.productBrand);
  const productBigrams = getBigrams(normalizedProduct);
  const productNoBrandBigrams = getBigrams(productNoBrand);
  const productTokens = new Set(normalizedProduct.split(/\s+/).filter((t) => t.length > 0));
  const productNoBrandTokens = new Set(productNoBrand.split(/\s+/).filter((t) => t.length > 0));

  let bestScore = -1;
  let bestCandidate: IndexedCandidate | null = null;

  for (const candidate of index) {
    // 1) Full name character-bigram Dice (with common-word penalty)
    let intersectionCount = 0;
    for (const bigram of productBigrams) {
      if (candidate.bigrams.has(bigram)) intersectionCount++;
    }
    const rawFullScore =
      productBigrams.size + candidate.bigrams.size > 0
        ? (2 * intersectionCount) / (productBigrams.size + candidate.bigrams.size)
        : normalizedProduct === candidate.normalized ? 1 : 0;
    const fullScore = penalizeWeakModelOverlap(rawFullScore, productTokens, candidate.tokens);

    // 2) Brand-removed character-bigram Dice (with common-word penalty)
    let noBrandIntersection = 0;
    for (const bigram of productNoBrandBigrams) {
      if (candidate.noBrandBigrams.has(bigram)) noBrandIntersection++;
    }
    const rawNoBrandScore =
      productNoBrandBigrams.size + candidate.noBrandBigrams.size > 0
        ? (2 * noBrandIntersection) / (productNoBrandBigrams.size + candidate.noBrandBigrams.size)
        : productNoBrand === candidate.noBrand ? 1 : 0;
    const noBrandScore = penalizeWeakModelOverlap(rawNoBrandScore, productNoBrandTokens, candidate.noBrandTokens);

    // 3) Token-level Dice
    let tokenIntersection = 0;
    for (const token of productTokens) {
      if (candidate.tokens.has(token)) tokenIntersection++;
    }
    const tokenFullScore =
      productTokens.size + candidate.tokens.size > 0
        ? (2 * tokenIntersection) / (productTokens.size + candidate.tokens.size)
        : 0;

    // 4) Token-level no-brand Dice
    let tokenNoBrandIntersection = 0;
    for (const token of productNoBrandTokens) {
      if (candidate.noBrandTokens.has(token)) tokenNoBrandIntersection++;
    }
    const tokenNoBrandScore =
      productNoBrandTokens.size + candidate.noBrandTokens.size > 0
        ? (2 * tokenNoBrandIntersection) / (productNoBrandTokens.size + candidate.noBrandTokens.size)
        : 0;

    const score = Math.max(fullScore, noBrandScore, tokenFullScore, tokenNoBrandScore);

    // Brand mismatch penalty: heavily penalize when brands are completely different
    let finalScore = score;
    if (options?.productBrand && candidate.brand) {
      const brandRelation = brandsSimilar(options.productBrand, candidate.brand);
      if (brandRelation === 'different') {
        finalScore *= 0.35;
      }
    }

    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestCandidate = candidate;
    }
  }

  if (!bestCandidate) return null;

  return {
    id: bestCandidate.id,
    name: bestCandidate.name,
    score: bestScore,
  };
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

export const MATCH_THRESHOLDS = {
  AUTO_APPROVE: 0.85,
  PENDING_REVIEW: 0.65,
  REJECT: 0.65,
} as const;
