/**
 * retailer-coupons.ts
 *
 * Curated list of verified retailer coupon/discount codes.
 * These are manually maintained and periodically validated.
 *
 * Sources:
 *   - Retailer newsletters / welcome emails
 *   - Reviewer affiliate codes (publicly shared)
 *   - Official retailer social media / promotional pages
 *
 * Adding a new coupon:
 *   1. Verify the code works (test at checkout or via Shopify lookup endpoint)
 *   2. Add entry with appropriate discount_type and discount_value
 *   3. For Shopify stores, add auto_apply_url using format:
 *      https://{domain}/discount/{CODE}
 *   4. Run: npm run seed:coupons
 */

export interface CouponSeed {
  retailer_id: string;
  code: string;
  description: string;
  discount_type: 'percentage' | 'fixed' | 'free_shipping';
  discount_value: number | null;
  min_purchase: number | null;
  auto_apply_url: string | null;
  source: string;
}

export const COUPON_SEEDS: CouponSeed[] = [
  // ---------------------------------------------------------------------------
  // Linsoul
  // ---------------------------------------------------------------------------
  {
    retailer_id: 'linsoul',
    code: 'LINSOULWELCOME',
    description: '$5 off first order',
    discount_type: 'fixed',
    discount_value: 5,
    min_purchase: null,
    auto_apply_url: 'https://www.linsoul.com/discount/LINSOULWELCOME',
    source: 'newsletter',
  },

  // ---------------------------------------------------------------------------
  // HiFiGo
  // ---------------------------------------------------------------------------
  {
    retailer_id: 'hifigo',
    code: 'HIFIGO5',
    description: '5% off sitewide',
    discount_type: 'percentage',
    discount_value: 5,
    min_purchase: null,
    auto_apply_url: 'https://hifigo.com/discount/HIFIGO5',
    source: 'manual',
  },

  // ---------------------------------------------------------------------------
  // Apos Audio
  // ---------------------------------------------------------------------------
  {
    retailer_id: 'aposaudio',
    code: 'APOS5',
    description: '5% off sitewide',
    discount_type: 'percentage',
    discount_value: 5,
    min_purchase: null,
    auto_apply_url: 'https://apos.audio/discount/APOS5',
    source: 'manual',
  },

  // ---------------------------------------------------------------------------
  // Bloom Audio -- codes rotate, these are common patterns
  // ---------------------------------------------------------------------------
  {
    retailer_id: 'bloomaudio',
    code: 'BLOOM5',
    description: '5% off sitewide',
    discount_type: 'percentage',
    discount_value: 5,
    min_purchase: null,
    auto_apply_url: 'https://bloomaudio.com/discount/BLOOM5',
    source: 'manual',
  },
];
