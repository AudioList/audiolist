/**
 * mark-best-variants.ts
 *
 * For product families with DSP or ANC variant types, mark the highest-scoring
 * variant as is_best_variant=true and all others as is_best_variant=false.
 * Non-best variants will be hidden from search results on the frontend.
 *
 * Re-runnable / idempotent. Run after parse-variants.ts.
 *
 * Usage:
 *   npx tsx scripts/mark-best-variants.ts --dry-run
 *   npx tsx scripts/mark-best-variants.ts
 */

import { getSupabase } from './config/retailers.ts';

const BATCH = 1000;
const DRY = process.argv.includes('--dry-run');

async function main() {
  const supabase = getSupabase();

  console.log('=================================================================');
  console.log('  Mark Best Variants (DSP/ANC/Switch families)');
  console.log(`  Mode: ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log('=================================================================\n');

  // Load all products that have a family and are DSP or ANC variants
  const products: {
    id: string;
    name: string;
    ppi_score: number | null;
    product_family_id: string;
    variant_type: string;
    is_best_variant: boolean | null;
  }[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, ppi_score, product_family_id, variant_type, is_best_variant')
      .not('product_family_id', 'is', null)
      .in('variant_type', ['dsp', 'anc', 'switch'])
      .range(offset, offset + BATCH - 1);

    if (error) {
      console.error('Error loading products:', error.message);
      break;
    }
    if (!data || data.length === 0) break;
    products.push(...(data as typeof products));
    offset += BATCH;
    if (data.length < BATCH) break;
  }

  console.log(`Loaded ${products.length} DSP/ANC/Switch variant products\n`);

  if (products.length === 0) {
    console.log('No DSP/ANC/Switch variants found in families.');
    return;
  }

  // Also load base products (no variant_type) that are in the same families
  const familyIds = [...new Set(products.map(p => p.product_family_id))];
  const baseProducts: typeof products = [];
  for (let i = 0; i < familyIds.length; i += 50) {
    const batch = familyIds.slice(i, i + 50);
    const { data } = await supabase
      .from('products')
      .select('id, name, ppi_score, product_family_id, variant_type, is_best_variant')
      .in('product_family_id', batch)
      .is('variant_type', null);

    if (data) baseProducts.push(...(data as typeof products));
  }

  // Combine all family members
  const allMembers = [...products, ...baseProducts];
  console.log(`Total family members (including bases): ${allMembers.length}\n`);

  // Group by family
  const families = new Map<string, typeof allMembers>();
  for (const p of allMembers) {
    const fam = families.get(p.product_family_id);
    if (fam) fam.push(p);
    else families.set(p.product_family_id, [p]);
  }

  console.log(`Families to process: ${families.size}\n`);

  let bestCount = 0;
  let nonBestCount = 0;
  const toSetTrue: string[] = [];
  const toSetFalse: string[] = [];

  for (const [familyId, members] of families) {
    // Find the member with the highest PPI score
    const withScores = members.filter(m => m.ppi_score !== null);
    if (withScores.length === 0) {
      console.log(`  Family ${familyId}: all members have null PPI, skipping`);
      continue;
    }

    const best = withScores.reduce((a, b) => (a.ppi_score! > b.ppi_score! ? a : b));

    console.log(`  Family: ${members.map(m => m.name).join(' | ')}`);
    console.log(`    Best: "${best.name}" (PPI ${best.ppi_score})`);

    for (const m of members) {
      if (m.id === best.id) {
        if (m.is_best_variant !== true) {
          toSetTrue.push(m.id);
        }
        bestCount++;
      } else {
        if (m.is_best_variant !== false) {
          toSetFalse.push(m.id);
        }
        nonBestCount++;
        console.log(`    Hide: "${m.name}" (PPI ${m.ppi_score})`);
      }
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Best variants: ${bestCount}`);
  console.log(`  Non-best (hidden): ${nonBestCount}`);
  console.log(`  Needing is_best_variant=true: ${toSetTrue.length}`);
  console.log(`  Needing is_best_variant=false: ${toSetFalse.length}`);

  if (DRY) {
    console.log('\n*** DRY RUN complete. No changes made. ***');
    return;
  }

  // Apply updates
  let updated = 0;

  if (toSetTrue.length > 0) {
    for (let i = 0; i < toSetTrue.length; i += 50) {
      const batch = toSetTrue.slice(i, i + 50);
      const { error } = await supabase
        .from('products')
        .update({ is_best_variant: true })
        .in('id', batch);
      if (error) console.error('Error setting true:', error.message);
      else updated += batch.length;
    }
  }

  if (toSetFalse.length > 0) {
    for (let i = 0; i < toSetFalse.length; i += 50) {
      const batch = toSetFalse.slice(i, i + 50);
      const { error } = await supabase
        .from('products')
        .update({ is_best_variant: false })
        .in('id', batch);
      if (error) console.error('Error setting false:', error.message);
      else updated += batch.length;
    }
  }

  console.log(`\n=================================================================`);
  console.log(`  MARK BEST VARIANTS COMPLETE`);
  console.log(`  Products updated: ${updated}`);
  console.log('=================================================================\n');
}

main().catch(console.error);
