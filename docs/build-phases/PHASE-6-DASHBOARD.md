# Phase 6 — Dashboard

## When to build

After Phase 1 (paid-media) is complete. Dashboard builds alongside or immediately after the last Phase 1 skill, using data already flowing into Supabase.

---

## Tech stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | Next.js 15 App Router | Already in use |
| Data | Supabase + realtime subscriptions | Live updates without polling |
| Styling | Tailwind | Already in use |
| Auth | Middleware + session cookie | Single user (Rodrigo) — no auth library |
| Charts | Recharts or Tremor | Lightweight, Tailwind-compatible |

---

## Authentication

Single user — no auth library needed. Middleware checks a session cookie (`mkt-os-session`) against a value in the environment. If missing or invalid, redirect to /login. Login posts to `/api/auth` which sets the cookie.

No NextAuth, no Clerk, no Supabase auth — just a signed cookie checked in middleware.

---

## Real-time updates

Supabase realtime channel subscriptions — dashboard updates when Slack buttons are clicked without page refresh.

```typescript
// Pattern for each dashboard section that needs live updates:
const channel = supabase
  .channel('recommendations')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'recommendations',
    filter: 'agent=eq.paid-media',
  }, (payload) => {
    // update local state
  })
  .subscribe()
```

Subscribe on mount, unsubscribe on unmount. Each section subscribes only to its own table/filter.

---

## Shared components

| Component | Used by |
|-----------|---------|
| `RecommendationCard` | /paid-media, /seo, /organic, /inbox |
| `SkillRunLog` | All pages (system health panels) |
| `ApproveRejectButtons` | All pages with pending decisions |
| `StatusBadge` | Creative pipeline, recommendations |
| `MetricsTile` | Performance panels |
| `TimelineChart` | Uptime, CPQL trends, rank history |

All shared components live in `app/components/`. Page-specific components live in `app/[page]/components/`.

---

## Page structure

```
app/
  paid-media/          # Phase 1 — first to build
    page.tsx
    components/
      PerformancePanel.tsx
      RecommendationsInbox.tsx
      CreativePipeline.tsx
      InspirationFeed.tsx
      ScriptConcepts.tsx
      PixelAppHealth.tsx
      AccuracyAudit.tsx
  seo/                 # Phase 2
  organic/             # Phase 3
  comms/               # Phase 4
  inbox/               # Phase 5 — CMO unified view
  settings/            # System health, SharePoint audit, agent config
  login/
  api/
    auth/
      route.ts
    webhooks/
      slack/
        route.ts       # All Slack button action handlers
    approve/
      route.ts         # Dashboard approve actions
```

---

## Slack webhook handler

`/api/webhooks/slack` is the single entry point for all Slack interactive button clicks.

```typescript
// Routing pattern:
switch (action.action_id) {
  case 'approve_recommendation': // paid-media
  case 'skip_recommendation':
  case 'approve_script':
  case 'reject_script':
  case 'approve_static':
  case 'approve_blog':           // SEO
  case 'reject_blog':
  case 'approve_gmb':
  case 'approve_content_idea':   // organic
  case 'approve_linkedin':
}
```

Each handler: validates payload signature → updates Supabase → optionally calls external API (Meta, Webflow, etc.) → posts confirmation back to Slack thread.

---

## Build order within Phase 6

1. `/api/webhooks/slack` — wire up existing approve/skip buttons
2. `/paid-media` page — Performance Panel + Recommendations Inbox first
3. Shared components (extract from paid-media as patterns stabilize)
4. Creative Pipeline + Inspiration Feed
5. System health panels (Pixel, App Health, Accuracy Audit)
6. Remaining pages (/seo, /organic, /comms, /inbox) in phase order
