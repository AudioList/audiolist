-- 006_community_spam_prevention.sql
--
-- Captures missing community schema (columns, tables, RPCs) and adds
-- spam prevention: CHECK constraints, rate-limiting triggers, moderation support.
-- Idempotent -- safe to re-run.

-- ============================================================
-- A) Add missing columns to builds (already in prod, capturing here)
-- ============================================================
ALTER TABLE builds ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE builds ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
ALTER TABLE builds ADD COLUMN IF NOT EXISTS upvotes INTEGER DEFAULT 0;
ALTER TABLE builds ADD COLUMN IF NOT EXISTS author_name TEXT;
ALTER TABLE builds ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- ============================================================
-- B) New columns for spam prevention and moderation
-- ============================================================
ALTER TABLE builds ADD COLUMN IF NOT EXISTS client_hash TEXT;
ALTER TABLE builds ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT FALSE;
ALTER TABLE builds ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMPTZ;

-- ============================================================
-- C) CHECK constraints on field lengths
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_builds_name_length') THEN
    ALTER TABLE builds ADD CONSTRAINT chk_builds_name_length
      CHECK (name IS NULL OR char_length(name) <= 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_builds_description_length') THEN
    ALTER TABLE builds ADD CONSTRAINT chk_builds_description_length
      CHECK (description IS NULL OR char_length(description) <= 500);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_builds_author_name_length') THEN
    ALTER TABLE builds ADD CONSTRAINT chk_builds_author_name_length
      CHECK (author_name IS NULL OR char_length(author_name) <= 50);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_build_items_quantity') THEN
    ALTER TABLE build_items ADD CONSTRAINT chk_build_items_quantity
      CHECK (quantity >= 1 AND quantity <= 99);
  END IF;
END$$;

-- ============================================================
-- D) build_votes table
-- ============================================================
CREATE TABLE IF NOT EXISTS build_votes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id    UUID NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  voter_hash  TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_build_votes_build_voter'
  ) THEN
    ALTER TABLE build_votes
      ADD CONSTRAINT uq_build_votes_build_voter UNIQUE (build_id, voter_hash);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_build_votes_build ON build_votes(build_id);
CREATE INDEX IF NOT EXISTS idx_build_votes_voter ON build_votes(voter_hash);
CREATE INDEX IF NOT EXISTS idx_build_votes_created ON build_votes(created_at);

ALTER TABLE build_votes ENABLE ROW LEVEL SECURITY;

-- RLS: anyone can read, insert, and delete their own votes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'build_votes_select' AND tablename = 'build_votes') THEN
    CREATE POLICY "build_votes_select" ON build_votes FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'build_votes_insert' AND tablename = 'build_votes') THEN
    CREATE POLICY "build_votes_insert" ON build_votes FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'build_votes_delete' AND tablename = 'build_votes') THEN
    CREATE POLICY "build_votes_delete" ON build_votes FOR DELETE USING (true);
  END IF;
END$$;

-- ============================================================
-- E) RPC functions for upvotes (SECURITY DEFINER to bypass RLS)
-- ============================================================
CREATE OR REPLACE FUNCTION increment_upvotes(build_uuid UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE builds
  SET upvotes = upvotes + 1, updated_at = NOW()
  WHERE id = build_uuid
  RETURNING upvotes;
$$;

CREATE OR REPLACE FUNCTION decrement_upvotes(build_uuid UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE builds
  SET upvotes = GREATEST(upvotes - 1, 0), updated_at = NOW()
  WHERE id = build_uuid
  RETURNING upvotes;
$$;

-- ============================================================
-- F) Rate-limiting triggers
-- ============================================================

-- Index for efficient rate limit lookups
CREATE INDEX IF NOT EXISTS idx_builds_client_hash_created
  ON builds(client_hash, created_at)
  WHERE client_hash IS NOT NULL;

-- F1: Limit builds per client_hash per hour (max 5)
CREATE OR REPLACE FUNCTION check_build_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  IF NEW.client_hash IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO recent_count
  FROM builds
  WHERE client_hash = NEW.client_hash
    AND created_at > NOW() - INTERVAL '1 hour';

  IF recent_count >= 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many builds created recently. Please wait before creating another.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_build_rate_limit ON builds;
CREATE TRIGGER trg_build_rate_limit
  BEFORE INSERT ON builds
  FOR EACH ROW
  EXECUTE FUNCTION check_build_rate_limit();

-- F2: Limit build_items per build (max 12)
CREATE OR REPLACE FUNCTION check_build_items_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  item_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO item_count
  FROM build_items
  WHERE build_id = NEW.build_id;

  IF item_count >= 12 THEN
    RAISE EXCEPTION 'Build item limit exceeded: maximum 12 items per build.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_build_items_limit ON build_items;
CREATE TRIGGER trg_build_items_limit
  BEFORE INSERT ON build_items
  FOR EACH ROW
  EXECUTE FUNCTION check_build_items_limit();

-- F3: Daily vote limit per voter_hash (max 30)
CREATE OR REPLACE FUNCTION check_vote_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  daily_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO daily_count
  FROM build_votes
  WHERE voter_hash = NEW.voter_hash
    AND created_at > NOW() - INTERVAL '24 hours';

  IF daily_count >= 30 THEN
    RAISE EXCEPTION 'Vote rate limit exceeded: too many votes today. Please try again later.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vote_rate_limit ON build_votes;
CREATE TRIGGER trg_vote_rate_limit
  BEFORE INSERT ON build_votes
  FOR EACH ROW
  EXECUTE FUNCTION check_vote_rate_limit();

-- ============================================================
-- G) Indexes for community listing
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_builds_community
  ON builds(created_at DESC)
  WHERE is_public = TRUE AND is_flagged = FALSE;

CREATE INDEX IF NOT EXISTS idx_builds_community_popular
  ON builds(upvotes DESC)
  WHERE is_public = TRUE AND is_flagged = FALSE;
