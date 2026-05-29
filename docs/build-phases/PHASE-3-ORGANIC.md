# Phase 3 — Organic Content Agent

## Status

| Layer | Status |
|-------|--------|
| Skills | PENDING (Day 3) |
| Dashboard | PENDING |
| Slack interactions | PENDING |

## Skills inventory

| Skill | Status |
|-------|--------|
| content-ideation.skill.ts | ⏳ Pending |
| canva-designer.skill.ts | ⏳ Pending |
| video-script.skill.ts | ⏳ Pending |
| ugc-sourcer.skill.ts | ⏳ Pending |
| linkedin-writer.skill.ts | ⏳ Pending |
| content-calendar.skill.ts | ⏳ Pending |
| voice-analyzer.skill.ts | ⏳ Pending |
| reporting.skill.ts | ⏳ Pending |

---

## Dashboard sections for /organic

### 1. Content Calendar

- **Data source:** `content_calendar` table
- Shows: 4-week ahead view by platform (Instagram, TikTok, LinkedIn, Facebook)

### 2. LinkedIn Drafts

- **Data source:** `content_calendar WHERE platform = 'linkedin' AND status = 'draft'`
- Shows: Neil + FSIQ drafts side by side
- Approve → schedules via Buffer
- Edit inline before approving

### 3. Content Ideas

- **Data source:** `recommendations WHERE agent = 'organic' AND skill = 'content-ideation'`
- Shows: pending ideas with hook type, awareness level, platform suggestion
- Approve → triggers canva-designer or video-script based on type

### 4. UGC Pipeline

- **Data source:** `recommendations WHERE skill = 'ugc-sourcer'`
- Shows: creator profiles + quotes

### 5. Performance

- **Data source:** pulled via reporting.skill.ts
- Shows: platform-level engagement metrics

---

## Slack interactions

| Action ID | Effect |
|-----------|--------|
| `approve_content_idea` | Trigger canva-designer or video-script |
| `approve_linkedin` | Schedule via Buffer |
| `reject` | Mark rejected |
