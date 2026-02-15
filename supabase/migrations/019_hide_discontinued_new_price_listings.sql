-- Hide "discontinued new" retailer offers from the public price_listings view.
--
-- We preserve device_offers rows (data/history), but do not surface them in
-- public listing UX when the corresponding retailer_products.raw_data flags
-- indicate the SKU is no longer available as "new".

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
FROM public.device_offers o
JOIN public.retailer_products rp
  ON rp.id = o.retailer_product_id
WHERE
  COALESCE(rp.raw_data->>'discontinued_new', 'false') <> 'true'
  AND COALESCE(rp.raw_data->>'discontinued_banner', 'false') <> 'true'
  AND COALESCE(rp.raw_data->>'discontinued', 'false') <> 'true';

-- Safety: ensure public read access remains.
GRANT SELECT ON public.price_listings TO anon, authenticated;
