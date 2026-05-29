# Phase 2 — SEO Agent

## Status

| Layer | Status |
|-------|--------|
| Skills | PENDING (Day 2) |
| Dashboard | PENDING |
| Slack interactions | PENDING |

## Skills inventory

| Skill | Status |
|-------|--------|
| rank-tracker.skill.ts | ⏳ Pending |
| blog-writer.skill.ts | ⏳ Pending |
| webflow-publisher.skill.ts | ⏳ Pending |
| gmb-manager.skill.ts | ⏳ Pending |
| backlink-manager.skill.ts | ⏳ Pending |
| technical-audit.skill.ts | ⏳ Pending |
| weekly-report.skill.ts | ⏳ Pending |

---

## Dashboard sections for /seo

### 1. Keyword Rankings

- **Data source:** `seo_content` table
- Shows: rank changes, top/bottom movers

### 2. Blog Pipeline

- **Data source:** `seo_content WHERE type = 'blog_draft'`
- Shows: drafts awaiting approval
- Approve → triggers webflow-publisher

### 3. GMB Suggestions

- **Data source:** `recommendations WHERE agent = 'seo' AND skill = 'gmb-manager'`

### 4. Technical Health

- **Data source:** `skill_runs WHERE skill = 'technical-audit'`
- Shows: crawl errors, Core Web Vitals, backlink opportunities

### 5. Weekly Report

- **Data source:** `skill_runs WHERE skill = 'weekly-report'`
- Shows: last report, trend charts

---

## Slack interactions

| Action ID | Effect |
|-----------|--------|
| `approve_blog` | Publish to Webflow |
| `reject_blog` | Mark draft as rejected |
| `approve_gmb` | Publish GMB update |
