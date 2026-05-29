// script-generator.skill.ts — Skill 1.3 (v2 — Stage 1 of multi-stage pipeline)
// Generates 3 script topic ideas from approved (approved=true, used=false) inspiration ads.
// Posts topics to #MediaBuying for human approve/skip.
// approve_topic_{topicId}_{idx} → webhook fires script-stage2 (Stage 2)
// skip_topic_{topicId}_{idx}    → topic ignored, no script written
// SOPs: paid-media, ad-scripting-rules, fsiq-company-profile, fsiq-brand-voice-paid-ads

import fs from 'fs'
import path from 'path'
import { askClaudeJson } from '../../lib/claude'
import { supabase } from '../../lib/supabase'
import { sendBlocks } from '../../lib/slack'
import type { KnownBlock } from '@slack/web-api'

function loadSop(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'sops', name), 'utf-8')
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TopicIdea {
  concept_name: string
  hook_type: string
  awareness_level: string
  suggested_lp: string
  angle: string
  inspiration_source: string | null
}

export interface ScriptGeneratorOutput {
  run_at: string
  topic_row_id: string
  topics_generated: number
  inspiration_ids_used: string[]
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function run(): Promise<ScriptGeneratorOutput> {
  const startedAt = new Date().toISOString()

  // 1. Load SOPs at runtime per AGENTS.md pairing rule
  const sop            = loadSop('paid-media-agent-sop.md')
  const scriptRules    = loadSop('ad-scripting-rules.md')
  const companyProfile = loadSop('fsiq-company-profile.md')
  const brandVoice     = loadSop('fsiq-brand-voice-paid-ads.md')

  // 2. Fetch best-performing creative benchmarks for creative direction
  const { data: benchmarks } = await supabase
    .from('creative_pipeline')
    .select('concept_name, hook_type, awareness_level, lp_code, cp2ql_lifetime, hook_description')
    .lt('cp2ql_lifetime', 200)
    .not('cp2ql_lifetime', 'is', null)
    .order('cp2ql_lifetime', { ascending: true })
    .limit(10)

  // 3. Fetch approved, unused inspiration ads
  const { data: inspirationAds } = await supabase
    .from('inspiration_catalog')
    .select('id, library_id, headline, body_text, cta_text, cta_type, ad_type, source_page')
    .eq('approved', true)
    .eq('used', false)
    .order('scraped_at', { ascending: false })
    .limit(10)

  const inspirationIds = (inspirationAds ?? []).map(a => a.id as string)

  // 4. Build Claude prompt
  const benchmarkLines = (benchmarks ?? []).map(ad =>
    `  - ${ad.concept_name ?? 'Unknown'} | Hook: ${ad.hook_type ?? '?'} | Awareness: ${ad.awareness_level ?? '?'} | LP: ${ad.lp_code ?? '?'} | CP2QL: $${ad.cp2ql_lifetime}`
  ).join('\n')

  const inspirationLines = (inspirationAds ?? []).map((ad, i) =>
    `  [${i + 1}] library_id: ${ad.library_id}\n` +
    `      Headline: ${ad.headline ?? 'none'}\n` +
    `      Body: ${(ad.body_text ?? '').slice(0, 300)}\n` +
    `      CTA: ${ad.cta_text ?? 'none'} (${ad.cta_type ?? '?'}) | Type: ${ad.ad_type} | Brand: ${ad.source_page}`
  ).join('\n\n')

  const prompt = `You are a direct-response video ad strategist for FoodServiceIQ (FSIQ).

## Company Profile (facts, case studies, proof points)
${companyProfile}

## Brand Voice Guide (rules, tone, hook taxonomy, CTA rules)
${brandVoice}

## Paid Media Agent SOP
${sop}

## Ad Scripting Rules
${scriptRules}

## Best-Performing Concepts (CP2QL < $200 lifetime)
${benchmarkLines || '  No benchmark data yet — reference the top performers in the Company Profile.'}

## Approved Competitor Inspiration Ads (scraped from Meta Ads Library)
${inspirationLines || '  No approved inspiration ads available — generate from first principles using the Brand Voice Guide.'}

## Task
Generate exactly 3 script topic ideas for new FSIQ video ads targeting independent restaurant operators
doing $3M–$50M+ annual revenue (owners, GMs, directors of operations).

These are topic proposals — not full scripts yet. A human will approve topics before scripts are written.

Requirements:
- Identify genuine white space — do NOT echo hook types already in the benchmarks above
- Each topic must name a specific creative angle (what the viewer feels/realizes at the hook, not just the hook category)
- If a competitor ad directly inspired a concept, include its library_id in inspiration_source
- Default LP: LP2-EB for Unaware/Problem Aware; LP1-CS for Solution Aware

Return ONLY a valid JSON array of exactly 3 objects — no preamble, no markdown, no explanation:
[
  {
    "concept_name": "4-6 word memorable name",
    "hook_type": "Post-Meeting | Gift-Offer | Podcast-Social-Proof | Data Hook | Pattern-Interrupt | Self-Qualifying | Invoice-Proof | Announcement",
    "awareness_level": "Unaware | Problem Aware | Solution Aware",
    "suggested_lp": "LP2-EB",
    "angle": "1-2 sentence description of the specific creative angle and why it will resonate with the target operator",
    "inspiration_source": "library_id string or null"
  }
]`

  // 5. Generate topic ideas via Claude
  const topics = await askClaudeJson<TopicIdea[]>(prompt, 2048)

  if (!Array.isArray(topics) || topics.length === 0) {
    throw new Error('Claude did not return valid topic ideas')
  }
  const validTopics = topics.slice(0, 3)

  // 6. Insert script_topics row
  const { data: topicRow, error: insertError } = await supabase
    .from('script_topics')
    .insert({
      inspiration_ids: inspirationIds,
      topics:          validTopics,
      approved_topics: [],
      status:          'pending',
    })
    .select('id')
    .single()

  if (insertError || !topicRow) {
    throw new Error(`Failed to insert script_topics: ${insertError?.message}`)
  }

  const topicId = topicRow.id as string

  // 7. Build Slack message — one message with all 3 topics, each with approve/skip
  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🎯 New Script Topics — Approve to Generate Scripts', emoji: true },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `topic_row: \`${topicId}\`  ·  ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
        },
      ],
    },
    { type: 'divider' },
  ]

  for (let i = 0; i < validTopics.length; i++) {
    const t = validTopics[i]
    blocks.push(
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `*${i + 1}. ${t.concept_name}*`,
            `*Hook:* ${t.hook_type}  ·  *Awareness:* ${t.awareness_level}  ·  *LP:* ${t.suggested_lp}`,
            `*Angle:* ${t.angle}`,
            `*Inspiration:* ${t.inspiration_source ?? 'Original'}`,
          ].join('\n'),
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ Approve Topic', emoji: true },
            style: 'primary',
            action_id: `approve_topic_${topicId}_${i}`,
            value: `${topicId}:${i}`,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '❌ Skip', emoji: true },
            style: 'danger',
            action_id: `skip_topic_${topicId}_${i}`,
            value: `${topicId}:${i}`,
          },
        ],
      },
      { type: 'divider' },
    )
  }

  const slackRes = await sendBlocks(
    'mediaBuying',
    blocks as never[],
    `🎯 ${validTopics.length} new script topics ready for review`,
  )

  // 8. Save slack_ts + status back to script_topics
  await supabase
    .from('script_topics')
    .update({
      status:        'topics_posted',
      slack_ts:      slackRes.ts ?? null,
      slack_channel: slackRes.channel ?? null,
    })
    .eq('id', topicId)

  // 9. Log skill run
  const runAt = new Date().toISOString()
  await supabase.from('skill_runs').insert({
    agent:          'paid-media',
    skill:          'script-generator',
    started_at:     startedAt,
    completed_at:   runAt,
    status:         'success',
    output_summary: {
      topic_row_id:         topicId,
      topics_generated:     validTopics.length,
      inspiration_ids_used: inspirationIds,
    },
  })

  return {
    run_at:               runAt,
    topic_row_id:         topicId,
    topics_generated:     validTopics.length,
    inspiration_ids_used: inspirationIds,
  }
}
