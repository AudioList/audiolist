/**
 * run-migration-004.ts
 *
 * Executes migration 004_product_families.sql against the Supabase database.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=<key> npx tsx scripts/run-migration-004.ts
 */

import postgres from 'postgres';

const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SERVICE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_KEY is not set.');
  process.exit(1);
}

const PROJECT_REF = 'sycfaajrlnkyczrauusx';

// Use direct connection (not pooler) for DDL operations
const connStr = `postgresql://postgres:${SERVICE_KEY}@db.${PROJECT_REF}.supabase.co:5432/postgres`;
const sql = postgres(connStr, { ssl: 'require' });

async function run(): Promise<void> {
  try {
    // Test connection
    const catCount = await sql`SELECT count(*) as cnt FROM categories`;
    console.log(`Connected! Current categories: ${catCount[0].cnt}`);

    // Check if migration already ran
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'categories' AND column_name = 'parent_category'
    `;
    if (cols.length > 0) {
      console.log('Migration 004 already applied (parent_category column exists). Checking completeness...');

      // Check new categories
      const newCats = await sql`SELECT id FROM categories WHERE parent_category IS NOT NULL`;
      console.log(`  Accessory categories: ${newCats.length}/5`);

      // Check product_families table
      const famExists = await sql`
        SELECT table_name FROM information_schema.tables WHERE table_name = 'product_families'
      `;
      console.log(`  product_families table: ${famExists.length > 0 ? 'exists' : 'MISSING'}`);

      // Check variant columns
      const varCols = await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'products' AND column_name IN ('product_family_id', 'variant_type', 'variant_value')
      `;
      console.log(`  Variant columns: ${varCols.length}/3`);

      // Check retailers
      const rets = await sql`
        SELECT id FROM retailers WHERE id IN ('64audio', 'campfireaudio', 'dekoniaudio', 'audeze')
      `;
      console.log(`  First-party retailers: ${rets.length}/4`);

      await sql.end();
      return;
    }

    console.log('\nRunning migration 004...\n');

    // 1a: Add parent_category
    await sql`ALTER TABLE categories ADD COLUMN parent_category TEXT REFERENCES categories(id)`;
    console.log('1a: Added parent_category column');

    // 1b: Insert accessory categories
    await sql`
      INSERT INTO categories (id, name, sort_order, icon, has_ppi, parent_category) VALUES
        ('iem_tips',   'IEM Eartips',            10, 'circle-dot', false, 'iem'),
        ('iem_cable',  'IEM Cables',             11, 'cable',      false, 'iem'),
        ('iem_filter', 'IEM Filters & Modules',  12, 'filter',     false, 'iem'),
        ('hp_pads',    'Headphone Earpads',      20, 'disc',       false, 'headphone'),
        ('hp_cable',   'Headphone Cables',       21, 'cable',      false, 'headphone')
    `;
    console.log('1b: Inserted 5 accessory categories');

    // 1c: Create product_families table
    await sql`
      CREATE TABLE product_families (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        canonical_name  TEXT NOT NULL,
        base_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
        category_id     TEXT NOT NULL REFERENCES categories(id),
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    console.log('1c: Created product_families table');

    await sql`CREATE INDEX idx_product_families_category ON product_families(category_id)`;
    await sql`CREATE INDEX idx_product_families_canonical ON product_families(canonical_name)`;
    await sql`ALTER TABLE product_families ENABLE ROW LEVEL SECURITY`;
    await sql`CREATE POLICY product_families_select ON product_families FOR SELECT USING (true)`;
    console.log('1c: Created indexes and RLS policy');

    // 1d: Add variant columns to products
    await sql`ALTER TABLE products ADD COLUMN product_family_id UUID REFERENCES product_families(id) ON DELETE SET NULL`;
    await sql`ALTER TABLE products ADD COLUMN variant_type TEXT`;
    await sql`ALTER TABLE products ADD COLUMN variant_value TEXT`;
    await sql`CREATE INDEX idx_products_family ON products(product_family_id)`;
    console.log('1d: Added variant columns to products');

    // 1e: Insert first-party retailers
    await sql`
      INSERT INTO retailers (id, name, base_url, shop_domain, api_type, affiliate_tag, affiliate_url_template, is_active) VALUES
        ('64audio',       '64 Audio',       'https://www.64audio.com',       'www.64audio.com',       'shopify', NULL, NULL, true),
        ('campfireaudio', 'Campfire Audio', 'https://www.campfireaudio.com', 'www.campfireaudio.com', 'shopify', NULL, NULL, true),
        ('dekoniaudio',   'Dekoni Audio',   'https://dekoniaudio.com',       'dekoniaudio.com',       'shopify', NULL, NULL, true),
        ('audeze',        'Audeze',         'https://www.audeze.com',        'www.audeze.com',        'shopify', NULL, NULL, true)
    `;
    console.log('1e: Inserted 4 first-party retailers');

    // Verify
    console.log('\n--- Verification ---');
    const newCats = await sql`SELECT id, name FROM categories WHERE parent_category IS NOT NULL`;
    console.log(`Accessory categories: ${newCats.length}`);
    for (const c of newCats) {
      console.log(`  ${c.id}: ${c.name}`);
    }

    const rets = await sql`SELECT id, name FROM retailers WHERE id IN ('64audio', 'campfireaudio', 'dekoniaudio', 'audeze')`;
    console.log(`First-party retailers: ${rets.length}`);
    for (const r of rets) {
      console.log(`  ${r.id}: ${r.name}`);
    }

    const varCols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'products' AND column_name IN ('product_family_id', 'variant_type', 'variant_value')
    `;
    console.log(`Variant columns on products: ${varCols.length}/3`);

    console.log('\nMigration 004 complete!');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Error:', msg);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
