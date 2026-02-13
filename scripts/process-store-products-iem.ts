/**
 * process-store-products-iem.ts
 *
 * Category-specific store product processor: IEM group (iem, iem_tips, iem_cable, iem_filter).
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/process-store-products-iem.ts [--dev]
 */

import "./lib/env.js";
import { CATEGORY_GROUPS } from './config/store-collections.ts';
import { runProcessStoreProducts } from './lib/process-store-products-core.ts';

const DEV_MODE = process.argv.includes('--dev');

runProcessStoreProducts({
  categoryFilter: new Set(CATEGORY_GROUPS.iem),
  devMode: DEV_MODE,
  label: 'IEM Group',
}).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
