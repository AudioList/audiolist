/**
 * store-collections.ts
 *
 * Static mapping of Shopify store domains → collection handles → AudioList categories.
 * Used by sync-stores.ts to fetch pre-categorized products from each store's
 * collection endpoints instead of pulling entire catalogs.
 *
 * To add a new store: add an entry with the domain, retailer ID, and collection mappings.
 * To add a new category to a store: add a { handle, categoryId } entry.
 */

export type CategoryId =
  | 'iem' | 'headphone' | 'dac' | 'amp' | 'speaker' | 'cable' | 'dap' | 'microphone'
  | 'iem_tips' | 'iem_cable' | 'iem_filter' | 'hp_pads' | 'hp_cable';

export interface CollectionMapping {
  handle: string;
  categoryId: CategoryId;
}

export interface StoreConfig {
  retailerId: string;
  collections: CollectionMapping[];
}

/** Category groups for split pipeline execution */
export const CATEGORY_GROUPS: Record<string, CategoryId[]> = {
  iem: ['iem', 'iem_tips', 'iem_cable', 'iem_filter'],
  headphone: ['headphone', 'hp_pads', 'hp_cable'],
};

export const STORE_COLLECTIONS: Record<string, StoreConfig> = {
  'bloomaudio.com': {
    retailerId: 'bloomaudio',
    collections: [
      { handle: 'earphones', categoryId: 'iem' },
      { handle: 'headphones', categoryId: 'headphone' },
      { handle: 'dacs', categoryId: 'dac' },
      { handle: 'desktop-amps', categoryId: 'amp' },
      { handle: 'daps', categoryId: 'dap' },
      { handle: 'cables', categoryId: 'cable' },
      { handle: 'bookshelf-speakers', categoryId: 'speaker' },
      { handle: 'eartips', categoryId: 'iem_tips' },
      { handle: 'pads', categoryId: 'hp_pads' },
      { handle: 'headphone-cables', categoryId: 'hp_cable' },
    ],
  },
  'apos.audio': {
    retailerId: 'aposaudio',
    collections: [
      { handle: 'in-ear-monitors-iem-earbuds-earphones', categoryId: 'iem' },
      { handle: 'headphones', categoryId: 'headphone' },
      { handle: 'dac-digital-to-analog-converter', categoryId: 'dac' },
      { handle: 'dac-amps', categoryId: 'dac' },
      { handle: 'headphone-amps-preamps', categoryId: 'amp' },
      { handle: 'speaker-amplifiers', categoryId: 'amp' },
      { handle: 'dap-digital-audio-players', categoryId: 'dap' },
      { handle: 'cables-for-in-ear-monitors-iem-earbuds-earphones', categoryId: 'cable' },
      { handle: 'speakers', categoryId: 'speaker' },
    ],
  },
  'www.headphones.com': {
    retailerId: 'headphones',
    collections: [
      { handle: 'in-ear-headphones', categoryId: 'iem' },
      { handle: 'headphones', categoryId: 'headphone' },
      { handle: 'dacs', categoryId: 'dac' },
      { handle: 'amplifiers', categoryId: 'amp' },
      { handle: 'headphone-amplifiers', categoryId: 'amp' },
      { handle: 'cables', categoryId: 'cable' },
      { handle: 'ear-pads-tips-1', categoryId: 'hp_pads' },
      { handle: 'headphone-cables', categoryId: 'hp_cable' },
      { handle: 'digital-audio-players', categoryId: 'dap' },
      { handle: 'bookshelf-speakers', categoryId: 'speaker' },
      { handle: 'speakers', categoryId: 'speaker' },
    ],
  },
  'hifigo.com': {
    retailerId: 'hifigo',
    collections: [
      { handle: 'in-ear', categoryId: 'iem' },
      { handle: 'headphone', categoryId: 'headphone' },
      { handle: 'desktop-dacs', categoryId: 'dac' },
      { handle: 'desktop-pre-amp-amplifier', categoryId: 'amp' },
      { handle: 'audio-player', categoryId: 'dap' },
      { handle: 'audio-cable', categoryId: 'cable' },
      { handle: 'eartips', categoryId: 'iem_tips' },
      { handle: 'headphone-cable', categoryId: 'hp_cable' },
      { handle: 'earpads', categoryId: 'hp_pads' },
    ],
  },
  'www.moon-audio.com': {
    retailerId: 'moonaudio',
    collections: [
      { handle: 'headphones-in-ear-monitors', categoryId: 'iem' },
      { handle: 'headphones-full-size', categoryId: 'headphone' },
      { handle: 'audio-gear-dacs-or-digital-audio-converters', categoryId: 'dac' },
      { handle: 'headphone-amplifiers-dacs-amplifiers', categoryId: 'amp' },
      { handle: 'audio-gear-music-players-or-dap', categoryId: 'dap' },
      { handle: 'dragon-audio-cables-headphones', categoryId: 'cable' },
      { handle: 'dragon-audio-cables-iem-earphone', categoryId: 'iem_cable' },
      { handle: 'headphone-amplifiers-dacs-speakers-house', categoryId: 'speaker' },
    ],
  },
  'www.linsoul.com': {
    retailerId: 'linsoul',
    collections: [
      { handle: 'in-ear-monitors', categoryId: 'iem' },
      { handle: 'headphones', categoryId: 'headphone' },
      { handle: 'amp-dacs', categoryId: 'dac' },
      { handle: 'digital-audio-players', categoryId: 'dap' },
      { handle: 'audio-cables', categoryId: 'cable' },
      { handle: 'eartips', categoryId: 'iem_tips' },
      { handle: 'earpads', categoryId: 'hp_pads' },
    ],
  },
  'shenzhenaudio.com': {
    retailerId: 'shenzhenaudio',
    collections: [
      { handle: 'in-ear-headphone', categoryId: 'iem' },
      { handle: 'over-ear-headphones', categoryId: 'headphone' },
      { handle: 'dac', categoryId: 'dac' },
      { handle: 'headphone-amplifiers', categoryId: 'amp' },
      { handle: 'speaker-amplifier', categoryId: 'amp' },
      { handle: 'audio-players', categoryId: 'dap' },
    ],
  },
  'www.headamp.com': {
    retailerId: 'headamp',
    collections: [
      { handle: 'in-ear-monitors', categoryId: 'iem' },
      { handle: 'headphones', categoryId: 'headphone' },
      { handle: 'dacs', categoryId: 'dac' },
      { handle: 'amplifiers', categoryId: 'amp' },
      { handle: 'cables', categoryId: 'cable' },
      { handle: 'ear-pads-headbands', categoryId: 'hp_pads' },
      { handle: 'headphone-cables', categoryId: 'hp_cable' },
      { handle: 'audio-players', categoryId: 'dap' },
    ],
  },
  'shop.musicteck.com': {
    retailerId: 'musicteck',
    collections: [
      { handle: '03-earphone', categoryId: 'iem' },
      { handle: '02-headphone', categoryId: 'headphone' },
      { handle: 'amplifier', categoryId: 'amp' },
      { handle: 'audio-player', categoryId: 'dap' },
      { handle: '06-cable', categoryId: 'cable' },
      { handle: '05-speaker', categoryId: 'speaker' },
    ],
  },
  'www.svsound.com': {
    retailerId: 'svsound',
    collections: [
      { handle: 'svs-bookshelf-speakers', categoryId: 'speaker' },
      { handle: 'svs-center-channel-speakers', categoryId: 'speaker' },
      { handle: 'sealed-subwoofers', categoryId: 'speaker' },
      { handle: 'ported-subwoofers', categoryId: 'speaker' },
    ],
  },
  'us.kef.com': {
    retailerId: 'kef',
    collections: [
      { handle: 'bookshelf-speakers', categoryId: 'speaker' },
      { handle: 'floorstanding-speakers', categoryId: 'speaker' },
      { handle: 'centre-channel-speakers', categoryId: 'speaker' },
      { handle: 'subwoofers', categoryId: 'speaker' },
      { handle: 'headphones', categoryId: 'headphone' },
    ],
  },
  'www.emotiva.com': {
    retailerId: 'emotiva',
    collections: [
      { handle: 'loudspeakers', categoryId: 'speaker' },
      { handle: 'amps', categoryId: 'amp' },
      { handle: 'dacs', categoryId: 'dac' },
    ],
  },
  'www.peachtreeaudio.com': {
    retailerId: 'peachtreeaudio',
    collections: [
      { handle: 'speakers', categoryId: 'speaker' },
      { handle: 'integrated-amplifiers', categoryId: 'amp' },
      { handle: 'preamps-and-power-amps', categoryId: 'amp' },
    ],
  },
  'www.psaudio.com': {
    retailerId: 'psaudio',
    collections: [
      { handle: 'loudspeakers', categoryId: 'speaker' },
      { handle: 'amplifiers', categoryId: 'amp' },
      { handle: 'dacs-and-sources', categoryId: 'dac' },
    ],
  },
  'www.rel.net': {
    retailerId: 'rel',
    collections: [
      { handle: 'powered-subwoofers', categoryId: 'speaker' },
    ],
  },
  'www.aperionaudio.com': {
    retailerId: 'aperionaudio',
    collections: [
      { handle: 'bookshelf-speakers', categoryId: 'speaker' },
      { handle: 'center-channel-speakers', categoryId: 'speaker' },
      { handle: 'tower-speakers', categoryId: 'speaker' },
      { handle: 'bravus-subwoofers', categoryId: 'speaker' },
      { handle: 'surround-speakers', categoryId: 'speaker' },
    ],
  },
  'www.qacoustics.com': {
    retailerId: 'qacoustics',
    collections: [
      { handle: 'bookshelf-speakers', categoryId: 'speaker' },
      { handle: 'floorstanding-speakers', categoryId: 'speaker' },
      { handle: 'sunwoofers', categoryId: 'speaker' },
      { handle: 'centered', categoryId: 'speaker' },
    ],
  },
  'www.buchardt-audio.com': {
    retailerId: 'buchardtaudio',
    collections: [
      { handle: 'active-speakers', categoryId: 'speaker' },
      { handle: 'passive-speakers', categoryId: 'speaker' },
    ],
  },
  'www.wharfedaleusa.com': {
    retailerId: 'wharfedale',
    collections: [
      { handle: 'bookshelf-speakers', categoryId: 'speaker' },
      { handle: 'floostanding', categoryId: 'speaker' },
      { handle: 'center-channel', categoryId: 'speaker' },
      { handle: 'subwoofer', categoryId: 'speaker' },
    ],
  },
  'www.jamo.com': {
    retailerId: 'jamo',
    collections: [
      { handle: 'hi-fi-speakers', categoryId: 'speaker' },
      { handle: 'home-theatre', categoryId: 'speaker' },
      { handle: 'subwoofers', categoryId: 'speaker' },
    ],
  },
  'www.trianglehifi.com': {
    retailerId: 'trianglehifi',
    collections: [
      { handle: 'enceinte-bibliotheque', categoryId: 'speaker' },
      { handle: 'enceintes-colonnes', categoryId: 'speaker' },
      { handle: 'enceintes-actives', categoryId: 'speaker' },
      { handle: 'voie-centrale', categoryId: 'speaker' },
      { handle: 'caisson-de-grave', categoryId: 'speaker' },
    ],
  },
};
