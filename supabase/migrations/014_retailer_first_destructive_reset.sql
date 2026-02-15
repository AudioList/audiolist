-- 014_retailer_first_destructive_reset.sql
--
-- DESTRUCTIVE RESET
-- Replaces the legacy mixed catalog model with a retailer-first schema.
-- Existing product/pricing/measurement catalog data is dropped.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- 0) Drop transitional/read models and helper functions from prior attempts
-- ---------------------------------------------------------------------------

-- The following relations can exist as either tables (legacy) or views
-- (compatibility layer). Drop whichever exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'products'
  ) THEN
    EXECUTE 'DROP VIEW public.products CASCADE';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'products' AND table_type = 'BASE TABLE'
  ) THEN
    EXECUTE 'DROP TABLE public.products CASCADE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'price_listings'
  ) THEN
    EXECUTE 'DROP VIEW public.price_listings CASCADE';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'price_listings' AND table_type = 'BASE TABLE'
  ) THEN
    EXECUTE 'DROP TABLE public.price_listings CASCADE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'price_history'
  ) THEN
    EXECUTE 'DROP VIEW public.price_history CASCADE';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'price_history' AND table_type = 'BASE TABLE'
  ) THEN
    EXECUTE 'DROP TABLE public.price_history CASCADE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'store_products'
  ) THEN
    EXECUTE 'DROP VIEW public.store_products CASCADE';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'store_products' AND table_type = 'BASE TABLE'
  ) THEN
    EXECUTE 'DROP TABLE public.store_products CASCADE';
  END IF;
END$$;

DROP VIEW IF EXISTS public.measurement_lab CASCADE;
DROP VIEW IF EXISTS public.catalog_products CASCADE;
DROP VIEW IF EXISTS public.v2_measurement_lab CASCADE;
DROP VIEW IF EXISTS public.v2_catalog_products CASCADE;

DROP FUNCTION IF EXISTS public.get_filter_options(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.v2_get_filter_options(TEXT) CASCADE;

DROP FUNCTION IF EXISTS public.v2_refresh_all_rollups() CASCADE;
DROP FUNCTION IF EXISTS public.v2_refresh_device_price_rollup(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.v2_refresh_device_measurement_rollup(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.v2_refresh_measurement_rollups_for_measurement(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.v2_offer_rollup_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.v2_link_rollup_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.v2_measurement_payload_rollup_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.v2_measurement_row_rollup_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.v2_enforce_link_category_match() CASCADE;
DROP FUNCTION IF EXISTS public.v2_set_updated_at() CASCADE;

DROP FUNCTION IF EXISTS public.refresh_all_rollups() CASCADE;
DROP FUNCTION IF EXISTS public.refresh_device_price_rollup(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.refresh_device_measurement_rollup(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.refresh_measurement_rollups_for_measurement(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.offer_rollup_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.link_rollup_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.measurement_payload_rollup_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.measurement_row_rollup_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_device_measurement_category_match() CASCADE;
DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;

-- ---------------------------------------------------------------------------
-- 1) Drop legacy catalog tables (destructive)
-- ---------------------------------------------------------------------------

-- Drop any partially-created retailer-first tables from previous runs.
DROP TABLE IF EXISTS public.device_measurement_rollups CASCADE;
DROP TABLE IF EXISTS public.device_price_rollups CASCADE;
DROP TABLE IF EXISTS public.review_tasks CASCADE;
DROP TABLE IF EXISTS public.device_measurement_links CASCADE;
DROP TABLE IF EXISTS public.measurement_spinorama CASCADE;
DROP TABLE IF EXISTS public.measurement_asr CASCADE;
DROP TABLE IF EXISTS public.measurement_squig CASCADE;
DROP TABLE IF EXISTS public.measurements CASCADE;
DROP TABLE IF EXISTS public.device_price_history CASCADE;
DROP TABLE IF EXISTS public.device_offers CASCADE;
DROP TABLE IF EXISTS public.devices CASCADE;
DROP TABLE IF EXISTS public.device_families CASCADE;
DROP TABLE IF EXISTS public.retailer_products CASCADE;

DROP TABLE IF EXISTS public.v2_device_measurement_rollups CASCADE;
DROP TABLE IF EXISTS public.v2_device_price_rollups CASCADE;
DROP TABLE IF EXISTS public.v2_review_tasks CASCADE;
DROP TABLE IF EXISTS public.v2_device_measurement_links CASCADE;
DROP TABLE IF EXISTS public.v2_measurement_spinorama CASCADE;
DROP TABLE IF EXISTS public.v2_measurement_asr CASCADE;
DROP TABLE IF EXISTS public.v2_measurement_squig CASCADE;
DROP TABLE IF EXISTS public.v2_measurements CASCADE;
DROP TABLE IF EXISTS public.v2_device_price_history CASCADE;
DROP TABLE IF EXISTS public.v2_device_offers CASCADE;
DROP TABLE IF EXISTS public.v2_devices CASCADE;
DROP TABLE IF EXISTS public.v2_device_families CASCADE;
DROP TABLE IF EXISTS public.v2_retailer_products CASCADE;

DROP TABLE IF EXISTS public.product_matches CASCADE;
DROP TABLE IF EXISTS public.product_families CASCADE;

-- Wipe build data because build_items.product_id is repointed to new devices ids.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'builds'
  ) THEN
    EXECUTE 'TRUNCATE TABLE public.builds RESTART IDENTITY CASCADE';
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 2) Align reference tables with fields used by UI/hooks
-- ---------------------------------------------------------------------------

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE public.retailers ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.retailers ADD COLUMN IF NOT EXISTS ships_from TEXT;
ALTER TABLE public.retailers ADD COLUMN IF NOT EXISTS return_policy TEXT;
ALTER TABLE public.retailers ADD COLUMN IF NOT EXISTS authorized_dealer BOOLEAN DEFAULT FALSE;
ALTER TABLE public.retailers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ---------------------------------------------------------------------------
-- 3) Generic updated_at trigger helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4) Retailer ingestion lineage (source of truth)
-- ---------------------------------------------------------------------------

CREATE TABLE public.retailer_products (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id          TEXT NOT NULL REFERENCES public.retailers(id),
  external_id          TEXT NOT NULL,
  title                TEXT NOT NULL,
  normalized_title     TEXT NOT NULL,
  vendor               TEXT,
  product_type         TEXT,
  tags                 TEXT[] NOT NULL DEFAULT '{}',
  source_category_id   TEXT NOT NULL REFERENCES public.categories(id),
  detected_category_id TEXT REFERENCES public.categories(id),
  category_confidence  NUMERIC(5,4),
  price                NUMERIC,
  compare_at_price     NUMERIC,
  currency             TEXT NOT NULL DEFAULT 'USD',
  on_sale              BOOLEAN NOT NULL DEFAULT FALSE,
  in_stock             BOOLEAN NOT NULL DEFAULT TRUE,
  image_url            TEXT,
  product_url          TEXT,
  affiliate_url        TEXT,
  raw_data             JSONB NOT NULL DEFAULT '{}',
  first_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed            BOOLEAN NOT NULL DEFAULT FALSE,
  canonical_device_id  UUID,
  needs_review         BOOLEAN NOT NULL DEFAULT FALSE,
  review_reason        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_retailer_products_identity UNIQUE (retailer_id, external_id),
  CONSTRAINT chk_retailer_products_category_confidence CHECK (
    category_confidence IS NULL OR (category_confidence >= 0 AND category_confidence <= 1)
  )
);

-- ---------------------------------------------------------------------------
-- 5) Canonical devices (retailer-derived only)
-- ---------------------------------------------------------------------------

CREATE TABLE public.device_families (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT NOT NULL,
  category_id    TEXT NOT NULL REFERENCES public.categories(id),
  base_device_id UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_device_families_name UNIQUE (category_id, canonical_name)
);

CREATE TABLE public.devices (
  id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id                      TEXT NOT NULL REFERENCES public.categories(id),
  name                             TEXT NOT NULL,
  brand                            TEXT,
  normalized_name                  TEXT NOT NULL,
  image_url                        TEXT,
  discontinued                     BOOLEAN NOT NULL DEFAULT FALSE,
  status                           TEXT NOT NULL DEFAULT 'active',
  created_from_retailer_product_id UUID NOT NULL UNIQUE REFERENCES public.retailer_products(id) ON DELETE RESTRICT,
  product_family_id                UUID REFERENCES public.device_families(id) ON DELETE SET NULL,
  variant_type                     TEXT,
  variant_value                    TEXT,
  is_best_variant                  BOOLEAN NOT NULL DEFAULT TRUE,
  speaker_type                     TEXT,
  headphone_design                 TEXT CHECK (headphone_design IS NULL OR headphone_design IN ('open', 'closed')),
  iem_type                         TEXT CHECK (iem_type IS NULL OR iem_type IN ('passive', 'active', 'tws')),
  driver_type                      TEXT CHECK (
    driver_type IS NULL OR
    driver_type IN ('dynamic', 'balanced_armature', 'planar', 'hybrid', 'tribrid', 'quadbrid', 'electrostatic', 'ribbon', 'bone_conduction')
  ),
  mic_connection                   TEXT CHECK (mic_connection IS NULL OR mic_connection IN ('usb', 'xlr', 'usb_xlr', 'wireless', '3.5mm')),
  mic_type                         TEXT CHECK (mic_type IS NULL OR mic_type IN ('dynamic', 'condenser', 'ribbon')),
  mic_pattern                      TEXT CHECK (
    mic_pattern IS NULL OR
    mic_pattern IN ('cardioid', 'omnidirectional', 'bidirectional', 'supercardioid', 'hypercardioid', 'multipattern', 'shotgun')
  ),
  specs                            JSONB NOT NULL DEFAULT '{}',
  created_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_devices_status CHECK (status IN ('active', 'hidden', 'discontinued'))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_retailer_products_canonical_device'
  ) THEN
    ALTER TABLE public.retailer_products
      ADD CONSTRAINT fk_retailer_products_canonical_device
      FOREIGN KEY (canonical_device_id)
      REFERENCES public.devices(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_device_families_base_device'
  ) THEN
    ALTER TABLE public.device_families
      ADD CONSTRAINT fk_device_families_base_device
      FOREIGN KEY (base_device_id)
      REFERENCES public.devices(id)
      ON DELETE SET NULL;
  END IF;
END$$;

-- Rewire build_items.product_id foreign key to devices.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'build_items'
  ) THEN
    ALTER TABLE public.build_items DROP CONSTRAINT IF EXISTS build_items_product_id_fkey;
    ALTER TABLE public.build_items
      ADD CONSTRAINT build_items_product_id_fkey
      FOREIGN KEY (product_id)
      REFERENCES public.devices(id)
      ON DELETE CASCADE;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 6) Offers + price history
-- ---------------------------------------------------------------------------

CREATE TABLE public.device_offers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id           UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  retailer_product_id UUID NOT NULL UNIQUE REFERENCES public.retailer_products(id) ON DELETE CASCADE,
  retailer_id         TEXT NOT NULL REFERENCES public.retailers(id),
  external_id         TEXT NOT NULL,
  price               NUMERIC NOT NULL,
  compare_at_price    NUMERIC,
  currency            TEXT NOT NULL DEFAULT 'USD',
  on_sale             BOOLEAN NOT NULL DEFAULT FALSE,
  in_stock            BOOLEAN NOT NULL DEFAULT TRUE,
  product_url         TEXT,
  affiliate_url       TEXT,
  image_url           TEXT,
  last_checked        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_device_offers_identity UNIQUE (retailer_id, external_id),
  CONSTRAINT chk_device_offers_compare_price CHECK (compare_at_price IS NULL OR compare_at_price > price)
);

CREATE TABLE public.device_price_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  retailer_id TEXT NOT NULL REFERENCES public.retailers(id),
  price       NUMERIC NOT NULL,
  in_stock    BOOLEAN NOT NULL DEFAULT TRUE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 7) Measurements (independent domain)
-- ---------------------------------------------------------------------------

CREATE TABLE public.measurements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source                TEXT NOT NULL,
  source_measurement_id TEXT NOT NULL,
  category_id           TEXT NOT NULL REFERENCES public.categories(id),
  raw_name              TEXT NOT NULL,
  brand                 TEXT,
  model                 TEXT,
  normalized_name       TEXT NOT NULL,
  source_domain         TEXT,
  source_url            TEXT,
  raw_payload           JSONB NOT NULL DEFAULT '{}',
  first_seen_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_measurements_source UNIQUE (source, source_measurement_id),
  CONSTRAINT chk_measurements_source CHECK (source IN ('squig', 'asr', 'spinorama')),
  CONSTRAINT chk_measurements_source_category CHECK (
    (source = 'squig' AND category_id IN ('iem', 'headphone')) OR
    (source = 'asr' AND category_id IN ('dac', 'amp')) OR
    (source = 'spinorama' AND category_id = 'speaker')
  )
);

CREATE TABLE public.measurement_squig (
  measurement_id UUID PRIMARY KEY REFERENCES public.measurements(id) ON DELETE CASCADE,
  ppi_score      NUMERIC NOT NULL,
  ppi_stdev      NUMERIC,
  ppi_slope      NUMERIC,
  ppi_avg_error  NUMERIC,
  rig_type       TEXT,
  pinna          TEXT,
  quality        TEXT
);

CREATE TABLE public.measurement_asr (
  measurement_id  UUID PRIMARY KEY REFERENCES public.measurements(id) ON DELETE CASCADE,
  sinad_db        NUMERIC NOT NULL,
  asr_device_type TEXT,
  asr_recommended BOOLEAN,
  asr_review_url  TEXT,
  asr_review_date TIMESTAMPTZ,
  power_4ohm_mw   NUMERIC,
  power_8ohm_mw   NUMERIC,
  power_16ohm_mw  NUMERIC,
  power_32ohm_mw  NUMERIC,
  power_50ohm_mw  NUMERIC,
  power_300ohm_mw NUMERIC,
  power_600ohm_mw NUMERIC,
  power_source    TEXT
);

CREATE TABLE public.measurement_spinorama (
  measurement_id   UUID PRIMARY KEY REFERENCES public.measurements(id) ON DELETE CASCADE,
  pref_score       NUMERIC NOT NULL,
  pref_score_wsub  NUMERIC,
  lfx_hz           NUMERIC,
  nbd_on_axis      NUMERIC,
  sm_pred_in_room  NUMERIC,
  speaker_type     TEXT,
  spinorama_origin TEXT,
  quality          TEXT
);

-- ---------------------------------------------------------------------------
-- 8) Manual review workflow + approved link graph
-- ---------------------------------------------------------------------------

CREATE TABLE public.device_measurement_links (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id      UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  measurement_id UUID NOT NULL REFERENCES public.measurements(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'pending',
  confidence     NUMERIC(5,4) NOT NULL,
  method         TEXT NOT NULL,
  is_primary     BOOLEAN NOT NULL DEFAULT FALSE,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at    TIMESTAMPTZ,
  reviewed_by    TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_device_measurement_link UNIQUE (device_id, measurement_id),
  CONSTRAINT chk_device_measurement_status CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT chk_device_measurement_confidence CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT chk_device_measurement_primary_only_if_approved CHECK (NOT is_primary OR status = 'approved')
);

CREATE TABLE public.review_tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type           TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'open',
  priority            INTEGER NOT NULL DEFAULT 50,
  retailer_product_id UUID REFERENCES public.retailer_products(id) ON DELETE CASCADE,
  device_id           UUID REFERENCES public.devices(id) ON DELETE CASCADE,
  measurement_id      UUID REFERENCES public.measurements(id) ON DELETE CASCADE,
  payload             JSONB NOT NULL DEFAULT '{}',
  reason              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ,
  CONSTRAINT chk_review_task_type CHECK (task_type IN ('measurement_link', 'retailer_category', 'device_merge')),
  CONSTRAINT chk_review_task_status CHECK (status IN ('open', 'in_review', 'resolved', 'rejected'))
);

-- ---------------------------------------------------------------------------
-- 9) Rollup tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.device_price_rollups (
  device_id                  UUID PRIMARY KEY REFERENCES public.devices(id) ON DELETE CASCADE,
  lowest_price               NUMERIC,
  lowest_price_retailer_id   TEXT REFERENCES public.retailers(id),
  lowest_price_affiliate_url TEXT,
  in_stock_any               BOOLEAN NOT NULL DEFAULT FALSE,
  offers_count               INTEGER NOT NULL DEFAULT 0,
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.device_measurement_rollups (
  device_id        UUID PRIMARY KEY REFERENCES public.devices(id) ON DELETE CASCADE,
  ppi_score        NUMERIC,
  ppi_stdev        NUMERIC,
  ppi_slope        NUMERIC,
  ppi_avg_error    NUMERIC,
  source_domain    TEXT,
  rig_type         TEXT,
  pinna            TEXT,
  quality          TEXT,
  sinad_db         NUMERIC,
  asr_device_type  TEXT,
  asr_recommended  BOOLEAN,
  asr_review_url   TEXT,
  asr_review_date  TIMESTAMPTZ,
  power_4ohm_mw    NUMERIC,
  power_8ohm_mw    NUMERIC,
  power_16ohm_mw   NUMERIC,
  power_32ohm_mw   NUMERIC,
  power_50ohm_mw   NUMERIC,
  power_300ohm_mw  NUMERIC,
  power_600ohm_mw  NUMERIC,
  power_source     TEXT,
  pref_score       NUMERIC,
  pref_score_wsub  NUMERIC,
  lfx_hz           NUMERIC,
  nbd_on_axis      NUMERIC,
  sm_pred_in_room  NUMERIC,
  speaker_type     TEXT,
  spinorama_origin TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 10) Category safety trigger for device<->measurement links
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_device_measurement_category_match()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  device_category TEXT;
  measurement_category TEXT;
BEGIN
  SELECT d.category_id INTO device_category
  FROM public.devices d
  WHERE d.id = NEW.device_id;

  SELECT m.category_id INTO measurement_category
  FROM public.measurements m
  WHERE m.id = NEW.measurement_id;

  IF device_category IS DISTINCT FROM measurement_category THEN
    RAISE EXCEPTION
      'Device category (%) does not match measurement category (%)',
      device_category,
      measurement_category;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_device_measurement_category_match ON public.device_measurement_links;
CREATE TRIGGER trg_enforce_device_measurement_category_match
  BEFORE INSERT OR UPDATE OF device_id, measurement_id
  ON public.device_measurement_links
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_device_measurement_category_match();

-- ---------------------------------------------------------------------------
-- 11) updated_at triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_retailer_products_set_updated_at ON public.retailer_products;
CREATE TRIGGER trg_retailer_products_set_updated_at
  BEFORE UPDATE ON public.retailer_products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_device_families_set_updated_at ON public.device_families;
CREATE TRIGGER trg_device_families_set_updated_at
  BEFORE UPDATE ON public.device_families
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_devices_set_updated_at ON public.devices;
CREATE TRIGGER trg_devices_set_updated_at
  BEFORE UPDATE ON public.devices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_device_offers_set_updated_at ON public.device_offers;
CREATE TRIGGER trg_device_offers_set_updated_at
  BEFORE UPDATE ON public.device_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_measurements_set_updated_at ON public.measurements;
CREATE TRIGGER trg_measurements_set_updated_at
  BEFORE UPDATE ON public.measurements
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_device_measurement_links_set_updated_at ON public.device_measurement_links;
CREATE TRIGGER trg_device_measurement_links_set_updated_at
  BEFORE UPDATE ON public.device_measurement_links
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_review_tasks_set_updated_at ON public.review_tasks;
CREATE TRIGGER trg_review_tasks_set_updated_at
  BEFORE UPDATE ON public.review_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_device_price_rollups_set_updated_at ON public.device_price_rollups;
CREATE TRIGGER trg_device_price_rollups_set_updated_at
  BEFORE UPDATE ON public.device_price_rollups
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_device_measurement_rollups_set_updated_at ON public.device_measurement_rollups;
CREATE TRIGGER trg_device_measurement_rollups_set_updated_at
  BEFORE UPDATE ON public.device_measurement_rollups
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_retailers_set_updated_at ON public.retailers;
CREATE TRIGGER trg_retailers_set_updated_at
  BEFORE UPDATE ON public.retailers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 12) Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX idx_retailer_products_category_source
  ON public.retailer_products(source_category_id);

CREATE INDEX idx_retailer_products_category_detected
  ON public.retailer_products(detected_category_id);

CREATE INDEX idx_retailer_products_processed
  ON public.retailer_products(processed)
  WHERE processed = FALSE;

CREATE INDEX idx_retailer_products_canonical_device
  ON public.retailer_products(canonical_device_id)
  WHERE canonical_device_id IS NOT NULL;

CREATE INDEX idx_retailer_products_normalized_title_trgm
  ON public.retailer_products
  USING gin (normalized_title gin_trgm_ops);

CREATE INDEX idx_devices_category_best
  ON public.devices(category_id, is_best_variant);

CREATE INDEX idx_devices_brand
  ON public.devices(brand);

CREATE INDEX idx_devices_status
  ON public.devices(status, discontinued);

CREATE INDEX idx_devices_family
  ON public.devices(product_family_id)
  WHERE product_family_id IS NOT NULL;

CREATE INDEX idx_devices_normalized_name_trgm
  ON public.devices
  USING gin (normalized_name gin_trgm_ops);

CREATE INDEX idx_device_offers_device
  ON public.device_offers(device_id);

CREATE INDEX idx_device_offers_device_price
  ON public.device_offers(device_id, in_stock, price);

CREATE INDEX idx_device_offers_retailer
  ON public.device_offers(retailer_id);

CREATE INDEX idx_device_price_history_device_recorded
  ON public.device_price_history(device_id, recorded_at DESC);

CREATE INDEX idx_measurements_source_category
  ON public.measurements(source, category_id);

CREATE INDEX idx_measurements_normalized_name_trgm
  ON public.measurements
  USING gin (normalized_name gin_trgm_ops);

CREATE INDEX idx_device_measurement_links_device
  ON public.device_measurement_links(device_id);

CREATE INDEX idx_device_measurement_links_measurement
  ON public.device_measurement_links(measurement_id);

CREATE INDEX idx_device_measurement_links_status_confidence
  ON public.device_measurement_links(status, confidence DESC);

CREATE UNIQUE INDEX uq_device_measurement_links_primary_approved_per_device
  ON public.device_measurement_links(device_id)
  WHERE is_primary = TRUE AND status = 'approved';

CREATE INDEX idx_review_tasks_status_priority
  ON public.review_tasks(status, priority DESC, created_at ASC);

CREATE INDEX idx_review_tasks_task_type
  ON public.review_tasks(task_type);

CREATE INDEX idx_device_price_rollups_lowest_price
  ON public.device_price_rollups(lowest_price);
