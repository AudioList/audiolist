-- Fix price_listings unique constraint.
-- The old constraint UNIQUE(product_id, retailer_id) allowed duplicate rows
-- when the same store product (external_id) matched to different canonical
-- products across successive sync runs. The correct constraint is
-- UNIQUE(retailer_id, external_id) -- one listing per store product.

-- Step 1: Delete duplicate price_listings, keeping only the most recent per
-- (retailer_id, external_id) pair.
DELETE FROM price_listings
WHERE id NOT IN (
  SELECT DISTINCT ON (retailer_id, external_id) id
  FROM price_listings
  ORDER BY retailer_id, external_id, last_checked DESC NULLS LAST
);

-- Step 2: Drop the old constraint
ALTER TABLE price_listings DROP CONSTRAINT IF EXISTS price_listings_product_id_retailer_id_key;

-- Step 3: Add the correct constraint
ALTER TABLE price_listings ADD CONSTRAINT price_listings_retailer_external_key
  UNIQUE (retailer_id, external_id);

-- Step 4: Add an index on (product_id, retailer_id) for fast lookups
-- (replaces the old unique constraint's implicit index)
CREATE INDEX IF NOT EXISTS idx_price_listings_product_retailer
  ON price_listings(product_id, retailer_id);
