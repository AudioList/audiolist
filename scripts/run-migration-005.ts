/**
 * run-migration-005.ts
 *
 * Executes migration 005_store_first.sql against the Supabase database.
 *
 * Usage:
 *   npx tsx scripts/run-migration-005.ts
 */

import postgres from 'postgres';

const PROJECT_REF = 'sycfaajrlnkyczrauusx';
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!DB_PASSWORD) {
  console.error('Error: SUPABASE_DB_PASSWORD env var is required');
  process.exit(1);
}

const connStr = `postgresql://postgres:${DB_PASSWORD}@db.${PROJECT_REF}.supabase.co:5432/postgres`;
const sql = postgres(connStr, { ssl: 'require' });

async function run(): Promise<void> {
  try {
    // Test connection
    const catCount = await sql`SELECT count(*) as cnt FROM categories`;
    console.log(`Connected! Current categories: ${catCount[0].cnt}`);

    // Check if migration already ran
    const tableExists = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'store_products' AND table_schema = 'public'
    `;

    if (tableExists.length > 0) {
      console.log('Migration 005 already applied (store_products table exists). Checking completeness...');

      const sourceTypeCol = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'source_type'
      `;
      console.log(`  source_type column: ${sourceTypeCol.length > 0 ? 'exists' : 'MISSING'}`);

      const inStockCol = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'in_stock'
      `;
      console.log(`  in_stock column: ${inStockCol.length > 0 ? 'exists' : 'MISSING'}`);

      const spCount = await sql`SELECT count(*) as cnt FROM store_products`;
      console.log(`  store_products rows: ${spCount[0].cnt}`);

      await sql.end();
      return;
    }

    console.log('\nRunning migration 005...\n');

    // 1. Create store_products table
    await sql`
      CREATE TABLE store_products (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        retailer_id           TEXT NOT NULL REFERENCES retailers(id),
        external_id           TEXT NOT NULL,
        title                 TEXT NOT NULL,
        vendor                TEXT,
        product_type          TEXT,
        tags                  TEXT[],
        category_id           TEXT REFERENCES categories(id),
        price                 NUMERIC,
        in_stock              BOOLEAN DEFAULT TRUE,
        image_url             TEXT,
        product_url           TEXT,
        affiliate_url         TEXT,
        raw_data              JSONB DEFAULT '{}',
        imported_at           TIMESTAMPTZ DEFAULT NOW(),
        processed             BOOLEAN DEFAULT FALSE,
        canonical_product_id  UUID REFERENCES products(id),
        UNIQUE(retailer_id, external_id)
      )
    `;
    console.log('1: Created store_products table');

    await sql`CREATE INDEX idx_sp_unprocessed ON store_products(processed) WHERE NOT processed`;
    await sql`CREATE INDEX idx_sp_category ON store_products(category_id)`;
    await sql`CREATE INDEX idx_sp_retailer ON store_products(retailer_id)`;
    console.log('1: Created indexes');

    await sql`ALTER TABLE store_products ENABLE ROW LEVEL SECURITY`;
    await sql`CREATE POLICY store_products_select ON store_products FOR SELECT USING (true)`;
    console.log('1: Enabled RLS with public SELECT');

    // 2. Add source_type to products
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'measurement'`;
    console.log('2: Added source_type column to products');

    // 3. Add in_stock to products
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS in_stock BOOLEAN DEFAULT FALSE`;
    console.log('3: Added in_stock column to products');

    // Verify
    console.log('\n--- Verification ---');
    const spExists = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'store_products' AND table_schema = 'public'
    `;
    console.log(`store_products table: ${spExists.length > 0 ? 'exists' : 'MISSING'}`);

    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'products' AND column_name IN ('source_type', 'in_stock')
    `;
    console.log(`New products columns: ${cols.length}/2`);
    for (const c of cols) {
      console.log(`  ${c.column_name}`);
    }

    console.log('\nMigration 005 complete!');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Error:', msg);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
