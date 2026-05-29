// test-script-generator.ts — v2 pipeline end-to-end test
// Tests Stage 1 (topic generation) + Stage 2 (script writing) in sequence.
// Stage 3/4 require live Slack interactions so are not tested here.

import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function header(label: string) {
  console.log(`\n${'═'.repeat(70)}`)
  console.log(label)
  console.log('═'.repeat(70))
}

async function main() {
  // ── Step 1: Approve one inspiration_catalog row ──────────────────────────
  header('STEP 1 — Approve an inspiration_catalog row')

  // Check if any approved rows already exist
  const { data: alreadyApproved } = await sb
    .from('inspiration_catalog')
    .select('id, library_id, headline, ad_type')
    .eq('approved', true)
    .eq('used', false)
    .limit(3)

  if (alreadyApproved && alreadyApproved.length > 0) {
    console.log(`  Already have ${alreadyApproved.length} approved row(s) — skipping approval step`)
    for (const r of alreadyApproved) {
      console.log(`  ✅ ${r.id} | ${r.ad_type} | "${r.headline ?? '(no headline)'}"`)
    }
  } else {
    const { data: target, error: findErr } = await sb
      .from('inspiration_catalog')
      .select('id, library_id, headline, ad_type')
      .eq('used', false)
      .not('library_id', 'is', null)
      .limit(1)
      .maybeSingle()

    if (findErr || !target) {
      console.error('  ❌ No unused inspiration_catalog rows found:', findErr?.message)
      console.error('     Run ads-library-scraper first to populate inspiration_catalog.')
      process.exit(1)
    }

    const { error: updateErr } = await sb
      .from('inspiration_catalog')
      .update({ approved: true })
      .eq('id', target.id)

    if (updateErr) {
      console.error('  ❌ Failed to set approved=true:', updateErr.message)
      process.exit(1)
    }

    console.log(`  ✅ Set approved=true on: ${target.id}`)
    console.log(`     library_id: ${target.library_id}`)
    console.log(`     headline:   "${target.headline ?? '(none)'}"`)
    console.log(`     ad_type:    ${target.ad_type}`)
  }

  // ── Step 2: Run Stage 1 (script-generator) ────────────────────────────────
  header('STEP 2 — Run script-generator Stage 1 (calls Claude → Supabase → Slack)')
  console.log('  Calling script-generator.skill.ts run() ...\n')

  let stage1Output: {
    run_at: string
    topic_row_id: string
    topics_generated: number
    inspiration_ids_used: string[]
  }

  try {
    const { run } = await import('../skills/paid-media/script-generator.skill')
    stage1Output = await run()
  } catch (err) {
    console.error('  ❌ Stage 1 failed:', (err as Error).message)
    console.error((err as Error).stack)
    process.exit(1)
  }

  console.log('\n  STAGE 1 OUTPUT:')
  console.log(JSON.stringify(stage1Output, null, 2))

  // ── Step 3: Show script_topics row ────────────────────────────────────────
  header('STEP 3 — script_topics row in Supabase')

  const { data: topicRow, error: fetchErr } = await sb
    .from('script_topics')
    .select('*')
    .eq('id', stage1Output.topic_row_id)
    .single()

  if (fetchErr || !topicRow) {
    console.error('  ❌ Could not fetch script_topics row:', fetchErr?.message)
    process.exit(1)
  }

  console.log(`\n  id:             ${topicRow.id}`)
  console.log(`  status:         ${topicRow.status}`)
  console.log(`  slack_ts:       ${topicRow.slack_ts ?? '(null)'}`)
  console.log(`  slack_channel:  ${topicRow.slack_channel ?? '(null)'}`)
  console.log(`  inspiration_ids (${topicRow.inspiration_ids?.length ?? 0}): ${JSON.stringify(topicRow.inspiration_ids)}`)
  console.log(`\n  TOPICS (${(topicRow.topics as unknown[]).length}):`)

  const topics = topicRow.topics as Array<{
    concept_name: string
    hook_type: string
    awareness_level: string
    suggested_lp: string
    angle: string
    inspiration_source: string | null
  }>

  for (let i = 0; i < topics.length; i++) {
    const t = topics[i]
    console.log(`\n  [${i}] ${t.concept_name}`)
    console.log(`      hook_type:       ${t.hook_type}`)
    console.log(`      awareness_level: ${t.awareness_level}`)
    console.log(`      suggested_lp:    ${t.suggested_lp}`)
    console.log(`      angle:           ${t.angle}`)
    console.log(`      inspiration:     ${t.inspiration_source ?? 'Original'}`)
  }

  // ── Step 4: Simulate approve_topic → trigger Stage 2 ─────────────────────
  header('STEP 4 — Simulate approve_topic (directly call script-stage2)')
  console.log(`  Approving topic [0]: "${topics[0]?.concept_name}"`)
  console.log('  Calling script-stage2.skill.ts run() ...\n')

  try {
    const { run } = await import('../skills/paid-media/script-stage2.skill')
    await run(stage1Output.topic_row_id, 0)
    console.log('\n  ✅ Stage 2 completed')
  } catch (err) {
    console.error('  ❌ Stage 2 failed:', (err as Error).message)
    console.error((err as Error).stack)
    process.exit(1)
  }

  // ── Step 5: Show created creative_pipeline rows ───────────────────────────
  header('STEP 5 — Verify creative_pipeline rows created by Stage 2')

  const { data: pipelineRows } = await sb
    .from('creative_pipeline')
    .select('id, ad_id, concept_name, hook_type, awareness_level, lp_code, duration, status, script_draft, slack_ts')
    .eq('script_topic_id', stage1Output.topic_row_id)
    .order('global_number', { ascending: true })

  if (!pipelineRows || pipelineRows.length === 0) {
    console.log('  ❌ No creative_pipeline rows found for this topic_row_id')
    process.exit(1)
  }

  console.log(`\n  Rows created: ${pipelineRows.length}\n`)

  for (const row of pipelineRows) {
    console.log(`  ─── ${row.ad_id}: ${row.concept_name}`)
    console.log(`      hook_type:       ${row.hook_type}`)
    console.log(`      awareness_level: ${row.awareness_level}`)
    console.log(`      lp_code:         ${row.lp_code}`)
    console.log(`      duration:        ${row.duration}`)
    console.log(`      status:          ${row.status}`)
    console.log(`      script_draft:    ${row.script_draft ? `✅ ${row.script_draft.length} chars` : '❌ NULL'}`)
    console.log(`      slack_ts:        ${row.slack_ts ?? '(null)'}`)
    console.log()
  }

  // ── Step 6: Show full scripts ─────────────────────────────────────────────
  header('STEP 6 — Full script text for each variation')
  for (const row of pipelineRows) {
    console.log(`\n━━━ ${row.ad_id}: ${row.concept_name} ━━━\n`)
    console.log(row.script_draft ?? '(no script)')
  }

  // Re-fetch script_topics to get post-Stage-2 status
  const { data: topicRowFinal } = await sb
    .from('script_topics')
    .select('status')
    .eq('id', stage1Output.topic_row_id)
    .single()

  // ── Summary ───────────────────────────────────────────────────────────────
  header('RESULT')
  const pass = (cond: boolean, msg: string) => console.log(`${cond ? '✅' : '❌'} ${msg}`)

  pass(stage1Output.topics_generated === 3, `Stage 1 generated ${stage1Output.topics_generated}/3 topics`)
  pass(!!topicRow.slack_ts, `Stage 1 posted to Slack (slack_ts: ${topicRow.slack_ts ?? 'missing'})`)
  pass(topicRowFinal?.status === 'scripts_generated', `script_topics status = "${topicRowFinal?.status}" (expected "scripts_generated")`)
  pass(pipelineRows.length === 2, `Stage 2 created ${pipelineRows.length}/2 variations`)
  pass(pipelineRows.every(r => r.status === 'Script Draft'), `All variations have status="Script Draft"`)
  pass(pipelineRows.every(r => r.script_draft && r.script_draft.length > 100), `All variations have script_draft populated`)
  pass(pipelineRows.every(r => r.slack_ts), `All variations posted to Slack`)

  console.log('\n' + '═'.repeat(70))
  console.log('TEST COMPLETE — check #MediaBuying in Slack to see the live messages')
  console.log(`topic_row_id: ${stage1Output.topic_row_id}`)
  console.log('═'.repeat(70))

  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
