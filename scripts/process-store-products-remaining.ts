/**
 * process-store-products-remaining.ts
 *
 * Category-specific store product processor: All remaining categories not covered
 * by iem/headphone/microphone group processors.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/process-store-products-remaining.ts [--dev]
 */

import { runProcessStoreProducts } from './lib/process-store-products-core.ts';
import type { CategoryId } from './config/store-collections.ts';

const DEV_MODE = process.argv.includes('--dev');

const REMAINING_CATEGORIES: CategoryId[] = ['dac', 'amp', 'dap', 'cable', 'speaker', 'hp_cable', 'iem_cable'];

runProcessStoreProducts({
  categoryFilter: new Set(REMAINING_CATEGORIES),
  devMode: DEV_MODE,
  label: 'Remaining Categories (dac, amp, dap, cable, speaker, hp_cable, iem_cable)',
}).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
