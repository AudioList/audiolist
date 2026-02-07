/**
 * Seed retailer trust information (description, ships_from, return_policy, authorized_dealer).
 * Run: npx tsx scripts/seed-retailer-trust.ts
 */
import { getSupabase } from './config/retailers';

interface RetailerTrust {
  id: string;
  description: string;
  ships_from: string;
  return_policy: string;
  authorized_dealer: boolean;
}

const RETAILER_TRUST_DATA: RetailerTrust[] = [
  {
    id: '64audio',
    description: 'Premium IEM manufacturer selling direct. Known for high-end custom and universal IEMs.',
    ships_from: 'US (Oregon)',
    return_policy: '30-day return',
    authorized_dealer: true,
  },
  {
    id: 'amazon',
    description: 'Major online marketplace with fast shipping. Check seller ratings for third-party listings.',
    ships_from: 'US (various warehouses)',
    return_policy: '30-day return',
    authorized_dealer: false,
  },
  {
    id: 'aperionaudio',
    description: 'Speaker manufacturer selling direct. Specializes in home theater and hi-fi speakers.',
    ships_from: 'US (Oregon)',
    return_policy: '30-day return',
    authorized_dealer: true,
  },
  {
    id: 'aposaudio',
    description: 'Authorized dealer for many audiophile brands. Curated selection of DACs, amps, and headphones.',
    ships_from: 'US (California)',
    return_policy: '30-day return',
    authorized_dealer: true,
  },
  {
    id: 'audeze',
    description: 'Planar magnetic headphone manufacturer selling direct. Known for LCD series headphones.',
    ships_from: 'US (California)',
    return_policy: '30-day return',
    authorized_dealer: true,
  },
  {
    id: 'bestbuy',
    description: 'Large electronics retailer with physical stores for in-person pickup and returns.',
    ships_from: 'US (various)',
    return_policy: '15-day return',
    authorized_dealer: true,
  },
  {
    id: 'bloomaudio',
    description: 'Specialty audio retailer. Authorized dealer for premium IEM and headphone brands.',
    ships_from: 'US (California)',
    return_policy: '30-day return',
    authorized_dealer: true,
  },
  {
    id: 'buchardtaudio',
    description: 'Danish speaker manufacturer selling direct. Known for active speakers with DSP.',
    ships_from: 'Denmark / EU',
    return_policy: '30-day return',
    authorized_dealer: true,
  },
  {
    id: 'campfireaudio',
    description: 'IEM manufacturer selling direct. Handmade in Portland, Oregon.',
    ships_from: 'US (Oregon)',
    return_policy: '30-day return',
    authorized_dealer: true,
  },
  {
    id: 'dekoniaudio',
    description: 'Headphone pad and accessory manufacturer. Specializes in premium replacement pads.',
    ships_from: 'US (New Hampshire)',
    return_policy: '30-day return',
    authorized_dealer: true,
  },
  {
    id: 'emotiva',
    description: 'Audio electronics manufacturer selling direct. Amplifiers, DACs, and speakers.',
    ships_from: 'US (Tennessee)',
    return_policy: '30-day return',
    authorized_dealer: true,
  },
  {
    id: 'headamp',
    description: 'Boutique headphone amplifier manufacturer. Hand-built amps including the legendary Blue Hawaii.',
    ships_from: 'US (Virginia)',
    return_policy: '14-day return',
    authorized_dealer: true,
  },
  {
    id: 'headphones',
    description: 'Specialty headphone retailer with expert staff. Authorized dealer for premium brands.',
    ships_from: 'US (Oregon)',
    return_policy: '365-day return',
    authorized_dealer: true,
  },
  {
    id: 'hifigo',
    description: 'Online audio retailer specializing in Chi-Fi and portable audio gear.',
    ships_from: 'China / US warehouse',
    return_policy: '15-day return',
    authorized_dealer: true,
  },
  {
    id: 'jamo',
    description: 'Danish speaker brand. Part of the Klipsch Group, known for affordable home speakers.',
    ships_from: 'US',
    return_policy: '30-day return',
    authorized_dealer: true,
  },
  {
    id: 'kef',
    description: 'British speaker manufacturer. Known for Uni-Q driver technology and LS50 series.',
    ships_from: 'US',
    return_policy: '30-day return',
    authorized_dealer: true,
  },
  {
    id: 'linsoul',
    description: 'Popular Chi-Fi retailer with a wide selection of budget to mid-range IEMs.',
    ships_from: 'China / US warehouse',
    return_policy: '15-day return',
    authorized_dealer: true,
  },
  {
    id: 'moonaudio',
    description: 'Specialty audio retailer and custom cable maker. Authorized dealer for many premium brands.',
    ships_from: 'US (North Carolina)',
    return_policy: '30-day return',
    authorized_dealer: true,
  },
  {
    id: 'musicteck',
    description: 'Authorized dealer for high-end IEMs and portable audio. Known for excellent customer service.',
    ships_from: 'US (California)',
    return_policy: '7-day return',
    authorized_dealer: true,
  },
  {
    id: 'peachtreeaudio',
    description: 'Audio electronics manufacturer. Known for integrated amplifiers and powered speakers.',
    ships_from: 'US',
    return_policy: '30-day return',
    authorized_dealer: true,
  },
  {
    id: 'psaudio',
    description: 'High-end audio manufacturer. Known for DACs, power regenerators, and speakers.',
    ships_from: 'US (Colorado)',
    return_policy: '30-day return',
    authorized_dealer: true,
  },
  {
    id: 'qacoustics',
    description: 'British speaker brand offering great value. Known for the 3000i series.',
    ships_from: 'US / UK',
    return_policy: '30-day return',
    authorized_dealer: true,
  },
  {
    id: 'rel',
    description: 'British subwoofer specialist. Premium subwoofers designed for music and home theater.',
    ships_from: 'US',
    return_policy: '30-day return',
    authorized_dealer: true,
  },
  {
    id: 'schiit',
    description: 'American DAC and amplifier manufacturer. Known for affordable, high-value audio gear.',
    ships_from: 'US (California)',
    return_policy: '15-day return',
    authorized_dealer: true,
  },
  {
    id: 'shenzhenaudio',
    description: 'Large Chinese audio retailer. Wide selection of IEMs, DAPs, and portable audio.',
    ships_from: 'China',
    return_policy: '15-day return',
    authorized_dealer: true,
  },
  {
    id: 'svsound',
    description: 'Subwoofer and speaker manufacturer selling direct. Known for high-performance subwoofers.',
    ships_from: 'US (Ohio)',
    return_policy: '45-day return',
    authorized_dealer: true,
  },
  {
    id: 'trianglehifi',
    description: 'French speaker manufacturer. Known for lively, detailed sound at various price points.',
    ships_from: 'France / US',
    return_policy: '30-day return',
    authorized_dealer: true,
  },
  {
    id: 'wharfedale',
    description: 'Historic British speaker brand. Known for excellent value speakers like the Diamond series.',
    ships_from: 'US',
    return_policy: '30-day return',
    authorized_dealer: true,
  },
];

async function main() {
  const supabase = getSupabase();

  console.log(`Seeding trust data for ${RETAILER_TRUST_DATA.length} retailers...`);

  for (const trust of RETAILER_TRUST_DATA) {
    const { error } = await supabase
      .from('retailers')
      .update({
        description: trust.description,
        ships_from: trust.ships_from,
        return_policy: trust.return_policy,
        authorized_dealer: trust.authorized_dealer,
      })
      .eq('id', trust.id);

    if (error) {
      console.error(`  Failed to update ${trust.id}: ${error.message}`);
    } else {
      console.log(`  Updated ${trust.id}`);
    }
  }

  console.log('Done.');
}

main().catch(console.error);
