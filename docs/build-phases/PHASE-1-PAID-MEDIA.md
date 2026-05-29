# Phase 1 — Paid Media Agent

## Status

| Layer | Status |
|-------|--------|
| Skills | See inventory below |
| Dashboard | PENDING (builds after all skills done) |
| Slack interactions | PARTIAL (approve/skip working) |

## Skills inventory

| Skill | Status |
|-------|--------|
| performance-sync.skill.ts | ✅ Complete |
| pixel-monitor.skill.ts | ✅ Complete |
| app-health-monitor.skill.ts | ✅ Complete |
| ads-library-scraper.skill.ts | ✅ Complete (pending Meta App API approval) |
| script-generator.skill.ts | 🔄 In Progress |
| campaign-brief-generator.skill.ts | ⏳ Pending |
| footage-watcher.skill.ts | ⏳ Pending |
| ghl-webhook-summary.skill.ts | ⏳ Pending |
| supabase-accuracy-audit.skill.ts | ⏳ Pending |
| static-creator.skill.ts | ⏳ Pending |
| slack-notify.skill.ts | ⏳ Pending |
| sharepoint-structure-agent.skill.ts | ⏳ Pending |
| paid-media.agent.ts (orchestrator) | ⏳ Pending |

---

## Dashboard sections for /paid-media

### 1. Performance Panel

- **Data source:** `ad_performance` table
- **Refresh:** on page load + after approve action
- Shows:
  - Active ad sets with CPQL / CP2QL / CP3QL windows
  - Scale ladder position per ad set
  - Budget allocation vs ceiling
  - Dual-source verification status badge (Sheet SOT / Supabase verified)

### 2. Recommendations Inbox

- **Data source:** `recommendations` table — `WHERE status = 'pending' AND agent = 'paid-media'`
- Shows:
  - All pending approve/skip decisions
  - Same data as Slack message but in table form
  - Bulk approve capability
  - Decision history (approved/rejected + timestamp)

### 3. Creative Pipeline

- **Data source:** `creative_pipeline` + `ad_set_naming`
- Shows:
  - All concepts by status
  - Naming convention builder (already built)
  - Script drafts from script-generator
  - Brief status from campaign-brief-generator

### 4. Inspiration Feed

- **Data source:** `inspiration_catalog`
- Shows:
  - 2 video + 2 static unused ads
  - Load more on demand
  - Mark as used
- *(Architecture defined — builds with dashboard)*

### 5. Script Concepts

- **Data source:** `creative_pipeline WHERE script_draft IS NOT NULL AND status = 'In Progress'`
- Shows:
  - Generated scripts awaiting review
  - Approve → moves to 'Recording Pending'
  - Reject → moves to 'Killed'
  - Edit inline

### 6. Pixel & App Health

- **Data source:** `skill_runs WHERE skill IN ('pixel-monitor', 'app-health-monitor')`
- Shows:
  - Current pixel status
  - Food Cost Analyzer uptime %
  - Last checked timestamp
  - Alert history

### 7. Accuracy Audit

- **Data source:** `accuracy_audit` table
- Shows:
  - 14-day streak progress
  - Daily scores per check
  - Days until Section 15 can be disabled

---

## Slack interactions for paid-media

All button handlers → `/api/webhooks/slack`

| Action ID | Effect |
|-----------|--------|
| `approve_recommendation` | Execute Meta API budget change + create ClickUp task + update dashboard recommendations panel |
| `skip_recommendation` | Mark rejected + update dashboard |
| `approve_script` | Move creative_pipeline status to 'Recording Pending' + trigger campaign-brief-generator |
| `reject_script` | Move status to 'Killed' |
| `approve_static` | Trigger static-creator Canva flow |
