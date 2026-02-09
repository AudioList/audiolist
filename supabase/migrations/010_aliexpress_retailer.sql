-- 010_aliexpress_retailer.sql
-- Add AliExpress as a retailer for price comparison.
-- Affiliate URLs are generated via the AliExpress Affiliate API (opaque s.click.aliexpress.com/e/... links).
-- affiliate_url_template is NULL because buildAffiliateUrl() cannot produce these links --
-- they are pre-generated at sync time and stored directly in store_products.affiliate_url.

INSERT INTO retailers (id, name, base_url, shop_domain, api_type, affiliate_tag, affiliate_url_template, is_active)
VALUES (
  'aliexpress',
  'AliExpress',
  'https://www.aliexpress.com',
  NULL,
  'aliexpress',
  NULL,
  NULL,
  true
)
ON CONFLICT (id) DO NOTHING;
