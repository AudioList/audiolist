/**
 * sync-stores-iem.ts
 *
 * Category-specific store sync: IEM group (iem, iem_tips, iem_cable, iem_filter).
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/sync-stores-iem.ts [--dev]
 */

import "./lib/env.js";
import { CATEGORY_GROUPS } from './config/store-collections.ts';
import { runSyncStores } from './lib/sync-stores-core.ts';

const DEV_MODE = process.argv.includes('--dev');

runSyncStores({
  categoryFilter: new Set(CATEGORY_GROUPS.iem),
  devMode: DEV_MODE,
  label: 'IEM Group',
}).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
