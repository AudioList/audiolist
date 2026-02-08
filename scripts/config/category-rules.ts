/**
 * category-rules.ts
 *
 * Central classification rules for cross-category product detection.
 * Used by detection functions in matcher.ts and fix scripts.
 *
 * Sections:
 *   1. IEM vs Headphone rules (Tier 1/2/3 system)
 *   2. Cable sub-category rules (cable vs iem_cable vs hp_cable)
 *   3. Speaker cleanup rules
 *   4. DAP reclassification rules
 *   5. DAC/Amp consolidation rules
 *   6. Junk & misplaced item overrides
 */

import type { CategoryId } from './store-collections.ts';

// ---------------------------------------------------------------------------
// Tier 1 -- Headphone-only brands
// ---------------------------------------------------------------------------

/** Brands that exclusively produce full-size headphones (no IEMs). */
export const HEADPHONE_ONLY_BRANDS: Set<string> = new Set([
  'stax',
  'zmf',
  'dan clark audio',
  'dca',
  'mrspeakers',
  'abyss',
  'kennerton',
  'sendy audio',
  't+a',
  'hedd',
  'raal',
  'raal-requisite',
]);

/**
 * Tier 1 exceptions: products from headphone-only brands that are actually IEMs.
 * If a product matches any of these patterns, it stays as IEM even if brand is in HEADPHONE_ONLY_BRANDS.
 */
export const HEADPHONE_BRAND_IEM_EXCEPTIONS: RegExp[] = [
  // STAX SR-001, SR-002, SR-003 (and MK variants like SR-003MK2) are in-ear electrostatics
  /\bSR[\s-]?00[123]/i,
];

// ---------------------------------------------------------------------------
// Tier 2 -- Brand + model regex rules
// ---------------------------------------------------------------------------

export interface BrandModelRule {
  /** Lowercase brand name (must match extracted brand) */
  brand: string;
  /** Patterns that indicate the product is a headphone */
  headphonePatterns: RegExp[];
  /** Patterns that indicate the product is an IEM (takes priority to prevent false reclassification) */
  iemPatterns: RegExp[];
}

export const BRAND_MODEL_RULES: BrandModelRule[] = [
  {
    brand: 'sennheiser',
    headphonePatterns: [/\bHD[\s-]?\d/i, /\bHE[\s-]?\d/i, /\bMomentum\s*[34]/i, /\bPX[\s-]?1\d\d/i, /\bGSP/i],
    iemPatterns: [/\bIE[\s-]?\d/i, /\bMomentum\s*(True|Sport|In)/i],
  },
  {
    brand: 'beyerdynamic',
    headphonePatterns: [/\bDT[\s-]?\d+\w*(?!\s*IE)\b/i, /\bAventho/i, /\bCustom\s+One\s+Pro/i, /\bT[\s-]?[15]\s/i, /\bAmiron/i],
    iemPatterns: [/\bDT[\s-]?\d+\w*\s*IE\b/i, /\bXelento/i, /\bByrd/i, /\bBlue\s*Byrd/i],
  },
  {
    brand: 'audio-technica',
    headphonePatterns: [/\bATH[\s-]?M\d/i, /\bATH[\s-]?R\d/i, /\bATH[\s-]?AD\d/i, /\bATH[\s-]?A\d/i, /\bATH[\s-]?W\d/i, /\bBPHS/i, /\bATH[\s-]?HP/i, /\bATH[\s-]?WP/i, /\bATH[\s-]?AWKT/i, /\bATH[\s-]?AWAS/i],
    iemPatterns: [/\bATH[\s-]?E\d/i, /\bATH[\s-]?CK/i, /\bATH[\s-]?LS/i, /\bATH[\s-]?IM/i, /\bATH[\s-]?IEX/i],
  },
  {
    brand: 'hifiman',
    headphonePatterns: [/\bHE[\s-]?\d/i, /\bSusvara/i, /\bArya/i, /\bAnanda/i, /\bSundara/i, /\bDeva/i, /\bEdition/i, /\bAudivina/i, /\bJade/i, /\bShangri/i, /\bIsvarna/i],
    iemPatterns: [/\bRE[\s-]?\d/i, /\bSvanar/i],
  },
  {
    brand: 'audeze',
    headphonePatterns: [/\bLCD[\s-]?[2345X](?![\s-]*i)/i, /\bMM[\s-]?\d/i, /\bCRBN/i, /\bMaxwell/i],
    iemPatterns: [/\bLCD[\s-]?i/i, /\biSINE/i, /\bEuclid/i],
  },
  {
    brand: 'meze',
    headphonePatterns: [/\b99\b/i, /\b109\b/i, /\bEmpyrean/i, /\bElite\b/i, /\bLiric/i, /\bPOET/i],
    iemPatterns: [/\bRAI/i, /\bAdvar/i, /\bAlba/i],
  },
  {
    brand: 'grado',
    headphonePatterns: [/\bSR[\s-]?\d/i, /\bRS[\s-]?\d/i, /\bGS[\s-]?\d/i, /\bPS[\s-]?\d/i, /\bGH[\s-]?\d/i, /\bHemp/i],
    iemPatterns: [/\bGR[\s-]?\d/i, /\biGe/i, /\bGT\d/i],
  },
  {
    brand: 'sony',
    headphonePatterns: [/\bWH[\s-]/i, /\bMDR[\s-]?Z/i, /\bMDR[\s-]?M\d/i, /\bMDR[\s-]?7506/i, /\bMDR[\s-]?CD/i, /\bMDR[\s-]?SA/i, /\bMDR[\s-]?H/i, /\bULT\s*WEAR/i],
    iemPatterns: [/\bWF[\s-]/i, /\bIER[\s-]/i, /\bXBA[\s-]/i, /\bMDR[\s-]?EX/i],
  },
  {
    brand: 'focal',
    headphonePatterns: [/\bElear/i, /\bUtopia(?!\s*Go)/i, /\bClear/i, /\bElegia/i, /\bStellia/i, /\bCelestee/i, /\bRadiance/i, /\bBathys/i, /\bHadenys/i, /\bAzurys/i, /\bListen/i],
    iemPatterns: [/\bSphear/i, /\bSpark/i, /\bUtopia\s*Go/i],
  },
  {
    brand: 'shure',
    headphonePatterns: [/\bSRH[\s-]?\d/i, /\bAONIC\s*50/i],
    iemPatterns: [/\bSE[\s-]?\d/i, /\bKSE[\s-]?\d/i, /\bAONIC\s*[345]\b/i],
  },
  {
    brand: 'final',
    headphonePatterns: [/\bD8000/i, /\bSonorous/i, /\bUX[\s-]?\d/i],
    iemPatterns: [/\b[EABF]\d{3,}/i, /\bZE[\s-]?\d/i, /\bAdagio/i],
  },
  {
    brand: 'fiio',
    headphonePatterns: [/\bFT[\s-]?\d/i, /\bJT[\s-]?\d/i, /\bWind/i, /\bSNOWSKY/i],
    iemPatterns: [/\bFH[\s-]?\d/i, /\bFD[\s-]?\d/i, /\bFA[\s-]?\d/i, /\bFX[\s-]?\d/i, /\bFW[\s-]?\d/i, /\bJD[\s-]?\d/i, /\bJH[\s-]?\d/i],
  },
  {
    brand: 'fostex',
    headphonePatterns: [/\bTH[\s-]?\d/i, /\bT\d+RP/i],
    iemPatterns: [/\bTE[\s-]?\d/i],
  },
  {
    brand: 'philips',
    headphonePatterns: [/\bFidelio\b/i, /\bSHP[\s-]?\d/i, /\bTAH[\s-]?\d/i],
    iemPatterns: [/\bSHE[\s-]?\d/i, /\bTAT[\s-]?\d/i],
  },
  {
    brand: 'yamaha',
    headphonePatterns: [/\bYH[\s-]?\d/i, /\bHPH[\s-]?\d/i, /\bHP[\s-]?\d/i],
    iemPatterns: [/\bEPH[\s-]?\d/i],
  },
  {
    brand: 'denon',
    headphonePatterns: [/\bAH[\s-]?D\d/i, /\bD\d{4}/i],
    iemPatterns: [/\bPerl/i, /\bAH[\s-]?C/i],
  },
  {
    brand: 'harmonicdyne',
    headphonePatterns: [/\bATHENA/i, /\bBAROQUE/i, /\bBlack\s*Hole/i, /\bDEVIL/i, /\bPoseidon/i, /\bZeus/i, /\bHelios/i],
    iemPatterns: [/\bP\.?D\.?1/i, /\bPD[\s-]?1/i],
  },
  {
    brand: 'koss',
    headphonePatterns: [/\bESP/i, /\bPortaPro/i, /\bKPH[\s-]?\d/i, /\bKSC[\s-]?\d/i, /\bPro[\s-]?4/i],
    iemPatterns: [/\bKEB[\s-]?\d/i, /\bKE[\s-]?5/i, /\bPlug/i],
  },
];

/** Quick lookup map: lowercase brand -> rule */
export const BRAND_RULE_MAP: Map<string, BrandModelRule> = new Map(
  BRAND_MODEL_RULES.map((r) => [r.brand, r])
);

// ---------------------------------------------------------------------------
// Tier 3 -- Name keyword indicators
// ---------------------------------------------------------------------------

/** Patterns in the product name that strongly indicate headphone (over-ear / on-ear). */
export const HEADPHONE_NAME_INDICATORS: RegExp[] = [
  /\bover[\s-]?ear\b/i,
  /\bon[\s-]?ear\b/i,
  /\bheadphones?\b(?!.*\bin[\s-]?ear)(?!.*\bzone\b)/i,  // "headphone" but NOT "in-ear headphone" or "Headphone Zone" (retailer)
  /\bheadband\b/i,
  /\bcircumaural\b/i,
  /\bsupra[\s-]?aural\b/i,
];

/**
 * Secondary headphone indicators -- only match if no earbud/IEM guard words are present.
 * These are checked separately because they can appear in IEM product names
 * (e.g. "open-back earbuds", "full size shell" for IEM mods).
 */
export const HEADPHONE_NAME_INDICATORS_GUARDED: RegExp[] = [
  /\bopen[\s-]?back\b/i,
  /\bclosed[\s-]?back\b/i,
  /\bfull[\s-]?size\b/i,
];

/** Words that prevent guarded headphone indicators from triggering. */
export const GUARDED_INDICATOR_BLOCKERS: RegExp[] = [
  /\bearbud/i,
  /\bearphone/i,
  /\bshell\b/i,
  /\bIEM\b/,
  /\bin[\s-]?ear\b/i,
];

/** Patterns that indicate the product is genuinely an IEM (prevent reclassification). */
export const IEM_NAME_INDICATORS: RegExp[] = [
  /\bin[\s-]?ear\b/i,
  /\bIEMs?\b/,
  /\bearphones?\b/i,
  /\bearbuds?\b/i,
  /\bTWS\b/i,
  /\btruly[\s-]?wireless\b/i,
  /\btrue[\s-]?wireless\b/i,
  /\bin[\s-]?ear\s+monitor/i,
];

// ===========================================================================
// 2. CABLE SUB-CATEGORY RULES (cable vs iem_cable vs hp_cable)
// ===========================================================================

/** Brands that exclusively produce IEM cables (never headphone cables). */
export const IEM_CABLE_BRANDS: Set<string> = new Set([
  'dunu',
  'hakugei',
  'kinera',
  'trn',
  'nicehck',
  'tripowin',
  'kbear',
  'xinhs',
  'linsoul',
  'yongse',
  'jcally',
  'isn',
  'yinyoo',
  'bgvp',
  'aful',
  'tri',
  'softears',
  'hisenior',
]);

/** Connector patterns that strongly indicate an IEM cable. */
export const IEM_CABLE_INDICATORS: RegExp[] = [
  /\b2[\s-]?pin\b/i,
  /\bMMCX\b/i,
  /\bQDC\b/i,
  /\b0\.78\s*mm\b/i,
  /\bIEM\b.*\bcable\b/i,
  /\bcable\b.*\bIEM\b/i,
  /\bearphone\s+(cable|upgrade)\b/i,
  /\b(cable|upgrade)\b.*\bearphone\b/i,
  /\bin[\s-]?ear\b.*\bcable\b/i,
  /\b(2[\s-]?pin|MMCX)\s+(0\.78|cable|upgrade)/i,
];

/** Brand+model patterns for specific IEM cable lines. */
export const IEM_CABLE_MODEL_PATTERNS: RegExp[] = [
  /\bFiiO\b.*\bLS[\s-]?\d/i,           // FiiO LS-series IEM cables
  /\bMoondrop\b.*\b(cable|CDSP|Line\s*K|PCC|MC1|Free\s*DSP|Silver\s*Pill)\b/i,
  /\bShanling\b.*\bEL\d/i,             // Shanling EL-series
  /\bHiBy\b.*\b(cable|upgrade)\b/i,
  /\bDUNU\b.*\b(DUW|HULK|LYRE)\b/i,
];

/** Connector/model patterns that strongly indicate a headphone cable. */
export const HP_CABLE_INDICATORS: RegExp[] = [
  /\bheadphone\s+(cable|upgrade)\b/i,
  /\b(cable|upgrade)\b.*\bheadphone\b/i,
  // "for <headphone brand/model>" patterns
  /\bfor\s+(HD[\s-]?\d|LCD|Audeze|Sennheiser|Focal|HiFiMAN|Beyerdynamic|ZMF|DCA|Dan\s+Clark)/i,
  // Specific headphone model references in cable names
  /\b(HD800|HD650|HD600|HD580|HD660|LCD[\s-]?[2345X]|Clear|Utopia|Arya|Sundara|Susvara|TH900|T60RP|T50RP)\b/i,
  /\b(mini[\s-]?XLR|4[\s-]?pin\s+XLR)\b.*\b(cable|headphone)\b/i,
];

/** HP cable brand+model patterns. */
export const HP_CABLE_MODEL_PATTERNS: RegExp[] = [
  /\bApos\s+Flow\s+Headphone\b/i,     // Apos Flow Headphone Cable series
  /\bDragon\b.*\b(headphone|HD|LCD|Focal|Audeze|Sennheiser)\b/i,  // Moon Audio Dragon cables
  /\bCardas\b.*\b(headphone|Clear\s+Beyond)\b/i,
  /\bDekoni\b.*\bcable\b/i,
  /\bDan\s+Clark\b.*\b(DUMMER|VIVO)\b/i,
  /\bMeze\b.*\b(99|109|Empyrean|Elite|Liric)\b.*\bcable\b/i,
  /\bRAAL[\s-]?requisite\b.*\bcable\b/i,
];

/** Patterns indicating a general audio cable (interconnect, power, USB, etc). */
export const GENERAL_CABLE_INDICATORS: RegExp[] = [
  /\binterconnect\b/i,
  /\bpower\s+c(able|ord)\b/i,
  /\bAC\s+power\b/i,
  /\bspeaker\s+cable\b/i,
  /\bspeaker\s+wire\b/i,
  /\bUSB[\s-]?(A|B|C)\b.*\bcable\b/i,
  /\bcable\b.*\bUSB[\s-]?(A|B|C)\b/i,
  /\bOTG\b/i,
  /\bcoaxial\b/i,
  /\boptical\b/i,
  /\bToslink\b/i,
  /\bRCA\b.*\bcable\b/i,
  /\bsubwoofer\s+cable\b/i,
  /\bumbilical\b/i,
  /\bpower\s+link\b/i,
  /\bpower\s+splitter\b/i,
  /\bclock\b.*\bBNC\b/i,
  /\bDC\s+jack\b/i,
  /\biEMatch\b/i,
];

// ===========================================================================
// 3. SPEAKER CLEANUP RULES
// ===========================================================================

/** Guard: products that definitely ARE speakers (prevent false reclassification). */
export const SPEAKER_GUARD_INDICATORS: RegExp[] = [
  /\bbookshelf\b/i,
  /\btower\b/i,
  /\bfloor[\s-]?standing\b/i,
  /\bcenter[\s-]?channel\b/i,
  /\bsubwoofer\b/i,
  /\bsound[\s-]?bar\b/i,
  /\bloudspeakers?\b/i,
  /\bspeakers?\b(?!\s+(cable|wire))/i,
  /\bpowered\s+speaker\b/i,
  /\bactive\s+speaker\b/i,
  /\bpassive\s+speaker\b/i,
  /\bmonitor\b/i,
  /\bwoofer\b/i,
  /\bspeaker\s+system\b/i,
  /\bsatellite\b/i,
  /\bsurround\b/i,
  /\b(2|3)[\s-]?way\b/i,
  /\bdriver\b/i,
];

/** Products in speaker that are actually cables. */
export const SPEAKER_TO_CABLE_INDICATORS: RegExp[] = [
  /\bcables?\b/i,
  /\binterconnects?\b/i,
  /\bwires?\b/i,
];

/** Products in speaker that are accessories (not speakers themselves). */
export const SPEAKER_ACCESSORY_INDICATORS: RegExp[] = [
  /\bstand\b/i,
  /\bgrill\b/i,
  /\bcover\b/i,
  /\bbracket\b/i,
  /\bmount\b/i,
  /\bremote\b/i,
];

// ===========================================================================
// 4. DAP RECLASSIFICATION RULES
// ===========================================================================

/** Specific product overrides for DAP items that belong in another category. */
export const DAP_PRODUCT_OVERRIDES: Array<{ pattern: RegExp; targetCategory: CategoryId }> = [
  { pattern: /\bTechnics\s+SC[\s-]?CX700\b/i, targetCategory: 'speaker' },
  { pattern: /\bTechnics\s+SU[\s-]?G700/i, targetCategory: 'amp' },
  { pattern: /\bBryston\s+BDA[\s-]?3\.14\b/i, targetCategory: 'dac' },
];

/** Patterns indicating a stationary/non-portable product in DAP category. */
export const STATIONARY_INDICATORS: RegExp[] = [
  /\bmusic\s+server\b/i,
  /\bserver\b/i,
  /\bstreamer\b/i,
  /\btransport\b/i,
  /\bnetwork\s+player\b/i,
  /\bnetwork\s+music\b/i,
  /\bintegrated\s+amplifier\b/i,
  /\bactive\s+speaker\b/i,
  /\brack\s+mount\b/i,
  /\bCD\s+(player|transport)\b/i,
  /\bSACD\b/i,
  /\bRoon\s+Core\b/i,
];

/** Guard: patterns confirming a product genuinely belongs in DAP. */
export const DAP_GUARD_INDICATORS: RegExp[] = [
  /\bportable\b/i,
  /\bDAP\b/,
  /\bdigital\s+audio\s+player\b/i,
  /\bpocket\b/i,
  /\bhi[\s-]?res\s+player\b/i,
];

// ===========================================================================
// 5. DAC / AMP CONSOLIDATION RULES
// ===========================================================================

/** Patterns indicating a product has DAC functionality (move to 'dac' if in 'amp'). */
export const DAC_INDICATORS: RegExp[] = [
  /\bDAC\w*/,
  /\bdigital[\s-]?to[\s-]?analog\b/i,
  /\bconverter\b/i,
  /\bDAC\/Amp\b/i,
  /\bAmp\/DAC\b/i,
  /\bDAC\s+and\b/i,
  /\bDAC\s*&\b/i,
  /\bDAC\s*\+\b/i,
  /\bStreaming\s+DAC\b/i,
  /\bDesktop\s+DAC\b/i,
  /\bPortable\s+DAC\b/i,
  /\bUSB\s+DAC\b/i,
  /\bBluetooth\s+DAC\b/i,
  /\bR2R\b/i,
];

/** Patterns confirming pure amplifier (no DAC component -- stays in 'amp'). */
export const AMP_ONLY_INDICATORS: RegExp[] = [
  /\bpower\s+amp/i,
  /\bspeaker\s+amp/i,
  /\bintegrated\s+amp/i,
  /\btube\s+amp/i,
  /\bheadphone\s+amp/i,
  /\bamp\b/i,
  /\bamplifier\b/i,
  /\bpre[\s-]?amp\b/i,
  /\benergizer\b/i,
];

// ===========================================================================
// 6. MICROPHONE EXCLUSION RULES
// ===========================================================================

/**
 * Products in the microphone category that are NOT actual microphones.
 * Matches karaoke machines, sound bars, boom arms/stands, audio interfaces,
 * mic handles, and other accessories that retailers lump into "microphones".
 */
export const MICROPHONE_JUNK_INDICATORS: RegExp[] = [
  // Karaoke machines / speakers / karaoke-branded mics
  /\bkaraoke\b/i,
  /\bportable\s+(bluetooth\s+)?speaker\b/i,
  /\bparty\s+speaker\b/i,
  // Sound bars
  /\bsound[\s-]?bar\b/i,
  // Boom arms and mic stands (not microphones themselves)
  /\b(mic(rophone)?|boom)\s+(arm|boom|stand)\b/i,
  /\bmicrophone\s+boom\b/i,
  /\bboom\s+arm\b/i,
  /\blow[\s-]?profile\s+microphone\s+arm\b/i,
  // Audio interfaces / mixers (not microphones)
  /\baudio\s+(interface|mixer)\b/i,
  /\bgaming\s+audio\s+interface\b/i,
  // Mic handles / adapters (accessories, not mics)
  /\bmicrophone\s+handle\b/i,
  /\bmic(rophone)?\s+adapter\b/i,
  // Shock mounts, pop filters, windscreens (accessories)
  /\bshock\s*mount\b/i,
  /\bpop\s+filter\b/i,
  /\bwindscreen\b/i,
  /\bwind\s*shield\b(?!.*\bmic)/i,
  // Phantom power / preamps / DI boxes (not microphones)
  /\bphantom\s+power\s+(supply|adapter)\b/i,
  /\bmic\s+preamp\b/i,
  /\binline\s+preamp\b/i,
  /\bdi\s+box\b/i,
  /\bdirect\s+box\b/i,
  /\bcloudlifter\b/i,
  // Headphones miscategorized in mic collections
  /\bheadphone\b/i,
  /\bin[\s-]?ear\s+monitor\b/i,
  // Cables (not microphones)
  /\bmic\s+cable\b/i,
  /\bXLR\s+cable\b/i,
  /\bmicrophone\s+cable\b/i,
  // Cases / bags
  /\bcarrying\s+case\b/i,
  /\bflight\s+case\b/i,
  /\bstorage\s+case\b/i,
  // Pop shields (variant naming)
  /\bpop\s+shield\b/i,
  // Speakers / monitors (not mics)
  /\bstudio\s+monitor\b/i,
  /\bspeaker\b/i,
  // Gift cards, service fees, non-audio products
  /\bgift\s+card\b/i,
  /\bservice\s+fee/i,
  /\btally\s+(light|indicator)\b/i,
  /\bfield\s+monitor\b/i,
  /\bintercom\b/i,
  /\bvoice\s+amplifier\b/i,
  /\bcharging\s+(case|dock)\b/i,
  /\bcold\s+shoe\b/i,
  /\bphone\s+monitor\b/i,
];

/**
 * Guard: patterns confirming a product IS a genuine microphone.
 * If these match, MICROPHONE_JUNK_INDICATORS are overridden.
 * Prevents false positives like "USB Condenser Microphone with Boom Arm"
 * from being excluded because it mentions "boom arm".
 */
export const MICROPHONE_GUARD_INDICATORS: RegExp[] = [
  /\bcondenser\s+mic/i,
  /\bdynamic\s+mic/i,
  /\bribbon\s+mic/i,
  /\bUSB\s+(condenser\s+)?mic/i,
  /\bXLR\s+(condenser\s+|dynamic\s+)?mic/i,
  /\bstudio\s+mic/i,
  /\brecording\s+mic/i,
  /\bstreaming\s+mic/i,
  /\bpodcast(ing)?\s+mic/i,
  /\bvocal\s+mic/i,
  /\blavalier\b/i,
  /\blapel\s+mic/i,
  /\bshotgun\s+mic/i,
  /\bwireless\s+mic(rophone)?\s+(system|kit|set)\b/i,
  /\blarge[\s-]?diaphragm\b/i,
  /\bsmall[\s-]?diaphragm\b/i,
  /\bboundary\s+mic/i,
  /\bdrum\s+mic/i,
  /\binstrument\s+mic/i,
  /\bbroadcast\s+mic/i,
  /\btube\s+mic/i,
  /\bvalve\s+mic/i,
  /\bgooseneck\s+mic/i,
  /\bhandheld\s+mic/i,
  /\bpencil\s+(condenser\s+)?mic/i,
];

// ===========================================================================
// 7. JUNK & MISPLACED ITEM OVERRIDES
// ===========================================================================

/** Product name patterns that indicate test/placeholder items to delete. */
export const JUNK_PRODUCT_PATTERNS: RegExp[] = [
  /^DAC\s+Test\b/i,
  /\bTest\s+DAC\s+Test\b/i,
  /^Test\s+Reference$/i,
];

/** Explicit product overrides: items known to be in the wrong category. */
export const MISPLACED_OVERRIDES: Array<{
  pattern: RegExp;
  sourceCategory: CategoryId;
  targetCategory: CategoryId;
}> = [
  // IEM -> other
  { pattern: /\biFi\s+GO\s+pod\b(?!.*\b(Ear\s+Loop|Connector|Accessori|Case|Tip|Hook))/i, sourceCategory: 'iem', targetCategory: 'dac' },
  { pattern: /\bMoondrop\s+RAYS\s+Cable\b/i, sourceCategory: 'iem', targetCategory: 'iem_cable' },
  { pattern: /\bCollection\s+Tips\b/i, sourceCategory: 'iem', targetCategory: 'iem_tips' },
  { pattern: /\bTips\s+Collection\b/i, sourceCategory: 'iem', targetCategory: 'iem_tips' },
  // DAC -> other
  { pattern: /\bddHiFi\b.*\bIEM\s+Cable\b/i, sourceCategory: 'dac', targetCategory: 'iem_cable' },
  { pattern: /\b3\.5mm\s+to\s+4\.4mm\s+Headphone\s+Adapter\b/i, sourceCategory: 'dac', targetCategory: 'cable' },
  // Headphone -> other
  { pattern: /\bStorage\s+Case\b/i, sourceCategory: 'headphone', targetCategory: 'cable' },
  { pattern: /\bCarrying\s+Case\b/i, sourceCategory: 'headphone', targetCategory: 'cable' },
  { pattern: /\bFloor\s+Stand\b/i, sourceCategory: 'headphone', targetCategory: 'cable' },
  { pattern: /\bInterspeaker\s+Cable\b/i, sourceCategory: 'headphone', targetCategory: 'cable' },
  { pattern: /\bSubwoofer\s+Adapter\b/i, sourceCategory: 'headphone', targetCategory: 'cable' },
  { pattern: /\bCanpur\s+Silver\s+Flash\b/i, sourceCategory: 'headphone', targetCategory: 'iem' },
];
