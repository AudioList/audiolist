/**
 * Applies migration 018 (headphone_type + hp_accessory category) to the remote Supabase DB.
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD=... npx tsx scripts/run-018-headphone-type-and-hp-accessory.ts
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
    // Fall through to default.
  }

  return DEFAULT_PROJECT_REF;
}

async function run(): Promise<void> {
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  if (!dbPassword) {
    console.error('Error: SUPABASE_DB_PASSWORD is required.');
    console.error('Set it and rerun: SUPABASE_DB_PASSWORD=... npx tsx scripts/run-018-headphone-type-and-hp-accessory.ts');
    process.exit(1);
  }

  const projectRef = getProjectRef();
  const encodedPassword = encodeURIComponent(dbPassword);
  const connStr = `postgresql://postgres:${encodedPassword}@db.${projectRef}.supabase.co:5432/postgres`;
  const sql = postgres(connStr, { ssl: 'require', max: 1 });

  try {
    const migrationPath = resolve('supabase/migrations/018_headphone_type_and_hp_accessory.sql');

    console.log('=== AudioList Migration 018 ===');
    console.log(`Project ref: ${projectRef}`);
    console.log(`Applying ${migrationPath} ...`);

    await sql`select 1`;
    await sql.file(migrationPath);

    const [check] = await sql`
      select
        exists(
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'devices'
            and column_name = 'headphone_type'
        ) as has_headphone_type,
        exists(
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'catalog_products'
            and column_name = 'headphone_type'
        ) as view_has_headphone_type,
        exists(
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'products'
            and column_name = 'headphone_type'
        ) as products_view_has_headphone_type
    `;

    console.log('Verification:');
    console.log(`- devices.headphone_type column: ${check.has_headphone_type}`);
    console.log(`- catalog_products.headphone_type column: ${check.view_has_headphone_type}`);
    console.log(`- products.headphone_type column: ${check.products_view_has_headphone_type}`);

    if (!check.has_headphone_type || !check.view_has_headphone_type || !check.products_view_has_headphone_type) {
      throw new Error('Migration 018 did not apply cleanly (missing expected columns/views).');
    }

    console.log('Migration 018 applied successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\nMigration 018 failed.');
    console.error(message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
