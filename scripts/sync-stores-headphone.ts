/**
 * sync-stores-headphone.ts
 *
 * Category-specific store sync: Headphone group (headphone, hp_pads, hp_cable).
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/sync-stores-headphone.ts [--dev]
 */

import { CATEGORY_GROUPS } from './config/store-collections.ts';
import { runSyncStores } from './lib/sync-stores-core.ts';

const DEV_MODE = process.argv.includes('--dev');

runSyncStores({
  categoryFilter: new Set(CATEGORY_GROUPS.headphone),
  devMode: DEV_MODE,
  label: 'Headphone Group',
}).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
