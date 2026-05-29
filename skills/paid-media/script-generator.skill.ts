// script-generator.skill.ts — Skill 1.3
// Generates 3 video ad script concepts via Claude using:
//   - Best-performing creative benchmarks (cp2ql_lifetime < $200)
//   - Unused inspiration ads from inspiration_catalog
//   - SOPs: paid-media, ad-scripting-rules, neil-voice-guide, fsiq-brand-voice-guide
// Posts each concept to #MediaBuying with approve/skip buttons.
// approve_script_[id] → status='Recording Pending' + ClickUp task
// skip_script_[id]    → status='Killed'

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

interface ScriptConcept {
  concept_name: string
  hook_type: string
  awareness_level: string
  suggested_lp: string
  full_script: string
  estimated_duration: string
  inspiration_source: string | null
}

interface InsertedConcept extends ScriptConcept {
  id: string
  global_number: number
}

export interface ScriptGeneratorOutput {
  run_at: string
  concepts_generated: number
  pipeline_ids: string[]
  inspiration_ids_used: string[]
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function run(): Promise<ScriptGeneratorOutput> {
  const startedAt = new Date().toISOString()

  // 1. Load SOPs at runtime per AGENTS.md pairing rule
  const sop         = loadSop('paid-media-agent-sop.md')
  const scriptRules = loadSop('ad-scripting-rules.md')
  const neilVoice   = loadSop('neil-voice-guide.md')
  const brandVoice  = loadSop('fsiq-brand-voice-guide.md')

  // 2. Fetch best-performing creative benchmarks
  const { data: benchmarks } = await supabase
    .from('creative_pipeline')
    .select('concept_name, hook_type, awareness_level, lp_code, cp2ql_lifetime, duration, hook_description')
    .lt('cp2ql_lifetime', 200)
    .not('cp2ql_lifetime', 'is', null)
    .order('cp2ql_lifetime', { ascending: true })
    .limit(10)

  // 3. Fetch unused inspiration ads
  const { data: inspirationAds } = await supabase
    .from('inspiration_catalog')
    .select('id, library_id, headline, body_text, cta_text, cta_type, ad_type, source_page')
    .eq('used', false)
    .order('scraped_at', { ascending: false })
    .limit(10)

  // 4. Get current max global_number for sequential ID assignment
  const { data: maxRow } = await supabase
    .from('creative_pipeline')
    .select('global_number')
    .not('global_number', 'is', null)
    .order('global_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const startGlobalNumber = (maxRow?.global_number ?? 0) + 1

  // 5. Build Claude prompt
  const benchmarkLines = (benchmarks ?? []).map(ad =>
    `  - ${ad.concept_name ?? 'Unknown'} | Hook: ${ad.hook_type ?? '?'} | Awareness: ${ad.awareness_level ?? '?'} | LP: ${ad.lp_code ?? '?'} | CP2QL: $${ad.cp2ql_lifetime}`
  ).join('\n')

  const inspirationLines = (inspirationAds ?? []).map((ad, i) =>
    `  [${i + 1}] library_id: ${ad.library_id}\n` +
    `      Headline: ${ad.headline ?? 'none'}\n` +
    `      Body: ${(ad.body_text ?? '').slice(0, 300)}\n` +
    `      CTA: ${ad.cta_text ?? 'none'} (${ad.cta_type ?? '?'}) | Type: ${ad.ad_type} | Brand: ${ad.source_page}`
  ).join('\n\n')

  const prompt = `You are a direct-response video ad scriptwriter for FoodServiceIQ (FSIQ).

## Paid Media SOP
${sop}

## Ad Scripting Rules
${scriptRules}

## Brand Voice Guide
${brandVoice}

## Neil's Voice Guide
${neilVoice}

## Best-Performing Concepts (CP2QL < $200 lifetime)
${benchmarkLines || '  No benchmark data yet — use SOP thresholds as reference.'}

## Unused Competitor Inspiration Ads (scraped from Meta Ads Library)
${inspirationLines || '  No inspiration ads available — write from first principles.'}

## Task
Generate exactly 3 new video ad script concepts for FSIQ targeting food service operators who spend $600k+ annually on food (restaurant owners, GMs, directors of operations).

Requirements per script:
- Open with a high-impact pattern-interrupt hook (first 3 seconds determine scroll-stop rate)
- Address a core pain: food cost pressure, margin squeeze, finding better pricing/suppliers
- Build trust with FSIQ's data-backed approach (3+ years, 90k+ restaurants tracked)
- Clear CTA driving to eBook download or case study (default: LP2-EB; use LP1-CS for Unaware/Problem Aware audiences)
- Length: 45–90 seconds (scripts under 60s outperform on cold traffic)
- Conversational, peer-to-peer voice — operator talking to operator

For inspiration_source: if a competitor ad above directly inspired the concept, provide its library_id. Otherwise use null.

Return ONLY a valid JSON array of exactly 3 objects — no preamble, no markdown, no explanation:
[
  {
    "concept_name": "4-6 word memorable name",
    "hook_type": "Problem-Led | Data Hook | Social Proof | Curiosity | Transformation | Authority | Before/After",
    "awareness_level": "Unaware | Problem Aware | Solution Aware | Most Aware",
    "suggested_lp": "LP2-EB",
    "full_script": "Complete word-for-word script with [HOOK], [BODY], [CTA] section markers",
    "estimated_duration": "60s",
    "inspiration_source": "library_id string or null"
  }
]`

  // 6. Generate scripts via Claude
  const concepts = await askClaudeJson<ScriptConcept[]>(prompt, 8192)

  if (!Array.isArray(concepts) || concepts.length === 0) {
    throw new Error('Claude did not return a valid array of script concepts')
  }
  const validConcepts = concepts.slice(0, 3)

  // 7. Insert rows into creative_pipeline
  const insertedConcepts: InsertedConcept[] = []

  for (let i = 0; i < validConcepts.length; i++) {
    const c = validConcepts[i]
    const globalNumber = startGlobalNumber + i

    const conceptId = `FSIQ-VIDEO-AD-${globalNumber}`

    const { data: row, error } = await supabase
      .from('creative_pipeline')
      .insert({
        ad_id:           conceptId,
        global_number:   globalNumber,
        concept_name:    c.concept_name,
        ad_type:         'Video',
        hook_type:       c.hook_type,
        awareness_level: c.awareness_level,
        lp_code:         c.suggested_lp,
        script_draft:    c.full_script,
        duration:        c.estimated_duration,
        status:          'In Progress',
        is_active:       false,
      })
      .select('id')
      .single()

    if (error || !row) {
      console.error(`[script-generator] Insert failed for concept ${i + 1}:`, error?.message)
      continue
    }

    insertedConcepts.push({ ...c, id: row.id, global_number: globalNumber })
    console.log(`  ✅ FSIQ-VIDEO-AD-${globalNumber}: ${c.concept_name}`)
  }

  // 8. Mark referenced inspiration ads as used
  const usedLibraryIds = validConcepts
    .map(c => c.inspiration_source)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)

  const usedInspirationIds: string[] = []
  if (usedLibraryIds.length > 0) {
    const { data: updatedRows } = await supabase
      .from('inspiration_catalog')
      .update({ used: true })
      .in('library_id', usedLibraryIds)
      .select('id')
    usedInspirationIds.push(...(updatedRows ?? []).map(r => r.id as string))
  }

  // 9. Post each concept to #MediaBuying with approve/skip buttons
  for (const concept of insertedConcepts) {
    const conceptId = `FSIQ-VIDEO-AD-${concept.global_number}`
    const scriptPreview = concept.full_script.length > 500
      ? concept.full_script.slice(0, 497) + '…'
      : concept.full_script

    const blocks: KnownBlock[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `🎬 New Script — ${concept.concept_name}`, emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Concept ID*\n${conceptId}` },
          { type: 'mrkdwn', text: `*Hook Type*\n${concept.hook_type}` },
          { type: 'mrkdwn', text: `*Awareness Level*\n${concept.awareness_level}` },
          { type: 'mrkdwn', text: `*Landing Page*\n${concept.suggested_lp}` },
          { type: 'mrkdwn', text: `*Duration*\n${concept.estimated_duration}` },
          { type: 'mrkdwn', text: `*Inspiration*\n${concept.inspiration_source ?? 'Original'}` },
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
            text: { type: 'plain_text', text: '✅ Approve Script', emoji: true },
            style: 'primary',
            action_id: `approve_script_${concept.id}`,
            value: concept.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '❌ Skip', emoji: true },
            style: 'danger',
            action_id: `skip_script_${concept.id}`,
            value: concept.id,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `pipeline_id: \`${concept.id}\`  ·  ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
          },
        ],
      },
    ]

    await sendBlocks(
      'mediaBuying',
      blocks as never[],
      `🎬 New Script: ${concept.concept_name} (${concept.hook_type}) — ${conceptId}`,
    )
  }

  // 10. Log skill run
  const runAt = new Date().toISOString()
  await supabase.from('skill_runs').insert({
    agent:        'paid-media',
    skill:        'script-generator',
    started_at:   startedAt,
    completed_at: runAt,
    status:       'success',
    output_summary: {
      concepts_generated:   insertedConcepts.length,
      pipeline_ids:         insertedConcepts.map(c => c.id),
      inspiration_ids_used: usedInspirationIds,
    },
  })

  return {
    run_at:               runAt,
    concepts_generated:   insertedConcepts.length,
    pipeline_ids:         insertedConcepts.map(c => c.id),
    inspiration_ids_used: usedInspirationIds,
  }
}
