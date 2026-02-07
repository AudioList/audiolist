import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://sycfaajrlnkyczrauusx.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
);

const { data: all } = await sb.from('product_matches').select('match_score').eq('status', 'pending');
if (!all) process.exit(1);

const buckets = { above80: 0, b75: 0, b70: 0, b65: 0, b60: 0, b55: 0 };
for (const r of all) {
  const s = r.match_score;
  if (s >= 0.80) buckets.above80++;
  else if (s >= 0.75) buckets.b75++;
  else if (s >= 0.70) buckets.b70++;
  else if (s >= 0.65) buckets.b65++;
  else if (s >= 0.60) buckets.b60++;
  else buckets.b55++;
}
console.log('Score distribution (pending):');
console.log('  0.80+:', buckets.above80);
console.log('  0.75-0.80:', buckets.b75);
console.log('  0.70-0.75:', buckets.b70);
console.log('  0.65-0.70:', buckets.b65);
console.log('  0.60-0.65:', buckets.b60);
console.log('  0.55-0.60:', buckets.b55);
console.log('  Total:', all.length);

// Bloom headphone pending matches
const { data: bloomHP } = await sb.from('product_matches')
  .select('external_name, match_score, product_id')
  .eq('status', 'pending')
  .eq('retailer_id', 'bloomaudio')
  .ilike('external_name', '%headphone%')
  .order('match_score', { ascending: false })
  .limit(20);
console.log('\nBloom pending headphone matches:');
if (bloomHP) {
  for (const b of bloomHP) {
    console.log('  ' + b.match_score.toFixed(3) + ' | ' + b.external_name);
  }
}

// All Bloom pending with pipe in name
const { data: bloomPipe } = await sb.from('product_matches')
  .select('external_name, match_score')
  .eq('status', 'pending')
  .eq('retailer_id', 'bloomaudio')
  .ilike('external_name', '%|%')
  .order('match_score', { ascending: false })
  .limit(20);
console.log('\nBloom pending with pipe in name:');
if (bloomPipe) {
  for (const b of bloomPipe) {
    console.log('  ' + b.match_score.toFixed(3) + ' | ' + b.external_name);
  }
}
