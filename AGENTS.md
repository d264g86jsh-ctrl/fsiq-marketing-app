<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:sop-skill-pairing-rule -->
# RULE: SOP ↔ SKILL PAIRING (enforced)

Every SOP file in `/sops/` must have corresponding skill file(s). Every skill file must load its paired SOP at runtime via `fs.readFileSync`. No exceptions.

## Naming convention

| SOP file | Loaded by |
|----------|-----------|
| `sops/paid-media-agent-sop.md` | all skills in `skills/paid-media/` |
| `sops/creative-pipeline-sop.md` | skills that read/write creative data |
| `sops/seo-agent-sop.md` | all skills in `skills/seo/` |
| `sops/organic-content-agent-sop.md` | all skills in `skills/organic/` |
| `sops/comms-agent-sop.md` | all skills in `skills/comms/` |
| `sops/cmo-orchestrator-sop.md` | CMO orchestrator skills |
| `sops/video-review-qa-framework.md` | footage-watcher, campaign-brief-generator |
| `sops/neil-voice-guide.md` | linkedin-writer |
| `sops/fsiq-brand-voice-guide.md` | linkedin-writer, content-ideation |
| `sops/ad-scripting-rules.md` | script-generator |
| `sops/campaign-brief-template.md` | campaign-brief-generator |

## Required pattern — every skill must start with:

```typescript
import fs from 'fs'
import path from 'path'

// inside the exported run function:
const sop = fs.readFileSync(
  path.join(process.cwd(), 'sops', '[sop-name].md'),
  'utf-8'
)
// pass sop as context in every Claude API call
```

## Creation rule

- Never create a new SOP without a paired skill stub.
- Never create a new skill without a paired SOP.
- If a skill needs a SOP that doesn't exist yet, create both in the same commit.

## Verification

Before completing any skill PR, confirm:
1. The skill loads its SOP via `fs.readFileSync` at the top of the run function.
2. The SOP string is passed into the Claude API prompt.
3. The skill file path follows `skills/[agent]/[skill-name].skill.ts`.
<!-- END:sop-skill-pairing-rule -->

<!-- BEGIN:channel-rules -->
# CHANNEL RULES (never violate)

| Channel | Env var | What goes here |
|---------|---------|----------------|
| `#operations` | `SLACK_CHANNEL_MEETING_TRANSCRIPTS` | **READ-ONLY. Agents NEVER post here.** Used by team for meeting transcript links only. |
| `#assistant` | `SLACK_CHANNEL_ASSISTANT` | SharePoint structure violations, naming violations, missing subfolders, weekly SharePoint audit report, any structural/housekeeping alerts |
| `#MediaBuying` | `SLACK_CHANNEL_MEDIA_BUYING` | Ad set decisions (scale/kill/hold), budget change confirmations, pixel issues, app health / Food Cost Analyzer alerts, Supabase accuracy alerts, GHL webhook summary, any critical paid media system alert |
| `#video-editor` | `SLACK_CHANNEL_VIDEO_EDITOR` | New footage detected, script match results (below 85% confidence), brief generation confirmations, QA feedback requests |
| `#seo-agent` | `SLACK_CHANNEL_SEO` | Rank changes, blog post drafts ready for review, GMB update suggestions, technical audit findings, backlink opportunities |
| `#organic-agent` | `SLACK_CHANNEL_ORGANIC` | Content ideas ready for review, LinkedIn drafts for Neil and FSIQ page, Ads Library daily digest |
| `#morning-brief` | `SLACK_CHANNEL_MORNING_BRIEF` | Daily CMO summary only |

**Enforcement:** Every skill that posts to Slack must use one of the channel keys from `lib/slack.ts`. Never hardcode channel names or IDs. Never reference `SLACK_CHANNEL_OPERATIONS`.
<!-- END:channel-rules -->
