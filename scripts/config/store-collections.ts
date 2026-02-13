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
  | 'iem_tips' | 'iem_cable' | 'iem_filter' | 'hp_pads' | 'hp_cable' | 'mic_accessory';

export interface CollectionMapping {
  handle: string;
  categoryId: CategoryId;
}

export interface StoreConfig {
  retailerId: string;
  collections: CollectionMapping[];
  /** Collection handles for sale/deals/clearance pages. Products in these
   *  collections get their on_sale flag set during sync. */
  dealCollections?: string[];
}

/** Category groups for split pipeline execution */
export const CATEGORY_GROUPS: Record<string, CategoryId[]> = {
  iem: ['iem', 'iem_tips', 'iem_cable', 'iem_filter'],
  headphone: ['headphone', 'hp_pads', 'hp_cable'],
  microphone: ['microphone', 'mic_accessory'],
};

export const STORE_COLLECTIONS: Record<string, StoreConfig> = {
  'bloomaudio.com': {
    retailerId: 'bloomaudio',
    collections: [
      { handle: 'earphones', categoryId: 'iem' },
      { handle: 'headphones', categoryId: 'headphone' },
      { handle: 'dacs', categoryId: 'dac' },
      { handle: 'desktop-amps', categoryId: 'amp' },
      { handle: 'speaker-amps', categoryId: 'amp' },
      { handle: 'daps', categoryId: 'dap' },
      { handle: 'cables', categoryId: 'cable' },
      { handle: 'bookshelf-speakers', categoryId: 'speaker' },
      { handle: 'eartips', categoryId: 'iem_tips' },
      { handle: 'pads', categoryId: 'hp_pads' },
      { handle: 'headphone-cables', categoryId: 'hp_cable' },
    ],
    dealCollections: ['open-box-deals', 'on-sale'],
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
    dealCollections: ['apos-audio-deals-section', 'apos-certified'],
  },
  'www.headphones.com': {
    retailerId: 'headphones',
    collections: [
      { handle: 'in-ear-headphones', categoryId: 'iem' },
      { handle: 'headphones', categoryId: 'headphone' },
      { handle: 'dacs', categoryId: 'dac' },
      { handle: 'amplifiers', categoryId: 'amp' },
      { handle: 'headphone-amplifiers', categoryId: 'amp' },
      { handle: 'speaker-amplifiers', categoryId: 'amp' },
      { handle: 'cables', categoryId: 'cable' },
      { handle: 'ear-pads-tips-1', categoryId: 'hp_pads' },
      { handle: 'headphone-cables', categoryId: 'hp_cable' },
      { handle: 'digital-audio-players', categoryId: 'dap' },
      { handle: 'bookshelf-speakers', categoryId: 'speaker' },
      { handle: 'speakers', categoryId: 'speaker' },
    ],
    dealCollections: ['sale'],
  },
  'hifigo.com': {
    retailerId: 'hifigo',
    collections: [
      { handle: 'in-ear', categoryId: 'iem' },
      { handle: 'headphone', categoryId: 'headphone' },
      { handle: 'desktop-dacs', categoryId: 'dac' },
      { handle: 'desktop-pre-amp-amplifier', categoryId: 'amp' },
      { handle: 'power-amplifier', categoryId: 'amp' },
      { handle: 'audio-player', categoryId: 'dap' },
      { handle: 'audio-cable', categoryId: 'cable' },
      { handle: 'lineout-cable', categoryId: 'cable' },
      { handle: 'eartips', categoryId: 'iem_tips' },
      { handle: 'headphone-cable', categoryId: 'hp_cable' },
      { handle: 'earpads', categoryId: 'hp_pads' },
    ],
    dealCollections: ['sales'],
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
      { handle: 'tws-in-ear-monitors', categoryId: 'iem' },
      { handle: 'headphones', categoryId: 'headphone' },
      { handle: 'amp-dacs', categoryId: 'dac' },
      { handle: 'portable-dac-amps', categoryId: 'dac' },
      { handle: 'desktop-dac-amps', categoryId: 'dac' },
      { handle: 'digital-audio-players', categoryId: 'dap' },
      { handle: 'audio-cables', categoryId: 'cable' },
      { handle: 'cable-adapters', categoryId: 'cable' },
      { handle: 'eartips', categoryId: 'iem_tips' },
      { handle: 'earpads', categoryId: 'hp_pads' },
    ],
    dealCollections: ['sale'],
  },
  'shenzhenaudio.com': {
    retailerId: 'shenzhenaudio',
    collections: [
      { handle: 'in-ear-headphone', categoryId: 'iem' },
      { handle: 'over-ear-headphones', categoryId: 'headphone' },
      { handle: 'dac', categoryId: 'dac' },
      { handle: 'portable-dac', categoryId: 'dac' },
      { handle: 'desktop-dac', categoryId: 'dac' },
      { handle: 'headphone-amplifiers', categoryId: 'amp' },
      { handle: 'speaker-amplifier', categoryId: 'amp' },
      { handle: 'zy-cable', categoryId: 'cable' },
    ],
  },
  'www.headamp.com': {
    retailerId: 'headamp',
    collections: [
      { handle: 'in-ear-monitors', categoryId: 'iem' },
      { handle: 'headphones', categoryId: 'headphone' },
      { handle: 'dacs', categoryId: 'dac' },
      { handle: 'amplifiers', categoryId: 'amp' },
      { handle: 'speaker-amplifiers', categoryId: 'amp' },
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
      { handle: 'portable-amplifier', categoryId: 'amp' },
      { handle: 'tube-amplifier', categoryId: 'amp' },
      { handle: 'solid-state-amplifier', categoryId: 'amp' },
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
      { handle: 'svs-tower-speakers', categoryId: 'speaker' },
      { handle: 'sealed-subwoofers', categoryId: 'speaker' },
      { handle: 'ported-subwoofers', categoryId: 'speaker' },
    ],
    dealCollections: ['speaker-outlet', 'subwoofer-outlet'],
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
      { handle: 'subwoofers', categoryId: 'speaker' },
      { handle: 'amps', categoryId: 'amp' },
      { handle: 'dacs', categoryId: 'dac' },
    ],
    dealCollections: ['last-chance'],
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
      { handle: 'power-amplifiers', categoryId: 'amp' },
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
      { handle: 'energy-amplifier-collection', categoryId: 'amp' },
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
  'www.64audio.com': {
    retailerId: '64audio',
    collections: [
      { handle: 'all-iems', categoryId: 'iem' },
      { handle: 'cables-and-adaptors', categoryId: 'iem_cable' },
      { handle: 'eartips', categoryId: 'iem_tips' },
    ],
  },
  'www.campfireaudio.com': {
    retailerId: 'campfireaudio',
    collections: [
      { handle: 'earphones-2', categoryId: 'iem' },
      { handle: 'cables', categoryId: 'iem_cable' },
      { handle: 'dac', categoryId: 'dac' },
    ],
  },
  'www.audeze.com': {
    retailerId: 'audeze',
    collections: [
      { handle: 'all-headphone-skus', categoryId: 'headphone' },
      { handle: 'in-ear', categoryId: 'iem' },
    ],
  },
  'dekoniaudio.com': {
    retailerId: 'dekoniaudio',
    collections: [
      { handle: 'earpads', categoryId: 'hp_pads' },
      { handle: 'bulletz-in-ear-headphone-tips', categoryId: 'iem_tips' },
      { handle: 'complete-cable', categoryId: 'hp_cable' },
      { handle: 'headphones', categoryId: 'headphone' },
    ],
  },
  'www.tonormic.com': {
    retailerId: 'tonor',
    collections: [
      { handle: 'microphones', categoryId: 'microphone' },
      { handle: 'accessories', categoryId: 'mic_accessory' },
    ],
  },
  'fifinemicrophone.com': {
    retailerId: 'fifine',
    collections: [
      { handle: 'microphones', categoryId: 'microphone' },
      { handle: 'microphone-boom-arm-stands', categoryId: 'mic_accessory' },
    ],
  },
  'www.maono.com': {
    retailerId: 'maono',
    collections: [
      { handle: 'microphones', categoryId: 'microphone' },
      { handle: 'mic-accessories', categoryId: 'mic_accessory' },
      { handle: 'mic-stand', categoryId: 'mic_accessory' },
      { handle: 'microphone-pop-filter-and-foam-windscreen', categoryId: 'mic_accessory' },
      { handle: 'headphones', categoryId: 'headphone' },
    ],
  },
  // --- Multi-brand pro audio retailer ---
  'www.performanceaudio.com': {
    retailerId: 'performance-audio',
    collections: [
      // Recording microphones (by transducer / diaphragm type)
      { handle: 'studio-microphones', categoryId: 'microphone' },
      { handle: 'condenser-microphones', categoryId: 'microphone' },
      { handle: 'large-diaphragm-condenser', categoryId: 'microphone' },
      { handle: 'small-diaphragm-condenser', categoryId: 'microphone' },
      { handle: 'dynamic-microphones', categoryId: 'microphone' },
      { handle: 'tube-microphones', categoryId: 'microphone' },
      { handle: 'ribbon-microphones', categoryId: 'microphone' },
      { handle: 'usb-microphones', categoryId: 'microphone' },
      // Live sound microphones (by use-case / form-factor)
      { handle: 'handheld-microphones', categoryId: 'microphone' },
      { handle: 'instrument-microphones', categoryId: 'microphone' },
      { handle: 'lavalier-lapel-microphones', categoryId: 'microphone' },
      { handle: 'headworn-microphones-headsets', categoryId: 'microphone' },
      { handle: 'shotgun-video-microphones', categoryId: 'microphone' },
      { handle: 'mobile-microphones', categoryId: 'microphone' },
      { handle: 'gooseneck-podium-microphones', categoryId: 'microphone' },
      { handle: 'boundary-tabletop-microphones', categoryId: 'microphone' },
      { handle: 'hanging-microphones', categoryId: 'microphone' },
      // Microphone accessories
      { handle: 'shock-mounts-suspension', categoryId: 'mic_accessory' },
      { handle: 'windscreens-grilles', categoryId: 'mic_accessory' },
      { handle: 'pop-filters-pop-screens', categoryId: 'mic_accessory' },
      { handle: 'microphone-clips-clamps', categoryId: 'mic_accessory' },
      { handle: 'microphone-cases-gig-bags', categoryId: 'mic_accessory' },
      { handle: 'goosenecks', categoryId: 'mic_accessory' },
      { handle: 'thread-adapters-fittings', categoryId: 'mic_accessory' },
      { handle: 'phantom-power-supplies', categoryId: 'mic_accessory' },
      { handle: 'direct-boxes', categoryId: 'mic_accessory' },
      { handle: 'microphone-preamps', categoryId: 'mic_accessory' },
      { handle: 'studio-mic-arms-accessories', categoryId: 'mic_accessory' },
      // Mic stands (accessory)
      { handle: 'microphone-boom-stands', categoryId: 'mic_accessory' },
      { handle: 'straight-stands', categoryId: 'mic_accessory' },
      { handle: 'desktop-microphone-stands', categoryId: 'mic_accessory' },
      { handle: 'boom-arms', categoryId: 'mic_accessory' },
      // Studio monitors & speakers
      { handle: 'studio-monitors', categoryId: 'speaker' },
      { handle: 'studio-monitor-stands', categoryId: 'speaker' },
      // Headphones
      { handle: 'professional-headphones', categoryId: 'headphone' },
      // Earphones / IEMs
      { handle: 'earphones', categoryId: 'iem' },
      // Headphone amplifiers
      { handle: 'headphone-amplifiers', categoryId: 'amp' },
      // DAC / Audio interfaces
      { handle: 'audio-interfaces', categoryId: 'dac' },
      // Cables
      { handle: 'xlr-to-xlr-cables', categoryId: 'cable' },
      { handle: '1-4-trs-to-1-4-trs-cables', categoryId: 'cable' },
      { handle: 'speaker-cables', categoryId: 'cable' },
      { handle: 'custom-xlr-to-xlr-cables', categoryId: 'cable' },
      { handle: 'custom-speaker-cables', categoryId: 'cable' },
      // Headphone cables
      { handle: 'custom-headphone-cables', categoryId: 'hp_cable' },
      // Additional speakers (powered subs)
      { handle: 'powered-subwoofers', categoryId: 'speaker' },
    ],
  },
  // --- Brand-direct microphone stores ---
  'shop.lewitt-audio.com': {
    retailerId: 'lewitt',
    collections: [
      { handle: 'microphones', categoryId: 'microphone' },
    ],
  },
  'www.sontronics.com': {
    retailerId: 'sontronics',
    collections: [
      { handle: 'all-products', categoryId: 'microphone' },
      { handle: 'accessories-1', categoryId: 'mic_accessory' },
    ],
  },
  'www.syncoaudio.com': {
    retailerId: 'synco',
    collections: [
      { handle: 'products', categoryId: 'microphone' },
    ],
  },
  'www.cloudmicrophones.com': {
    retailerId: 'cloud-microphones',
    collections: [
      { handle: 'microphones', categoryId: 'microphone' },
      { handle: 'cloudlifters', categoryId: 'mic_accessory' },
    ],
  },
};
