-- 004_product_families.sql
-- Adds product families, variant tracking, accessory categories, and first-party retailers.

-- ---------------------------------------------------------------------------
-- 1a. Add parent_category to categories
-- ---------------------------------------------------------------------------
ALTER TABLE categories ADD COLUMN parent_category TEXT REFERENCES categories(id);

-- ---------------------------------------------------------------------------
-- 1b. Insert accessory categories
-- ---------------------------------------------------------------------------
INSERT INTO categories (id, name, sort_order, icon, has_ppi, parent_category) VALUES
  ('iem_tips',   'IEM Eartips',            10, 'circle-dot', false, 'iem'),
  ('iem_cable',  'IEM Cables',             11, 'cable',      false, 'iem'),
  ('iem_filter', 'IEM Filters & Modules',  12, 'filter',     false, 'iem'),
  ('hp_pads',    'Headphone Earpads',      20, 'disc',       false, 'headphone'),
  ('hp_cable',   'Headphone Cables',       21, 'cable',      false, 'headphone');

-- ---------------------------------------------------------------------------
-- 1c. Create product_families table
-- ---------------------------------------------------------------------------
CREATE TABLE product_families (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name  TEXT NOT NULL,
  base_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  category_id     TEXT NOT NULL REFERENCES categories(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_product_families_category ON product_families(category_id);
CREATE INDEX idx_product_families_canonical ON product_families(canonical_name);

ALTER TABLE product_families ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_families_select" ON product_families FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- 1d. Add variant columns to products
-- ---------------------------------------------------------------------------
ALTER TABLE products ADD COLUMN product_family_id UUID REFERENCES product_families(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN variant_type TEXT;
ALTER TABLE products ADD COLUMN variant_value TEXT;

CREATE INDEX idx_products_family ON products(product_family_id);

-- ---------------------------------------------------------------------------
-- 1e. Insert first-party retailers
-- ---------------------------------------------------------------------------
INSERT INTO retailers (id, name, base_url, shop_domain, api_type, affiliate_tag, affiliate_url_template, is_active) VALUES
  ('64audio',       '64 Audio',       'https://www.64audio.com',       'www.64audio.com',       'shopify', NULL, NULL, true),
  ('campfireaudio', 'Campfire Audio', 'https://www.campfireaudio.com', 'www.campfireaudio.com', 'shopify', NULL, NULL, true),
  ('dekoniaudio',   'Dekoni Audio',   'https://dekoniaudio.com',       'dekoniaudio.com',       'shopify', NULL, NULL, true),
  ('audeze',        'Audeze',         'https://www.audeze.com',        'www.audeze.com',        'shopify', NULL, NULL, true);
