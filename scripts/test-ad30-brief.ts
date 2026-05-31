/**
 * test-ad30-brief.ts
 *
 * Tests multi-hook brief generation for AD-30 (Media Pouch V2, 4 hooks).
 * Uses a mock transcript injected from the Ad Scripting doc to bypass
 * the MediaContent.Read.All permission requirement.
 *
 * Run: npx tsx --env-file=.env.local scripts/test-ad30-brief.ts
 */

import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../lib/supabase'
import { run as generateBrief } from '../skills/paid-media/campaign-brief-generator.skill'

// AD-30 script from Ad Scripting doc (Media Pouch V2 — 3/25/26)
const AD30_SCRIPT = `[HOOK 1]
Even with some of the larger independent restaurant groups that spend up to $20M per year on food, we've still been able to help them save an average of 5-7% on their annual food costs…

[HOOK 2]
Yeah, so for example we recently worked with the owner of MaryAnn's Diner, a 5-unit diner chain who had been in business for over two decades…and…we saved him over $270,000 on his annual food costs.

[HOOK 3]
One of the restaurant groups we work with spends over $15M per year on food, and we were still able to come in and save them close to 4 percent on their annual food costs.

[HOOK 4]
So we started in 2010, and since then we've helped over 2,000 independent restaurants save 5-7% on their annual food costs…

[BODY]
So if you are curious how we've achieved these savings, my team put together a completely free, 200-page playbook that shows the exact strategies we've used to give over 2,000 restaurants the same pricing and purchasing strategies as national chains. There's also a few free case studies included of specific restaurants we've worked with who have each saved anywhere between $100 thousand to $550 thousand dollars per year on food costs without any changes to ingredients or suppliers. There's no strings attached and this is really just a way for our team to help bring value to your restaurant, so yeah, check it out!

[CTA]
So if that sounds at all interesting to you, check out the link below to download our completely free food cost reduction playbook where you can see exactly how 2,000 other restaurants have saved 5-7% on their annual food costs, with no changes to ingredients or distributors.`

// Mock transcript — natural spoken version mixing all 4 hooks
const MOCK_TRANSCRIPT = `Even with some of the larger independent restaurant groups that spend up to 20 million dollars per year on food, we've still been able to help them save an average of 5 to 7 percent on their annual food costs. So if you are curious how we've achieved these savings, my team put together a completely free 200-page playbook that shows the exact strategies we've used to give over 2,000 restaurants the same pricing and purchasing strategies as national chains. There's also a few free case studies included of specific restaurants we've worked with who have each saved anywhere between 100 thousand to 550 thousand dollars per year on food costs without any changes to ingredients or suppliers. There's no strings attached and this is really just a way for our team to help bring value to your restaurant. So if that sounds at all interesting to you, check out the link below to download our completely free food cost reduction playbook where you can see exactly how 2,000 other restaurants have saved 5 to 7 percent on their annual food costs, with no changes to ingredients or distributors.`

async function main() {
  const anthropic = new Anthropic()

  console.log()
  console.log('='.repeat(62))
  console.log('AD-30 MULTI-HOOK BRIEF TEST — Media Pouch V2')
  console.log('='.repeat(62))
  console.log()

  // 1. Query footage_log for AD-30
  const { data: rows, error } = await supabase
    .from('footage_log')
    .select('id, ad_id, concept_folder, file_name, sharepoint_item_id, status')
    .ilike('ad_id', '%AD-30%')
    .order('id', { ascending: false })

  if (error) throw error

  console.log(`AD-30 footage rows in DB: ${rows?.length ?? 0}`)
  if (rows && rows.length > 0) {
    for (const r of rows) {
      console.log(`  [${r.ad_id}] ${r.file_name} — status: ${r.status}`)
    }
  } else {
    console.log('  (none — using mock footage row for test)')
  }
  console.log()

  // 2. Run Claude semantic match against AD-30 script
  console.log('Running Claude semantic match against AD-30 script...')
  const matchMsg = await anthropic.messages.create({
    model:      'claude-opus-4-7',
    max_tokens: 300,
    messages: [{
      role:    'user',
      content: `You are matching a video transcript to an ad script. Natural speech, paraphrasing, and summarized delivery all count as matches.

VIDEO TRANSCRIPT:
${MOCK_TRANSCRIPT}

AD SCRIPTS TO MATCH AGAINST:
Script 1: "Media Pouch V2"
${AD30_SCRIPT}

Which script (if any) does this transcript match? Consider that speakers often paraphrase or summarize scripts naturally.

Respond with JSON only:
{
  "matched_script_name": "string or null",
  "confidence": 0-100,
  "reasoning": "one sentence"
}`,
    }],
  })

  let confidence  = 0
  let matchedName = '—'
  let reasoning   = ''
  try {
    const parsed = JSON.parse((matchMsg.content[0] as { text: string }).text)
    confidence  = parsed.confidence ?? 0
    matchedName = parsed.matched_script_name ?? '—'
    reasoning   = parsed.reasoning ?? ''
  } catch {
    reasoning = 'parse error'
  }

  console.log(`  Confidence:     ${confidence}%`)
  console.log(`  Matched script: ${matchedName}`)
  console.log(`  Reasoning:      ${reasoning}`)
  console.log()

  // 3. Parse the script and count hooks
  // Quick local parse to show hook count before generating brief
  const hookMatches = [...AD30_SCRIPT.matchAll(/\[HOOK\s+\d+[^\]]*\]/gi)]
  console.log(`Hooks detected in script: ${hookMatches.length}`)
  hookMatches.forEach((m, i) => console.log(`  Hook ${i + 1}: ${m[0]}`))
  console.log()

  // 4. Generate multi-hook brief (dry run — save to tmp/, do NOT upload)
  console.log('Generating multi-hook brief (dry run — saving to tmp/)...')
  console.log()

  // Use first real AD-30 row if it exists, otherwise use a stub ID
  const footageRow = rows?.[0]
  const footageLogId = footageRow?.id ?? 'test-ad30-stub'
  const conceptId    = footageRow?.ad_id ?? 'FSIQ-VIDEO-AD-30'

  const result = await generateBrief({
    conceptId,
    footageLogId,
    matchedScript: {
      matched_script_name: matchedName,
      matched_ad_id:       conceptId,
      confidence,
      matching_elements:   [],
      reasoning,
      full_text:           AD30_SCRIPT,
    },
    dryRun: true,
  })

  console.log()
  console.log('='.repeat(62))
  console.log('RESULTS')
  console.log('='.repeat(62))
  console.log(`  AD-30 footage rows:    ${rows?.length ?? 0}`)
  console.log(`  Transcript source:     mock (injected from Ad Scripting doc)`)
  console.log(`  Match confidence:      ${confidence}%`)
  console.log(`  Matched script:        ${matchedName}`)
  console.log(`  Hooks in script:       ${hookMatches.length}`)
  console.log(`  Brief status:          ${result.status}`)
  console.log()

  if (result.status === 'dry_run') {
    const outPath = `${process.cwd()}/tmp/${conceptId}-Brief.docx`
    console.log(`  Brief saved to: ${outPath}`)
    console.log()
    console.log('Open the .docx and verify:')
    console.log('  1. HOOK 1 label (blue, bold) with first hook text')
    console.log('  2. HOOK 2, HOOK 3, HOOK 4 labels injected with correct text')
    console.log('  3. BODY section with full body paragraph')
    console.log('  4. CTA section with CTA text')
    console.log('  5. Formatting matches AD-33 template (no extra borders, correct fonts)')
  }
  console.log()
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
