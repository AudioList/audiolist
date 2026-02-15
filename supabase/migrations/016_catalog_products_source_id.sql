-- Adds a stable source_id for squig-linked devices so the frontend can
-- construct per-measurement graph URLs (legacy behavior).

CREATE OR REPLACE VIEW public.catalog_products AS
SELECT
  d.id,
  CASE
    WHEN best_squig.raw_name IS NOT NULL THEN ('squig::' || best_squig.raw_name)
    ELSE NULL::TEXT
  END AS source_id,
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
  COALESCE(best_squig.source_domain, mr.source_domain) AS source_domain,
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
LEFT JOIN public.device_measurement_rollups mr ON mr.device_id = d.id
LEFT JOIN LATERAL (
  SELECT
    m.raw_name,
    m.source_domain
  FROM public.device_measurement_links l
  JOIN public.measurements m ON m.id = l.measurement_id
  WHERE l.device_id = d.id
    AND l.status = 'approved'
    AND m.source = 'squig'
  ORDER BY
    l.is_primary DESC,
    l.confidence DESC,
    l.created_at DESC,
    l.id
  LIMIT 1
) best_squig ON TRUE;
