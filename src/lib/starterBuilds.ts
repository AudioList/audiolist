import type { CategoryId } from '../types';

export interface StarterBuild {
  id: string;
  name: string;
  tier: '$50' | '$150' | '$500' | '$1000';
  budget: number;
  description: string;
  useCase: string;
  items: {
    categoryId: CategoryId;
    productId: string;
    productName: string;
    reason: string;
  }[];
}

export const STARTER_BUILDS: StarterBuild[] = [
  {
    id: 'budget-iem-portable',
    name: 'Budget Portable Setup',
    tier: '$50',
    budget: 30,
    description: 'Incredible sound straight from your phone -- no extra gear needed.',
    useCase: 'Portable / On-the-go',
    items: [
      {
        categoryId: 'iem',
        productId: 'a64fd45a-de82-4d69-b01b-7e6794ba5d4a',
        productName: 'Moondrop Space Travel Reference',
        reason: 'Outstanding tuning for the price. Neutral, clean, and easy to drive from any source.',
      },
    ],
  },
  {
    id: 'budget-iem-detail',
    name: 'Detail-Focused Portable',
    tier: '$150',
    budget: 115,
    description: 'A step up in detail and refinement, still fully portable.',
    useCase: 'Portable / Commute',
    items: [
      {
        categoryId: 'iem',
        productId: '8b69b261-f645-41c3-ab29-925f2aae76bc',
        productName: 'Truthear Hexa',
        reason: 'Exceptional PPI score. Neutral, detailed sound that punches way above its weight.',
      },
      {
        categoryId: 'dac',
        productId: '756dda80-da8f-4ad3-af67-be3daa39b6a8',
        productName: 'FiiO KA11',
        reason: 'Dongle DAC/Amp with 110 dB SINAD -- massive upgrade over phone audio.',
      },
    ],
  },
  {
    id: 'desktop-starter',
    name: 'Desktop Starter',
    tier: '$500',
    budget: 370,
    description: 'Your first proper desktop headphone setup with a clean all-in-one DAC/Amp.',
    useCase: 'Desk / Home office',
    items: [
      {
        categoryId: 'headphone',
        productId: 'f4bd9f1c-037d-4eff-84e0-786233bce959',
        productName: 'HiFiMAN Sundara',
        reason: 'The gateway planar magnetic headphone. Open, detailed, and fast.',
      },
      {
        categoryId: 'dac',
        productId: 'fec05753-c056-4555-9019-56634f0bfea1',
        productName: 'Topping DX3 Pro+',
        reason: 'Desktop DAC/Amp combo with Bluetooth -- one device handles both conversion and amplification.',
      },
    ],
  },
  {
    id: 'desktop-reference',
    name: 'Desktop Reference',
    tier: '$1000',
    budget: 950,
    description: 'A legendary headphone paired with a capable DAC/Amp stack.',
    useCase: 'Critical listening / Home',
    items: [
      {
        categoryId: 'headphone',
        productId: '2e76eb85-e87a-4660-9c58-031a2e6f2c13',
        productName: 'Sennheiser HD650/HD6XX',
        reason: 'An enduring classic loved by audiophiles for its natural, musical presentation.',
      },
      {
        categoryId: 'dac',
        productId: 'a955610b-5ce3-4808-85c8-15dbdc1b29be',
        productName: 'Schiit Modius',
        reason: 'Balanced DAC with excellent performance and build quality.',
      },
      {
        categoryId: 'amp',
        productId: '60f14da2-386c-4fd7-991b-b22156e4b7c9',
        productName: 'Topping L30 II',
        reason: 'Ultra-clean amplification with more than enough power for the HD650.',
      },
    ],
  },
  {
    id: 'value-iem-bundle',
    name: 'Value Champion',
    tier: '$50',
    budget: 21,
    description: 'Maximum performance per dollar -- a single IEM that rivals products costing five times more.',
    useCase: 'Budget / First setup',
    items: [
      {
        categoryId: 'iem',
        productId: '3204cdf8-8b3d-47f1-a439-6c16b584aea5',
        productName: 'KZ D-FI UDDD',
        reason: 'Tunable switches let you customize sound. Top-tier PPI at an unreal price.',
      },
    ],
  },
  {
    id: 'all-in-one-desktop',
    name: 'All-in-One Desktop',
    tier: '$500',
    budget: 500,
    description: 'A single-box DAC/Amp combo paired with excellent headphones for a clean, minimal desk setup.',
    useCase: 'Desk / Minimalist',
    items: [
      {
        categoryId: 'headphone',
        productId: 'f4bd9f1c-037d-4eff-84e0-786233bce959',
        productName: 'HiFiMAN Sundara',
        reason: 'Excellent planar magnetic headphone with fast, detailed sound.',
      },
      {
        categoryId: 'dac',
        productId: 'fec05753-c056-4555-9019-56634f0bfea1',
        productName: 'Topping DX3 Pro+',
        reason: 'DAC/Amp combo with Bluetooth -- one device does everything.',
      },
    ],
  },
];
