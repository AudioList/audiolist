-- 013_private_beta_schema_alignment.sql
-- Captures schema relied on by current app/hooks/scripts so fresh environments
-- are reproducible.

-- ---------------------------------------------------------------------------
-- 1) Products: fields used by UI filtering/detail views and sync scripts
-- ---------------------------------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_best_variant BOOLEAN DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS discontinued BOOLEAN DEFAULT FALSE;

ALTER TABLE products ADD COLUMN IF NOT EXISTS headphone_design TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS iem_type TEXT;

ALTER TABLE products ADD COLUMN IF NOT EXISTS sinad_db NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS asr_device_type TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS asr_recommended BOOLEAN;
ALTER TABLE products ADD COLUMN IF NOT EXISTS asr_review_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS asr_review_date TIMESTAMPTZ;

ALTER TABLE products ADD COLUMN IF NOT EXISTS power_4ohm_mw NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS power_8ohm_mw NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS power_16ohm_mw NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS power_32ohm_mw NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS power_50ohm_mw NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS power_300ohm_mw NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS power_600ohm_mw NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS power_source TEXT;

ALTER TABLE products ADD COLUMN IF NOT EXISTS pref_score NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS pref_score_wsub NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS lfx_hz NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS nbd_on_axis NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sm_pred_in_room NUMERIC;
ALTER TABLE products ADD COLUMN IF NOT EXISTS speaker_type TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS spinorama_origin TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS editorial_blurb TEXT;

UPDATE products
SET is_best_variant = TRUE
WHERE is_best_variant IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_best_variant
  ON products(category_id, is_best_variant);

-- ---------------------------------------------------------------------------
-- 2) Price history table (used by hooks and snapshot script)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  retailer_id  TEXT NOT NULL REFERENCES retailers(id),
  price        NUMERIC NOT NULL,
  in_stock     BOOLEAN DEFAULT TRUE,
  recorded_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_product_recorded
  ON price_history(product_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_history_product_retailer_recorded
  ON price_history(product_id, retailer_id, recorded_at DESC);

ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'price_history'
      AND policyname = 'price_history_select'
  ) THEN
    CREATE POLICY "price_history_select"
      ON price_history
      FOR SELECT
      USING (true);
  END IF;
END$$;
