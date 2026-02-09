/**
 * seed-coupons.ts
 *
 * Upserts curated coupon codes from retailer-coupons.ts into the
 * retailer_coupons table. Safe to run multiple times (idempotent).
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/seed-coupons.ts
 */

import { getSupabase } from './config/retailers.ts';
import { COUPON_SEEDS } from './config/retailer-coupons.ts';

async function main() {
  const supabase = getSupabase();

  console.log(`Seeding ${COUPON_SEEDS.length} coupon codes...`);

  const rows = COUPON_SEEDS.map((c) => ({
    retailer_id: c.retailer_id,
    code: c.code,
    description: c.description,
    discount_type: c.discount_type,
    discount_value: c.discount_value,
    min_purchase: c.min_purchase,
    auto_apply_url: c.auto_apply_url,
    source: c.source,
    is_active: true,
    verified_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('retailer_coupons')
    .upsert(rows, { onConflict: 'retailer_id,code' });

  if (error) {
    console.error(`Failed to seed coupons: ${error.message}`);
    process.exit(1);
  }

  console.log(`Successfully seeded ${rows.length} coupon codes.`);

  // List what's in the table now
  const { data, error: listError } = await supabase
    .from('retailer_coupons')
    .select('retailer_id, code, description, discount_type, discount_value, is_active')
    .order('retailer_id');

  if (listError) {
    console.error(`Failed to list coupons: ${listError.message}`);
  } else {
    console.log(`\nAll coupons in database (${data?.length ?? 0}):`);
    for (const c of data ?? []) {
      const value = c.discount_type === 'percentage'
        ? `${c.discount_value}% off`
        : c.discount_type === 'fixed'
          ? `$${c.discount_value} off`
          : 'free shipping';
      console.log(`  ${c.retailer_id}: ${c.code} (${value}) ${c.is_active ? '' : '[INACTIVE]'}`);
    }
  }
}

main().catch(console.error);
