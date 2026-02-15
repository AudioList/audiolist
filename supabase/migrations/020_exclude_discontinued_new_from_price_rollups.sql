-- Exclude "discontinued new" retailer offers from device_price_rollups.
--
-- We keep device_offers rows for history, but rollups should not surface them
-- as the canonical "best price" / affiliate link.

CREATE OR REPLACE FUNCTION public.refresh_device_price_rollup(p_device_id UUID)
RETURNS VOID
LANGUAGE sql
AS $function$
WITH eligible_offers AS (
  SELECT o.*
  FROM public.device_offers o
  JOIN public.retailer_products rp
    ON rp.id = o.retailer_product_id
  WHERE o.device_id = p_device_id
    AND COALESCE(rp.raw_data->>'discontinued_new', 'false') <> 'true'
    AND COALESCE(rp.raw_data->>'discontinued_banner', 'false') <> 'true'
    AND COALESCE(rp.raw_data->>'discontinued', 'false') <> 'true'
),
offer_stats AS (
  SELECT
    bool_or(o.in_stock) AS in_stock_any,
    count(*)::INTEGER AS offers_count
  FROM eligible_offers o
),
best_offer AS (
  SELECT
    o.price,
    o.retailer_id,
    o.affiliate_url,
    o.product_url
  FROM eligible_offers o
  ORDER BY
    CASE WHEN o.in_stock THEN 0 ELSE 1 END,
    o.price ASC NULLS LAST,
    o.last_checked DESC
  LIMIT 1
)
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
FROM offer_stats
LEFT JOIN best_offer ON TRUE
ON CONFLICT (device_id)
DO UPDATE SET
  lowest_price = EXCLUDED.lowest_price,
  lowest_price_retailer_id = EXCLUDED.lowest_price_retailer_id,
  lowest_price_affiliate_url = EXCLUDED.lowest_price_affiliate_url,
  in_stock_any = EXCLUDED.in_stock_any,
  offers_count = EXCLUDED.offers_count,
  updated_at = NOW();
$function$;

-- Refresh rollups for any devices that currently have discontinued-new offers.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN (
    SELECT DISTINCT o.device_id
    FROM public.device_offers o
    JOIN public.retailer_products rp ON rp.id = o.retailer_product_id
    WHERE COALESCE(rp.raw_data->>'discontinued_new', 'false') = 'true'
       OR COALESCE(rp.raw_data->>'discontinued_banner', 'false') = 'true'
       OR COALESCE(rp.raw_data->>'discontinued', 'false') = 'true'
  ) LOOP
    PERFORM public.refresh_device_price_rollup(rec.device_id);
  END LOOP;
END$$;
