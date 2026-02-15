-- 018_headphone_type_and_hp_accessory.sql
--
-- Adds:
--  - devices.headphone_type (active vs passive headphone facet)
--  - hp_accessory category id in categories table (if schema supports it)
--  - catalog/products views + filter options RPC support

-- ---------------------------------------------------------------------------
-- 1) devices: headphone_type facet
-- ---------------------------------------------------------------------------

ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS headphone_type TEXT;

ALTER TABLE public.devices
  DROP CONSTRAINT IF EXISTS chk_devices_headphone_type;

ALTER TABLE public.devices
  ADD CONSTRAINT chk_devices_headphone_type CHECK (
    headphone_type IS NULL OR headphone_type IN ('passive', 'active')
  );

CREATE INDEX IF NOT EXISTS idx_devices_headphone_type
  ON public.devices(headphone_type)
  WHERE headphone_type IS NOT NULL;

-- Best-effort backfill from the device name.
UPDATE public.devices
SET headphone_type = CASE
  WHEN name ~* '(wireless|bluetooth|\banc\b|noise[\s-]?cancell?ing|active noise|\bdsp\b)' THEN 'active'
  ELSE 'passive'
END
WHERE category_id = 'headphone'
  AND headphone_type IS NULL;

-- ---------------------------------------------------------------------------
-- 2) categories: add hp_accessory if possible
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  cols TEXT := 'id';
  vals TEXT := quote_literal('hp_accessory');
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'categories'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = 'hp_accessory') THEN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'name'
      ) THEN
        cols := cols || ',name';
        vals := vals || ',' || quote_literal('Headphone Accessories');
      END IF;

      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'description'
      ) THEN
        cols := cols || ',description';
        vals := vals || ',' || quote_literal('Stands, cases, adapters, and other headphone accessories');
      END IF;

      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'sort_order'
      ) THEN
        cols := cols || ',sort_order';
        vals := vals || ',22';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'icon'
      ) THEN
        cols := cols || ',icon';
        vals := vals || ',' || quote_literal('wrench');
      END IF;

      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'has_ppi'
      ) THEN
        cols := cols || ',has_ppi';
        vals := vals || ',false';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'parent_category'
      ) THEN
        cols := cols || ',parent_category';
        vals := vals || ',' || quote_literal('headphone');
      END IF;

      EXECUTE format('INSERT INTO public.categories(%s) VALUES (%s)', cols, vals);
    END IF;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 3) Read models: expose headphone_type
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.catalog_products AS
SELECT
  d.id,
  NULL::TEXT AS source_id,
  d.category_id,
  d.name,
  d.brand,
  pr.lowest_price AS price,
  d.image_url,
  pr.lowest_price_affiliate_url AS affiliate_url,
  mr.ppi_score,
  mr.ppi_stdev,
  mr.ppi_slope,
  mr.ppi_avg_error,
  mr.source_domain,
  mr.rig_type,
  mr.pinna,
  mr.quality,
  d.specs,
  d.product_family_id,
  d.variant_type,
  d.variant_value,
  'retailer'::TEXT AS source_type,
  COALESCE(pr.in_stock_any, FALSE) AS in_stock,
  d.discontinued,
  NULL::TIMESTAMPTZ AS first_seen,
  mr.sinad_db,
  mr.asr_device_type,
  mr.asr_recommended,
  mr.asr_review_url,
  mr.asr_review_date,
  mr.power_4ohm_mw,
  mr.power_8ohm_mw,
  mr.power_16ohm_mw,
  mr.power_32ohm_mw,
  mr.power_50ohm_mw,
  mr.power_300ohm_mw,
  mr.power_600ohm_mw,
  mr.power_source,
  mr.pref_score,
  mr.pref_score_wsub,
  mr.lfx_hz,
  mr.nbd_on_axis,
  mr.sm_pred_in_room,
  COALESCE(d.speaker_type, mr.speaker_type) AS speaker_type,
  mr.spinorama_origin,
  NULL::TEXT AS editorial_blurb,
  d.headphone_design,
  d.iem_type,
  d.mic_connection,
  d.mic_type,
  d.mic_pattern,
  d.driver_type,
  d.is_best_variant,
  d.created_at,
  d.updated_at,
  d.status,
  COALESCE(pr.offers_count, 0) AS offers_count,
  -- IMPORTANT: append new columns at the end so CREATE OR REPLACE VIEW
  -- does not attempt to rename existing columns.
  d.headphone_type
FROM public.devices d
LEFT JOIN public.device_price_rollups pr ON pr.device_id = d.id
LEFT JOIN public.device_measurement_rollups mr ON mr.device_id = d.id;

CREATE OR REPLACE VIEW public.products AS
SELECT
  id,
  source_id,
  category_id,
  name,
  brand,
  price,
  image_url,
  affiliate_url,
  ppi_score,
  ppi_stdev,
  ppi_slope,
  ppi_avg_error,
  source_domain,
  rig_type,
  pinna,
  quality,
  specs,
  product_family_id,
  variant_type,
  variant_value,
  source_type,
  in_stock,
  discontinued,
  first_seen,
  sinad_db,
  asr_device_type,
  asr_recommended,
  asr_review_url,
  asr_review_date,
  power_4ohm_mw,
  power_8ohm_mw,
  power_16ohm_mw,
  power_32ohm_mw,
  power_50ohm_mw,
  power_300ohm_mw,
  power_600ohm_mw,
  power_source,
  pref_score,
  pref_score_wsub,
  lfx_hz,
  nbd_on_axis,
  sm_pred_in_room,
  speaker_type,
  spinorama_origin,
  editorial_blurb,
  headphone_design,
  iem_type,
  mic_connection,
  mic_type,
  mic_pattern,
  driver_type,
  is_best_variant,
  created_at,
  updated_at,
  headphone_type
FROM public.catalog_products;

-- ---------------------------------------------------------------------------
-- 4) Filter options RPC: add headphone_types facet
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_filter_options(p_category_id TEXT)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
SELECT json_build_object(
  'brands', (
    SELECT COALESCE(json_agg(b ORDER BY b), '[]'::json)
    FROM (
      SELECT DISTINCT brand AS b
      FROM public.products
      WHERE category_id = p_category_id AND brand IS NOT NULL
    ) sub
  ),
  'retailers', (
    SELECT COALESCE(json_agg(json_build_object('id', r.id, 'name', r.name) ORDER BY r.name), '[]'::json)
    FROM public.retailers r
    WHERE r.is_active = TRUE
      AND EXISTS (
        SELECT 1
        FROM public.price_listings pl
        JOIN public.products p ON p.id = pl.product_id
        WHERE pl.retailer_id = r.id
          AND p.category_id = p_category_id
      )
  ),
  'iem_types', CASE WHEN p_category_id = 'iem' THEN (
    SELECT COALESCE(json_agg(json_build_object('value', iem_type, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
    FROM (
      SELECT iem_type, COUNT(*) cnt
      FROM public.products
      WHERE category_id = 'iem' AND is_best_variant = TRUE AND iem_type IS NOT NULL
      GROUP BY iem_type
    ) sub
  ) ELSE NULL END,
  'headphone_types', CASE WHEN p_category_id = 'headphone' THEN (
    SELECT COALESCE(json_agg(json_build_object('value', headphone_type, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
    FROM (
      SELECT headphone_type, COUNT(*) cnt
      FROM public.products
      WHERE category_id = 'headphone' AND is_best_variant = TRUE AND headphone_type IS NOT NULL
      GROUP BY headphone_type
    ) sub
  ) ELSE NULL END,
  'driver_types', CASE WHEN p_category_id IN ('iem', 'headphone') THEN (
    SELECT COALESCE(json_agg(json_build_object('value', driver_type, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
    FROM (
      SELECT driver_type, COUNT(*) cnt
      FROM public.products
      WHERE category_id = p_category_id AND is_best_variant = TRUE AND driver_type IS NOT NULL
      GROUP BY driver_type
    ) sub
  ) ELSE NULL END,
  'speaker_types', CASE WHEN p_category_id = 'speaker' THEN (
    SELECT COALESCE(json_agg(json_build_object('value', speaker_type, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
    FROM (
      SELECT speaker_type, COUNT(*) cnt
      FROM public.products
      WHERE category_id = 'speaker' AND speaker_type IS NOT NULL
      GROUP BY speaker_type
    ) sub
  ) ELSE NULL END,
  'headphone_designs', CASE WHEN p_category_id = 'headphone' THEN (
    SELECT COALESCE(json_agg(json_build_object('value', headphone_design, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
    FROM (
      SELECT headphone_design, COUNT(*) cnt
      FROM public.products
      WHERE category_id = 'headphone' AND headphone_design IS NOT NULL
      GROUP BY headphone_design
    ) sub
  ) ELSE NULL END,
  'mic_connections', CASE WHEN p_category_id = 'microphone' THEN (
    SELECT COALESCE(json_agg(json_build_object('value', mic_connection, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
    FROM (
      SELECT mic_connection, COUNT(*) cnt
      FROM public.products
      WHERE category_id = 'microphone' AND mic_connection IS NOT NULL
      GROUP BY mic_connection
    ) sub
  ) ELSE NULL END,
  'mic_types', CASE WHEN p_category_id = 'microphone' THEN (
    SELECT COALESCE(json_agg(json_build_object('value', mic_type, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
    FROM (
      SELECT mic_type, COUNT(*) cnt
      FROM public.products
      WHERE category_id = 'microphone' AND mic_type IS NOT NULL
      GROUP BY mic_type
    ) sub
  ) ELSE NULL END,
  'mic_patterns', CASE WHEN p_category_id = 'microphone' THEN (
    SELECT COALESCE(json_agg(json_build_object('value', mic_pattern, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
    FROM (
      SELECT mic_pattern, COUNT(*) cnt
      FROM public.products
      WHERE category_id = 'microphone' AND mic_pattern IS NOT NULL
      GROUP BY mic_pattern
    ) sub
  ) ELSE NULL END
);
$function$;
