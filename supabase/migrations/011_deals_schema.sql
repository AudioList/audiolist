-- 011_deals_schema.sql
-- Adds compare_at_price, on_sale flags, and retailer_coupons table
-- for the deals & savings scanner feature.

-- ---------------------------------------------------------------------------
-- 1. Add compare_at_price to store_products (raw staging)
-- ---------------------------------------------------------------------------
ALTER TABLE store_products ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC;

-- ---------------------------------------------------------------------------
-- 2. Add compare_at_price to price_listings (final prices shown to users)
-- ---------------------------------------------------------------------------
ALTER TABLE price_listings ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC;

-- ---------------------------------------------------------------------------
-- 3. Add on_sale flag to store_products and price_listings
-- ---------------------------------------------------------------------------
ALTER TABLE store_products ADD COLUMN IF NOT EXISTS on_sale BOOLEAN DEFAULT FALSE;
ALTER TABLE price_listings ADD COLUMN IF NOT EXISTS on_sale BOOLEAN DEFAULT FALSE;

-- ---------------------------------------------------------------------------
-- 4. Retailer coupons table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS retailer_coupons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id     TEXT NOT NULL REFERENCES retailers(id),
  code            TEXT NOT NULL,
  description     TEXT NOT NULL,
  discount_type   TEXT NOT NULL,      -- 'percentage', 'fixed', 'free_shipping'
  discount_value  NUMERIC,            -- 10 for 10%, 5 for $5 off
  min_purchase    NUMERIC,            -- minimum order amount (NULL = no minimum)
  auto_apply_url  TEXT,               -- Shopify auto-apply URL template
  verified_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT TRUE,
  source          TEXT,               -- 'manual', 'validated', 'newsletter'
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(retailer_id, code)
);

ALTER TABLE retailer_coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupons_select" ON retailer_coupons FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS idx_coupons_retailer ON retailer_coupons(retailer_id);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON retailer_coupons(is_active) WHERE is_active;
