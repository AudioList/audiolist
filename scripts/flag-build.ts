/**
 * flag-build.ts
 *
 * Admin moderation tool for community builds.
 * Flags or unflags a build by share code, hiding it from the community listing.
 *
 * Usage:
 *   npx tsx scripts/flag-build.ts <share_code>
 *   npx tsx scripts/flag-build.ts <share_code> --unflag
 */

import { getSupabase } from './config/retailers.ts';

const shareCode = process.argv[2];
const unflag = process.argv.includes('--unflag');

if (!shareCode) {
  console.error('Usage: npx tsx scripts/flag-build.ts <share_code> [--unflag]');
  process.exit(1);
}

async function main() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('builds')
    .update({
      is_flagged: !unflag,
      flagged_at: unflag ? null : new Date().toISOString(),
    })
    .eq('share_code', shareCode)
    .select('id, share_code, name, is_public, is_flagged, author_name')
    .single();

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  if (!data) {
    console.error(`No build found with share code: ${shareCode}`);
    process.exit(1);
  }

  console.log(unflag ? 'Unflagged:' : 'Flagged:', data);
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
