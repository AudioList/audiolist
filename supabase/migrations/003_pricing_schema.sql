-- Pricing schema: retailers, price_listings, product_matches

-- Retailers registry
CREATE TABLE retailers (
  id                      TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  base_url                TEXT NOT NULL,
  shop_domain             TEXT,
  api_type                TEXT NOT NULL,  -- 'shopify', 'bestbuy', 'manual'
  affiliate_tag           TEXT,
  affiliate_url_template  TEXT,           -- '{product_url}?sca_ref=...'
  is_active               BOOLEAN DEFAULT TRUE,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Price listings (one per product per retailer)
CREATE TABLE price_listings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  retailer_id     TEXT NOT NULL REFERENCES retailers(id),
  external_id     TEXT,
  price           NUMERIC NOT NULL,
  currency        TEXT DEFAULT 'USD',
  in_stock        BOOLEAN DEFAULT TRUE,
  product_url     TEXT,
  affiliate_url   TEXT,
  image_url       TEXT,
  last_checked    TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, retailer_id)
);

-- Fuzzy match candidates for admin review
CREATE TABLE product_matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  retailer_id     TEXT NOT NULL REFERENCES retailers(id),
  external_id     TEXT NOT NULL,
  external_name   TEXT NOT NULL,
  external_price  NUMERIC,
  match_score     NUMERIC,
  status          TEXT DEFAULT 'pending',  -- pending | approved | rejected
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, retailer_id)
);

-- Indexes
CREATE INDEX idx_price_listings_product ON price_listings(product_id);
CREATE INDEX idx_price_listings_retailer ON price_listings(retailer_id);
CREATE INDEX idx_price_listings_last_checked ON price_listings(last_checked);
CREATE INDEX idx_product_matches_status ON product_matches(status);
CREATE INDEX idx_product_matches_product ON product_matches(product_id);

-- RLS
ALTER TABLE retailers ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_matches ENABLE ROW LEVEL SECURITY;

-- Public read for retailers and price_listings
CREATE POLICY "retailers_select" ON retailers FOR SELECT USING (true);
CREATE POLICY "price_listings_select" ON price_listings FOR SELECT USING (true);
-- product_matches: no public read (admin only via service key)

-- Seed retailers
INSERT INTO retailers (id, name, base_url, shop_domain, api_type, affiliate_tag, affiliate_url_template) VALUES
  ('bestbuy', 'Best Buy', 'https://www.bestbuy.com', NULL, 'bestbuy', NULL, NULL),
  ('linsoul', 'Linsoul', 'https://www.linsoul.com', 'www.linsoul.com', 'shopify', '10584615.Cbtqoz7npA', '{product_url}?sca_ref=10584615.Cbtqoz7npA'),
  ('shenzhenaudio', 'Shenzhen Audio', 'https://shenzhenaudio.com', 'shenzhenaudio.com', 'shopify', 'tMRVrIMYdO', '{base_url}/products/{handle}?utm_source=Growave&utm_medium=referral&utm_campaign=referral_program&utm_content=tMRVrIMYdO&ref=tMRVrIMYdO&referralContext=eyJzZW5kZXJJZCI6InZJZWV1cTgydExiK1FGZ0lIMFU0QXhhcVJvbEpsQT09In0%3D'),
  ('amazon', 'Amazon', 'https://www.amazon.com', NULL, 'manual', 'lecrampeq-20', 'https://www.amazon.com/dp/{external_id}?tag=lecrampeq-20'),
  ('hifigo', 'HiFiGo', 'https://hifigo.com', 'hifigo.com', 'shopify', NULL, NULL),
  ('headphones', 'Headphones.com', 'https://www.headphones.com', 'www.headphones.com', 'shopify', NULL, NULL),
  ('headamp', 'HeadAmp', 'https://www.headamp.com', 'www.headamp.com', 'shopify', NULL, NULL),
  ('moonaudio', 'Moon Audio', 'https://www.moon-audio.com', 'www.moon-audio.com', 'shopify', NULL, NULL),
  ('musicteck', 'MusicTeck', 'https://shop.musicteck.com', 'shop.musicteck.com', 'shopify', NULL, NULL),
  ('bloomaudio', 'Bloom Audio', 'https://bloomaudio.com', 'bloomaudio.com', 'shopify', NULL, NULL),
  ('aposaudio', 'Apos Audio', 'https://apos.audio', 'apos.audio', 'shopify', NULL, NULL);
