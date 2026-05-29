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
  posts to Slack with action buttons →
  Slack button click hits /api/webhooks/slack →
  updates Supabase record →
  dashboard reflects updated state in real time

Dashboard actions (approve/reject/edit) →
  hit /api/approve or skill-specific routes →
  update Supabase →
  optionally post confirmation to Slack
```

## Channel → Dashboard mapping

| Slack Channel | Dashboard Page |
|---------------|----------------|
| #MediaBuying | /paid-media |
| #video-editor | /paid-media (creative pipeline section) |
| #seo-agent | /seo |
| #organic-agent | /organic |
| #morning-brief | /inbox (CMO view) |
| #assistant | /settings (system health section) |
