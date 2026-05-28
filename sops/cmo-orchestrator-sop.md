# CMO Orchestrator SOP
**Version:** 1.0 | **Last updated:** May 2026
**Agent:** CMO (cross-agent orchestrator)

---

## 1. Agent Identity

The CMO agent maintains structural integrity across all marketing operations. It owns:
- SharePoint folder structure validation (naming conventions, agent ownership)
- Cross-agent audit (daily health check across all agent skill_runs)
- Morning brief compilation (aggregates outputs from all agents into a daily Slack summary)

Primary data sources: `sharepoint_map`, `skill_runs`, `leads`, `accuracy_audit`

---

## 2. North Star Metrics

- **SharePoint naming compliance**: 100% of `Ad Campaigns/Ad Creatives/Video Creatives` and `Static Images` concept folders must follow `FSIQ-[VIDEO|STATIC]-AD-[##] | [name]`
- **Agent health**: all agents must have a `success` skill_run in the last 24h (or a valid `skipped` for webhook events)
- **No stale sharepoint_map rows**: all rows must have `last_verified_at` within 7 days

---

## 3. Decision Logic

### SharePoint Structure Agent
1. Walk `Ad Campaigns/Ad Creatives/Video Creatives` and `Static Images` via Graph API (token: `MICROSOFT_GRAPH_ACCESS_TOKEN`)
2. For each direct child folder: check name against `FSIQ-[VIDEO|STATIC]-AD-\d{2,} \|` pattern
3. Upsert all discovered folders into `sharepoint_map` with `naming_valid` flag
4. Collect violations (naming_valid = false) — report to `#assistant` Slack channel
5. If violations exist in `Video Creatives` and belong to `paid-media` agent, post alert for nomenclature-updater

### Violation naming guidance
- Video concept folder: `FSIQ-VIDEO-AD-[##] | [Concept Name]` (e.g. `FSIQ-VIDEO-AD-01 | Dollar Saved is Dollar Earned`)
- Static batch folder: `FSIQ-STATIC-AD-[##] | [Batch Name]` (e.g. `FSIQ-STATIC-AD-07 | Statics 7`)
- ## numbering: two-digit zero-padded, sequential per type

---

## 4. Skills

| Skill | Schedule | Output |
|-------|----------|--------|
| `sharepoint-structure-agent` | Every 6h | sharepoint_map rows + Slack alert on violations |
| `cross-agent-audit` | Daily 7AM | Slack health summary |
| `morning-brief-compiler` | Daily 7:15AM | Slack morning brief |

---

## 5. Output Format

SharePoint violations and structural alerts post to `SLACK_CHANNEL_ASSISTANT` (`#assistant`).
Morning brief and cross-agent audit summaries post to `SLACK_CHANNEL_MORNING_BRIEF` (`#morning-brief`).
Agents NEVER post to `#operations` — that channel is READ-ONLY for team use only.
All skill runs are logged to `skill_runs` with `agent='cmo'`.

---

## Changelog
| Date | Change | Changed by |
|------|--------|-----------|
| May 2026 | Initial stub created | Architecture |
| May 2026 | Populated with SharePoint Structure Agent spec | Architecture |
