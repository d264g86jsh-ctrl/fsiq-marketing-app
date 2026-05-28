-- Migration: add ad_set_token, targeting, week, editor_assigned, lp_code to creative_pipeline
-- and create pending_renames table.
-- Run in Supabase SQL editor or via: npx tsx --env-file=.env.local scripts/seed-pending-renames.ts
--
-- All ADD COLUMN statements are idempotent (IF NOT EXISTS).

ALTER TABLE creative_pipeline
  ADD COLUMN IF NOT EXISTS ad_set_token    TEXT,
  ADD COLUMN IF NOT EXISTS targeting       TEXT DEFAULT 'Broad',
  ADD COLUMN IF NOT EXISTS week            TEXT,
  ADD COLUMN IF NOT EXISTS editor_assigned TEXT,
  ADD COLUMN IF NOT EXISTS lp_code         TEXT;

-- Backfill lp_code from existing funnel column where possible
UPDATE creative_pipeline
SET lp_code = funnel
WHERE lp_code IS NULL
  AND funnel IN ('LP1-CS', 'LP2-EB', 'LP3-EB');

-- pending_renames: holds proposed SharePoint folder renames.
-- approved stays false until Rodrigo explicitly approves each row.
-- sharepoint-structure-agent and nomenclature-updater read this table.
-- DO NOT rename any folder until approved = true.
CREATE TABLE IF NOT EXISTS pending_renames (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  sharepoint_item_id  TEXT,
  current_name        TEXT         NOT NULL,
  path                TEXT         NOT NULL UNIQUE,
  proposed_name       TEXT         NOT NULL,
  concept_id          TEXT,
  item_type           TEXT         DEFAULT 'folder',
  approved            BOOLEAN      DEFAULT false,
  flag                TEXT,        -- 'confirmed', 'needs_review', 'never_produced', 'duplicate'
  notes               TEXT,
  created_at          TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pending_renames_approved_idx ON pending_renames (approved);
CREATE INDEX IF NOT EXISTS pending_renames_concept_idx  ON pending_renames (concept_id);

-- ad_set_naming: one row per Meta ad set name produced by the Naming Builder.
-- creative_pipeline holds ad-level rows; this table holds the ad-set-level naming
-- so the same concept can carry multiple ad sets (talent splits, broad vs interest).
CREATE TABLE IF NOT EXISTS ad_set_naming (
  id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  type               TEXT         NOT NULL,                 -- 'VIDEO' | 'STATIC'
  concept_id         TEXT         NOT NULL,                 -- e.g. FSIQ-VIDEO-AD-38
  ad_set_token       TEXT         NOT NULL,                 -- e.g. "VSL_1" or "Media Pouch"
  talent             TEXT,                                  -- e.g. "Chad" (video only, optional)
  targeting          TEXT         DEFAULT 'Broad',          -- 'Broad' | 'Interest'
  lp_code            TEXT,                                  -- 'LP1-CS' | 'LP2-EB' | 'LP3-EB'
  final_ad_set_name  TEXT         NOT NULL,
  meta_renamed       BOOLEAN      DEFAULT false,
  status             TEXT         DEFAULT 'active',
  created_at         TIMESTAMPTZ  DEFAULT now(),
  updated_at         TIMESTAMPTZ  DEFAULT now(),
  UNIQUE (concept_id, final_ad_set_name)
);

CREATE INDEX IF NOT EXISTS ad_set_naming_concept_idx  ON ad_set_naming (concept_id);
CREATE INDEX IF NOT EXISTS ad_set_naming_type_idx     ON ad_set_naming (type);
CREATE INDEX IF NOT EXISTS ad_set_naming_renamed_idx  ON ad_set_naming (meta_renamed);
