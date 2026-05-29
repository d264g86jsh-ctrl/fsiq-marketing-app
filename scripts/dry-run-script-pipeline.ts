// dry-run-script-pipeline.ts
// Runs Stage 1 + Stage 2 + humanizer with the exact same prompts as the real skills.
// NO Supabase writes. NO Slack posts. Terminal output only.
// Shows BEFORE and AFTER humanization for each variation, with per-change diff.

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'
import { humanize } from '../skills/cmo/humanizer.skill'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

function loadSop(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'sops', name), 'utf-8')
}

async function askJson<T>(prompt: string, maxTokens = 8192): Promise<T> {
  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = response.content[0]
  const text = block.type === 'text' ? block.text : ''
  try {
    return JSON.parse(text) as T
  } catch {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned) as T
  }
}

function divider(char = '═', width = 70) {
  return char.repeat(width)
}

// Split text into comparable units (sentences + section markers)
function toUnits(text: string): string[] {
  return text
    .split(/(?<=[\.\?\!…])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean)
}

// Print a line-level diff between raw and humanized text
function printDiff(raw: string, clean: string): void {
  const rawUnits   = toUnits(raw)
  const cleanUnits = toUnits(clean)

  const changes: Array<{ before: string; after: string }> = []

  // Simple longest-common-subsequence approach: mark units that differ
  const rawSet   = new Set(rawUnits)
  const cleanSet = new Set(cleanUnits)

  // Lines in raw but not in clean (removed/changed)
  const removed = rawUnits.filter(u => !cleanSet.has(u))
  // Lines in clean but not in raw (added/changed)
  const added   = cleanUnits.filter(u => !rawSet.has(u))

  // Pair them up by position
  const maxLen = Math.max(removed.length, added.length)
  for (let i = 0; i < maxLen; i++) {
    const before = removed[i] ?? '(removed)'
    const after  = added[i]  ?? '(line removed — not replaced)'
    changes.push({ before, after })
  }

  if (changes.length === 0) {
    console.log('  ✅ No changes detected — script was already clean.')
    return
  }

  console.log(`  ${changes.length} change(s) detected:\n`)
  for (let i = 0; i < changes.length; i++) {
    console.log(`  ── Change ${i + 1} ──────────────────────────────────────────────`)
    console.log(`  BEFORE: ${changes[i].before}`)
    console.log(`  AFTER:  ${changes[i].after}`)
    console.log()
  }
}

async function main() {
  // ── Step 1: Find approved inspiration ad ──────────────────────────────────
  console.log('\n' + divider())
  console.log('STEP 1 — Approved inspiration ad')
  console.log(divider())

  let inspiration: {
    id: string
    source_page: string
    headline: string | null
    body_text: string | null
    ad_type: string
    cta_text: string | null
    library_id: string
  } | null = null

  const { data: approved } = await sb
    .from('inspiration_catalog')
    .select('id, source_page, headline, body_text, ad_type, cta_text, library_id, scraped_at')
    .eq('approved', true)
    .eq('used', false)
    .order('scraped_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (approved) {
    inspiration = approved
    console.log('\nUsing existing approved ad:')
  } else {
    console.log('\nNo approved ads found — approving one now...')
    const { data: target } = await sb
      .from('inspiration_catalog')
      .select('id, source_page, headline, body_text, ad_type, cta_text, library_id')
      .eq('used', false)
      .not('library_id', 'is', null)
      .limit(1)
      .maybeSingle()

    if (!target) {
      console.error('❌ inspiration_catalog is empty. Run ads-library-scraper first.')
      process.exit(1)
    }

    await sb.from('inspiration_catalog').update({ approved: true }).eq('id', target.id)
    inspiration = target
    console.log('Approved:')
  }

  console.log(`\n  id:          ${inspiration.id}`)
  console.log(`  source_page: ${inspiration.source_page}`)
  console.log(`  ad_type:     ${inspiration.ad_type}`)
  console.log(`  library_id:  ${inspiration.library_id}`)
  console.log(`  headline:    ${inspiration.headline ?? '(none)'}`)
  console.log(`  cta_text:    ${inspiration.cta_text ?? '(none)'}`)
  console.log(`\n  body_text:\n`)
  console.log('  ' + (inspiration.body_text ?? '(none)').split('\n').join('\n  '))

  // ── Load SOPs ─────────────────────────────────────────────────────────────
  console.log('\n' + divider('-'))
  console.log('Loading SOPs...')
  const sop            = loadSop('paid-media-agent-sop.md')
  const scriptRules    = loadSop('ad-scripting-rules.md')
  const companyProfile = loadSop('fsiq-company-profile.md')
  const brandVoice     = loadSop('fsiq-brand-voice-paid-ads.md')
  console.log('✅ 4 SOPs loaded')

  // ── Fetch benchmarks ──────────────────────────────────────────────────────
  const { data: benchmarks } = await sb
    .from('creative_pipeline')
    .select('concept_name, hook_type, awareness_level, lp_code, cp2ql_lifetime, hook_description')
    .lt('cp2ql_lifetime', 200)
    .not('cp2ql_lifetime', 'is', null)
    .order('cp2ql_lifetime', { ascending: true })
    .limit(10)

  const benchmarkLines = (benchmarks ?? []).map(ad =>
    `  - ${ad.concept_name ?? 'Unknown'} | Hook: ${ad.hook_type ?? '?'} | Awareness: ${ad.awareness_level ?? '?'} | LP: ${ad.lp_code ?? '?'} | CP2QL: $${ad.cp2ql_lifetime}`
  ).join('\n')

  const inspirationLine =
    `  [1] library_id: ${inspiration.library_id}\n` +
    `      Headline: ${inspiration.headline ?? 'none'}\n` +
    `      Body: ${(inspiration.body_text ?? '').slice(0, 300)}\n` +
    `      CTA: ${inspiration.cta_text ?? 'none'} | Type: ${inspiration.ad_type} | Brand: ${inspiration.source_page}`

  // ── Step 2: Stage 1 — Generate topics ─────────────────────────────────────
  console.log('\n' + divider())
  console.log('STEP 2 — Stage 1: generating 3 topic ideas (calling Claude...)')
  console.log(divider())

  const stage1Prompt = `You are a direct-response video ad strategist for FoodServiceIQ (FSIQ).

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
${inspirationLine}

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

  interface TopicIdea {
    concept_name: string
    hook_type: string
    awareness_level: string
    suggested_lp: string
    angle: string
    inspiration_source: string | null
  }

  const topics = await askJson<TopicIdea[]>(stage1Prompt, 2048)
  if (!Array.isArray(topics) || topics.length === 0) {
    console.error('❌ Claude did not return valid topics')
    process.exit(1)
  }
  const validTopics = topics.slice(0, 3)

  console.log(`\n✅ ${validTopics.length} topics generated\n`)

  for (let i = 0; i < validTopics.length; i++) {
    const t = validTopics[i]
    console.log(divider('─'))
    console.log(`TOPIC ${i + 1}: ${t.concept_name}`)
    console.log(divider('─'))
    console.log(`  Hook Type:   ${t.hook_type}`)
    console.log(`  Awareness:   ${t.awareness_level}`)
    console.log(`  LP:          ${t.suggested_lp}`)
    console.log(`  Inspiration: ${t.inspiration_source ?? 'Original'}`)
    console.log(`\n  Angle:\n  ${t.angle}\n`)
  }

  // ── Step 3: Stage 2 — Write scripts for Topic 1 ───────────────────────────
  const topic = validTopics[0]
  console.log('\n' + divider())
  console.log(`STEP 3 — Stage 2: writing 2 script variations for Topic 1`)
  console.log(`         "${topic.concept_name}" (calling Claude...)`)
  console.log(divider())

  const stage2Prompt = `You are a direct-response video ad scriptwriter for FoodServiceIQ (FSIQ).

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

  interface ScriptVariation {
    concept_name: string
    hook_type: string
    awareness_level: string
    suggested_lp: string
    full_script: string
    estimated_duration: string
    variation_label: string
  }

  const variations = await askJson<ScriptVariation[]>(stage2Prompt, 8192)
  if (!Array.isArray(variations) || variations.length === 0) {
    console.error('❌ Claude did not return valid script variations')
    process.exit(1)
  }
  const validVariations = variations.slice(0, 2)
  console.log(`\n✅ ${validVariations.length} raw variations generated`)

  // ── Step 4: Humanizer pass — show BEFORE / AFTER / DIFF for each variation ─
  console.log('\n' + divider())
  console.log('STEP 4 — Humanizer: calling humanize() for each variation...')
  console.log(divider())

  for (const v of validVariations) {
    console.log(`\nHumanizing ${v.variation_label}...`)
  }

  const humanized = await Promise.all(
    validVariations.map(v => humanize(v.full_script, 'paid-ads'))
  )

  console.log('✅ Humanization complete\n')

  // ── Print full BEFORE / AFTER / DIFF ──────────────────────────────────────
  for (let i = 0; i < validVariations.length; i++) {
    const v     = validVariations[i]
    const raw   = v.full_script
    const clean = humanized[i]

    console.log('\n' + divider('█'))
    console.log(`${v.variation_label.toUpperCase()} — ${v.concept_name}`)
    console.log(`Hook Type: ${v.hook_type} | Awareness: ${v.awareness_level} | LP: ${v.suggested_lp} | Duration: ${v.estimated_duration}`)
    console.log(divider('█'))

    console.log('\n' + divider('─'))
    console.log(`BEFORE HUMANIZATION — ${v.variation_label}`)
    console.log(divider('─'))
    console.log(raw)

    console.log('\n' + divider('─'))
    console.log(`AFTER HUMANIZATION — ${v.variation_label}`)
    console.log(divider('─'))
    console.log(clean)

    console.log('\n' + divider('─'))
    console.log(`DIFF — ${v.variation_label}: patterns caught and fixed`)
    console.log(divider('─'))
    printDiff(raw, clean)
  }

  console.log('\n' + divider())
  console.log('DRY RUN COMPLETE — nothing written to Supabase or Slack')
  console.log(divider() + '\n')

  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
