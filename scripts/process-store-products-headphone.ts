/**
 * process-store-products-headphone.ts
 *
 * Category-specific store product processor: Headphone group (headphone, hp_pads, hp_cable).
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/process-store-products-headphone.ts [--dev]
 */

import { CATEGORY_GROUPS } from './config/store-collections.ts';
import { runProcessStoreProducts } from './lib/process-store-products-core.ts';

const DEV_MODE = process.argv.includes('--dev');

runProcessStoreProducts({
  categoryFilter: new Set(CATEGORY_GROUPS.headphone),
  devMode: DEV_MODE,
  label: 'Headphone Group',
}).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
