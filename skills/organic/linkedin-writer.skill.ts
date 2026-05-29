// linkedin-writer.skill.ts
// Generates LinkedIn post drafts for Neil's personal page and the FSIQ company page.
// Posts each draft to #organic-agent with Approve / Edit / Skip buttons.
// approve_linkedin_{draftId} → status = 'Approved'
// edit_linkedin_{draftId}    → open edit modal, save updated text
// skip_linkedin_{draftId}    → status = 'Skipped'
// SOPs: fsiq-brand-voice-linkedin.md, fsiq-company-profile.md, organic-content-agent-sop.md

import fs from 'fs'
import path from 'path'
import { askClaudeJson } from '../../lib/claude'
import { supabase } from '../../lib/supabase'
import { sendBlocks } from '../../lib/slack'
import { humanize } from '../cmo/humanizer.skill'
import type { KnownBlock } from '@slack/web-api'

function loadSop(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'sops', name), 'utf-8')
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type LinkedInTarget = 'neil-personal' | 'fsiq-company'

export interface LinkedInWriterInput {
  topic?: string
  target?: LinkedInTarget | 'both'
}

export interface LinkedInWriterOutput {
  run_at: string
  drafts_created: number
  draft_ids: string[]
}

interface DraftResult {
  target: LinkedInTarget
  topic: string
  post_text: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// When no topic is provided, pick one from a rotating set of FSIQ content pillars
// anchored to the most recent high-performing creative or case study.
async function autoSelectTopic(companyProfile: string): Promise<string> {
  const pillars = [
    'Why independent restaurants consistently overpay compared to national chains on the same SKUs — the structural pricing gap',
    'What a national chain-level distributor contract actually contains vs what independents typically have',
    'Why GPOs only solve part of the food cost problem — what they miss at the distribution layer',
    'Cherry-picking SKUs across multiple distributors — why it often raises blended cost instead of lowering it',
    'How distributor loyalty over many years can preserve margins for the distributor rather than the operator',
    'What the $2.37B in annual recoverable food cost losses across independent restaurants actually represents',
    'Why operators who raise menu prices more than 10% often report lower profits — and where margin actually comes from',
    'What changes when an independent restaurant gets access to $2B+ in aggregated buying power',
  ]

  // Rotate based on day of year so the same topic doesn't repeat every run
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000)
  return pillars[dayOfYear % pillars.length]
}

// ── Post generation ───────────────────────────────────────────────────────────

async function generateDraft(
  target: LinkedInTarget,
  topic: string,
  brandVoice: string,
  companyProfile: string,
  recentWins: string,
): Promise<string> {
  const isNeil = target === 'neil-personal'

  const prompt = `You are writing a LinkedIn post for FoodServiceIQ (FSIQ).

## Company Profile (use for facts, proof points, case study data)
${companyProfile}

## LinkedIn Brand Voice Guide (follow every rule exactly)
${brandVoice}

## Recent Client Wins (use if the topic calls for a case study example)
${recentWins}

## Target
${isNeil
  ? 'Neil Chand\'s personal LinkedIn page (linkedin.com/in/neil-chand-9738a072). Write in first person as Neil. Use his "I" voice. Analytical, operator-to-operator tone. No emojis. No hashtags.'
  : 'FSIQ company LinkedIn page (linkedin.com/company/foodserviceiq). Write as the brand ("We" / "Our"). More structured. Case study format if topic is a client win. No emojis except one 🎉 or 👏 for celebration posts.'}

## Topic
${topic}

## Task
Write one LinkedIn post for the topic above. Follow the brand voice guide exactly.

Requirements:
- Opening line must use one of the four approved opening patterns from the voice guide
- Length: 150–350 words
- No em dashes (use nothing — restructure the sentence instead)
- No fear-mongering, no adversarial distributor framing
- No math out loud — state results, not arithmetic
- No "It's not X, it's Y" constructions
- No downstream outcome claims (new locations opened, bonuses paid, etc.)
- End with the correct CTA for the target (see voice guide)
${isNeil ? '- No emojis. No hashtags.' : '- Add 4–5 hashtags from the approved set at the end if this is an insight or case study post. Skip hashtags for celebration posts.'}

Return ONLY the post text — no commentary, no "here's the post:", no markdown fences. Just the post.`

  const raw = await askClaudeJson<string>(prompt, 2048)
  return typeof raw === 'string' ? raw : JSON.stringify(raw)
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function run(input: LinkedInWriterInput = {}): Promise<LinkedInWriterOutput> {
  const runAt = new Date().toISOString()

  // 1. Load SOPs at runtime per AGENTS.md pairing rule
  const brandVoice     = loadSop('fsiq-brand-voice-linkedin.md')
  const companyProfile = loadSop('fsiq-company-profile.md')

  // 2. Determine targets
  const targetArg = input.target ?? 'both'
  const targets: LinkedInTarget[] = targetArg === 'both'
    ? ['neil-personal', 'fsiq-company']
    : [targetArg]

  // 3. Determine topic
  const topic = input.topic ?? await autoSelectTopic(companyProfile)

  // 4. Fetch recent top-performing case studies for grounding
  const { data: topWins } = await supabase
    .from('creative_pipeline')
    .select('concept_name, cp2ql_lifetime, hook_type')
    .lt('cp2ql_lifetime', 150)
    .not('cp2ql_lifetime', 'is', null)
    .order('cp2ql_lifetime', { ascending: true })
    .limit(5)

  const recentWins = (topWins ?? []).length > 0
    ? (topWins ?? []).map(w => `- ${w.concept_name ?? 'Unknown'} | CP2QL: $${w.cp2ql_lifetime}`).join('\n')
    : '- No recent performance data — use company profile case studies'

  // 5. Generate and humanize one draft per target
  const drafts: DraftResult[] = []

  for (const target of targets) {
    console.log(`  Generating ${target} post for: "${topic.slice(0, 60)}..."`)
    const raw = await generateDraft(target, topic, brandVoice, companyProfile, recentWins)
    const clean = await humanize(raw, 'linkedin')
    drafts.push({ target, topic, post_text: clean })
  }

  // 6. Insert drafts into Supabase + post to #organic-agent
  const draftIds: string[] = []

  for (const draft of drafts) {
    const { data: row, error } = await supabase
      .from('linkedin_drafts')
      .insert({
        target:    draft.target,
        topic:     draft.topic,
        post_text: draft.post_text,
        status:    'Draft',
      })
      .select('id')
      .single()

    if (error || !row) {
      console.error(`[linkedin-writer] Insert failed for ${draft.target}:`, error?.message)
      continue
    }

    const draftId = row.id as string
    draftIds.push(draftId)

    const targetLabel = draft.target === 'neil-personal' ? '👤 Neil Personal' : '🏢 FSIQ Company'
    const preview = draft.post_text.length > 700
      ? draft.post_text.slice(0, 697) + '…'
      : draft.post_text

    const blocks: KnownBlock[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `✍️ LinkedIn Draft — ${targetLabel}`, emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Target*\n${targetLabel}` },
          { type: 'mrkdwn', text: `*Topic*\n${draft.topic.slice(0, 100)}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Draft:*\n\`\`\`${preview}\`\`\`` },
      },
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ Approve', emoji: true },
            style: 'primary',
            action_id: `approve_linkedin_${draftId}`,
            value: draftId,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '✏️ Edit', emoji: true },
            action_id: `edit_linkedin_${draftId}`,
            value: draftId,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '❌ Skip', emoji: true },
            style: 'danger',
            action_id: `skip_linkedin_${draftId}`,
            value: draftId,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `draft_id: \`${draftId}\`  ·  ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
          },
        ],
      },
    ]

    const slackRes = await sendBlocks(
      'organic',
      blocks as never[],
      `✍️ LinkedIn Draft (${targetLabel}): ${draft.topic.slice(0, 60)}`,
    )

    if (slackRes.ts) {
      await supabase
        .from('linkedin_drafts')
        .update({ slack_ts: slackRes.ts, slack_channel: slackRes.channel ?? null })
        .eq('id', draftId)
    }

    console.log(`  ✅ Draft created: ${draftId} (${draft.target})`)
  }

  // 7. Log to skill_runs
  await supabase.from('skill_runs').insert({
    agent:        'organic',
    skill:        'linkedin-writer',
    started_at:   runAt,
    completed_at: new Date().toISOString(),
    status:       'success',
    output:       { drafts_created: draftIds.length, draft_ids: draftIds, topic },
  })

  return {
    run_at:        runAt,
    drafts_created: draftIds.length,
    draft_ids:     draftIds,
  }
}
