/**
 * One-time bulk extraction of product attributes from Shopify tags.
 * Reads store_products.tags for headphones.com products and updates
 * canonical products with headphone_design, driver_type, wearing_style.
 *
 * Usage:
 *   npx tsx scripts/extract-shopify-tags.ts --dry-run
 *   npx tsx scripts/extract-shopify-tags.ts
 */
import { getSupabase } from './config/retailers';
import { extractTagAttributes, type ExtractedTags } from './lib/extract-tags';

const DRY = process.argv.includes('--dry-run');

async function main() {
  const sb = getSupabase();

  if (DRY) console.log('[DRY RUN] No changes will be made.\n');

  // Fetch all headphones.com store products that are linked to canonical products
  console.log('Fetching headphones.com store products with canonical links...');
  const { data: storeProducts, error } = await sb
    .from('store_products')
    .select('id, title, tags, canonical_product_id, category_id')
    .eq('retailer_id', 'headphones')
    .not('canonical_product_id', 'is', null);

  if (error) {
    console.error('Error fetching store products:', error.message);
    return;
  }

  console.log(`Found ${storeProducts?.length ?? 0} linked store products.\n`);
  if (!storeProducts || storeProducts.length === 0) return;

  // Fetch the current state of those canonical products
  const canonicalIds = [...new Set(storeProducts.map(sp => sp.canonical_product_id as string))];
  const { data: products } = await sb
    .from('products')
    .select('id, name, headphone_design, specs, category_id')
    .in('id', canonicalIds);

  const productMap = new Map(products?.map(p => [p.id, p]) ?? []);

  let updatedCount = 0;
  let skippedCount = 0;
  const summary: { name: string; changes: string[] }[] = [];

  for (const sp of storeProducts) {
    const tags = sp.tags as string[] | null;
    if (!tags || tags.length === 0) continue;

    const extracted = extractTagAttributes(tags);
    if (!extracted.headphone_design && !extracted.driver_type && !extracted.wearing_style) {
      continue;
    }

    const product = productMap.get(sp.canonical_product_id as string);
    if (!product) continue;

    const currentSpecs = (product.specs as Record<string, unknown>) ?? {};
    const updates: Record<string, unknown> = {};
    const changes: string[] = [];

    // headphone_design: only set if currently null
    if (extracted.headphone_design && !product.headphone_design) {
      updates.headphone_design = extracted.headphone_design;
      changes.push(`headphone_design=${extracted.headphone_design}`);
    }

    // driver_type: only set if not already in specs
    if (extracted.driver_type && !currentSpecs.driver_type) {
      updates.specs = { ...currentSpecs, ...((updates.specs as Record<string, unknown>) ?? {}), driver_type: extracted.driver_type };
      changes.push(`driver_type=${extracted.driver_type}`);
    }

    // wearing_style: only set if not already in specs
    if (extracted.wearing_style && !currentSpecs.wearing_style) {
      if (!updates.specs) updates.specs = { ...currentSpecs };
      (updates.specs as Record<string, unknown>).wearing_style = extracted.wearing_style;
      changes.push(`wearing_style=${extracted.wearing_style}`);
    }

    if (changes.length === 0) {
      skippedCount++;
      continue;
    }

    summary.push({ name: product.name, changes });

    if (!DRY) {
      const { error: updateErr } = await sb
        .from('products')
        .update(updates)
        .eq('id', product.id);

      if (updateErr) {
        console.error(`  ERROR updating "${product.name}":`, updateErr.message);
      } else {
        updatedCount++;
      }
    } else {
      updatedCount++;
    }
  }

  // Print summary
  console.log('=== Update Summary ===\n');
  for (const item of summary) {
    console.log(`  ${item.name}: ${item.changes.join(', ')}`);
  }
  console.log(`\nUpdated: ${updatedCount}`);
  console.log(`Skipped (already had data): ${skippedCount}`);
  console.log(`Total store products processed: ${storeProducts.length}`);
  console.log(DRY ? '\n(dry run -- no changes made)' : '\nDone.');
}

main().catch(console.error);
