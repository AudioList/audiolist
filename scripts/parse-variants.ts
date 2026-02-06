/**
 * parse-variants.ts
 *
 * One-time (or re-runnable) script that:
 * 1. Fetches all products from Supabase
 * 2. Parses variant modifiers from product names
 * 3. Groups products into families by canonical base name
 * 4. Creates product_families rows and updates products with family/variant info
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/parse-variants.ts
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/parse-variants.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { parseProductVariant, type ParseResult, type VariantType } from './variant-config';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = 'https://sycfaajrlnkyczrauusx.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_KEY environment variable is not set.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const DRY_RUN = process.argv.includes('--dry-run');
const PAGE_SIZE = 1000;
const UPSERT_BATCH = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProductRow {
  id: string;
  name: string;
  brand: string | null;
  category_id: string;
  ppi_score: number | null;
  variant_type: string | null;
  variant_value: string | null;
  product_family_id: string | null;
}

interface FamilyGroup {
  baseName: string;
  categoryId: string;
  members: Array<{
    id: string;
    name: string;
    ppiScore: number | null;
    variants: Array<{ type: VariantType; value: string }>;
    hasVariants: boolean;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string): void {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Product Variant Parser ===');
  if (DRY_RUN) console.log('*** DRY RUN — no database changes will be made ***\n');

  // Step 1: Fetch all products
  log('Step 1: Fetching all products...');
  const allProducts: ProductRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, brand, category_id, ppi_score, variant_type, variant_value, product_family_id')
      .order('name')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error(`  ERROR fetching at offset ${offset}: ${error.message}`);
      break;
    }

    const batch = (data ?? []) as ProductRow[];
    if (batch.length === 0) break;
    allProducts.push(...batch);
    offset += PAGE_SIZE;
    if (batch.length < PAGE_SIZE) break;
  }

  log(`  Fetched ${allProducts.length} products total`);

  // Step 2: Parse variants for each product
  log('Step 2: Parsing variants...');
  const parseResults = new Map<string, ParseResult>();
  const variantCounts: Record<string, number> = {};
  let productsWithVariants = 0;

  for (const product of allProducts) {
    const result = parseProductVariant(product.name);
    parseResults.set(product.id, result);

    if (result.variants.length > 0) {
      productsWithVariants++;
      for (const v of result.variants) {
        variantCounts[v.type] = (variantCounts[v.type] ?? 0) + 1;
      }
    }
  }

  log(`  Products with variants: ${productsWithVariants} / ${allProducts.length}`);
  log('  Variant type distribution:');
  const sortedTypes = Object.entries(variantCounts).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sortedTypes) {
    log(`    ${type}: ${count}`);
  }

  // Step 3: Group into families by (baseName + categoryId)
  log('\nStep 3: Grouping into product families...');
  const familyMap = new Map<string, FamilyGroup>();

  for (const product of allProducts) {
    const result = parseResults.get(product.id)!;
    // Key: normalized base name + category
    const key = `${result.baseName.toLowerCase().trim()}||${product.category_id}`;

    if (!familyMap.has(key)) {
      familyMap.set(key, {
        baseName: result.baseName,
        categoryId: product.category_id,
        members: [],
      });
    }

    familyMap.get(key)!.members.push({
      id: product.id,
      name: product.name,
      ppiScore: product.ppi_score,
      variants: result.variants,
      hasVariants: result.variants.length > 0,
    });
  }

  // Only families with 2+ members are real families
  const realFamilies = Array.from(familyMap.values()).filter((f) => f.members.length >= 2);
  const singletons = familyMap.size - realFamilies.length;

  log(`  Total groups: ${familyMap.size}`);
  log(`  Families (2+ members): ${realFamilies.length}`);
  log(`  Singletons: ${singletons}`);
  log(`  Total products in families: ${realFamilies.reduce((s, f) => s + f.members.length, 0)}`);

  // Show top families by member count
  const topFamilies = [...realFamilies].sort((a, b) => b.members.length - a.members.length).slice(0, 20);
  log('\n  Top 20 families by member count:');
  for (const fam of topFamilies) {
    log(`    "${fam.baseName}" (${fam.categoryId}): ${fam.members.length} members`);
    for (const mem of fam.members.slice(0, 5)) {
      const varStr = mem.variants.map((v) => `${v.type}="${v.value}"`).join(', ') || '(base)';
      log(`      - "${mem.name}" → ${varStr}`);
    }
    if (fam.members.length > 5) {
      log(`      ... and ${fam.members.length - 5} more`);
    }
  }

  // Show sample variant extractions
  log('\n  Sample variant extractions:');
  const samplesWithVariants = allProducts
    .filter((p) => (parseResults.get(p.id)?.variants.length ?? 0) > 0)
    .slice(0, 30);
  for (const p of samplesWithVariants) {
    const result = parseResults.get(p.id)!;
    const vars = result.variants.map((v) => `${v.type}="${v.value}"`).join(', ');
    log(`    "${p.name}" → base="${result.baseName}" | ${vars}`);
  }

  if (DRY_RUN) {
    console.log('\n*** DRY RUN complete. No changes written. ***');
    return;
  }

  // Step 4: Create product_families and update products
  log('\nStep 4: Writing to database...');

  // 4a: Clear existing family assignments (re-runnable)
  log('  Clearing existing family assignments...');
  const { error: clearError } = await supabase
    .from('products')
    .update({ product_family_id: null, variant_type: null, variant_value: null })
    .not('product_family_id', 'is', null);
  if (clearError) {
    console.error(`  WARNING: Failed to clear existing assignments: ${clearError.message}`);
  }

  // Delete existing families
  const { error: deleteFamError } = await supabase
    .from('product_families')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all
  if (deleteFamError) {
    console.error(`  WARNING: Failed to delete existing families: ${deleteFamError.message}`);
  }

  // 4b: Create product_families
  log('  Creating product families...');
  let familiesCreated = 0;
  let productsUpdated = 0;

  for (let i = 0; i < realFamilies.length; i += UPSERT_BATCH) {
    const batch = realFamilies.slice(i, i + UPSERT_BATCH);
    const familyRows = batch.map((fam) => {
      // Base product: member with no variants, or the one with highest PPI
      const baseProduct =
        fam.members.find((m) => !m.hasVariants) ??
        fam.members.reduce((best, m) => ((m.ppiScore ?? 0) > (best.ppiScore ?? 0) ? m : best));

      return {
        canonical_name: fam.baseName,
        base_product_id: baseProduct.id,
        category_id: fam.categoryId,
      };
    });

    const { data: inserted, error: insertErr } = await supabase
      .from('product_families')
      .insert(familyRows)
      .select('id, canonical_name');

    if (insertErr) {
      console.error(`  ERROR inserting families batch: ${insertErr.message}`);
      continue;
    }

    familiesCreated += (inserted ?? []).length;

    // Map canonical name back to family ID
    const nameToFamilyId = new Map<string, string>();
    for (const row of inserted ?? []) {
      nameToFamilyId.set(row.canonical_name, row.id);
    }

    // Update products in this batch
    for (const fam of batch) {
      const familyId = nameToFamilyId.get(fam.baseName);
      if (!familyId) continue;

      for (const member of fam.members) {
        const result = parseResults.get(member.id)!;
        const primaryVariant = result.variants[0];

        const { error: updateErr } = await supabase
          .from('products')
          .update({
            product_family_id: familyId,
            variant_type: primaryVariant?.type ?? null,
            variant_value: primaryVariant?.value ?? null,
          })
          .eq('id', member.id);

        if (updateErr) {
          console.error(`  ERROR updating product ${member.id}: ${updateErr.message}`);
        } else {
          productsUpdated++;
        }
      }
    }

    if ((i + UPSERT_BATCH) % 500 < UPSERT_BATCH) {
      log(`  Progress: ${Math.min(i + UPSERT_BATCH, realFamilies.length)}/${realFamilies.length} families processed`);
    }
  }

  // 4c: Update singleton products that have variants but no family
  log('  Updating singleton products with variants...');
  let singletonsUpdated = 0;

  for (const product of allProducts) {
    const result = parseResults.get(product.id)!;
    if (result.variants.length === 0) continue;

    // Check if this product is NOT in a family
    const key = `${result.baseName.toLowerCase().trim()}||${product.category_id}`;
    const family = familyMap.get(key);
    if (family && family.members.length >= 2) continue; // Already handled above

    const primaryVariant = result.variants[0];
    const { error: updateErr } = await supabase
      .from('products')
      .update({
        variant_type: primaryVariant.type,
        variant_value: primaryVariant.value,
      })
      .eq('id', product.id);

    if (!updateErr) singletonsUpdated++;
  }

  // Summary
  console.log('\n=== Parse Variants Complete ===');
  console.log(`  Products scanned:           ${allProducts.length}`);
  console.log(`  Products with variants:     ${productsWithVariants}`);
  console.log(`  Product families created:   ${familiesCreated}`);
  console.log(`  Products linked to family:  ${productsUpdated}`);
  console.log(`  Singletons with variants:   ${singletonsUpdated}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
