# FSIQ Marketing OS — Architecture
**Last updated:** May 2026

## System Overview

5 specialized agents + 1 CMO Orchestrator, all feeding into a unified dashboard deployed on Vercel. Supabase is the central data layer for all agents. Agents read their SOP files at runtime and pass them as context to every Claude API call.

## Agent Map

| Agent | File | Skills | Schedule |
|-------|------|--------|----------|
| CMO Orchestrator | `cmo.agent.ts` | 3 | Daily 7AM |
| Paid Media | `paid-media.agent.ts` | 9 | Multiple cron |
| SEO + Web | `seo.agent.ts` | 7 | Daily + weekly |
| Organic Content | `organic.agent.ts` | 8 | Daily |
| Comms + PM | `comms.agent.ts` | 8 | Multiple cron |

## Data Flow

```
GHL Workflows ──► POST /api/webhooks/ghl ──────────────────► Supabase leads
  (Form Submit,       parseSpend() + classifyStage()           (annual_food_spend,
   Tag Added,         adset_id/UTM attribution                  lead_stage,
   Contact Created)                                             adset_id)

Meta API ──────────────────────────────────────────────────► Supabase ad_performance
  (active ad sets,    performance-sync.skill.ts                (per-ad-set snapshots)
   spend windows,     daily at 6AM
   CPM, leads)

Supabase leads ────────────────────────────────────────────► Claude API
  + Supabase sheet_sot  performance-sync.skill.ts               (SOP-driven decisions)
  (dual-source verify)  Section 15: KILL/SCALE DOWN
                        blocked unless both agree

Claude API ────────────────────────────────────────────────► Supabase recommendations
  (structured JSON      performance-sync.skill.ts               (pending decisions)
   decisions)

Supabase recommendations ──────────────────────────────────► Slack #MediaBuying
  (pending)             slack-notify.skill.ts                   (approve/skip buttons)
                        daily at 6:05AM

Slack button click ────────────────────────────────────────► /api/approve
  (approve/skip)        /api/webhooks/slack                   → Supabase status update
                                                              → Meta budget change (TODO)
```

## SOP ↔ Skill Pairing

Every SOP is loaded at runtime via `fs.readFileSync`. The SOP string is passed to every Claude API call as context. See `AGENTS.md` for the full enforcement rule.

| SOP File | Status | Paired Skills |
|----------|--------|---------------|
| `paid-media-agent-sop.md` | ✅ Complete (v1.2) | All 9 paid-media skills |
| `creative-pipeline-sop.md` | ✅ Complete (v1.0) | performance-sync, ads-library-scraper, static-creator, campaign-brief-generator |
| `seo-agent-sop.md` | 📝 Stub | All 7 seo skills |
| `organic-content-agent-sop.md` | 📝 Stub | All 8 organic skills |
| `comms-agent-sop.md` | 📝 Stub | All 8 comms skills |
| `cmo-orchestrator-sop.md` | 📝 Stub | All 3 cmo skills |
| `video-review-qa-framework.md` | 📝 Stub | footage-watcher, campaign-brief-generator |
| `neil-voice-guide.md` | 📝 Stub | linkedin-writer |
| `fsiq-brand-voice-guide.md` | 📝 Stub | linkedin-writer, content-ideation |
| `ad-scripting-rules.md` | 📝 Stub | script-generator |
| `campaign-brief-template.md` | 📝 Stub | campaign-brief-generator |

## Supabase Tables

| Table | Source | Purpose | Status |
|-------|--------|---------|--------|
| `leads` | GHL webhook (real-time) | All contacts with lead_stage classification | ✅ 804 rows backfilled |
| `daily_spend` | Sheet backfill | Aggregate daily Meta spend (Aug 2024 → now) | ✅ 255 rows |
| `ad_performance` | Meta API + skill upsert | Per-ad-set metrics snapshot | ✅ 67 rows |
| `sheet_sot` | `sync-sheet-sot.ts` script | Google Sheet SOT mirror for dual-source verify | ✅ 1 row (AD-28) |
| `creative_pipeline` | Sheet backfill | Ad creative registry (all 90 ads) | ✅ 90 rows |
| `creative_performance` | Meta API (future) | Per-creative performance data | ⏳ Empty |
| `recommendations` | Agent skills | Pending budget/action decisions | ✅ Active |
| `skill_runs` | Agent skills | Skill execution log | ✅ Active |

## Lead Qualification Model (3-Stage)

| Stage | Threshold | Metric | Goal | Scale Down | Kill | Priority |
|-------|-----------|--------|------|------------|------|----------|
| `cpql` | ≥ $600k food spend | CPQL | $100 | $200 | $300 | Primary early signal |
| `cp2ql` | ≥ $1M food spend | CP2QL | $150 | $300 | $450 | **Primary scaling signal** |
| `cp3ql` | ≥ $2M food spend | CP3QL | $400 | $700 | $900 | Quality floor |
| `unqualified` | < $600k | — | — | — | — | Never use for decisions |

**Benchmarks** (from $133,811 lifetime spend, 255 days):
- CP2QL ($1M+): $206 lifetime | $183 7d
- CP3QL ($2M+): $399 lifetime | $243 7d

## Dual-Source Verification (SOP Section 15 — Active)

All KILL and SCALE DOWN decisions require both Supabase leads AND Google Sheet SOT to agree.

| Scenario | Action |
|----------|--------|
| Supabase 0 leads, Sheet has leads | Use Sheet; flag `sheet_sot`; no KILL |
| Both agree underperforming | Allow KILL/SCALE DOWN; flag `supabase_verified` |
| Sources conflict | Use Sheet; flag `conflict_sheet_used`; no KILL |
| Sheet has no entry | Hold only; flag `attribution_pending`; never KILL |

To disable: remove Section 15 from `paid-media-agent-sop.md`. No code change needed.

## Channel Routing Rules (never violate)

| Channel | Env var | What goes here |
|---------|---------|----------------|
| `#operations` | `SLACK_CHANNEL_MEETING_TRANSCRIPTS` | **READ-ONLY. Agents NEVER post here.** Team-only, for meeting transcript links. |
| `#assistant` | `SLACK_CHANNEL_ASSISTANT` | SharePoint violations, naming violations, missing subfolders, structural alerts |
| `#MediaBuying` | `SLACK_CHANNEL_MEDIA_BUYING` | Ad decisions, budget changes, pixel/app health, accuracy alerts, GHL summary |
| `#video-editor` | `SLACK_CHANNEL_VIDEO_EDITOR` | Footage detected, script matches, brief confirmations, QA requests |
| `#seo-agent` | `SLACK_CHANNEL_SEO` | Rank changes, blog drafts, GMB suggestions, technical audit findings |
| `#organic-agent` | `SLACK_CHANNEL_ORGANIC` | Content ideas, LinkedIn drafts, Ads Library digest |
| `#morning-brief` | `SLACK_CHANNEL_MORNING_BRIEF` | Daily CMO summary only |

All channel keys are defined in `lib/slack.ts`. Never hardcode channel names or reference `SLACK_CHANNEL_OPERATIONS`.

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/webhooks/ghl` | POST | GHL → Supabase lead sync (Contact Created/Updated) |
| `/api/webhooks/slack` | POST | Slack button handler (approve/skip) |
| `/api/webhooks/meta` | GET/POST | Meta Pixel webhook verification + events |
| `/api/approve` | POST | Execute approved recommendations |
| `/api/agents/run` | POST | Manual skill trigger (also used by Vercel Cron) |
| `/api/agents/status` | GET | Recent skill run log |

## Cron Schedule

| Time | Agent | Skill |
|------|-------|-------|
| Daily 6:00AM | paid-media | performance-sync |
| Daily 6:05AM | paid-media | slack-notify |
| Daily 6:30AM | comms | morning-brief |
| Daily 7:00AM | cmo | morning-brief-compiler |
| Daily 7:00AM | seo | rank-tracker |
| Monday 8:00AM | seo | weekly-report |
| Monday 9:00AM | paid-media | weekly-health-check |

## Deployment

- **Hosting:** Vercel (Next.js 14 App Router)
- **Production URL:** https://fsiq-marketing-os.vercel.app
- **GHL webhook endpoint:** `/api/webhooks/ghl`
- **Supabase project:** ebbbooaxlucxybycudrf.supabase.co
- **Status:** ⚠️ Not yet deployed — run `vercel --prod` to activate GHL webhook

## Skills Build Status

### Paid Media Agent (9 skills)
| # | Skill | Status |
|---|-------|--------|
| 1.1 | performance-sync | ✅ Complete |
| 1.2 | slack-notify | 🔜 Next |
| 1.3 | ads-library-scraper | 📝 Stub |
| 1.4 | script-generator | 📝 Stub |
| 1.5 | campaign-brief-generator | 📝 Stub |
| 1.6 | footage-watcher | 📝 Stub |
| 1.7 | static-creator | 📝 Stub |
| 1.8 | pixel-monitor | 📝 Stub |
| 1.9 | app-health-monitor | 📝 Stub |

### All Other Agents
All skills are stubs — will be built after paid-media agent is complete and in production.
