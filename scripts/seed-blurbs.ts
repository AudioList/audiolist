/**
 * Seed editorial blurbs for popular products.
 * Run: npx tsx scripts/seed-blurbs.ts
 */
import { getSupabase } from './config/retailers';

interface Blurb {
  id: string;
  blurb: string;
}

const BLURBS: Blurb[] = [
  // IEMs
  {
    id: '8b69b261-f645-41c3-ab29-925f2aae76bc', // Truthear Hexa
    blurb: 'One of the highest-scoring IEMs in PPI measurements at its price point. The Hexa delivers a remarkably neutral and detailed sound that punches well above its weight, making it a go-to recommendation for those seeking accurate tuning on a budget.',
  },
  {
    id: 'e0a42fc1-f391-4ed6-9616-fcbcd290a05e', // ARPEGEAR HANE DDDU
    blurb: 'An impressive performer from a newer brand, the HANE scores exceptionally well in objective measurements. Its dynamic driver configuration delivers a natural, well-balanced sound with excellent tonal accuracy.',
  },
  {
    id: 'a8e549de-b98e-4d4c-998f-9077012cf598', // TANGZU x HBB NV
    blurb: 'A collaboration with well-known reviewer HBB that nails the tuning. This IEM offers an engaging listen with a slightly warm tilt while maintaining excellent measurement performance, making it great for both critical and casual listening.',
  },
  {
    id: 'a64fd45a-de82-4d69-b01b-7e6794ba5d4a', // Moondrop Space Travel Reference
    blurb: 'Moondrop continues to push the value envelope. The Space Travel Reference delivers remarkably accurate sound at an astonishing price, proving that great audio does not have to be expensive. A standout choice for beginners.',
  },
  {
    id: 'a8955851-976a-4be8-ad9b-b2237a70d5fb', // Tangzu Wan'er SE
    blurb: 'At under $20, the Wan\'er SE is one of the best values in audio. It scores surprisingly well in objective measurements and delivers a clean, balanced sound that makes it the default recommendation for anyone just starting their audio journey.',
  },
  {
    id: '3204cdf8-8b3d-47f1-a439-6c16b584aea5', // KZ D-FI UDDD
    blurb: 'The D-FI is a unique IEM with switchable tuning filters that let you customize the sound signature. The UDDD configuration scores exceptionally well, delivering reference-quality tuning at a fraction of the expected cost.',
  },
  {
    id: 'e2d8d99c-3d9e-4333-a14b-1a513783091e', // Moondrop Aria
    blurb: 'A modern classic in the budget IEM space. The Aria offers a smooth, musical sound with a slight warm tilt that works beautifully across genres. Its excellent build quality and included accessories make it a complete package.',
  },
  {
    id: '8e7d6f19-1bdb-4217-87d1-03a171b5980a', // Moondrop Chu 2
    blurb: 'The Chu 2 proves that exceptional audio quality can come in a tiny, affordable package. With solid PPI scores and Moondrop\'s signature tuning expertise, this is the IEM to beat at the sub-$25 price point.',
  },
  {
    id: 'd3594a56-86b1-4e8d-a40b-5a3e478f4be1', // 7Hz Salnotes Dioko
    blurb: 'A planar magnetic IEM at a remarkably accessible price point. The Dioko delivers the fast transient response and detailed sound that planar drivers are known for, with excellent objective measurements to back it up.',
  },
  {
    id: '8b407dc6-ec51-488e-ad38-193bafff9e00', // 7Hz Salnotes Zero
    blurb: 'The Salnotes Zero is widely regarded as one of the best entry-level IEMs ever made. Its surprisingly good tuning and comfortable fit have made it a staple recommendation across audio communities worldwide.',
  },

  // Headphones
  {
    id: 'f4bd9f1c-037d-4eff-84e0-786233bce959', // HiFiMAN Sundara
    blurb: 'The Sundara is the gateway into planar magnetic headphones for many enthusiasts. It offers speed, detail, and an open soundstage that dynamic drivers struggle to match at this price. A cornerstone of the mid-fi headphone world.',
  },
  {
    id: 'c29b48a5-8cfc-43d8-960e-50fb930b79e3', // HiFiMAN Arya Organic
    blurb: 'The Arya Organic brings HiFiMAN\'s flagship-level planar technology to a more accessible price. Known for its massive soundstage and incredible resolution, it is a top pick for those who want the best detail retrieval without going to summit-fi prices.',
  },

  // DACs
  {
    id: 'c95afed2-21f2-4d81-99be-d7f6ab7f1399', // FiiO KA11
    blurb: 'A tiny dongle DAC that punches far above its weight. With 110 dB SINAD, the KA11 delivers clean, transparent audio from your phone or laptop. One of the simplest and most effective upgrades for mobile listeners.',
  },
  {
    id: 'e20f396c-ed88-4b1b-bd1d-b2e18c15dc97', // FiiO KA15
    blurb: 'The KA15 pushes dongle DAC performance to impressive heights with 115 dB SINAD. Its dual DAC chip design delivers pristine audio quality in a portable form factor, with both single-ended and balanced outputs.',
  },

  // Speakers
  {
    id: 'a8a9ffbd-5bb6-4cdf-bb7b-7b644430c3a3', // KEF LS50 Meta
    blurb: 'The LS50 Meta is KEF\'s legendary compact speaker refined with their Metamaterial Absorption Technology. It delivers a stunningly accurate and detailed sound from a bookshelf-sized form factor, earning it countless awards and recommendations.',
  },
  {
    id: '39cf15be-41af-46b5-8d71-510e126ae346', // KEF LS60 Wireless
    blurb: 'An all-in-one active speaker system that eliminates the need for separate amps and DACs. The LS60 Wireless combines KEF\'s acclaimed driver technology with powerful built-in amplification and streaming capabilities.',
  },
];

async function main() {
  const supabase = getSupabase();

  console.log(`Seeding editorial blurbs for ${BLURBS.length} products...`);

  for (const { id, blurb } of BLURBS) {
    const { error } = await supabase
      .from('products')
      .update({ editorial_blurb: blurb })
      .eq('id', id);

    if (error) {
      console.error(`  Failed to update ${id}: ${error.message}`);
    } else {
      console.log(`  Updated ${id}`);
    }
  }

  console.log('Done.');
}

main().catch(console.error);
