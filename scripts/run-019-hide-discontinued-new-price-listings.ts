/**
 * Applies migration 019 (hide discontinued-new SKUs from price_listings).
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD=... npx tsx scripts/run-019-hide-discontinued-new-price-listings.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';

import './lib/env.js';

const DEFAULT_PROJECT_REF = 'sycfaajrlnkyczrauusx';

function getProjectRef(): string {
  if (process.env.SUPABASE_PROJECT_REF?.trim()) {
    return process.env.SUPABASE_PROJECT_REF.trim();
  }

  const refPath = resolve('supabase/.temp/project-ref');
  try {
    const ref = readFileSync(refPath, 'utf-8').trim();
    if (ref) return ref;
  } catch {
    // Fall through.
  }

  return DEFAULT_PROJECT_REF;
}

async function run(): Promise<void> {
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  if (!dbPassword) {
    console.error('Error: SUPABASE_DB_PASSWORD is required.');
    console.error('Set it and rerun: SUPABASE_DB_PASSWORD=... npx tsx scripts/run-019-hide-discontinued-new-price-listings.ts');
    process.exit(1);
  }

  const projectRef = getProjectRef();
  const encodedPassword = encodeURIComponent(dbPassword);
  const connStr = `postgresql://postgres:${encodedPassword}@db.${projectRef}.supabase.co:5432/postgres`;
  const sql = postgres(connStr, { ssl: 'require', max: 1 });

  try {
    const migrationPath = resolve('supabase/migrations/019_hide_discontinued_new_price_listings.sql');

    console.log('=== AudioList Migration 019 ===');
    console.log(`Project ref: ${projectRef}`);
    console.log(`Applying ${migrationPath} ...`);

    await sql`select 1`;
    await sql.file(migrationPath);

    const [check] = await sql`
      select
        exists(
          select 1
          from information_schema.views
          where table_schema = 'public'
            and table_name = 'price_listings'
        ) as has_view
    `;

    console.log('Verification:');
    console.log(`- price_listings view exists: ${check.has_view}`);
    if (!check.has_view) throw new Error('Migration 019 did not apply cleanly (price_listings view missing).');

    console.log('Migration 019 applied successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\nMigration 019 failed.');
    console.error(message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
