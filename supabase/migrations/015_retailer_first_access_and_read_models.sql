-- 015_retailer_first_access_and_read_models.sql
--
-- Phase 1 continuation for destructive retailer-first schema:
-- - RLS policies
-- - rollup refresh functions and triggers
-- - read models and compatibility views
-- - filter-options RPC

-- ---------------------------------------------------------------------------
-- 1) Enable RLS on new tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.retailer_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurement_squig ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurement_asr ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.measurement_spinorama ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_measurement_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_price_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_measurement_rollups ENABLE ROW LEVEL SECURITY;

-- Public read tables. Raw ingestion and review queue remain private.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'device_families' AND policyname = 'device_families_select'
  ) THEN
    CREATE POLICY "device_families_select" ON public.device_families FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'devices' AND policyname = 'devices_select'
  ) THEN
    CREATE POLICY "devices_select" ON public.devices FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'device_offers' AND policyname = 'device_offers_select'
  ) THEN
    CREATE POLICY "device_offers_select" ON public.device_offers FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'device_price_history' AND policyname = 'device_price_history_select'
  ) THEN
    CREATE POLICY "device_price_history_select" ON public.device_price_history FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'measurements' AND policyname = 'measurements_select'
  ) THEN
    CREATE POLICY "measurements_select" ON public.measurements FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'measurement_squig' AND policyname = 'measurement_squig_select'
  ) THEN
    CREATE POLICY "measurement_squig_select" ON public.measurement_squig FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'measurement_asr' AND policyname = 'measurement_asr_select'
  ) THEN
    CREATE POLICY "measurement_asr_select" ON public.measurement_asr FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'measurement_spinorama' AND policyname = 'measurement_spinorama_select'
  ) THEN
    CREATE POLICY "measurement_spinorama_select" ON public.measurement_spinorama FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'device_measurement_links' AND policyname = 'device_measurement_links_select_approved'
  ) THEN
    CREATE POLICY "device_measurement_links_select_approved"
      ON public.device_measurement_links
      FOR SELECT
      USING (status = 'approved');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'device_price_rollups' AND policyname = 'device_price_rollups_select'
  ) THEN
    CREATE POLICY "device_price_rollups_select" ON public.device_price_rollups FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'device_measurement_rollups' AND policyname = 'device_measurement_rollups_select'
  ) THEN
    CREATE POLICY "device_measurement_rollups_select" ON public.device_measurement_rollups FOR SELECT USING (true);
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 2) Rollup refresh functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_device_price_rollup(p_device_id UUID)
RETURNS VOID
LANGUAGE sql
AS $function$
INSERT INTO public.device_price_rollups (
  device_id,
  lowest_price,
  lowest_price_retailer_id,
  lowest_price_affiliate_url,
  in_stock_any,
  offers_count,
  updated_at
)
SELECT
  p_device_id,
  best_offer.price,
  best_offer.retailer_id,
  COALESCE(best_offer.affiliate_url, best_offer.product_url),
  COALESCE(offer_stats.in_stock_any, FALSE),
  COALESCE(offer_stats.offers_count, 0),
  NOW()
FROM (
  SELECT
    bool_or(o.in_stock) AS in_stock_any,
    count(*)::INTEGER AS offers_count
  FROM public.device_offers o
  WHERE o.device_id = p_device_id
) offer_stats
LEFT JOIN LATERAL (
  SELECT
    o.price,
    o.retailer_id,
    o.affiliate_url,
    o.product_url
  FROM public.device_offers o
  WHERE o.device_id = p_device_id
  ORDER BY
    CASE WHEN o.in_stock THEN 0 ELSE 1 END,
    o.price ASC NULLS LAST,
    o.last_checked DESC
  LIMIT 1
) best_offer ON TRUE
ON CONFLICT (device_id)
DO UPDATE SET
  lowest_price = EXCLUDED.lowest_price,
  lowest_price_retailer_id = EXCLUDED.lowest_price_retailer_id,
  lowest_price_affiliate_url = EXCLUDED.lowest_price_affiliate_url,
  in_stock_any = EXCLUDED.in_stock_any,
  offers_count = EXCLUDED.offers_count,
  updated_at = NOW();
$function$;

CREATE OR REPLACE FUNCTION public.refresh_device_measurement_rollup(p_device_id UUID)
RETURNS VOID
LANGUAGE sql
AS $function$
WITH best_links AS (
  SELECT DISTINCT ON (m.source)
    m.source,
    l.measurement_id
  FROM public.device_measurement_links l
  JOIN public.measurements m ON m.id = l.measurement_id
  WHERE l.device_id = p_device_id
    AND l.status = 'approved'
  ORDER BY
    m.source,
    l.is_primary DESC,
    l.confidence DESC,
    l.created_at DESC,
    l.id
),
squig AS (
  SELECT
    m.source_domain,
    sq.ppi_score,
    sq.ppi_stdev,
    sq.ppi_slope,
    sq.ppi_avg_error,
    sq.rig_type,
    sq.pinna,
    sq.quality
  FROM best_links bl
  JOIN public.measurements m ON m.id = bl.measurement_id
  JOIN public.measurement_squig sq ON sq.measurement_id = bl.measurement_id
  WHERE bl.source = 'squig'
),
asr AS (
  SELECT
    asr.sinad_db,
    asr.asr_device_type,
    asr.asr_recommended,
    asr.asr_review_url,
    asr.asr_review_date,
    asr.power_4ohm_mw,
    asr.power_8ohm_mw,
    asr.power_16ohm_mw,
    asr.power_32ohm_mw,
    asr.power_50ohm_mw,
    asr.power_300ohm_mw,
    asr.power_600ohm_mw,
    asr.power_source
  FROM best_links bl
  JOIN public.measurement_asr asr ON asr.measurement_id = bl.measurement_id
  WHERE bl.source = 'asr'
),
spin AS (
  SELECT
    sp.pref_score,
    sp.pref_score_wsub,
    sp.lfx_hz,
    sp.nbd_on_axis,
    sp.sm_pred_in_room,
    sp.speaker_type,
    sp.spinorama_origin,
    sp.quality
  FROM best_links bl
  JOIN public.measurement_spinorama sp ON sp.measurement_id = bl.measurement_id
  WHERE bl.source = 'spinorama'
)
INSERT INTO public.device_measurement_rollups (
  device_id,
  ppi_score,
  ppi_stdev,
  ppi_slope,
  ppi_avg_error,
  source_domain,
  rig_type,
  pinna,
  quality,
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
  updated_at
)
SELECT
  p_device_id,
  squig.ppi_score,
  squig.ppi_stdev,
  squig.ppi_slope,
  squig.ppi_avg_error,
  COALESCE(
    squig.source_domain,
    CASE WHEN spin.pref_score IS NOT NULL THEN 'spinorama.org' END,
    CASE WHEN asr.sinad_db IS NOT NULL THEN 'audiosciencereview.com' END
  ),
  squig.rig_type,
  squig.pinna,
  COALESCE(squig.quality, spin.quality),
  asr.sinad_db,
  asr.asr_device_type,
  asr.asr_recommended,
  asr.asr_review_url,
  asr.asr_review_date,
  asr.power_4ohm_mw,
  asr.power_8ohm_mw,
  asr.power_16ohm_mw,
  asr.power_32ohm_mw,
  asr.power_50ohm_mw,
  asr.power_300ohm_mw,
  asr.power_600ohm_mw,
  asr.power_source,
  spin.pref_score,
  spin.pref_score_wsub,
  spin.lfx_hz,
  spin.nbd_on_axis,
  spin.sm_pred_in_room,
  spin.speaker_type,
  spin.spinorama_origin,
  NOW()
FROM (SELECT 1) seed
LEFT JOIN squig ON TRUE
LEFT JOIN asr ON TRUE
LEFT JOIN spin ON TRUE
ON CONFLICT (device_id)
DO UPDATE SET
  ppi_score = EXCLUDED.ppi_score,
  ppi_stdev = EXCLUDED.ppi_stdev,
  ppi_slope = EXCLUDED.ppi_slope,
  ppi_avg_error = EXCLUDED.ppi_avg_error,
  source_domain = EXCLUDED.source_domain,
  rig_type = EXCLUDED.rig_type,
  pinna = EXCLUDED.pinna,
  quality = EXCLUDED.quality,
  sinad_db = EXCLUDED.sinad_db,
  asr_device_type = EXCLUDED.asr_device_type,
  asr_recommended = EXCLUDED.asr_recommended,
  asr_review_url = EXCLUDED.asr_review_url,
  asr_review_date = EXCLUDED.asr_review_date,
  power_4ohm_mw = EXCLUDED.power_4ohm_mw,
  power_8ohm_mw = EXCLUDED.power_8ohm_mw,
  power_16ohm_mw = EXCLUDED.power_16ohm_mw,
  power_32ohm_mw = EXCLUDED.power_32ohm_mw,
  power_50ohm_mw = EXCLUDED.power_50ohm_mw,
  power_300ohm_mw = EXCLUDED.power_300ohm_mw,
  power_600ohm_mw = EXCLUDED.power_600ohm_mw,
  power_source = EXCLUDED.power_source,
  pref_score = EXCLUDED.pref_score,
  pref_score_wsub = EXCLUDED.pref_score_wsub,
  lfx_hz = EXCLUDED.lfx_hz,
  nbd_on_axis = EXCLUDED.nbd_on_axis,
  sm_pred_in_room = EXCLUDED.sm_pred_in_room,
  speaker_type = EXCLUDED.speaker_type,
  spinorama_origin = EXCLUDED.spinorama_origin,
  updated_at = NOW();
$function$;

CREATE OR REPLACE FUNCTION public.refresh_measurement_rollups_for_measurement(p_measurement_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT l.device_id
    FROM public.device_measurement_links l
    WHERE l.measurement_id = p_measurement_id
      AND l.status = 'approved'
  LOOP
    PERFORM public.refresh_device_measurement_rollup(rec.device_id);
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_all_rollups()
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM public.devices LOOP
    PERFORM public.refresh_device_price_rollup(rec.id);
    PERFORM public.refresh_device_measurement_rollup(rec.id);
  END LOOP;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3) Rollup maintenance triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.offer_rollup_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_device_price_rollup(OLD.device_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_device_price_rollup(NEW.device_id);

  IF TG_OP = 'UPDATE' AND OLD.device_id IS DISTINCT FROM NEW.device_id THEN
    PERFORM public.refresh_device_price_rollup(OLD.device_id);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.link_rollup_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_device_measurement_rollup(OLD.device_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_device_measurement_rollup(NEW.device_id);

  IF TG_OP = 'UPDATE' AND OLD.device_id IS DISTINCT FROM NEW.device_id THEN
    PERFORM public.refresh_device_measurement_rollup(OLD.device_id);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.measurement_payload_rollup_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  measurement_uuid UUID;
BEGIN
  measurement_uuid := COALESCE(NEW.measurement_id, OLD.measurement_id);
  IF measurement_uuid IS NOT NULL THEN
    PERFORM public.refresh_measurement_rollups_for_measurement(measurement_uuid);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.measurement_row_rollup_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  measurement_uuid UUID;
BEGIN
  measurement_uuid := COALESCE(NEW.id, OLD.id);
  IF measurement_uuid IS NOT NULL THEN
    PERFORM public.refresh_measurement_rollups_for_measurement(measurement_uuid);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_offer_rollup_refresh ON public.device_offers;
CREATE TRIGGER trg_offer_rollup_refresh
  AFTER INSERT OR UPDATE OR DELETE
  ON public.device_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.offer_rollup_trigger();

DROP TRIGGER IF EXISTS trg_link_rollup_refresh ON public.device_measurement_links;
CREATE TRIGGER trg_link_rollup_refresh
  AFTER INSERT OR UPDATE OR DELETE
  ON public.device_measurement_links
  FOR EACH ROW
  EXECUTE FUNCTION public.link_rollup_trigger();

DROP TRIGGER IF EXISTS trg_measurement_squig_rollup_refresh ON public.measurement_squig;
CREATE TRIGGER trg_measurement_squig_rollup_refresh
  AFTER INSERT OR UPDATE OR DELETE
  ON public.measurement_squig
  FOR EACH ROW
  EXECUTE FUNCTION public.measurement_payload_rollup_trigger();

DROP TRIGGER IF EXISTS trg_measurement_asr_rollup_refresh ON public.measurement_asr;
CREATE TRIGGER trg_measurement_asr_rollup_refresh
  AFTER INSERT OR UPDATE OR DELETE
  ON public.measurement_asr
  FOR EACH ROW
  EXECUTE FUNCTION public.measurement_payload_rollup_trigger();

DROP TRIGGER IF EXISTS trg_measurement_spinorama_rollup_refresh ON public.measurement_spinorama;
CREATE TRIGGER trg_measurement_spinorama_rollup_refresh
  AFTER INSERT OR UPDATE OR DELETE
  ON public.measurement_spinorama
  FOR EACH ROW
  EXECUTE FUNCTION public.measurement_payload_rollup_trigger();

DROP TRIGGER IF EXISTS trg_measurements_rollup_refresh ON public.measurements;
CREATE TRIGGER trg_measurements_rollup_refresh
  AFTER UPDATE
  ON public.measurements
  FOR EACH ROW
  EXECUTE FUNCTION public.measurement_row_rollup_trigger();

-- ---------------------------------------------------------------------------
-- 4) Read models
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
  COALESCE(pr.offers_count, 0) AS offers_count
FROM public.devices d
LEFT JOIN public.device_price_rollups pr ON pr.device_id = d.id
LEFT JOIN public.device_measurement_rollups mr ON mr.device_id = d.id;

CREATE OR REPLACE VIEW public.measurement_lab AS
SELECT
  m.id AS measurement_id,
  m.source,
  m.source_measurement_id,
  m.category_id,
  m.raw_name,
  m.brand,
  m.model,
  m.normalized_name,
  m.source_domain,
  m.source_url,
  sq.ppi_score,
  sq.ppi_stdev,
  sq.ppi_slope,
  sq.ppi_avg_error,
  asr.sinad_db,
  asr.asr_device_type,
  asr.asr_recommended,
  asr.asr_review_url,
  asr.asr_review_date,
  asr.power_4ohm_mw,
  asr.power_8ohm_mw,
  asr.power_16ohm_mw,
  asr.power_32ohm_mw,
  asr.power_50ohm_mw,
  asr.power_300ohm_mw,
  asr.power_600ohm_mw,
  asr.power_source,
  sp.pref_score,
  sp.pref_score_wsub,
  sp.lfx_hz,
  sp.nbd_on_axis,
  sp.sm_pred_in_room,
  sp.speaker_type,
  sp.spinorama_origin,
  COALESCE(best_link.status, 'unlinked') AS link_status,
  best_link.confidence AS link_confidence,
  best_link.method AS link_method,
  best_link.reviewed_at,
  d.id AS device_id,
  d.name AS device_name,
  d.brand AS device_brand,
  d.category_id AS device_category_id,
  m.first_seen_at,
  m.last_seen_at
FROM public.measurements m
LEFT JOIN public.measurement_squig sq ON sq.measurement_id = m.id
LEFT JOIN public.measurement_asr asr ON asr.measurement_id = m.id
LEFT JOIN public.measurement_spinorama sp ON sp.measurement_id = m.id
LEFT JOIN LATERAL (
  SELECT
    l.device_id,
    l.status,
    l.confidence,
    l.method,
    l.reviewed_at,
    l.is_primary,
    l.created_at
  FROM public.device_measurement_links l
  WHERE l.measurement_id = m.id
  ORDER BY
    CASE l.status
      WHEN 'approved' THEN 0
      WHEN 'pending' THEN 1
      ELSE 2
    END,
    l.is_primary DESC,
    l.confidence DESC,
    l.created_at DESC
  LIMIT 1
) best_link ON TRUE
LEFT JOIN public.devices d ON d.id = best_link.device_id;

-- ---------------------------------------------------------------------------
-- 5) Compatibility views for legacy read paths during migration
-- ---------------------------------------------------------------------------

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
  updated_at
FROM public.catalog_products;

CREATE OR REPLACE VIEW public.price_listings AS
SELECT
  o.id,
  o.device_id AS product_id,
  o.retailer_id,
  o.external_id,
  o.price,
  o.compare_at_price,
  o.on_sale,
  o.currency,
  o.in_stock,
  o.product_url,
  o.affiliate_url,
  o.image_url,
  o.last_checked,
  o.created_at
FROM public.device_offers o;

CREATE OR REPLACE VIEW public.price_history AS
SELECT
  h.id,
  h.device_id AS product_id,
  h.retailer_id,
  h.price,
  h.in_stock,
  h.recorded_at
FROM public.device_price_history h;

CREATE OR REPLACE VIEW public.store_products AS
SELECT
  rp.id,
  rp.retailer_id,
  rp.external_id,
  rp.title,
  rp.vendor,
  rp.product_type,
  rp.tags,
  rp.source_category_id AS category_id,
  rp.price,
  rp.compare_at_price,
  rp.on_sale,
  rp.in_stock,
  rp.image_url,
  rp.product_url,
  rp.affiliate_url,
  rp.raw_data,
  rp.imported_at,
  rp.processed,
  rp.canonical_device_id AS canonical_product_id
FROM public.retailer_products rp;

-- ---------------------------------------------------------------------------
-- 6) Filter options RPC (legacy shape, now backed by retailer-first data)
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

-- ---------------------------------------------------------------------------
-- 7) Grants for anon/authenticated read paths
-- ---------------------------------------------------------------------------

GRANT SELECT ON public.catalog_products TO anon, authenticated;
GRANT SELECT ON public.measurement_lab TO anon, authenticated;
GRANT SELECT ON public.products TO anon, authenticated;
GRANT SELECT ON public.price_listings TO anon, authenticated;
GRANT SELECT ON public.price_history TO anon, authenticated;
GRANT SELECT ON public.store_products TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_filter_options(TEXT) TO anon, authenticated;
