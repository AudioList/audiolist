/**
 * process-store-products-microphone.ts
 *
 * Category-specific store product processor: Microphone group (microphone).
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/process-store-products-microphone.ts [--dev]
 */

import { CATEGORY_GROUPS } from './config/store-collections.ts';
import { runProcessStoreProducts } from './lib/process-store-products-core.ts';

const DEV_MODE = process.argv.includes('--dev');

runProcessStoreProducts({
  categoryFilter: new Set(CATEGORY_GROUPS.microphone),
  devMode: DEV_MODE,
  label: 'Microphone Group',
}).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
