-- Migration: script-generator v2 — multi-stage pipeline
-- Run in Supabase SQL editor before deploying script-generator v2.
-- All statements are idempotent (safe to run multiple times).

-- 1. Add approved column to inspiration_catalog
ALTER TABLE inspiration_catalog
  ADD COLUMN IF NOT EXISTS approved BOOL DEFAULT false;

-- 2. Create script_topics table
CREATE TABLE IF NOT EXISTS script_topics (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  inspiration_ids       TEXT[]      NOT NULL DEFAULT '{}',
  topics                JSONB       NOT NULL DEFAULT '[]',
  approved_topics       JSONB       NOT NULL DEFAULT '[]',
  status                TEXT        NOT NULL DEFAULT 'pending',
  slack_ts              TEXT,
  slack_channel         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Add script_topic_id to creative_pipeline
ALTER TABLE creative_pipeline
  ADD COLUMN IF NOT EXISTS script_topic_id UUID REFERENCES script_topics(id);

-- 4. Add test_hooks to creative_pipeline (stores Stage 3 A/B hook variations)
--    Format: [{"hook_iphone": "...", "hook_studio": "...", "label": "Variation A"}]
ALTER TABLE creative_pipeline
  ADD COLUMN IF NOT EXISTS test_hooks JSONB;

-- 5. Add Slack message tracking to creative_pipeline (used by edit-in-thread flow)
ALTER TABLE creative_pipeline
  ADD COLUMN IF NOT EXISTS slack_ts TEXT;

ALTER TABLE creative_pipeline
  ADD COLUMN IF NOT EXISTS slack_channel TEXT;
