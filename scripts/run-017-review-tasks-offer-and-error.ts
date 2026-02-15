/**
 * Applies migration 017 (review_tasks offer_link + ingest_error) to the remote Supabase DB.
 *
 * Usage:
 *   SUPABASE_DB_PASSWORD=... npx tsx scripts/run-017-review-tasks-offer-and-error.ts
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
    console.error('Set it and rerun: SUPABASE_DB_PASSWORD=... npx tsx scripts/run-017-review-tasks-offer-and-error.ts');
    process.exit(1);
  }

  const projectRef = getProjectRef();
  const encodedPassword = encodeURIComponent(dbPassword);
  const connStr = `postgresql://postgres:${encodedPassword}@db.${projectRef}.supabase.co:5432/postgres`;
  const sql = postgres(connStr, { ssl: 'require', max: 1 });

  try {
    const migrationPath = resolve('supabase/migrations/017_review_tasks_offer_and_error.sql');

    console.log('=== AudioList Migration 017 ===');
    console.log(`Project ref: ${projectRef}`);
    console.log(`Applying ${migrationPath} ...`);

    await sql`select 1`;
    await sql.file(migrationPath);

    const [check] = await sql`
      select
        exists(
          select 1
          from pg_constraint
          where conname = 'chk_review_task_type'
        ) as has_task_type_check,
        exists(
          select 1
          from pg_constraint
          where conname = 'uq_review_tasks_task_type_retailer_product'
        ) as has_unique_task_constraint
    `;

    console.log('Verification:');
    console.log(`- chk_review_task_type exists: ${check.has_task_type_check}`);
    console.log(`- uq_review_tasks_task_type_retailer_product exists: ${check.has_unique_task_constraint}`);

    if (!check.has_task_type_check || !check.has_unique_task_constraint) {
      throw new Error('Migration 017 did not apply cleanly (missing expected constraints).');
    }

    console.log('Migration 017 applied successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\nMigration 017 failed.');
    console.error(message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
