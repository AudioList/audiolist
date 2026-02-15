-- Expand review_tasks task types for retailer-first ingestion.
-- Adds:
--  - offer_link: manual review needed to link an offer to a device (or create a new device)
--  - ingest_error: non-fatal errors captured for later review/learning

ALTER TABLE public.review_tasks
  DROP CONSTRAINT IF EXISTS chk_review_task_type;

ALTER TABLE public.review_tasks
  ADD CONSTRAINT chk_review_task_type CHECK (
    task_type IN (
      'measurement_link',
      'retailer_category',
      'device_merge',
      'offer_link',
      'ingest_error'
    )
  );

-- Resolve duplicate open tasks per (task_type, retailer_product_id) so we can
-- enforce uniqueness without breaking existing data.
WITH ranked AS (
  SELECT
    id,
    task_type,
    retailer_product_id,
    ROW_NUMBER() OVER (
      PARTITION BY task_type, retailer_product_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.review_tasks
  WHERE retailer_product_id IS NOT NULL
)
DELETE FROM public.review_tasks t
USING ranked r
WHERE t.id = r.id
  AND r.rn > 1;

-- Enforce: at most one task per retailer product + task type.
-- This makes it safe to use UPSERT from scripts without manual DB edits.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_review_tasks_task_type_retailer_product'
  ) THEN
    ALTER TABLE public.review_tasks
      ADD CONSTRAINT uq_review_tasks_task_type_retailer_product
      UNIQUE (task_type, retailer_product_id);
  END IF;
END$$;

-- Helpful indexes for dashboard queries.
CREATE INDEX IF NOT EXISTS idx_review_tasks_status_priority
  ON public.review_tasks (status, priority DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_tasks_type_status
  ON public.review_tasks (task_type, status, created_at DESC);
