import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://sycfaajrlnkyczrauusx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5Y2ZhYWpybG5reWN6cmF1dXN4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTk5MzQ5OSwiZXhwIjoyMDg1NTY5NDk5fQ.j8snsW9uHHrnBhuMlDt8BKRGpzG4yXLSliJUUSd9Lso'
);

async function fix() {
  const PAGE = 1000;
  const listings: any[] = [];
  let offset = 0;

  console.log('Fetching ALL price_listings (in-stock + out-of-stock)...');
  while (true) {
    const { data, error } = await supabase
      .from('price_listings')
      .select('product_id, price, affiliate_url, product_url, in_stock')
      .order('price', { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) { console.error('Error:', error); return; }
    if (!data || data.length === 0) break;
    listings.push(...data);
    offset += data.length;
    console.log(`  Fetched ${listings.length} listings so far...`);
    if (data.length < PAGE) break;
  }

  console.log(`Total listings: ${listings.length}`);

  // Group by product, prefer in-stock lowest price, fallback to OOS lowest price
  const lowestByProduct = new Map<string, { price: number; affiliate_url: string | null; in_stock: boolean }>();
  for (const l of listings) {
    if (l.price === null) continue;
    const existing = lowestByProduct.get(l.product_id);
    if (!existing ||
        (l.in_stock && !existing.in_stock) ||
        (l.in_stock === existing.in_stock && l.price < existing.price)) {
      lowestByProduct.set(l.product_id, {
        price: l.price,
        affiliate_url: l.affiliate_url ?? l.product_url,
        in_stock: l.in_stock,
      });
    }
  }

  console.log(`Products to update: ${lowestByProduct.size}`);

  let updated = 0;
  const entries = Array.from(lowestByProduct.entries());
  const BATCH = 25;
  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH);
    const results = await Promise.all(
      chunk.map(([id, info]) =>
        supabase
          .from('products')
          .update({ price: info.price, affiliate_url: info.affiliate_url, in_stock: info.in_stock })
          .eq('id', id)
      )
    );
    for (let j = 0; j < results.length; j++) {
      if (results[j].error) console.error('Update error for', chunk[j][0], results[j].error);
      else updated++;
    }
    if (i % 100 === 0 && i > 0) console.log(`  Progress: ${i}/${entries.length}`);
  }

  console.log(`Done! Updated ${updated} products with listing data`);

  // --- Step 2: Clear stale prices on products with NO price_listings ---
  console.log('\nClearing stale prices on products with no listings...');
  const productIdsWithListings = new Set(lowestByProduct.keys());

  let offset2 = 0;
  let cleared = 0;

  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .not('price', 'is', null)
      .range(offset2, offset2 + PAGE - 1);

    if (error) { console.error('Error fetching products:', error); break; }
    if (!data || data.length === 0) break;

    const toClear = data.filter(p => !productIdsWithListings.has(p.id));

    if (toClear.length > 0) {
      for (let i = 0; i < toClear.length; i += BATCH) {
        const batch = toClear.slice(i, i + BATCH);
        const results = await Promise.all(
          batch.map(p =>
            supabase
              .from('products')
              .update({ price: null, affiliate_url: null, in_stock: false })
              .eq('id', p.id)
          )
        );
        for (let j = 0; j < results.length; j++) {
          if (results[j].error) console.error('Clear error for', batch[j].id, results[j].error);
          else cleared++;
        }
      }
    }

    offset2 += data.length;
    if (data.length < PAGE) break;
  }

  console.log(`Cleared stale prices on ${cleared} products (no listings)`);
}

fix();
