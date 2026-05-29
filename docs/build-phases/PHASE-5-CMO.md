# Phase 5 — CMO Orchestrator

## Status

| Layer | Status |
|-------|--------|
| Skills | PENDING (builds last — depends on all agents) |
| Dashboard | PENDING |
| Slack interactions | N/A |

## Skills inventory

| Skill | Status |
|-------|--------|
| cross-agent-audit.skill.ts | ⏳ Pending |
| morning-brief-compiler.skill.ts | ⏳ Pending |
| sop-updater.skill.ts | ⏳ Pending |

---

## Role

The CMO orchestrator runs last in the daily cycle. It reads outputs from all agents (paid-media, SEO, organic, comms), synthesizes them into a single executive brief, and posts to #morning-brief.

It also runs cross-agent audits to catch gaps: skills that didn't fire, Slack messages with no Approve/Skip response after 24h, SOPs that are out of date relative to codebase state.

---

## Dashboard sections for /inbox

The /inbox page is the unified CMO view — one place to see all pending decisions across all agents.

### 1. All Pending Recommendations

- **Data source:** `recommendations WHERE status = 'pending'`
- **Grouped by:** agent (paid-media / SEO / organic / comms)
- Shows: all approve/skip decisions across every agent in one view
- Bulk actions: approve all, skip all by agent

### 2. Daily Brief

- **Data source:** `skill_runs WHERE skill = 'morning-brief-compiler' ORDER BY completed_at DESC LIMIT 1`
- Shows: today's compiled brief, expandable sections per agent

### 3. Agent Health

- **Data source:** `skill_runs` — last run per skill, grouped by agent
- Shows: which skills ran today, which missed, last status
- Red if a skill that runs daily hasn't fired in 25+ hours

### 4. SOP Drift Alerts

- **Data source:** `skill_runs WHERE skill = 'sop-updater'`
- Shows: flagged SOPs with suggested updates, approve to commit change

---

## Orchestration order (daily)

```
1. paid-media.agent.ts     — runs all paid-media skills
2. seo.agent.ts            — runs all SEO skills
3. organic.agent.ts        — runs all organic skills
4. comms.agent.ts          — runs all comms skills
5. cmo.agent.ts            — cross-agent-audit + morning-brief-compiler
```

Each agent writes to `skill_runs` on completion. CMO reads those rows to compile the brief.
