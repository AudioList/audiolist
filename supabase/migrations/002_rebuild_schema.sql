-- AudioList Schema Rebuild
-- Drops existing incompatible tables and creates the AudioList schema

-- Drop existing tables (cascade to remove dependencies)
DROP TABLE IF EXISTS build_items CASCADE;
DROP TABLE IF EXISTS builds CASCADE;
DROP VIEW IF EXISTS latest_prices CASCADE;
DROP TABLE IF EXISTS retailer_links CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;

-- Enable trigram extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Categories
CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL,
  icon        TEXT,
  has_ppi     BOOLEAN DEFAULT FALSE
);

-- 2. Products
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       TEXT UNIQUE,
  category_id     TEXT NOT NULL REFERENCES categories(id),
  name            TEXT NOT NULL,
  brand           TEXT,
  price           NUMERIC,
  image_url       TEXT,
  affiliate_url   TEXT,
  ppi_score       NUMERIC,
  ppi_stdev       NUMERIC,
  ppi_slope       NUMERIC,
  ppi_avg_error   NUMERIC,
  source_domain   TEXT,
  rig_type        TEXT,
  pinna           TEXT,
  quality         TEXT,
  specs           JSONB DEFAULT '{}',
  first_seen      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Builds
CREATE TABLE builds (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_code  TEXT UNIQUE NOT NULL,
  name        TEXT DEFAULT 'My Audio Build',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Build items
CREATE TABLE build_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id      UUID NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  category_id   TEXT NOT NULL REFERENCES categories(id),
  product_id    UUID NOT NULL REFERENCES products(id),
  custom_price  NUMERIC,
  quantity      INTEGER DEFAULT 1
);

-- Indexes
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_ppi ON products(ppi_score DESC NULLS LAST);
CREATE INDEX idx_products_brand ON products(brand);
CREATE INDEX idx_products_source_id ON products(source_id);
CREATE INDEX idx_builds_share_code ON builds(share_code);
CREATE INDEX idx_build_items_build ON build_items(build_id);

-- Row Level Security
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE builds ENABLE ROW LEVEL SECURITY;
ALTER TABLE build_items ENABLE ROW LEVEL SECURITY;

-- Everyone can read everything
CREATE POLICY "categories_select" ON categories FOR SELECT USING (true);
CREATE POLICY "products_select" ON products FOR SELECT USING (true);
CREATE POLICY "builds_select" ON builds FOR SELECT USING (true);
CREATE POLICY "build_items_select" ON build_items FOR SELECT USING (true);

-- Anyone can create builds (no auth required for MVP)
CREATE POLICY "builds_insert" ON builds FOR INSERT WITH CHECK (true);
CREATE POLICY "build_items_insert" ON build_items FOR INSERT WITH CHECK (true);

-- Seed categories
INSERT INTO categories (id, name, sort_order, icon, has_ppi) VALUES
  ('iem', 'IEMs', 1, 'headphones', true),
  ('headphone', 'Headphones', 2, 'headphones', true),
  ('dac', 'DAC', 3, 'cpu', false),
  ('amp', 'Amplifier', 4, 'zap', false),
  ('speaker', 'Speakers', 5, 'speaker', false),
  ('cable', 'Cables & Accessories', 6, 'cable', false),
  ('dap', 'DAP', 7, 'smartphone', false),
  ('microphone', 'Microphone', 8, 'mic', false);
