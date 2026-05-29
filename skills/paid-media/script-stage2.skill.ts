// script-stage2.skill.ts — Stage 2 of multi-stage pipeline
// Called from the Slack webhook (fire-and-forget) when a topic is approved.
// Generates 2 full script variations for the approved topic concept.
// Posts each variation to #MediaBuying with Approve / Edit / Skip buttons.
// approve_variation_{pipelineId} → webhook fires Stage 3 (A/B hook generation)
// edit_variation_{pipelineId}    → webhook opens edit modal
// skip_variation_{pipelineId}    → status='Killed'
// SOPs: paid-media, ad-scripting-rules, fsiq-company-profile, fsiq-brand-voice-paid-ads, fsiq-humanizer-sop

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

interface TopicIdea {
  concept_name: string
  hook_type: string
  awareness_level: string
  suggested_lp: string
  angle: string
  inspiration_source: string | null
}

interface ScriptVariation {
  concept_name: string
  hook_type: string
  awareness_level: string
  suggested_lp: string
  full_script: string
  estimated_duration: string
  variation_label: string
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function run(topicId: string, topicIdx: number): Promise<void> {
  // 1. Load SOPs at runtime per AGENTS.md pairing rule
  const sop            = loadSop('paid-media-agent-sop.md')
  const scriptRules    = loadSop('ad-scripting-rules.md')
  const companyProfile = loadSop('fsiq-company-profile.md')
  const brandVoice     = loadSop('fsiq-brand-voice-paid-ads.md')

  // 2. Fetch script_topics row
  const { data: topicRow, error: fetchError } = await supabase
    .from('script_topics')
    .select('id, topics, inspiration_ids')
    .eq('id', topicId)
    .single()

  if (fetchError || !topicRow) {
    throw new Error(`script_topics row not found: ${topicId} — ${fetchError?.message}`)
  }

  const topics = topicRow.topics as TopicIdea[]
  const topic = topics[topicIdx]
  if (!topic) {
    throw new Error(`Topic index ${topicIdx} out of range for topic row ${topicId}`)
  }

  // 3. Fetch best-performing benchmarks for creative grounding
  const { data: benchmarks } = await supabase
    .from('creative_pipeline')
    .select('concept_name, hook_type, awareness_level, lp_code, cp2ql_lifetime, script_draft')
    .lt('cp2ql_lifetime', 200)
    .not('cp2ql_lifetime', 'is', null)
    .order('cp2ql_lifetime', { ascending: true })
    .limit(5)

  const benchmarkLines = (benchmarks ?? []).map(ad =>
    `  - ${ad.concept_name ?? 'Unknown'} | Hook: ${ad.hook_type ?? '?'} | Awareness: ${ad.awareness_level ?? '?'} | CP2QL: $${ad.cp2ql_lifetime}`
  ).join('\n')

  // 4. Build Claude prompt
  const prompt = `You are a direct-response video ad scriptwriter for FoodServiceIQ (FSIQ).

## Company Profile (facts, case studies, proof points)
${companyProfile}

## Brand Voice Guide (rules, tone, hook taxonomy, CTA rules — follow every rule exactly)
${brandVoice}

## Paid Media Agent SOP
${sop}

## Ad Scripting Rules
${scriptRules}

## Best-Performing Concepts (CP2QL < $200 lifetime)
${benchmarkLines || '  No benchmark data yet — reference the top performers in the Company Profile.'}

## Approved Topic to Script
Concept Name: ${topic.concept_name}
Hook Type: ${topic.hook_type}
Awareness Level: ${topic.awareness_level}
Landing Page: ${topic.suggested_lp}
Creative Angle: ${topic.angle}
Inspiration Source: ${topic.inspiration_source ?? 'Original'}

## Task
Write exactly 2 script variations for this topic. Both execute the same creative angle —
but with meaningfully different openings, pacing, or emphasis. Not just different words.
Label them "Variation A" and "Variation B".

Requirements per script (follow Brand Voice Guide for all rules):
- Open in media res — no warmup, no introduction, already delivering value by sentence 2
- Use the approved hook type: ${topic.hook_type}
- Body must include both mechanisms: $2B+ buying power AND founder insider knowledge
- Body must include the no-disruption guarantee: "no changes to ingredients or distributors"
- Body must include the performance-based model: zero upfront cost
- Use ellipses not em dashes; no short choppy sentences; no math out loud; no fear-mongering
- Never hardcode playbook page count — use "our free playbook" only
- Two hook variants per script: [HOOK-IPHONE] (loose, riffing) and [HOOK-STUDIO] (composed, confident)
- Length: 45–75 seconds for cold traffic

Return ONLY a valid JSON array of exactly 2 objects — no preamble, no markdown, no explanation:
[
  {
    "concept_name": "${topic.concept_name} — Variation A",
    "hook_type": "${topic.hook_type}",
    "awareness_level": "${topic.awareness_level}",
    "suggested_lp": "${topic.suggested_lp}",
    "full_script": "Complete word-for-word script with [HOOK-IPHONE], [HOOK-STUDIO], [BODY], [CTA] section markers",
    "estimated_duration": "60s",
    "variation_label": "Variation A"
  },
  {
    "concept_name": "${topic.concept_name} — Variation B",
    "hook_type": "${topic.hook_type}",
    "awareness_level": "${topic.awareness_level}",
    "suggested_lp": "${topic.suggested_lp}",
    "full_script": "Complete word-for-word script with [HOOK-IPHONE], [HOOK-STUDIO], [BODY], [CTA] section markers",
    "estimated_duration": "60s",
    "variation_label": "Variation B"
  }
]`

  // 5. Generate variations via Claude
  const variations = await askClaudeJson<ScriptVariation[]>(prompt, 8192)

  if (!Array.isArray(variations) || variations.length === 0) {
    throw new Error('Claude did not return valid script variations')
  }
  const validVariations = variations.slice(0, 2)

  // 6. Get current max global_number for sequential ID assignment
  const { data: maxRow } = await supabase
    .from('creative_pipeline')
    .select('global_number')
    .not('global_number', 'is', null)
    .order('global_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const startGlobalNumber = (maxRow?.global_number ?? 0) + 1

  // 7. Insert each variation + post to Slack
  for (let i = 0; i < validVariations.length; i++) {
    const v = validVariations[i]
    const globalNumber = startGlobalNumber + i
    const conceptId = `FSIQ-VIDEO-AD-${globalNumber}`

    // Humanizer pass — remove AI writing patterns before saving (AGENTS.md rule)
    const cleanScript = await humanize(v.full_script, 'paid-ads')

    const { data: row, error: insertError } = await supabase
      .from('creative_pipeline')
      .insert({
        ad_id:           conceptId,
        global_number:   globalNumber,
        concept_name:    v.concept_name,
        ad_type:         'Video',
        hook_type:       v.hook_type,
        awareness_level: v.awareness_level,
        lp_code:         v.suggested_lp,
        script_draft:    cleanScript,
        duration:        v.estimated_duration,
        status:          'Script Draft',
        is_active:       false,
        script_topic_id: topicId,
      })
      .select('id')
      .single()

    if (insertError || !row) {
      console.error(`[script-stage2] Insert failed for variation ${i + 1}:`, insertError?.message)
      continue
    }

    const pipelineId = row.id as string
    const scriptPreview = cleanScript.length > 600
      ? cleanScript.slice(0, 597) + '…'
      : cleanScript

    const blocks: KnownBlock[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `📝 Script ${v.variation_label} — ${topic.concept_name}`, emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Concept ID*\n${conceptId}` },
          { type: 'mrkdwn', text: `*Hook Type*\n${v.hook_type}` },
          { type: 'mrkdwn', text: `*Awareness Level*\n${v.awareness_level}` },
          { type: 'mrkdwn', text: `*Landing Page*\n${v.suggested_lp}` },
          { type: 'mrkdwn', text: `*Duration*\n${v.estimated_duration}` },
          { type: 'mrkdwn', text: `*Variation*\n${v.variation_label}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Script:*\n\`\`\`${scriptPreview}\`\`\`` },
      },
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ Approve', emoji: true },
            style: 'primary',
            action_id: `approve_variation_${pipelineId}`,
            value: pipelineId,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '✏️ Edit', emoji: true },
            action_id: `edit_variation_${pipelineId}`,
            value: pipelineId,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '❌ Skip', emoji: true },
            style: 'danger',
            action_id: `skip_variation_${pipelineId}`,
            value: pipelineId,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `pipeline_id: \`${pipelineId}\`  ·  ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
          },
        ],
      },
    ]

    const slackRes = await sendBlocks(
      'mediaBuying',
      blocks as never[],
      `📝 Script ${v.variation_label}: ${v.concept_name} (${v.hook_type}) — ${conceptId}`,
    )

    // Save slack_ts so the edit-in-thread flow can post replies
    if (slackRes.ts) {
      await supabase
        .from('creative_pipeline')
        .update({ slack_ts: slackRes.ts, slack_channel: slackRes.channel ?? null })
        .eq('id', pipelineId)
    }

    console.log(`  ✅ ${conceptId}: ${v.concept_name}`)
  }

  // 8. Update topic row status
  await supabase
    .from('script_topics')
    .update({ status: 'scripts_generated' })
    .eq('id', topicId)
}
