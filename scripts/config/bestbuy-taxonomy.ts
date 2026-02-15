/**
 * Best Buy category taxonomy IDs for targeted AudioList categories.
 *
 * Source: `npm run bestbuy:taxonomy` output (Best Buy Categories API).
 *
 * Notes:
 * - Best Buy recommends class/subclass for stability, but categoryPath IDs are
 *   useful for keeping search results tight and relevant.
 * - These IDs can change over time; rerun the taxonomy dump if results drift.
 */

export const BESTBUY_CATEGORY_IDS = {
  headphone: [
    'abcat0204000', // Headphones (root)
    'pcmcat144700050004', // All Headphones
    'pcmcat1767643432117', // Audiophile Headphones
    'pcmcat143000050010', // Behind-the-Neck Headphones
    'pcmcat1631299414411', // Bluetooth Audio Glasses
    'pcmcat143000050009', // Clip-On Headphones
    'abcat0204001', // Home & DJ Headphone
    'pcmcat168000050041', // Kids' Headphones
    'pcmcat1506545802590', // Noise-Cancelling Headphones
    'abcat0204002', // Noise-Cancelling Headphones
    'pcmcat1705068483683', // Open-Ear Headphones
    'pcmcat143000050011', // Over-Ear & On-Ear Headphones
    'pcmcat748300662394', // Premium Headphones
    'abcat0204003', // Sport Headphones
    'pcmcat306200050003', // Sports Headphones
    'pcmcat219300050003', // Studio Headphones
    'pcmcat1550847451874', // Wired Headphones
    'abcat0204005', // Wireless Bluetooth Headphones
    'pcmcat331200050015', // Wireless Headphones
    'abcat0204004', // Wireless Headphones
  ],
  // These Best Buy "headphones" subcategories primarily contain earbuds/IEMs.
  // We ingest them under AudioList `iem` (retailer-first; category conflicts are queued as retailer_category tasks).
  iem: [
    'pcmcat143000050007', // Earbud & In-Ear Headphones
    'pcmcat1498066426386', // True Wireless Earbud Headphones
  ],
  hp_accessory: [
    'pcmcat313100050031', // Headphone Accessories
  ],
  microphone: [
    'pcmcat152100050038', // Microphones (root)
    'pcmcat258000050011', // Camera Microphones
    'abcat0515041', // Computer Microphones
    'pcmcat221400050015', // Condenser Microphones
    'pcmcat221400050014', // Dynamic Microphones
    'pcmcat1744392454000', // Gaming Microphones
    'pcmcat1687898514957', // Lavalier Microphones
    'pcmcat224100050021', // More Microphones
    'pcmcat221400050016', // Wireless Microphones
  ],
} as const;

export const BESTBUY_EXCLUDED_CATEGORY_IDS = [
  // Returned under Headphones, but clearly not a headphone category.
  'pcmcat236900050011', // Canon CMOS HD Camcorder
] as const;
