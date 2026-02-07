/**
 * clean-products.ts
 *
 * Cleans junk products and deduplicates exact-name entries from the database.
 * Removes: samples, prototypes, fakes, personal mods, and duplicate rows.
 *
 * Usage:
 *   npx tsx scripts/clean-products.ts [--dry-run]
 */

const DRY_RUN = process.argv.includes("--dry-run");

const SUPABASE_PROJECT_REF = "sycfaajrlnkyczrauusx";
const PERSONAL_ACCESS_TOKEN = process.env.SUPABASE_PAT;
if (!PERSONAL_ACCESS_TOKEN) {
  console.error('Error: SUPABASE_PAT env var is required');
  process.exit(1);
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function log(phase: string, msg: string): void {
  console.log(`[${timestamp()}] [${phase}] ${msg}`);
}

async function runSQL(query: string): Promise<unknown[]> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERSONAL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SQL query failed (${res.status}): ${text}`);
  }

  return (await res.json()) as unknown[];
}

/**
 * Delete products and all their FK references across all 5 referencing tables.
 * idList is a comma-separated list of quoted UUIDs: 'uuid1','uuid2',...
 */
async function cascadeDeleteProducts(idList: string, label: string): Promise<void> {
  // 1. store_products (canonical_product_id)
  const sp = await runSQL(`
    WITH deleted AS (
      DELETE FROM store_products WHERE canonical_product_id IN (${idList})
      RETURNING id
    ) SELECT count(*) as cnt FROM deleted
  `) as { cnt: number }[];
  if ((sp[0]?.cnt ?? 0) > 0) log(label, `  Removed ${sp[0].cnt} store_products references`);

  // 2. product_families (base_product_id)
  const pf = await runSQL(`
    UPDATE product_families SET base_product_id = NULL WHERE base_product_id IN (${idList})
    RETURNING id
  `) as { id: string }[];
  if (pf.length > 0) log(label, `  Nullified ${pf.length} product_families.base_product_id references`);

  // 3. build_items (product_id)
  const bi = await runSQL(`
    WITH deleted AS (
      DELETE FROM build_items WHERE product_id IN (${idList})
      RETURNING id
    ) SELECT count(*) as cnt FROM deleted
  `) as { cnt: number }[];
  if ((bi[0]?.cnt ?? 0) > 0) log(label, `  Removed ${bi[0].cnt} build_items references`);

  // 4. price_listings (product_id)
  const pl = await runSQL(`
    WITH deleted AS (
      DELETE FROM price_listings WHERE product_id IN (${idList})
      RETURNING id
    ) SELECT count(*) as cnt FROM deleted
  `) as { cnt: number }[];
  if ((pl[0]?.cnt ?? 0) > 0) log(label, `  Removed ${pl[0].cnt} price_listings references`);

  // 5. product_matches (product_id)
  const pm = await runSQL(`
    WITH deleted AS (
      DELETE FROM product_matches WHERE product_id IN (${idList})
      RETURNING id
    ) SELECT count(*) as cnt FROM deleted
  `) as { cnt: number }[];
  if ((pm[0]?.cnt ?? 0) > 0) log(label, `  Removed ${pm[0].cnt} product_matches references`);

  // 6. Finally delete the products themselves
  await runSQL(`DELETE FROM products WHERE id IN (${idList})`);
}

async function main() {
  console.log("=================================================================");
  console.log("  AudioList Product Database Cleanup");
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN (no changes)" : "LIVE"}`);
  console.log(`  Started at ${new Date().toISOString()}`);
  console.log("=================================================================\n");

  // --- Step 1: Count junk products ---
  log("JUNK", "Counting junk products (samples, prototypes, fakes, personal mods)...");

  const junkCountResult = await runSQL(`
    SELECT count(*) as cnt FROM products WHERE brand IS NOT NULL AND (
      name ILIKE '%sample %' OR name ILIKE '%(sample%'
      OR name ILIKE '%prototype%' OR name ILIKE '%pre-production%'
      OR name ILIKE '%fake%'
      OR name ILIKE '%modded%' OR name ILIKE '%(mod)%'
    ) AND brand NOT IN ('Modhouse', 'FakeNemesis')
  `) as { cnt: number }[];

  const junkCount = junkCountResult[0]?.cnt ?? 0;
  log("JUNK", `Found ${junkCount} junk products to delete`);

  // Show some examples
  const junkExamples = await runSQL(`
    SELECT name, brand, category_id FROM products WHERE brand IS NOT NULL AND (
      name ILIKE '%sample %' OR name ILIKE '%(sample%'
      OR name ILIKE '%prototype%' OR name ILIKE '%pre-production%'
      OR name ILIKE '%fake%'
      OR name ILIKE '%modded%' OR name ILIKE '%(mod)%'
    ) AND brand NOT IN ('Modhouse', 'FakeNemesis')
    ORDER BY name LIMIT 15
  `) as { name: string; brand: string; category_id: string }[];

  for (const ex of junkExamples) {
    console.log(`    ${ex.brand}: ${ex.name} (${ex.category_id})`);
  }
  if (junkCount > 15) console.log(`    ... and ${junkCount - 15} more`);

  // --- Step 2: Count duplicates ---
  log("DEDUP", "Counting exact-name duplicates...");

  const dupCountResult = await runSQL(`
    SELECT count(*) as products_with_dupes, sum(cnt - 1) as excess_rows
    FROM (
      SELECT lower(name) as lname, count(*) as cnt
      FROM products WHERE brand IS NOT NULL
      GROUP BY lower(name) HAVING count(*) > 1
    ) sub
  `) as { products_with_dupes: number; excess_rows: string }[];

  const dupeProducts = dupCountResult[0]?.products_with_dupes ?? 0;
  const excessRows = parseInt(dupCountResult[0]?.excess_rows ?? "0", 10);
  log("DEDUP", `Found ${dupeProducts} products with duplicates, ${excessRows} excess rows to remove`);

  // Show top duplicates
  const topDupes = await runSQL(`
    SELECT lower(name) as lname, count(*) as cnt
    FROM products WHERE brand IS NOT NULL
    GROUP BY lower(name) HAVING count(*) > 1
    ORDER BY count(*) DESC LIMIT 10
  `) as { lname: string; cnt: number }[];

  for (const d of topDupes) {
    console.log(`    "${d.lname}" x${d.cnt}`);
  }

  const totalRemovable = junkCount + excessRows;
  log("SUMMARY", `Total products to remove: ${totalRemovable} (${junkCount} junk + ${excessRows} duplicates)`);

  if (DRY_RUN) {
    log("DRY-RUN", "No changes made. Run without --dry-run to execute.");
    return;
  }

  // --- Step 3: Delete junk products (cascade through all FK tables) ---
  log("DELETE", "Collecting junk product IDs...");

  const junkIds = await runSQL(`
    SELECT id FROM products WHERE brand IS NOT NULL AND (
      name ILIKE '%sample %' OR name ILIKE '%(sample%'
      OR name ILIKE '%prototype%' OR name ILIKE '%pre-production%'
      OR name ILIKE '%fake%'
      OR name ILIKE '%modded%' OR name ILIKE '%(mod)%'
    ) AND brand NOT IN ('Modhouse', 'FakeNemesis')
  `) as { id: string }[];

  log("DELETE", `Found ${junkIds.length} junk product IDs. Cascading deletes...`);

  if (junkIds.length > 0) {
    const junkIdList = junkIds.map((r) => `'${r.id}'`).join(",");
    await cascadeDeleteProducts(junkIdList, "JUNK");
  }

  log("DELETE", `Deleted ${junkIds.length} junk products`);

  // --- Step 4: Deduplicate (cascade through all FK tables) ---
  log("DEDUP", "Deduplicating exact-name products (keeping highest PPI)...");

  const dupeIds = await runSQL(`
    WITH ranked AS (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY lower(name)
          ORDER BY
            ppi_score DESC NULLS LAST,
            CASE source_type WHEN 'merged' THEN 1 WHEN 'store' THEN 2 ELSE 3 END,
            created_at DESC
        ) as rn
      FROM products
      WHERE brand IS NOT NULL
    )
    SELECT id FROM ranked WHERE rn > 1
  `) as { id: string }[];

  log("DEDUP", `Found ${dupeIds.length} duplicate product IDs. Cascading deletes...`);

  // Process in batches of 500 to avoid overly long SQL
  const BATCH_SIZE = 500;
  for (let i = 0; i < dupeIds.length; i += BATCH_SIZE) {
    const batch = dupeIds.slice(i, i + BATCH_SIZE);
    const idList = batch.map((r) => `'${r.id}'`).join(",");
    await cascadeDeleteProducts(idList, "DEDUP");
    log("DEDUP", `Deleted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(dupeIds.length / BATCH_SIZE)} (${batch.length} products)`);
  }

  log("DEDUP", `Deleted ${dupeIds.length} duplicate products total`);

  // --- Step 5: Clean any remaining orphaned foreign keys ---
  log("ORPHANS", "Cleaning any remaining orphaned records...");

  const orphanListings = await runSQL(`
    WITH deleted AS (
      DELETE FROM price_listings WHERE product_id NOT IN (SELECT id FROM products)
      RETURNING id
    )
    SELECT count(*) as deleted FROM deleted
  `) as { deleted: number }[];
  log("ORPHANS", `Deleted ${orphanListings[0]?.deleted ?? 0} orphaned price_listings`);

  const orphanMatches = await runSQL(`
    WITH deleted AS (
      DELETE FROM product_matches WHERE product_id NOT IN (SELECT id FROM products)
      RETURNING id
    )
    SELECT count(*) as deleted FROM deleted
  `) as { deleted: number }[];
  log("ORPHANS", `Deleted ${orphanMatches[0]?.deleted ?? 0} orphaned product_matches`);

  // --- Step 6: Final count ---
  const finalCount = await runSQL(`
    SELECT count(*) as cnt FROM products WHERE brand IS NOT NULL
  `) as { cnt: number }[];

  console.log("\n=================================================================");
  console.log("  CLEANUP COMPLETE");
  console.log("=================================================================");
  console.log(`  Junk deleted:      ${junkIds.length}`);
  console.log(`  Duplicates deleted: ${dupeIds.length}`);
  console.log(`  Orphan listings:   ${orphanListings[0]?.deleted ?? 0}`);
  console.log(`  Orphan matches:    ${orphanMatches[0]?.deleted ?? 0}`);
  console.log(`  Products remaining: ${finalCount[0]?.cnt ?? "?"}`);
  console.log("=================================================================\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
