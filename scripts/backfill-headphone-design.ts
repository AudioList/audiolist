/**
 * backfill-headphone-design.ts
 *
 * 1. Scans existing headphone/IEM products and extracts open/closed-back design
 *    from their names, updating the headphone_design column.
 * 2. Also checks store_products titles for additional design info that may not
 *    be in the canonical product name but is in the retailer's listing title.
 *
 * Usage: npx tsx scripts/backfill-headphone-design.ts [--dev]
 */

import { getSupabase } from './config/retailers.ts';
import { extractHeadphoneDesign } from './scrapers/matcher.ts';

const BATCH = 1000;
const UPDATE_BATCH = 50;
const DEV_LIMIT = 100;

async function main() {
  const devMode = process.argv.includes('--dev');
  const supabase = getSupabase();

  console.log('=================================================================');
  console.log('  Backfill headphone_design from product names');
  console.log(`  Mode: ${devMode ? 'DEV' : 'FULL'}`);
  console.log('=================================================================\n');

  // Step 1: Load all headphone products that don't have a design yet
  const products: { id: string; name: string }[] = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from('products')
      .select('id, name')
      .eq('category_id', 'headphone')
      .is('headphone_design', null)
      .range(offset, offset + BATCH - 1);

    const { data, error } = await query;
    if (error) {
      console.error('Error loading products:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    products.push(...data);
    if (devMode && products.length >= DEV_LIMIT) {
      products.length = DEV_LIMIT;
      break;
    }
    offset += BATCH;
    if (data.length < BATCH) break;
  }

  console.log(`Loaded ${products.length} headphone/IEM products without design type`);

  // Step 1a: Extract design from product names
  const updates: { id: string; design: string }[] = [];
  for (const p of products) {
    const design = extractHeadphoneDesign(p.name);
    if (design) {
      updates.push({ id: p.id, design });
    }
  }

  console.log(`Found design type in ${updates.length}/${products.length} product names`);

  // Step 2: Check store_products titles for additional design info
  // (for products that didn't have design in their canonical name)
  const missingDesignIds = new Set(
    products.filter((p) => !updates.find((u) => u.id === p.id)).map((p) => p.id)
  );

  if (missingDesignIds.size > 0) {
    console.log(`\nChecking store_products for ${missingDesignIds.size} products without design...`);
    let spOffset = 0;
    let spChecked = 0;

    while (missingDesignIds.size > 0) {
      const { data: storeProducts, error: spError } = await supabase
        .from('store_products')
        .select('canonical_product_id, title')
        .not('canonical_product_id', 'is', null)
        .eq('category_id', 'headphone')
        .range(spOffset, spOffset + BATCH - 1);

      if (spError) {
        console.error('Error loading store_products:', spError.message);
        break;
      }
      if (!storeProducts || storeProducts.length === 0) break;

      for (const sp of storeProducts) {
        const pid = sp.canonical_product_id as string;
        if (!missingDesignIds.has(pid)) continue;

        const design = extractHeadphoneDesign(sp.title);
        if (design) {
          updates.push({ id: pid, design });
          missingDesignIds.delete(pid);
          spChecked++;
        }
      }

      spOffset += BATCH;
      if (storeProducts.length < BATCH) break;
      if (devMode && spOffset > 2000) break;
    }

    console.log(`Found ${spChecked} additional designs from store_products titles`);
  }

  // Step 3: Also check product_matches external_name for design info
  if (missingDesignIds.size > 0) {
    console.log(`\nChecking product_matches for ${missingDesignIds.size} remaining products...`);
    let pmOffset = 0;
    let pmFound = 0;

    while (missingDesignIds.size > 0) {
      const { data: matches, error: pmError } = await supabase
        .from('product_matches')
        .select('product_id, external_name')
        .range(pmOffset, pmOffset + BATCH - 1);

      if (pmError) {
        console.error('Error loading product_matches:', pmError.message);
        break;
      }
      if (!matches || matches.length === 0) break;

      for (const m of matches) {
        const pid = m.product_id as string;
        if (!missingDesignIds.has(pid)) continue;

        const design = extractHeadphoneDesign(m.external_name as string);
        if (design) {
          updates.push({ id: pid, design });
          missingDesignIds.delete(pid);
          pmFound++;
        }
      }

      pmOffset += BATCH;
      if (matches.length < BATCH) break;
      if (devMode && pmOffset > 2000) break;
    }

    console.log(`Found ${pmFound} additional designs from product_matches`);
  }

  // Step 4: Apply updates
  console.log(`\nTotal updates to apply: ${updates.length}`);

  // Deduplicate by product id (keep first found)
  const seen = new Set<string>();
  const deduped = updates.filter((u) => {
    if (seen.has(u.id)) return false;
    seen.add(u.id);
    return true;
  });

  console.log(`After dedup: ${deduped.length} unique products to update`);

  let updated = 0;
  for (let i = 0; i < deduped.length; i += UPDATE_BATCH) {
    const batch = deduped.slice(i, i + UPDATE_BATCH);

    // Supabase doesn't support batch conditional updates, so we do per-design-type
    const openIds = batch.filter((u) => u.design === 'open').map((u) => u.id);
    const closedIds = batch.filter((u) => u.design === 'closed').map((u) => u.id);

    if (openIds.length > 0) {
      const { error } = await supabase
        .from('products')
        .update({ headphone_design: 'open' })
        .in('id', openIds);
      if (error) console.error('Error updating open:', error.message);
      else updated += openIds.length;
    }

    if (closedIds.length > 0) {
      const { error } = await supabase
        .from('products')
        .update({ headphone_design: 'closed' })
        .in('id', closedIds);
      if (error) console.error('Error updating closed:', error.message);
      else updated += closedIds.length;
    }

    if ((i + UPDATE_BATCH) % 200 === 0) {
      console.log(`  Updated ${Math.min(i + UPDATE_BATCH, deduped.length)}/${deduped.length}...`);
    }
  }

  console.log(`\n=================================================================`);
  console.log(`  BACKFILL COMPLETE`);
  console.log(`  Products updated: ${updated}`);
  console.log(`  Open-back: ${deduped.filter((u) => u.design === 'open').length}`);
  console.log(`  Closed-back: ${deduped.filter((u) => u.design === 'closed').length}`);
  console.log(`  Still unknown: ${products.length - deduped.length}`);
  console.log('=================================================================\n');
}

main().catch(console.error);
