/**
 * mic-known-specs.ts
 *
 * Known microphone specs lookup table for well-known models.
 * Used as a final fallback when title/tag/product_type extraction fails.
 */

export interface KnownMicSpecs {
  mic_connection?: 'usb' | 'xlr' | 'usb_xlr' | 'wireless' | '3.5mm';
  mic_type?: 'dynamic' | 'condenser' | 'ribbon';
  mic_pattern?: 'cardioid' | 'omnidirectional' | 'bidirectional' | 'supercardioid' | 'hypercardioid' | 'multipattern' | 'shotgun';
}

/**
 * Regex pattern -> known specs. Ordered most-specific first.
 * Only includes attributes that are definitively known for the model.
 */
export const KNOWN_MIC_SPECS: [RegExp, KnownMicSpecs][] = [
  // ── Shure ──
  [/\bsm7\s?d\s?b\b/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],
  [/\bsm7\s?b\b/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],
  [/\bmv7i\b/i, { mic_connection: 'usb_xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],
  [/\bmv7\+/i, { mic_connection: 'usb_xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],
  [/\bmv7\b/i, { mic_connection: 'usb_xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],
  [/\bsm58\b/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],
  [/\bsm57\b/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],
  [/\bsm86\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bsm27\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bmv88\b/i, { mic_connection: 'usb', mic_type: 'condenser', mic_pattern: 'bidirectional' }],
  [/\bmv51\b/i, { mic_connection: 'usb', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bmv5\b/i, { mic_connection: 'usb', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bbeta\s?58/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'supercardioid' }],
  [/\bbeta\s?87/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'supercardioid' }],
  [/\bbeta\s?91/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bpga48\b/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],
  [/\bpga181\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\b55sh\b/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],
  [/\bsuper\s?55\b/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'supercardioid' }],
  [/\bmotiv/i, { mic_connection: 'usb', mic_type: 'condenser' }],
  [/\bmove\s?mic\b/i, { mic_connection: 'wireless', mic_type: 'condenser', mic_pattern: 'cardioid' }],

  // ── Electro-Voice ──
  [/\bre20\b/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],
  [/\bre320\b/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],
  [/\bre27/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],

  // ── Rode ──
  [/\bpodmic\s*usb\b/i, { mic_connection: 'usb_xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],
  [/\bpodmic\b/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],
  [/\bnt1[\s-]?a\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bnt1\b.*(?:5th|gen)/i, { mic_connection: 'usb_xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bnt1\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bnt2[\s-]?a\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'multipattern' }],
  [/\bnt\-?usb\+/i, { mic_connection: 'usb', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bnt\-?usb\b/i, { mic_connection: 'usb', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bntg5\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'shotgun' }],
  [/\bntg4\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'shotgun' }],
  [/\bntg3\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'shotgun' }],
  [/\bntg2\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'shotgun' }],
  [/\bntg1\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'shotgun' }],
  [/\bnt[\s-]?sf1\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'bidirectional' }],
  [/\bvideomic\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'shotgun' }],
  [/\bntr\b.*\brode\b|\brode\b.*\bntr\b/i, { mic_connection: 'xlr', mic_type: 'ribbon', mic_pattern: 'bidirectional' }],
  [/\bprocaster\b/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],
  [/\bpodcaster\b/i, { mic_connection: 'usb', mic_type: 'dynamic', mic_pattern: 'cardioid' }],

  // ── Audio-Technica ──
  [/\bat2020usb/i, { mic_connection: 'usb', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bat2020\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bat2035\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bat2040\b/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'hypercardioid' }],
  [/\bat2050\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'multipattern' }],
  [/\bat4040\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bat4050\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'multipattern' }],
  [/\bat875r\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'shotgun' }],
  [/\bat897\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'shotgun' }],

  // ── AKG ──
  [/\bc414\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'multipattern' }],
  [/\bc214\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bc314\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'multipattern' }],
  [/\bp120\b.*\bakg\b|\bakg\b.*\bp120\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bp420\b.*\bakg\b|\bakg\b.*\bp420\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'multipattern' }],
  [/\bc519\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bc5\b.*\bakg\b|\bakg\b.*\bc5\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bc7\b.*\bakg\b|\bakg\b.*\bc7\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'supercardioid' }],
  [/\blyra\b/i, { mic_connection: 'usb', mic_type: 'condenser', mic_pattern: 'multipattern' }],
  [/\bc411\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'bidirectional' }],

  // ── Sennheiser / Neumann ──
  [/\bmke\s?600\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'shotgun' }],
  [/\bmkh\s?8018\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'supercardioid' }],
  [/\bmk4\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\be\s?835\b/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],
  [/\be\s?935\b/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],
  [/\be\s?945\b/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'supercardioid' }],
  [/\bprofile\b.*\bsennheiser\b|\bsennheiser\b.*\bprofile\b/i, { mic_connection: 'usb', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\btlm\s?103\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\btlm\s?102\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bu\s?87\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'multipattern' }],

  // ── Warm Audio ──
  [/\bwa[\s-]?87\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'multipattern' }],
  [/\bwa[\s-]?47\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bwa[\s-]?14\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'multipattern' }],

  // ── AEA (ribbon) ──
  [/\baea\b.*\bnuvo\b|\bnuvo\b/i, { mic_connection: 'xlr', mic_type: 'ribbon', mic_pattern: 'bidirectional' }],
  [/\baea\b.*\bn22\b|\bn22\b.*\baea\b/i, { mic_connection: 'xlr', mic_type: 'ribbon', mic_pattern: 'bidirectional' }],
  [/\baea\b.*\br44\b|\br44\b.*\baea\b/i, { mic_connection: 'xlr', mic_type: 'ribbon', mic_pattern: 'bidirectional' }],

  // ── Beyerdynamic ──
  [/\bm\s?70\b.*\bbeyerdynamic\b|\bbeyerdynamic\b.*\bm\s?70\b/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'hypercardioid' }],
  [/\bm\s?90\b.*\bbeyerdynamic\b|\bbeyerdynamic\b.*\bm\s?90\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bfox\b.*\bbeyerdynamic\b|\bbeyerdynamic\b.*\bfox\b/i, { mic_connection: 'usb', mic_type: 'condenser', mic_pattern: 'cardioid' }],

  // ── HyperX ──
  [/\bquadcast\b/i, { mic_connection: 'usb', mic_type: 'condenser', mic_pattern: 'multipattern' }],
  [/\bsolocast\b/i, { mic_connection: 'usb', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bduocast\b/i, { mic_connection: 'usb', mic_type: 'condenser', mic_pattern: 'bidirectional' }],

  // ── Elgato ──
  [/\bwave[\s:]?\s*(?:1|one)\b/i, { mic_connection: 'usb', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bwave[\s:]?\s*(?:3|three)\b/i, { mic_connection: 'usb', mic_type: 'condenser', mic_pattern: 'cardioid' }],

  // ── Samson ──
  [/\bq2u\b/i, { mic_connection: 'usb_xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],
  [/\bq9u\b/i, { mic_connection: 'usb_xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],

  // ── Heil ──
  [/\bpr[\s-]?40\b/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],
  [/\bpr[\s-]?30\b/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'cardioid' }],

  // ── Earthworks ──
  [/\bethos\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'supercardioid' }],

  // ── sE Electronics ──
  [/\bse4100\b|\bse\s*4100\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],
  [/\bse2200\b|\bse\s*2200\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],

  // ── Lauten Audio ──
  [/\bla[\s-]?320\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'multipattern' }],
  [/\bla[\s-]?220\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'cardioid' }],

  // ── Universal Audio ──
  [/\bsphere\b.*\blx\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'multipattern' }],
  [/\bsphere\b.*\bdlx\b/i, { mic_connection: 'xlr', mic_type: 'condenser', mic_pattern: 'multipattern' }],

  // ── Zoom ──
  [/\bzdm[\s-]?1\b/i, { mic_connection: 'xlr', mic_type: 'dynamic', mic_pattern: 'supercardioid' }],
  [/\biq7\b/i, { mic_connection: 'usb', mic_type: 'condenser', mic_pattern: 'bidirectional' }],

  // ── IK Multimedia ──
  [/\birig\s*mic\s*studio\b/i, { mic_connection: 'usb', mic_type: 'condenser', mic_pattern: 'cardioid' }],
];

/**
 * Look up known mic specs by product name.
 * Returns partial specs (only fields definitively known for this model), or null.
 */
export function lookupKnownMicSpecs(productName: string): KnownMicSpecs | null {
  const lower = productName.toLowerCase();
  for (const [pattern, specs] of KNOWN_MIC_SPECS) {
    if (pattern.test(lower)) {
      return specs;
    }
  }
  return null;
}
