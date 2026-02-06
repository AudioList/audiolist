/**
 * Run SQL migration against Supabase
 * Uses the Supabase database URL with service role JWT auth via the pooler
 * 
 * Usage: npx tsx scripts/run-migration.ts
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://sycfaajrlnkyczrauusx.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SERVICE_KEY) {
  console.error('Error: SUPABASE_SERVICE_KEY environment variable is required');
  console.error('Set it with: set SUPABASE_SERVICE_KEY=your-key-here');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function runMigration() {
  console.log('=== AudioList Database Migration ===\n');

  // Read SQL file
  const sql = readFileSync('supabase/migrations/001_initial_schema.sql', 'utf-8');
  
  // Split into individual statements (handle multiline)
  const statements = sql
    .split(/;\s*$/m)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`Found ${statements.length} SQL statements to execute\n`);

  // Try to execute via Supabase's rpc or direct query
  // Since supabase-js doesn't support DDL, we'll use fetch directly
  // against the Supabase SQL API endpoint
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
    process.stdout.write(`[${i + 1}/${statements.length}] ${preview}...`);
    
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'apikey': SERVICE_KEY as string,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: stmt }),
      });
      
      if (response.ok) {
        console.log(' OK');
      } else {
        const text = await response.text();
        console.log(` WARN: ${response.status}`);
        if (text.includes('already exists')) {
          console.log('   (already exists - skipping)');
        }
      }
    } catch (err) {
      console.log(` ERROR: ${err}`);
    }
  }

  // Verify by checking if categories table has data
  console.log('\n--- Verifying migration ---');
  const { data, error } = await supabase.from('categories').select('*');
  
  if (error) {
    console.error('Migration verification FAILED:', error.message);
    console.log('\n--- Manual migration required ---');
    console.log('Please paste the SQL from supabase/migrations/001_initial_schema.sql');
    console.log('into the Supabase SQL Editor:');
    console.log('https://supabase.com/dashboard/project/sycfaajrlnkyczrauusx/sql/new');
    return false;
  }
  
  console.log(`Categories table has ${data.length} rows`);
  if (data.length > 0) {
    console.log('Migration verified successfully!');
    return true;
  }
  
  return false;
}

runMigration().catch(console.error);
