# FSIQ Marketing OS — Build Phases

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
