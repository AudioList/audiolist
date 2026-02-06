/**
 * dedup-existing.ts
 *
 * One-time script to deduplicate existing measurement products.
 * Groups products by LOWER(brand) + normalizeName(name) within same category_id,
 * keeps the highest-PPI row as canonical, and soft-deletes duplicates.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/dedup-existing.ts [--dry-run]
 */

import { getSupabase } from './config/retailers.ts';
import { normalizeName } from './scrapers/matcher.ts';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 1000;

type Product = {
  id: string;
  name: string;
  brand: string | null;
  category_id: string;
  ppi_score: number | null;
  product_family_id: string | null;
};

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function log(msg: string): void {
  console.log(`[${timestamp()}] ${msg}`);
}

/**
 * Build a dedup key from brand + normalized name + category.
 * Products with the same key are considered duplicates.
 */
function dedupKey(product: Product): string {
  const brand = (product.brand ?? '').toLowerCase().trim();
  const normalized = normalizeName(product.name);
  return `${product.category_id}::${brand}::${normalized}`;
}

async function loadAllProducts(): Promise<Product[]> {
  const supabase = getSupabase();
  const all: Product[] = [];
  let offset = 0;

  log('Loading all products...');

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, brand, category_id, ppi_score, product_family_id')
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      log(`ERROR loading at offset ${offset}: ${error.message}`);
      break;
    }

    const batch = (data ?? []) as Product[];
    if (batch.length === 0) break;

    all.push(...batch);
    offset += BATCH_SIZE;
    if (batch.length < BATCH_SIZE) break;
  }

  log(`Loaded ${all.length} products`);
  return all;
}

async function main(): Promise<void> {
  console.log('=================================================================');
  console.log('  AudioList Product Dedup');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`  Started at ${new Date().toISOString()}`);
  console.log('=================================================================\n');

  const products = await loadAllProducts();

  // Group products by dedup key
  const groups = new Map<string, Product[]>();
  for (const product of products) {
    const key = dedupKey(product);
    const group = groups.get(key);
    if (group) {
      group.push(product);
    } else {
      groups.set(key, [product]);
    }
  }

  // Find duplicate groups (2+ members)
  const dupGroups = Array.from(groups.entries()).filter(([, group]) => group.length > 1);

  log(`Found ${groups.size} unique products, ${dupGroups.length} duplicate groups`);

  let totalDuplicates = 0;
  let totalDeleted = 0;

  const supabase = getSupabase();

  const CONCURRENCY = 20;

  async function processGroup(group: Product[]): Promise<number> {
    // Sort by PPI score desc (nulls last)
    group.sort((a, b) => {
      if (a.ppi_score !== null && b.ppi_score !== null) return b.ppi_score - a.ppi_score;
      if (a.ppi_score !== null) return -1;
      if (b.ppi_score !== null) return 1;
      return 0;
    });

    const canonical = group[0];
    const duplicates = group.slice(1);
    const duplicateIds = duplicates.map((d) => d.id);

    // Run FK updates in parallel
    const [listingResult, buildResult, matchResult] = await Promise.all([
      supabase.from('price_listings').update({ product_id: canonical.id }).in('product_id', duplicateIds),
      supabase.from('build_items').update({ product_id: canonical.id }).in('product_id', duplicateIds),
      supabase.from('product_matches').update({ product_id: canonical.id }).in('product_id', duplicateIds),
    ]);

    if (listingResult.error) log(`  WARNING: price_listings for "${canonical.name}": ${listingResult.error.message}`);
    if (buildResult.error) log(`  WARNING: build_items for "${canonical.name}": ${buildResult.error.message}`);
    if (matchResult.error) log(`  WARNING: product_matches for "${canonical.name}": ${matchResult.error.message}`);

    // Inherit product_family_id if needed
    if (!canonical.product_family_id) {
      const familyDonor = duplicates.find((d) => d.product_family_id);
      if (familyDonor) {
        await supabase
          .from('products')
          .update({ product_family_id: familyDonor.product_family_id })
          .eq('id', canonical.id);
      }
    }

    // Delete duplicates
    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .in('id', duplicateIds);

    if (deleteError) {
      log(`  ERROR: Failed to delete duplicates for "${canonical.name}": ${deleteError.message}`);
      return 0;
    }
    return duplicateIds.length;
  }

  // Count totals for dry-run
  for (const [key, group] of dupGroups) {
    group.sort((a, b) => {
      if (a.ppi_score !== null && b.ppi_score !== null) return b.ppi_score - a.ppi_score;
      if (a.ppi_score !== null) return -1;
      if (b.ppi_score !== null) return 1;
      return 0;
    });

    const duplicates = group.slice(1);
    totalDuplicates += duplicates.length;

    if (duplicates.length >= 3) {
      const canonical = group[0];
      log(`  "${canonical.name}" (${canonical.brand ?? 'no brand'}): keeping id=${canonical.id} (PPI=${canonical.ppi_score}), removing ${duplicates.length} duplicates`);
    }
  }

  if (!DRY_RUN) {
    // Process groups in chunks of CONCURRENCY
    for (let i = 0; i < dupGroups.length; i += CONCURRENCY) {
      const chunk = dupGroups.slice(i, i + CONCURRENCY);
      if (i % 100 === 0) {
        log(`Processing groups ${i + 1}-${Math.min(i + CONCURRENCY, dupGroups.length)} of ${dupGroups.length}...`);
      }
      const results = await Promise.all(chunk.map(([, group]) => processGroup(group)));
      totalDeleted += results.reduce((sum, n) => sum + n, 0);
    }
  }

  // Summary
  console.log('\n=================================================================');
  console.log('  DEDUP COMPLETE');
  console.log('=================================================================');
  console.log(`  Total products:         ${products.length}`);
  console.log(`  Unique products:        ${groups.size}`);
  console.log(`  Duplicate groups:       ${dupGroups.length}`);
  console.log(`  Total duplicates:       ${totalDuplicates}`);
  if (DRY_RUN) {
    console.log(`  Would delete:           ${totalDuplicates}`);
    console.log(`  Mode:                   DRY RUN — no changes made`);
  } else {
    console.log(`  Actually deleted:       ${totalDeleted}`);
  }
  console.log('=================================================================\n');

  // Show top 20 largest duplicate groups
  const sortedGroups = dupGroups.sort(([, a], [, b]) => b.length - a.length);
  console.log('Top 20 largest duplicate groups:');
  for (const [key, group] of sortedGroups.slice(0, 20)) {
    const canonical = group[0];
    console.log(`  ${group.length}x  "${canonical.name}" (${canonical.brand ?? 'no brand'}) [${canonical.category_id}]`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
