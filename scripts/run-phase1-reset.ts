/**
 * Runs the destructive Phase 1 schema migrations against Supabase.
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD=... npx tsx scripts/run-phase1-reset.ts
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

function getMigrations(): string[] {
  return [
    resolve('supabase/migrations/014_retailer_first_destructive_reset.sql'),
    resolve('supabase/migrations/015_retailer_first_access_and_read_models.sql'),
  ];
}

async function run(): Promise<void> {
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  if (!dbPassword) {
    console.error('Error: SUPABASE_DB_PASSWORD is required.');
    console.error('Set it and rerun: SUPABASE_DB_PASSWORD=... npx tsx scripts/run-phase1-reset.ts');
    process.exit(1);
  }

  const projectRef = getProjectRef();
  const encodedPassword = encodeURIComponent(dbPassword);
  const connStr = `postgresql://postgres:${encodedPassword}@db.${projectRef}.supabase.co:5432/postgres`;
  const sql = postgres(connStr, { ssl: 'require', max: 1 });

  try {
    console.log('=== AudioList Phase 1 Destructive Reset ===');
    console.log(`Project ref: ${projectRef}`);
    console.log('Connecting...');

    await sql`select 1`;
    console.log('Connection established.');

    for (const migrationPath of getMigrations()) {
      console.log(`\nApplying ${migrationPath} ...`);
      await sql.file(migrationPath);
      console.log('Applied.');
    }

    console.log('\nRunning verification checks...');

    const [tableChecks, viewChecks, functionChecks, policyChecks] = await Promise.all([
      sql`
        select
          exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'devices') as has_devices,
          exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'retailer_products') as has_retailer_products,
          exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'measurements') as has_measurements,
          exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'device_measurement_links') as has_links
      `,
      sql`
        select
          exists(select 1 from information_schema.views where table_schema = 'public' and table_name = 'catalog_products') as has_catalog_products,
          exists(select 1 from information_schema.views where table_schema = 'public' and table_name = 'measurement_lab') as has_measurement_lab,
          exists(select 1 from information_schema.views where table_schema = 'public' and table_name = 'products') as has_compat_products,
          exists(select 1 from information_schema.views where table_schema = 'public' and table_name = 'price_listings') as has_compat_price_listings
      `,
      sql`
        select
          exists(select 1 from pg_proc where proname = 'get_filter_options') as has_get_filter_options,
          exists(select 1 from pg_proc where proname = 'refresh_all_rollups') as has_refresh_all_rollups,
          exists(select 1 from pg_proc where proname = 'enforce_device_measurement_category_match') as has_category_trigger_fn
      `,
      sql`
        select count(*)::int as policy_count
        from pg_policies
        where schemaname = 'public'
          and tablename in (
            'devices',
            'device_offers',
            'measurements',
            'device_measurement_links',
            'device_price_rollups',
            'device_measurement_rollups'
          )
      `,
    ]);

    console.log('Verification summary:');
    console.log(`- tables: ${JSON.stringify(tableChecks[0])}`);
    console.log(`- views: ${JSON.stringify(viewChecks[0])}`);
    console.log(`- functions: ${JSON.stringify(functionChecks[0])}`);
    console.log(`- policy count: ${policyChecks[0].policy_count}`);
    console.log('\nPhase 1 migrations applied successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\nPhase 1 migration failed.');
    console.error(message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
