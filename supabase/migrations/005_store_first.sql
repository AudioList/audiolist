-- 005_store_first.sql
-- Adds store_products staging table for bulk catalog imports,
-- source_type tracking, and in_stock flag for sort ordering.

-- ---------------------------------------------------------------------------
-- 1. Raw store catalog staging table
-- ---------------------------------------------------------------------------
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
);

CREATE INDEX idx_sp_unprocessed ON store_products(processed) WHERE NOT processed;
CREATE INDEX idx_sp_category ON store_products(category_id);
CREATE INDEX idx_sp_retailer ON store_products(retailer_id);

ALTER TABLE store_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_products_select" ON store_products FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- 2. Track product origin on products table
-- ---------------------------------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'measurement';
-- Values: 'measurement' (Squig-Rank), 'store' (retailer catalog), 'merged' (both)

-- ---------------------------------------------------------------------------
-- 3. Add in_stock flag to products for sort ordering
-- ---------------------------------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS in_stock BOOLEAN DEFAULT FALSE;
