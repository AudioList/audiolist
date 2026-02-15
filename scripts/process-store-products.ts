/**
 * process-store-products.ts
 *
 * Processes unprocessed retailer_products: resolves/creates canonical devices,
 * writes device_offers, and queues review_tasks for manual merge review.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/process-store-products.ts [--dev]
 */

import "./lib/env.js";
import { runProcessStoreProducts } from "./lib/process-store-products-core.ts";

const DEV_MODE = process.argv.includes("--dev");

runProcessStoreProducts({
  categoryFilter: null,
  devMode: DEV_MODE,
  label: "All Categories",
}).catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
