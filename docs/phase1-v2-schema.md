# Phase 1: Retailer-First Schema (Destructive)

This phase defines the database contract for the rewrite using a **destructive reset**.

## Goals

- Make retailer ingestion the only source that can create canonical catalog devices.
- Keep measurements in a separate domain and link them explicitly.
- Add hard category safety constraints to prevent cross-category contamination.
- Provide read models (`catalog_products`, `measurement_lab`) for frontend cutover.

## Non-goals

- No ingestion script rewrite yet.
- No frontend query migration yet.
- No backfill/cutover in this phase.

## New Tables

- `retailer_products`: raw ingest lineage from retailers.
- `devices`: canonical devices (retailer-derived only).
- `device_families`: canonical family grouping for variants.
- `device_offers`: normalized offer rows per retailer listing.
- `device_price_history`: historical offer snapshots.
- `measurements`: source-agnostic measurement identity.
- `measurement_squig`: squig-specific metrics.
- `measurement_asr`: ASR-specific metrics.
- `measurement_spinorama`: spinorama-specific metrics.
- `device_measurement_links`: reviewable links with confidence/status.
- `review_tasks`: manual-review queue.
- `device_price_rollups`: best-price + stock summary.
- `device_measurement_rollups`: approved measurement summary per device.

## Hard Invariants

1. Canonical devices come from retailer ingestion:
   - `devices.created_from_retailer_product_id` is required and unique.
2. Measurement source/category compatibility:
   - `squig -> iem/headphone`
   - `asr -> dac/amp`
   - `spinorama -> speaker`
3. Device/measurement category match is enforced by trigger:
   - `trg_enforce_device_measurement_category_match`
4. Retailer listing identity is stable:
   - `UNIQUE(retailer_id, external_id)` in both `retailer_products` and `device_offers`.

## Security Model

- RLS enabled on all new tables.
- Public read policies for catalog-facing tables and measurement tables.
- `retailer_products` and `review_tasks` intentionally remain non-public.
- Public can only read approved links from `device_measurement_links`.

## Read Models

- `catalog_products`: canonical device row plus price and measurement rollups.
- `measurement_lab`: measurement records plus best link context.
- Compatibility views for transition: `products`, `price_listings`, `price_history`, `store_products`.

## Rollup Maintenance

- Price rollups auto-refresh via `device_offers` trigger.
- Measurement rollups auto-refresh via link and measurement payload triggers.
- Manual full refresh available via `refresh_all_rollups()`.

## Migration Files

- `supabase/migrations/014_retailer_first_destructive_reset.sql`
- `supabase/migrations/015_retailer_first_access_and_read_models.sql`

## Validation Checklist (Phase 1 Done)

- [ ] Migrations apply cleanly on a fresh DB.
- [ ] Category mismatch links are rejected by DB trigger.
- [ ] `catalog_products` returns rows when seeded with test data.
- [ ] `measurement_lab` shows unlinked and linked measurement records.
- [ ] Offer insert/update refreshes `device_price_rollups`.
- [ ] Link approval refreshes `device_measurement_rollups`.
- [ ] `get_filter_options()` returns expected JSON shape.
