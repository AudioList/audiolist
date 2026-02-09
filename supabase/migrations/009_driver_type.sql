-- 009_driver_type.sql
-- Add driver_type column for IEM/headphone driver technology classification.
-- Values: dynamic, balanced_armature, planar, hybrid, tribrid, quadbrid,
--         electrostatic, ribbon, bone_conduction

ALTER TABLE products ADD COLUMN IF NOT EXISTS driver_type TEXT;

CREATE INDEX IF NOT EXISTS idx_products_driver_type
  ON products (driver_type) WHERE driver_type IS NOT NULL;

-- Update get_filter_options to include driver_types for iem and headphone categories
CREATE OR REPLACE FUNCTION public.get_filter_options(p_category_id text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
SELECT json_build_object(
  'brands', (
    SELECT COALESCE(json_agg(b ORDER BY b), '[]'::json)
    FROM (SELECT DISTINCT brand AS b FROM products WHERE category_id = p_category_id AND brand IS NOT NULL) sub
  ),
  'retailers', (
    SELECT COALESCE(json_agg(json_build_object('id', r.id, 'name', r.name) ORDER BY r.name), '[]'::json)
    FROM retailers r
    WHERE r.is_active = true
      AND EXISTS (SELECT 1 FROM price_listings pl JOIN products p ON p.id = pl.product_id WHERE pl.retailer_id = r.id AND p.category_id = p_category_id)
  ),
  'iem_types', CASE WHEN p_category_id = 'iem' THEN (
    SELECT COALESCE(json_agg(json_build_object('value', iem_type, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
    FROM (SELECT iem_type, COUNT(*) cnt FROM products WHERE category_id = 'iem' AND is_best_variant = true AND iem_type IS NOT NULL GROUP BY iem_type) sub
  ) ELSE NULL END,
  'driver_types', CASE WHEN p_category_id IN ('iem', 'headphone') THEN (
    SELECT COALESCE(json_agg(json_build_object('value', driver_type, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
    FROM (SELECT driver_type, COUNT(*) cnt FROM products WHERE category_id = p_category_id AND is_best_variant = true AND driver_type IS NOT NULL GROUP BY driver_type) sub
  ) ELSE NULL END,
  'speaker_types', CASE WHEN p_category_id = 'speaker' THEN (
    SELECT COALESCE(json_agg(json_build_object('value', speaker_type, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
    FROM (SELECT speaker_type, COUNT(*) cnt FROM products WHERE category_id = 'speaker' AND speaker_type IS NOT NULL GROUP BY speaker_type) sub
  ) ELSE NULL END,
  'headphone_designs', CASE WHEN p_category_id = 'headphone' THEN (
    SELECT COALESCE(json_agg(json_build_object('value', headphone_design, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
    FROM (SELECT headphone_design, COUNT(*) cnt FROM products WHERE category_id = 'headphone' AND headphone_design IS NOT NULL GROUP BY headphone_design) sub
  ) ELSE NULL END,
  'mic_connections', CASE WHEN p_category_id = 'microphone' THEN (
    SELECT COALESCE(json_agg(json_build_object('value', mic_connection, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
    FROM (SELECT mic_connection, COUNT(*) cnt FROM products WHERE category_id = 'microphone' AND mic_connection IS NOT NULL GROUP BY mic_connection) sub
  ) ELSE NULL END,
  'mic_types', CASE WHEN p_category_id = 'microphone' THEN (
    SELECT COALESCE(json_agg(json_build_object('value', mic_type, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
    FROM (SELECT mic_type, COUNT(*) cnt FROM products WHERE category_id = 'microphone' AND mic_type IS NOT NULL GROUP BY mic_type) sub
  ) ELSE NULL END,
  'mic_patterns', CASE WHEN p_category_id = 'microphone' THEN (
    SELECT COALESCE(json_agg(json_build_object('value', mic_pattern, 'count', cnt) ORDER BY cnt DESC), '[]'::json)
    FROM (SELECT mic_pattern, COUNT(*) cnt FROM products WHERE category_id = 'microphone' AND mic_pattern IS NOT NULL GROUP BY mic_pattern) sub
  ) ELSE NULL END
);
$function$;
