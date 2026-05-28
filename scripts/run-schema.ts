// Run with: npx tsx --env-file=.env.local scripts/run-schema.ts
import { Client } from 'pg'

const schema = `
-- All recommendations from all agents
CREATE TABLE IF NOT EXISTS recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent TEXT NOT NULL,
  skill TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT,
  body JSONB,
  status TEXT DEFAULT 'pending',
  slack_ts TEXT,
  slack_channel TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  executed_by TEXT DEFAULT 'system'
);

-- Skill execution log (audit trail)
CREATE TABLE IF NOT EXISTS skill_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent TEXT,
  skill TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT,
  error TEXT,
  output_summary TEXT,
  recommendations_created INT DEFAULT 0
);

-- Ad performance (synced from Meta)
CREATE TABLE IF NOT EXISTS ad_performance (
  ad_set_id TEXT PRIMARY KEY,
  ad_set_name TEXT,
  campaign_id TEXT,
  status TEXT,
  daily_budget NUMERIC,
  lifetime_budget NUMERIC,
  spend_total NUMERIC,
  spend_1d NUMERIC,
  spend_3d NUMERIC,
  spend_7d NUMERIC,
  spend_30d NUMERIC,
  leads_1d INT,
  leads_3d INT,
  leads_7d INT,
  leads_30d INT,
  leads_lifetime INT,
  cpl_7d NUMERIC,
  cpl_lifetime NUMERIC,
  cpql_7d NUMERIC,
  cpql_lifetime NUMERIC,
  cp2ql_7d NUMERIC,
  cp2ql_lifetime NUMERIC,
  cpm_d1 NUMERIC,
  launch_date DATE,
  last_synced TIMESTAMPTZ DEFAULT now()
);

-- Creative pipeline
CREATE TABLE IF NOT EXISTS creative_pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_name TEXT,
  ad_number INT,
  ad_type TEXT,
  funnel TEXT,
  status TEXT,
  sharepoint_link TEXT,
  canva_link TEXT,
  dropbox_link TEXT,
  launch_date DATE,
  source TEXT,
  concept_brief TEXT,
  script TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- SEO content drafts
CREATE TABLE IF NOT EXISTS seo_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT,
  keyword TEXT,
  title TEXT,
  content_html TEXT,
  meta_title TEXT,
  meta_description TEXT,
  slug TEXT,
  status TEXT DEFAULT 'draft',
  webflow_item_id TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Content calendar (organic)
CREATE TABLE IF NOT EXISTS content_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT,
  content_type TEXT,
  title TEXT,
  body TEXT,
  canva_link TEXT,
  script TEXT,
  scheduled_date DATE,
  status TEXT DEFAULT 'draft',
  approved_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Inspiration catalog
CREATE TABLE IF NOT EXISTS inspiration_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_page TEXT,
  page_id TEXT,
  ad_type TEXT,
  ad_url TEXT,
  thumbnail_url TEXT,
  concept_summary TEXT,
  scraped_at TIMESTAMPTZ DEFAULT now(),
  used_in_pipeline BOOLEAN DEFAULT false
);

-- Config / settings (API keys, inspiration pages, thresholds)
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);
`

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  console.log('Connected to Supabase Postgres')

  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0)

  for (const stmt of statements) {
    const tableName = stmt.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] ?? '...'
    await client.query(stmt)
    console.log(`  ✅ ${tableName}`)
  }

  await client.end()
  console.log('\nSchema complete — all 8 tables ready.')
}

run().catch(e => {
  console.error('Schema failed:', e.message)
  process.exit(1)
})
