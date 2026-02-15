/**
 * Applies migration 020 (exclude discontinued-new offers from device_price_rollups).
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD=... npx tsx scripts/run-020-exclude-discontinued-new-from-price-rollups.ts
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
    // ignore
  }

  return DEFAULT_PROJECT_REF;
}

async function run(): Promise<void> {
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  if (!dbPassword) {
    console.error('Error: SUPABASE_DB_PASSWORD is required.');
    console.error('Set it and rerun: SUPABASE_DB_PASSWORD=... npx tsx scripts/run-020-exclude-discontinued-new-from-price-rollups.ts');
    process.exit(1);
  }

  const projectRef = getProjectRef();
  const encodedPassword = encodeURIComponent(dbPassword);
  const connStr = `postgresql://postgres:${encodedPassword}@db.${projectRef}.supabase.co:5432/postgres`;
  const sql = postgres(connStr, { ssl: 'require', max: 1 });

  try {
    const migrationPath = resolve('supabase/migrations/020_exclude_discontinued_new_from_price_rollups.sql');

    console.log('=== AudioList Migration 020 ===');
    console.log(`Project ref: ${projectRef}`);
    console.log(`Applying ${migrationPath} ...`);

    await sql`select 1`;
    await sql.file(migrationPath);

    console.log('Migration 020 applied successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\nMigration 020 failed.');
    console.error(message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
