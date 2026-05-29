# Phase 4 — Comms Agent

## Status

| Layer | Status |
|-------|--------|
| Skills | PENDING |
| Dashboard | PENDING |
| Slack interactions | N/A — outputs are informational |

## Skills inventory

| Skill | Status |
|-------|--------|
| morning-brief.skill.ts | ⏳ Pending |
| triweekly-email.skill.ts | ⏳ Pending |
| meeting-followup.skill.ts | ⏳ Pending |
| clickup-sync.skill.ts | ⏳ Pending |
| sharepoint-organizer.skill.ts | ⏳ Pending |
| zapier-monitor.skill.ts | ⏳ Pending |
| monthly-review.skill.ts | ⏳ Pending |
| leadership-creative-pick.skill.ts | ⏳ Pending |

---

## Dashboard sections for /comms

### 1. Morning Brief Archive

- **Data source:** `skill_runs WHERE skill = 'morning-brief'`
- Shows: daily brief history, full text expand

### 2. Meeting Followups

- **Data source:** `skill_runs WHERE skill = 'meeting-followup'`
- Shows: generated action items per meeting, ClickUp task links

### 3. ClickUp Sync Log

- **Data source:** `skill_runs WHERE skill = 'clickup-sync'`
- Shows: tasks created/updated per run, sync errors

### 4. Email Drafts

- **Data source:** `skill_runs WHERE skill = 'triweekly-email'`
- Shows: drafted emails awaiting send, sent history

### 5. Monthly Review

- **Data source:** `skill_runs WHERE skill = 'monthly-review'`
- Shows: last report, key metrics snapshot

### 6. Zapier Health

- **Data source:** `skill_runs WHERE skill = 'zapier-monitor'`
- Shows: active Zap count, error rate, last checked

---

## Slack interactions

No interactive buttons — comms agent outputs are informational only. All outputs post to #assistant or #morning-brief as one-way digests.
