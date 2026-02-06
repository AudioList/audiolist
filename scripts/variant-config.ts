/**
 * variant-config.ts
 *
 * Product name variant parsing for AudioList.
 * Extracts variant modifiers (pads, tips, filters, APEX modules, DSP, etc.)
 * from parenthetical segments in Squig-Rank product names.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VariantType =
  | 'pads'
  | 'tips'
  | 'apex'
  | 'nozzle'
  | 'filter'
  | 'dsp'
  | 'cable'
  | 'impedance'
  | 'anc'
  | 'switch'
  | 'mod'
  | 'sample'
  | 'fit'
  | 'year';

/** A variant pattern definition. */
interface VariantPattern {
  type: VariantType;
  /** Keywords to match against parenthetical content (case-insensitive). */
  keywords: string[];
  /** Regex patterns to match (tested against the parenthetical content). */
  regexes?: RegExp[];
}

export interface ParsedVariant {
  type: VariantType;
  value: string;
}

export interface ParseResult {
  baseName: string;
  variants: ParsedVariant[];
}

/**
 * Maps variant types to the accessory category they should be linked to.
 * Null means the variant is informational only (not purchasable).
 */
export type AccessoryCategory = 'iem_tips' | 'iem_cable' | 'iem_filter' | 'hp_pads' | 'hp_cable';

// ---------------------------------------------------------------------------
// Variant patterns (order matters — first match wins per parenthetical)
// ---------------------------------------------------------------------------

const VARIANT_PATTERNS: VariantPattern[] = [
  // Sample numbers — check early so "(Sample 1)" doesn't match other patterns
  {
    type: 'sample',
    keywords: [],
    regexes: [
      /^(?:sample|unit|s)\s*#?\s*\d+$/i,
      /^S\d+$/,  // "S2", "S3" etc.
    ],
  },

  // Year / generation revisions — not purchasable accessories
  {
    type: 'year',
    keywords: [],
    regexes: [
      /^(?:19|20)\d{2}$/,                           // (2021), (2016)
      /^Pre-?\d{4}$/i,                              // (Pre-2021)
      /^\d+(?:st|nd|rd|th)\s+Gen(?:eration)?$/i,    // (3rd Gen)
      /^(?:v|ver(?:sion)?)\s*\d/i,                  // (V2), (Version 3)
      /^(?:Gen|Generation)\s*\d/i,                  // (Gen 2)
      /^Rev(?:ision)?\s*\w/i,                       // (Rev A), (Revision 2)
      /^MK\.?\s*(?:I{1,3}V?|V?I{0,3})$/i,          // (MK2), (MKIII), etc.
    ],
  },

  // Earpads (headphone accessories)
  {
    type: 'pads',
    keywords: [
      // Pad brands
      'Dekoni', 'Dekoni Audio', 'Dekoni Elite',
      'Brainwavz', 'Yaxi', 'ZMF',
      'Misodiko', 'Geekria', 'Wicked Cushions', 'Vesper',
      'FOCUSPAD', 'Focus pad',
      // Pad materials/types
      'Velour pads', 'Velour', 'Suede pads', 'Suede',
      'Leather pads', 'Leather', 'Pleather',
      'Protein leather', 'Sheepskin', 'Lambskin',
      'Alcantara', 'Alcantara pads',
      'Hybrid pads', 'Hybrid',
      'Perforated', 'Fenestrated',
      'Mesh pads', 'Foam pads',
      'Stock pads', 'OEM pads',
      // Specific pad models
      'Elite Velour', 'Elite Sheepskin', 'Elite Hybrid',
      'Clear Mg pads', 'Utopia pads', 'Analytical pads',
    ],
    regexes: [
      /\bpads?\b/i,                   // anything containing "pad" or "pads"
      /\bearpad/i,                     // "earpad", "earpads"
      /\bcushion/i,                    // "cushion", "cushions"
      /dekoni/i,                       // any dekoni mention
      /brainwavz/i,
      /yaxi/i,
    ],
  },

  // Eartips (IEM accessories) — only third-party, not stock
  {
    type: 'tips',
    keywords: [
      // Tip brands
      'SpinFit', 'Spin Fit', 'SpinFit CP145', 'SpinFit CP100', 'SpinFit CP360',
      'SpinFit Omni', 'SpinFit W1',
      'Comply', 'Comply Foam',
      'Azla', 'Azla Sedna', 'Azla SednaEarfit', 'Azla Sedna Short',
      'Azla Sedna Crystal', 'Azla Sedna Shorts', 'Sedna',
      'Final Type E', 'Final Audio Type E',
      'JVC Spiral Dot', 'Spiral Dot', 'JVC Spiral',
      'Symbio', 'Symbio W', 'Symbio F',
      'Dunu S&S',
      'Divinus Velvet', 'Divinus',
      'Pentaconn Coreir',
    ],
    regexes: [
      /spinfit/i,
      /comply/i,
      /azla/i,
      /sedna/i,
      /spiral\s*dot/i,
      /symbio/i,
      /divinus/i,
    ],
  },

  // 64 Audio APEX modules
  {
    type: 'apex',
    keywords: [
      'M15', 'M20', 'MX', 'M12',
      'm15', 'm20', 'mX', 'm12',
      'APEX M15', 'APEX M20', 'APEX MX', 'APEX M12',
    ],
    regexes: [
      /^[Mm]\d{2}$/,        // M15, M20, M12
      /^[Mm][Xx]$/,          // MX
      /^APEX\s+M/i,          // APEX M15, etc.
    ],
  },

  // Nozzle / filter positions
  {
    type: 'nozzle',
    keywords: [
      'Bass nozzle', 'Treble nozzle', 'Default nozzle',
      'High nozzle', 'Mid nozzle', 'Low nozzle',
      'Nozzle 1', 'Nozzle 2', 'Nozzle 3',
      'Red nozzle', 'Blue nozzle', 'Gold nozzle', 'Silver nozzle',
      'Black nozzle', 'Green nozzle',
      'Bass boost nozzle', 'Reference nozzle',
    ],
    regexes: [
      /\bnozzle\b/i,
    ],
  },

  // Filters (IEM tuning filters, not APEX)
  {
    type: 'filter',
    keywords: [
      'Bass filter', 'Treble filter', 'Vokal filter', 'Mid filter',
      'Reference filter', 'Vocal filter',
      'Red filter', 'Blue filter', 'Gold filter', 'Silver filter',
      'Black filter', 'White filter', 'Green filter',
      'Foam filter', 'Mesh filter',
    ],
    regexes: [
      /\bfilter\b/i,
      /\bnozzle.+filter\b/i,  // "Red nozzle with blue filter"
    ],
  },

  // Switches / tuning settings
  {
    type: 'switch',
    keywords: [
      'BA on', 'BA off',
      'Bass switch on', 'Bass switch off',
      'Switch on', 'Switch off',
    ],
    regexes: [
      /^\d{3,}\s*setting$/i,   // "003 setting", "020 setting"
      /\bswitch\s+(?:on|off)\b/i,
      /\bBA\s+(?:on|off)\b/i,
    ],
  },

  // ANC / mode variants (TWS)
  {
    type: 'anc',
    keywords: [
      'ANC mode', 'ANC on', 'ANC off',
      'Passive mode', 'Transparency mode',
      'Noise cancelling', 'Noise canceling',
    ],
    regexes: [
      /\bANC\b/i,
      /\bpassive\s+mode\b/i,
      /\btransparency\b/i,
    ],
  },

  // DSP / EQ modes
  {
    type: 'dsp',
    keywords: [
      'DSP', 'Analog',
      'Stock EQ', 'Crinacle EQ', 'Game EQ',
      'Bass Boost preset', 'Bright preset',
      'Harman target',
    ],
    regexes: [
      /^DSP$/i,
      /^DSP:\s*.+$/i,             // "DSP: Bass+", "DSP: Harman"
      /\bpreset\b/i,
      /\bEQ\b/,                    // uppercase EQ only to avoid false positives
    ],
  },

  // Impedance / resistor variants
  {
    type: 'impedance',
    keywords: [],
    regexes: [
      /\d+\s*ohm/i,               // "75 ohm resistor", "250 ohm", "32 ohm"
      /\bresistor\b/i,
    ],
  },

  // Cable variants
  {
    type: 'cable',
    keywords: [
      'Stock cable', 'Balanced cable',
      'Silver cable', 'Copper cable', 'SPC cable',
    ],
    regexes: [
      /\bcable\b/i,
      /^(?:balanced|4\.4mm|2\.5mm|3\.5mm)$/i,
    ],
  },

  // Fit / seal
  {
    type: 'fit',
    keywords: [
      'Custom', 'Universal', 'CIEM',
      'Deep fit', 'Shallow fit', 'Normal fit',
      'Loose seal', 'Tight seal',
    ],
    regexes: [
      /^Custom$/i,
      /^Universal$/i,
      /^CIEM$/i,
    ],
  },

  // Mods
  {
    type: 'mod',
    keywords: [
      'modded', 'mod', 'MOD',
      'DIYAH filter',
      'TANYA FILTER',
    ],
    regexes: [
      /^mod(?:ded)?$/i,
      /\bDIY\w*\s+filter\b/i,
    ],
  },
];

// ---------------------------------------------------------------------------
// Skip patterns — parentheticals that are NOT variants (brand sub-names, etc.)
// These stay in the baseName.
// ---------------------------------------------------------------------------

const SKIP_PATTERNS: RegExp[] = [
  // Sub-brand parentheticals: "Celest (Kinera)", "FIIO(飞傲)"
  /^[A-Z][a-zA-Z]+$/,                  // Single capitalized word that could be a brand
  // Pre-production / prototype noise (left in baseName, not a variant)
  /^pre-?production$/i,
  /^prototype$/i,
  /^pre-?release$/i,
  /^loaner$/i,
  /^review\s*unit$/i,
  /^demo$/i,
  // Measurement rig info (not a variant)
  /^Pinna\b/i,
  /^\d+dB/i,                           // "(84dB + ANC)"
  // Model aliases like "(B2)" for "Blessing 2"
  /^[A-Z]\d{1,2}$/,                    // B2, S3, etc.  — likely model aliases
];

// ---------------------------------------------------------------------------
// Accessory category mapping
// ---------------------------------------------------------------------------

const ACCESSORY_MAP: Record<string, { iem: AccessoryCategory | null; headphone: AccessoryCategory | null }> = {
  pads:       { iem: null,          headphone: 'hp_pads' },
  tips:       { iem: 'iem_tips',    headphone: null },
  apex:       { iem: 'iem_filter',  headphone: null },
  nozzle:     { iem: 'iem_filter',  headphone: null },
  filter:     { iem: 'iem_filter',  headphone: null },
  cable:      { iem: 'iem_cable',   headphone: 'hp_cable' },
  switch:     { iem: null,          headphone: null },
  impedance:  { iem: null,          headphone: null },
  anc:        { iem: null,          headphone: null },
  dsp:        { iem: null,          headphone: null },
  sample:     { iem: null,          headphone: null },
  fit:        { iem: null,          headphone: null },
  mod:        { iem: null,          headphone: null },
  year:       { iem: null,          headphone: null },
};

/**
 * Maps a variant type + parent category to an accessory CategoryId (or null if not purchasable).
 */
export function mapVariantToAccessoryCategory(
  variantType: VariantType,
  parentCategory: 'iem' | 'headphone'
): AccessoryCategory | null {
  return ACCESSORY_MAP[variantType]?.[parentCategory] ?? null;
}

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

/**
 * Checks if a parenthetical content should be skipped (stays in baseName).
 */
function shouldSkip(content: string): boolean {
  return SKIP_PATTERNS.some((re) => re.test(content));
}

/**
 * Matches parenthetical content against variant patterns.
 * Returns the variant type if matched, null otherwise.
 */
function matchVariant(content: string): VariantType | null {
  const lower = content.toLowerCase();

  for (const pattern of VARIANT_PATTERNS) {
    // Check keyword matches (case-insensitive substring)
    for (const keyword of pattern.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return pattern.type;
      }
    }

    // Check regex matches
    if (pattern.regexes) {
      for (const re of pattern.regexes) {
        if (re.test(content)) {
          return pattern.type;
        }
      }
    }
  }

  return null;
}

/**
 * Parse a product name to extract variant modifiers from parenthetical segments.
 *
 * Examples:
 *   "Sennheiser HD600 (Dekoni Elite Velour)" → { baseName: "Sennheiser HD600", variants: [{ type: "pads", value: "Dekoni Elite Velour" }] }
 *   "64 Audio U12t (M15)" → { baseName: "64 Audio U12t", variants: [{ type: "apex", value: "M15" }] }
 *   "Moondrop Blessing 2 (B2)" → { baseName: "Moondrop Blessing 2 (B2)", variants: [] }
 */
export function parseProductVariant(name: string): ParseResult {
  const variants: ParsedVariant[] = [];
  let workingName = name;

  // Find all parenthetical segments: "(content)"
  // Use a regex that captures content between balanced parens
  const parenRegex = /\(([^)]+)\)/g;
  const matches: Array<{ full: string; content: string }> = [];
  let m: RegExpExecArray | null;

  while ((m = parenRegex.exec(name)) !== null) {
    matches.push({ full: m[0], content: m[1].trim() });
  }

  // Process each parenthetical
  for (const { full, content } of matches) {
    // Try to match a variant FIRST (variant match takes priority over skip)
    const variantType = matchVariant(content);
    if (variantType) {
      variants.push({ type: variantType, value: content });
      // Remove the matched parenthetical from the working name
      workingName = workingName.replace(full, '');
      continue;
    }

    // Only skip (leave in baseName) if no variant was matched
    // Unmatched parentheticals that don't match skip patterns also stay in baseName
  }

  // Clean up the base name: collapse multiple spaces, trim
  const baseName = workingName.replace(/\s{2,}/g, ' ').trim();

  return { baseName, variants };
}
