-- Migration: create inspiration_catalog table and add extended columns
-- Run in Supabase SQL editor.
-- All statements are idempotent (IF NOT EXISTS / IF NOT EXISTS column).

CREATE TABLE IF NOT EXISTS inspiration_catalog (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id          TEXT         UNIQUE,          -- Meta ad archive ID (stable dedup key)
  source_page         TEXT         NOT NULL,        -- page name from config
  ad_type             TEXT,                         -- 'video' | 'static'
  media_type          TEXT,                         -- raw meta media_type field
  headline            TEXT,                         -- ad_creative_link_titles[0]
  body_text           TEXT,                         -- ad_creative_bodies[0]
  snapshot_url        TEXT,                         -- ad_snapshot_url
  publisher_platforms TEXT[],                       -- e.g. ['facebook', 'instagram']
  delivery_start_time TIMESTAMPTZ,                  -- ad_delivery_start_time
  scraped_at          TIMESTAMPTZ  DEFAULT now(),
  used                BOOLEAN      DEFAULT false,
  created_at          TIMESTAMPTZ  DEFAULT now()
);

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
