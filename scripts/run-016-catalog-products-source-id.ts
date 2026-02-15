/**
 * Applies migration 016 (catalog_products source_id) to the remote Supabase DB.
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD=... npx tsx scripts/run-016-catalog-products-source-id.ts
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
    console.error('Set it and rerun: SUPABASE_DB_PASSWORD=... npx tsx scripts/run-016-catalog-products-source-id.ts');
    process.exit(1);
  }

  const projectRef = getProjectRef();
  const encodedPassword = encodeURIComponent(dbPassword);
  const connStr = `postgresql://postgres:${encodedPassword}@db.${projectRef}.supabase.co:5432/postgres`;
  const sql = postgres(connStr, { ssl: 'require', max: 1 });

  try {
    const migrationPath = resolve('supabase/migrations/016_catalog_products_source_id.sql');

    console.log('=== AudioList Migration 016 ===');
    console.log(`Project ref: ${projectRef}`);
    console.log(`Applying ${migrationPath} ...`);

    await sql`select 1`;
    await sql.file(migrationPath);

    const [check] = await sql`
      select
        exists(select 1 from information_schema.views where table_schema = 'public' and table_name = 'catalog_products') as has_catalog_products,
        exists(
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'catalog_products'
            and column_name = 'source_id'
        ) as has_source_id
    `;

    console.log('Verification:');
    console.log(`- catalog_products: ${check.has_catalog_products}`);
    console.log(`- catalog_products.source_id column: ${check.has_source_id}`);
    console.log('Migration 016 applied successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\nMigration 016 failed.');
    console.error(message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
