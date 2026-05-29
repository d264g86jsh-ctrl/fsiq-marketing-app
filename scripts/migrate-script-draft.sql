-- Migration: add script_draft column to creative_pipeline
-- Idempotent — safe to run multiple times.
-- Run in Supabase SQL editor before testing script-generator.skill.ts

ALTER TABLE creative_pipeline
  ADD COLUMN IF NOT EXISTS script_draft TEXT;
