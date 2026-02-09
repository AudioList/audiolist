import { getSupabase } from './config/retailers.ts';
async function main() {
  const s = getSupabase();
  const { data } = await s.from('products').select('id, name, brand').ilike('name', '%hane%').order('name');
  for (const p of data || []) {
    console.log(p.id + ' | ' + (p.brand || 'NULL') + ' | ' + p.name);
  }

  // Get price listings for all hane products
  const ids = (data || []).map(p => p.id);
  const { data: listings } = await s.from('price_listings').select('id, product_id, retailer_id, price').in('product_id', ids);
  console.log('\nListings:');
  for (const l of listings || []) {
    const product = data?.find(p => p.id === l.product_id);
    console.log(l.id + ' | ' + l.product_id.slice(0,8) + ' | ' + (product?.name || '?') + ' | $' + l.price);
  }

  // Get orphan IDs
  const orphans = (data || []).filter(p => p.name.startsWith('[IEMs]'));
  console.log('\nOrphan exact IDs:');
  for (const o of orphans) console.log(o.id);

  // Get Topping exact IDs
  const toppings = (data || []).filter(p => p.brand === 'Topping');
  console.log('\nTopping exact IDs:');
  for (const t of toppings) console.log(t.id + ' | ' + t.name);
}
main().catch(console.error);
