/**
 * fix-category-misclassification.ts
 *
 * One-time (re-runnable) script to fix headphones miscategorized as IEMs.
 * Uses the three-tier detection system from category-rules.ts.
 *
 * For each reclassified product:
 *   - category_id: 'iem' -> 'headphone'
 *   - headphone_design: extracted from name (open/closed/null)
 *   - iem_type: set to null (clear IEM field)
 *
 * Usage:
 *   npx tsx scripts/fix-category-misclassification.ts --dry-run
 *   npx tsx scripts/fix-category-misclassification.ts
 *   npx tsx scripts/fix-category-misclassification.ts --reverse --dry-run   (check headphones that might be IEMs)
 */

import { getSupabase } from './config/retailers.ts';
import { detectProductCategory, extractHeadphoneDesign, extractIemType } from './scrapers/matcher.ts';
import {
  HEADPHONE_ONLY_BRANDS,
  HEADPHONE_BRAND_IEM_EXCEPTIONS,
  BRAND_RULE_MAP,
  HEADPHONE_NAME_INDICATORS,
  HEADPHONE_NAME_INDICATORS_GUARDED,
  GUARDED_INDICATOR_BLOCKERS,
} from './config/category-rules.ts';

const BATCH = 1000;
const UPDATE_BATCH = 50;
const DRY = process.argv.includes('--dry-run');
const REVERSE = process.argv.includes('--reverse');

interface ProductRow {
  id: string;
  name: string;
  brand: string | null;
  category_id: string;
  headphone_design: string | null;
  iem_type: string | null;
}

interface ReclassifyResult {
  product: ProductRow;
  detectedCategory: 'iem' | 'headphone';
  tier: string;
  headphoneDesign: string | null;
}

async function main() {
  const supabase = getSupabase();

  const sourceCategory = REVERSE ? 'headphone' : 'iem';
  const targetCategory = REVERSE ? 'iem' : 'headphone';

  console.log('=================================================================');
  console.log('  Fix Category Misclassification');
  console.log(`  Direction: ${sourceCategory} -> ${targetCategory}`);
  console.log(`  Mode: ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log('=================================================================\n');

  // Step 1: Load all products from source category
  const products: ProductRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, brand, category_id, headphone_design, iem_type')
      .eq('category_id', sourceCategory)
      .range(offset, offset + BATCH - 1);

    if (error) {
      console.error('Error loading products:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    products.push(...(data as ProductRow[]));
    offset += BATCH;
    if (data.length < BATCH) break;
  }

  console.log(`Loaded ${products.length} products from category '${sourceCategory}'\n`);

  // Step 2: Detect misclassified products
  const reclassifications: ReclassifyResult[] = [];

  for (const p of products) {
    const detected = detectProductCategory(p.name, p.brand);

    if (detected === targetCategory) {
      // Determine which tier triggered the detection for reporting
      const tier = getTierLabel(p.name, p.brand, detected);
      const headphoneDesign = detected === 'headphone'
        ? extractHeadphoneDesign(p.name)
        : null;

      reclassifications.push({
        product: p,
        detectedCategory: detected,
        tier,
        headphoneDesign,
      });
    }
  }

  console.log(`Found ${reclassifications.length} products to reclassify\n`);

  if (reclassifications.length === 0) {
    console.log('Nothing to fix.');
    return;
  }

  // Step 3: Print detailed report
  // Group by brand for readable output
  const byBrand = new Map<string, ReclassifyResult[]>();
  for (const r of reclassifications) {
    const key = r.product.brand ?? '(no brand)';
    if (!byBrand.has(key)) byBrand.set(key, []);
    byBrand.get(key)!.push(r);
  }

  const sortedBrands = [...byBrand.entries()].sort((a, b) => b[1].length - a[1].length);

  for (const [brand, items] of sortedBrands) {
    console.log(`\n--- ${brand} (${items.length}) ---`);
    for (const r of items) {
      const design = r.headphoneDesign ? ` [${r.headphoneDesign}]` : '';
      console.log(`  ${r.tier} | ${r.product.name}${design}`);
    }
  }

  console.log(`\n=================================================================`);
  console.log(`  Total: ${reclassifications.length} products to move ${sourceCategory} -> ${targetCategory}`);
  console.log(`=================================================================\n`);

  // Step 4: Apply updates (unless dry run or reverse-only)
  if (DRY) {
    console.log('[DRY RUN] No changes applied.\n');
    return;
  }

  // Reverse direction also applies updates when not in dry-run mode

  console.log('Applying updates...\n');
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < reclassifications.length; i += UPDATE_BATCH) {
    const batch = reclassifications.slice(i, i + UPDATE_BATCH);

    const promises = batch.map(async (r) => {
      const updateData: Record<string, unknown> = {
        category_id: r.detectedCategory,
      };

      if (r.detectedCategory === 'headphone') {
        updateData.headphone_design = r.headphoneDesign;
        updateData.iem_type = null;
      } else {
        // Moving to IEM -- detect iem_type from name
        updateData.headphone_design = null;
        const iemType = extractIemType(r.product.name);
        updateData.iem_type = iemType ?? 'passive';
      }

      const { error } = await supabase
        .from('products')
        .update(updateData)
        .eq('id', r.product.id);

      if (error) {
        console.error(`  ERROR updating "${r.product.name}": ${error.message}`);
        errors++;
      } else {
        updated++;
      }
    });

    await Promise.all(promises);

    if ((i + UPDATE_BATCH) % 100 < UPDATE_BATCH) {
      console.log(`  Progress: ${Math.min(i + UPDATE_BATCH, reclassifications.length)}/${reclassifications.length}`);
    }
  }

  console.log(`\nDone! Updated: ${updated}, Errors: ${errors}\n`);
}

/**
 * Determine which classification tier triggered the detection.
 * Used purely for reporting in the dry-run output.
 */
function getTierLabel(name: string, brand: string | null, detected: 'iem' | 'headphone'): string {
  const brandLower = brand?.toLowerCase().trim() ?? '';

  // Tier 1
  if (brandLower && HEADPHONE_ONLY_BRANDS.has(brandLower)) {
    let isException = false;
    for (const rx of HEADPHONE_BRAND_IEM_EXCEPTIONS) {
      if (rx.test(name)) { isException = true; break; }
    }
    if (!isException && detected === 'headphone') return 'T1:brand-only';
    if (isException && detected === 'iem') return 'T1:brand-exception';
  }

  // Tier 2
  if (brandLower) {
    const rule = BRAND_RULE_MAP.get(brandLower);
    if (rule) {
      for (const rx of rule.iemPatterns) {
        if (rx.test(name)) return `T2:iem-model(${rx.source})`;
      }
      for (const rx of rule.headphonePatterns) {
        if (rx.test(name)) return `T2:hp-model(${rx.source})`;
      }
    }
  }

  // Tier 3
  for (const rx of HEADPHONE_NAME_INDICATORS) {
    if (rx.test(name)) return `T3:name(${rx.source})`;
  }

  // Tier 3 guarded
  const hasBlocker = GUARDED_INDICATOR_BLOCKERS.some((rx) => rx.test(name));
  if (!hasBlocker) {
    for (const rx of HEADPHONE_NAME_INDICATORS_GUARDED) {
      if (rx.test(name)) return `T3:guarded(${rx.source})`;
    }
  }

  return 'unknown';
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
