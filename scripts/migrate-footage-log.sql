-- footage_log table
-- Tracks video files discovered in SharePoint /Raw Footage/ subfolders.
-- Written by footage-watcher.skill.ts on each hourly run.
-- Read by nomenclature-updater.skill.ts and script-matcher.skill.ts.

CREATE TABLE IF NOT EXISTS footage_log (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_folder_name TEXT          NOT NULL,
  concept_id          TEXT,                        -- FSIQ-VIDEO-AD-XX (null until nomenclature-updater assigns)
  file_name           TEXT          NOT NULL,
  sharepoint_item_id  TEXT          NOT NULL UNIQUE,
  file_size           BIGINT,
  raw_footage_path    TEXT          NOT NULL,       -- full SharePoint path to /Raw Footage/ folder
  status              TEXT          NOT NULL DEFAULT 'new'
                                    CHECK (status IN ('new', 'renaming', 'transcribing', 'matched', 'posted', 'skipped')),
  detected_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  processed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS footage_log_status_idx     ON footage_log (status);
CREATE INDEX IF NOT EXISTS footage_log_concept_id_idx ON footage_log (concept_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_footage_log_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'footage_log_updated_at'
  ) THEN
    CREATE TRIGGER footage_log_updated_at
      BEFORE UPDATE ON footage_log
      FOR EACH ROW EXECUTE FUNCTION set_footage_log_updated_at();
  END IF;
END;
$$;
