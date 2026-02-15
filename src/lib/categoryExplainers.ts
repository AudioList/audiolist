import type { CategoryId } from '../types';

export interface CategoryExplainer {
  shortBlurb: string;
  whyYouNeed: string;
}

export const CATEGORY_EXPLAINERS: Record<CategoryId, CategoryExplainer> = {
  iem: {
    shortBlurb: 'Small earbuds that fit inside your ear canal for detailed, isolated sound.',
    whyYouNeed: 'Great for portable listening with excellent noise isolation.',
  },
  iem_tips: {
    shortBlurb: 'Silicone or foam tips that seal your IEMs in your ear.',
    whyYouNeed: 'Better tips improve comfort and sound quality.',
  },
  iem_cable: {
    shortBlurb: 'Replacement cables for detachable IEMs.',
    whyYouNeed: 'Upgrade for better durability or a different connector.',
  },
  iem_filter: {
    shortBlurb: 'Tuning filters and sound modules that change your IEM\'s tone.',
    whyYouNeed: 'Fine-tune the bass, mids, or treble to your preference.',
  },
  headphone: {
    shortBlurb: 'Over-ear or on-ear headphones for immersive listening.',
    whyYouNeed: 'The foundation of any desktop audio setup.',
  },
  hp_pads: {
    shortBlurb: 'Replacement earpads that affect comfort and sound.',
    whyYouNeed: 'Fresh pads restore comfort and can subtly change the sound.',
  },
  hp_cable: {
    shortBlurb: 'Replacement cables for detachable headphones.',
    whyYouNeed: 'Upgrade to a longer cable or a different connector type.',
  },
  hp_accessory: {
    shortBlurb: 'Stands, cases, adapters, and other headphone accessories.',
    whyYouNeed: 'Finish your setup with storage, comfort upgrades, and compatibility pieces.',
  },
  dac: {
    shortBlurb: 'Converts the digital music on your phone or computer into analog sound.',
    whyYouNeed: 'Improves audio quality over your device\'s built-in output.',
  },
  amp: {
    shortBlurb: 'Amplifies the audio signal to properly drive your headphones.',
    whyYouNeed: 'Needed for harder-to-drive headphones; adds power and control.',
  },
  speaker: {
    shortBlurb: 'Bookshelf, floor-standing, or powered speakers for room listening.',
    whyYouNeed: 'For filling a room with sound instead of personal listening.',
  },
  cable: {
    shortBlurb: 'Audio cables, adapters, and interconnects.',
    whyYouNeed: 'Connect your components together with the right cables.',
  },
  dap: {
    shortBlurb: 'A portable device dedicated to playing high-quality music files.',
    whyYouNeed: 'Better audio quality and storage compared to a phone.',
  },
  microphone: {
    shortBlurb: 'Recording and streaming microphones for voice capture.',
    whyYouNeed: 'For podcasting, streaming, calls, or music recording.',
  },
  mic_accessory: {
    shortBlurb: 'Preamps, boom arms, adapters, and other microphone accessories.',
    whyYouNeed: 'Enhance your mic setup with better mounting, signal processing, or connectivity.',
  },
};
