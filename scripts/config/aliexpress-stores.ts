/**
 * aliexpress-stores.ts
 *
 * Curated list of verified official AliExpress brand stores.
 * Only products from these stores are ingested, ensuring data quality.
 *
 * Store IDs (sellerIds) are the numeric identifiers in AliExpress store URLs:
 *   https://www.aliexpress.com/store/{STORE_ID}
 *
 * Adding a new store:
 *   1. Find the brand's official AliExpress store page
 *   2. Extract the numeric store ID from the URL
 *   3. Verify it has the "Official Store" badge or is linked from the brand's website
 *   4. Add an entry with appropriate categories and search keywords
 */

import type { CategoryId } from './store-collections.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AliExpressStoreConfig {
  /** AliExpress store/seller numeric ID (from the store URL) */
  sellerId: string;
  /** Canonical brand name -- used to populate vendor field for brand extraction */
  brandName: string;
  /** Keywords to search via the affiliate API (brand name + variants) */
  searchKeywords: string[];
  /** AudioList categories this store's products belong to */
  categories: CategoryId[];
  /** Store URL for reference/debugging */
  storeUrl: string;
}

// ---------------------------------------------------------------------------
// Curated Official Stores
// ---------------------------------------------------------------------------

export const ALIEXPRESS_STORES: AliExpressStoreConfig[] = [
  // ---- IEM Brands ----
  {
    sellerId: '1102182648',
    brandName: 'TruthEar',
    searchKeywords: ['TruthEar', 'TRUTHEAR'],
    categories: ['iem'],
    storeUrl: 'https://www.aliexpress.com/store/1102182648',
  },
  {
    sellerId: '4980017',
    brandName: 'Moondrop',
    searchKeywords: ['Moondrop', 'MOONDROP'],
    categories: ['iem', 'cable', 'dac', 'dap'],
    storeUrl: 'https://moondrop.aliexpress.com/store/4980017',
  },
  {
    sellerId: '912683665',
    brandName: 'Tangzu',
    searchKeywords: ['Tangzu', 'TANGZU'],
    categories: ['iem', 'cable'],
    storeUrl: 'https://tangzuofficial.aliexpress.com/store/912683665',
  },
  {
    sellerId: '912323289',
    brandName: 'Tin HiFi',
    searchKeywords: ['TinHiFi', 'Tin HiFi', 'TINHIFI'],
    categories: ['iem', 'cable'],
    storeUrl: 'https://tinhifi.aliexpress.com/store/912323289',
  },
  {
    sellerId: '1358152',
    brandName: 'KZ',
    searchKeywords: ['KZ', 'KZ earphone', 'Knowledge Zenith'],
    categories: ['iem', 'cable'],
    storeUrl: 'https://kziems.aliexpress.com/store/1358152',
  },
  {
    sellerId: '4829026',
    brandName: 'CCA',
    searchKeywords: ['CCA', 'CCA earphone'],
    categories: ['iem', 'cable'],
    storeUrl: 'https://www.aliexpress.com/store/4829026',
  },
  {
    sellerId: '5141052',
    brandName: 'Simgot',
    searchKeywords: ['Simgot', 'SIMGOT'],
    categories: ['iem', 'cable'],
    storeUrl: 'https://simgot.aliexpress.com/store/5141052',
  },
  {
    sellerId: '911136067',
    brandName: 'Letshuoer',
    searchKeywords: ['Letshuoer', 'LETSHUOER', 'Shuoer'],
    categories: ['iem', 'dac', 'cable'],
    storeUrl: 'https://shuoer.aliexpress.com/store/911136067',
  },
  {
    sellerId: '1100869364',
    brandName: 'QKZ',
    searchKeywords: ['QKZ'],
    categories: ['iem'],
    storeUrl: 'https://qkzwholesalers.aliexpress.com/store/1100869364',
  },
  {
    sellerId: '1101260842',
    brandName: 'Kinera',
    searchKeywords: ['Kinera', 'KINERA'],
    categories: ['iem', 'cable'],
    storeUrl: 'https://kinera.aliexpress.com/store/1101260842',
  },
  {
    sellerId: '5380078',
    brandName: 'NiceHCK',
    searchKeywords: ['NiceHCK', 'NICEHCK'],
    categories: ['iem', 'cable'],
    storeUrl: 'https://nicehck.aliexpress.com/store/5380078',
  },
  {
    sellerId: '5017064',
    brandName: 'KBEAR',
    searchKeywords: ['KBEAR', 'TRI', 'Tripowin'],
    categories: ['iem', 'cable'],
    storeUrl: 'https://kbear.aliexpress.com/store/5017064',
  },
  {
    sellerId: '5001057',
    brandName: 'Dunu',
    searchKeywords: ['Dunu', 'DUNU'],
    categories: ['iem', 'cable'],
    storeUrl: 'https://dunu.aliexpress.com/store/5001057',
  },
  {
    sellerId: '1102017126',
    brandName: 'EPZ',
    searchKeywords: ['EPZ'],
    categories: ['iem', 'dac'],
    storeUrl: 'https://epzearphones.aliexpress.com/store/1102017126',
  },
  {
    sellerId: '5578037',
    brandName: 'Hidizs',
    searchKeywords: ['Hidizs', 'HIDIZS'],
    categories: ['iem', 'dac', 'dap'],
    storeUrl: 'https://hidizshidizsofficial.aliexpress.com/store/5578037',
  },

  // ---- Multi-Category (IEM + DAC + DAP) ----
  {
    sellerId: '1473108',
    brandName: 'FiiO',
    searchKeywords: ['FiiO', 'FIIO'],
    categories: ['iem', 'dac', 'amp', 'dap', 'cable'],
    storeUrl: 'https://fiio.aliexpress.com/store/1473108',
  },
  {
    sellerId: '4663118',
    brandName: 'HiBy',
    searchKeywords: ['HiBy', 'HIBY'],
    categories: ['dap', 'iem', 'dac'],
    storeUrl: 'https://hiby.aliexpress.com/store/4663118',
  },

  // ---- DAC/Amp Brands ----
  {
    sellerId: '1104038748',
    brandName: 'Topping',
    searchKeywords: ['Topping', 'TOPPING'],
    categories: ['dac', 'amp'],
    storeUrl: 'https://www.aliexpress.com/store/1104038748',
  },
  {
    sellerId: '3135026',
    brandName: 'SMSL',
    searchKeywords: ['SMSL'],
    categories: ['dac', 'amp'],
    storeUrl: 'https://smsl.aliexpress.com/store/3135026',
  },
  {
    sellerId: '1100171319',
    brandName: 'xDuoo',
    searchKeywords: ['xDuoo', 'XDUOO'],
    categories: ['dac', 'amp', 'dap'],
    storeUrl: 'https://xduoo.aliexpress.com/store/1100171319',
  },
  {
    sellerId: '910561376',
    brandName: 'Cayin',
    searchKeywords: ['Cayin', 'CAYIN'],
    categories: ['dac', 'amp', 'dap'],
    storeUrl: 'https://cayin.aliexpress.com/store/910561376',
  },
  {
    sellerId: '1102301349',
    brandName: 'iFi',
    searchKeywords: ['iFi', 'iFi Audio'],
    categories: ['dac', 'amp'],
    storeUrl: 'https://ifi-audio.aliexpress.com/store/1102301349',
  },

  // ---- Headphone Brands ----
  {
    sellerId: '1100064034',
    brandName: 'Hifiman',
    searchKeywords: ['Hifiman', 'HIFIMAN'],
    categories: ['headphone', 'iem'],
    storeUrl: 'https://hifiman.aliexpress.com/store/1100064034',
  },
  {
    sellerId: '4670091',
    brandName: 'Sivga',
    searchKeywords: ['Sivga', 'SIVGA'],
    categories: ['headphone'],
    storeUrl: 'https://sivga.aliexpress.com/store/4670091',
  },

  // ---- Authorized Reseller (carries multiple brands without own stores) ----
  // DD-Audio is the authorized AliExpress distributor for ThieAudio
  {
    sellerId: '2894006',
    brandName: 'DD-Audio',
    searchKeywords: ['ThieAudio', 'THIEAUDIO', '7Hz', '7HZ'],
    categories: ['iem', 'cable', 'dac'],
    storeUrl: 'https://ddaudio.aliexpress.com/store/2894006',
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Set of all curated seller IDs for fast membership check */
export const CURATED_SELLER_IDS = new Set(
  ALIEXPRESS_STORES.map(s => s.sellerId),
);

/** Map from seller ID to store config */
export const SELLER_ID_MAP = new Map(
  ALIEXPRESS_STORES.map(s => [s.sellerId, s]),
);

/** Map from brand name (lowercase) to store config */
export const BRAND_TO_STORE = new Map(
  ALIEXPRESS_STORES.map(s => [s.brandName.toLowerCase(), s]),
);
