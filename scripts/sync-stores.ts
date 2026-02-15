/**
 * sync-stores.ts
 *
 * Bulk import products from retailer collections into the retailer_products
 * ingestion table.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/sync-stores.ts [--dev]
 */

import "./lib/env.js";
import { runSyncStores } from "./lib/sync-stores-core.ts";

const DEV_MODE = process.argv.includes("--dev");

runSyncStores({
  categoryFilter: null,
  devMode: DEV_MODE,
  label: "All Categories",
}).catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
