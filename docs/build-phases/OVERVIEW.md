# FSIQ Marketing OS — Build Phases

> **Living handoff log:** See [PROJECT-PROGRESS.md](./PROJECT-PROGRESS.md) for the current build phase, recent changes, known incomplete areas, and the next intended task. Check this file before reviewing or continuing work.

## Dashboard Architecture Principle

Every skill has two outputs:
1. Slack — real-time notification with action buttons (approve/reject/skip)
2. Dashboard — persistent record of all skill outputs, decisions, and state

Slack is for real-time interaction.
Dashboard is the source of truth for history, analytics, and bulk management.

## Agent ↔ Dashboard ↔ Slack relationship

```
Agent skill runs →
  writes to Supabase (recommendations, skill_runs, or agent-specific table) →
  posts to Slack inline with action buttons (saves slack_ts back to row) →
  Slack button click hits /api/webhooks/slack →
  updates Supabase record →
  dashboard reflects updated state in real time

Dashboard actions (approve/reject/edit) →
  hit /api/approve or skill-specific routes →
  update Supabase →
  optionally post confirmation to Slack
```

## Inline vs catch-up Slack posting

Skills post to Slack **inline** (immediately after writing to Supabase) and save `slack_ts` back to the recommendation row. This means the Slack message and the DB record are always in sync.

`slack-notify.skill.ts` is a **catch-up fallback** — it runs after the primary skill and picks up any rows where `slack_ts IS NULL` (inline post failed). Under normal operation it sends nothing.

## Channel → Dashboard mapping

| Slack Channel | Dashboard Page |
|---------------|----------------|
| #MediaBuying | /paid-media |
| #video-editor | /paid-media (creative pipeline section) |
| #seo-agent | /seo |
| #organic-agent | /organic |
| #morning-brief | /inbox (CMO view) |
| #assistant | /settings (system health section) |

## Dashboard pattern

Every skill writes structured output to Supabase using consistent field names. Dashboard pages use Supabase realtime subscriptions to show live updates without polling.

**No skill needs to know about the dashboard.** It writes clean data to Supabase; the dashboard reads it.

## Supabase → Dashboard source map

### /paid-media

| Section | Table | Query |
|---------|-------|-------|
| Recommendations | `recommendations` | `WHERE agent='paid-media' ORDER BY created_at DESC` |
| Performance | `ad_performance` | all rows, order by `cp2ql_7d ASC` |
| Creative Pipeline | `creative_pipeline` | all rows, filter by status |
| Inspiration Feed | `inspiration_catalog` | `WHERE used=false ORDER BY delivery_start_time DESC` |
| Script Concepts | `creative_pipeline` | `WHERE script_draft IS NOT NULL AND status='In Progress'` |
| System Health | `skill_runs` | `WHERE skill IN ('pixel-monitor','app-health-monitor','supabase-accuracy-audit')` |

### /seo
| Section | Table | Query |
|---------|-------|-------|
| Keyword Rankings | `seo_content` | `WHERE type='rank'` |
| Blog Pipeline | `seo_content` | `WHERE type='blog_draft'` |
| GMB Suggestions | `recommendations` | `WHERE agent='seo' AND skill='gmb-manager'` |
| Technical Health | `skill_runs` | `WHERE skill='technical-audit'` |

### /organic
| Section | Table | Query |
|---------|-------|-------|
| Content Calendar | `content_calendar` | all, order by `publish_date ASC` |
| LinkedIn Drafts | `content_calendar` | `WHERE platform='linkedin' AND status='draft'` |
| Content Ideas | `recommendations` | `WHERE agent='organic' AND skill='content-ideation'` |

### /inbox (CMO)
| Section | Table | Query |
|---------|-------|-------|
| All Pending | `recommendations` | `WHERE status='pending' ORDER BY created_at DESC` |
| Daily Brief | `skill_runs` | `WHERE skill='morning-brief-compiler' LIMIT 1` |
| Agent Health | `skill_runs` | latest per skill, all agents |
