-- Migration: inspiration_catalog — fully idempotent
-- Safe to run multiple times. Handles both fresh installs and pre-existing tables.
-- Run in Supabase SQL editor.

-- Step 1: create table if it doesn't exist yet (minimal required columns)
CREATE TABLE IF NOT EXISTS inspiration_catalog (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Step 2: add all columns (idempotent — each is IF NOT EXISTS)
ALTER TABLE inspiration_catalog
  ADD COLUMN IF NOT EXISTS library_id          TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS source_page         TEXT,
  ADD COLUMN IF NOT EXISTS ad_type             TEXT,
  ADD COLUMN IF NOT EXISTS media_type          TEXT,
  ADD COLUMN IF NOT EXISTS headline            TEXT,
  ADD COLUMN IF NOT EXISTS body_text           TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_url        TEXT,
  ADD COLUMN IF NOT EXISTS video_url           TEXT,
  ADD COLUMN IF NOT EXISTS video_thumbnail     TEXT,
  ADD COLUMN IF NOT EXISTS image_url           TEXT,
  ADD COLUMN IF NOT EXISTS cta_text            TEXT,
  ADD COLUMN IF NOT EXISTS cta_type            TEXT,
  ADD COLUMN IF NOT EXISTS link_url            TEXT,
  ADD COLUMN IF NOT EXISTS publisher_platforms TEXT[],
  ADD COLUMN IF NOT EXISTS delivery_start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_active           BOOL DEFAULT true,
  ADD COLUMN IF NOT EXISTS scraped_at          TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS used                BOOLEAN DEFAULT false;

-- Step 3: indexes
CREATE INDEX IF NOT EXISTS inspiration_catalog_library_id_idx  ON inspiration_catalog (library_id);
CREATE INDEX IF NOT EXISTS inspiration_catalog_ad_type_idx     ON inspiration_catalog (ad_type);
CREATE INDEX IF NOT EXISTS inspiration_catalog_used_idx        ON inspiration_catalog (used);
CREATE INDEX IF NOT EXISTS inspiration_catalog_scraped_at_idx  ON inspiration_catalog (scraped_at DESC);

-- config table: generic key/value store read by multiple skills
CREATE TABLE IF NOT EXISTS config (
  key        TEXT  PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
