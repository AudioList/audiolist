/**
 * sync-stores-microphone.ts
 *
 * Category-specific store sync: Microphone group (microphone).
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/sync-stores-microphone.ts [--dev]
 */

import { CATEGORY_GROUPS } from './config/store-collections.ts';
import { runSyncStores } from './lib/sync-stores-core.ts';

const DEV_MODE = process.argv.includes('--dev');

runSyncStores({
  categoryFilter: new Set(CATEGORY_GROUPS.microphone),
  devMode: DEV_MODE,
  label: 'Microphone Group',
}).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
