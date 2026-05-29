// test-script-generator.ts
// Validates script-generator.skill.ts end-to-end:
//   1. Claude generates 3 script concepts
//   2. 3 rows inserted into creative_pipeline with script_draft populated
//   3. 3 Slack messages posted to #MediaBuying with approve/skip buttons

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

async function clearPriorTestRecs() {
  // Remove any script-generator skill_runs from the last hour to avoid noise
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  await sb.from('skill_runs')
    .delete()
    .eq('skill', 'script-generator')
    .gte('started_at', cutoff)
  console.log('  [cleared recent script-generator skill_runs]')
}

async function runScriptGenerator() {
  const key = require.resolve('../skills/paid-media/script-generator.skill')
  delete require.cache[key]
  const { run } = await import('../skills/paid-media/script-generator.skill')
  return run()
}

async function fetchCreatedRows(pipelineIds: string[]) {
  if (pipelineIds.length === 0) return []
  const { data } = await sb
    .from('creative_pipeline')
    .select('id, global_number, concept_name, hook_type, awareness_level, lp_code, duration, status, script_draft')
    .in('id', pipelineIds)
  return data ?? []
}

async function main() {
  header('PRE-FLIGHT — clear recent test data')
  await clearPriorTestRecs()

  header('STEP 1 — Run script-generator (calls Claude + writes to Supabase + posts Slack)')
  console.log('Running script-generator (this will call Claude API)...\n')

  let output: Awaited<ReturnType<typeof runScriptGenerator>> | null = null
  try {
    output = await runScriptGenerator()
    console.log('\nSKILL OUTPUT:')
    console.log(JSON.stringify(output, null, 2))
  } catch (err) {
    console.error('UNEXPECTED ERROR:', (err as Error).message)
    process.exit(1)
  }

  header('STEP 2 — Verify creative_pipeline rows')
  const rows = await fetchCreatedRows(output?.pipeline_ids ?? [])
  console.log(`\nRows created: ${rows.length}`)
  console.log()

  for (const row of rows) {
    const conceptId = `FSIQ-VIDEO-AD-${row.global_number}`
    console.log(`─── ${conceptId}: ${row.concept_name}`)
    console.log(`    hook_type:       ${row.hook_type}`)
    console.log(`    awareness_level: ${row.awareness_level}`)
    console.log(`    lp_code:         ${row.lp_code}`)
    console.log(`    duration:        ${row.duration}`)
    console.log(`    status:          ${row.status}`)
    console.log(`    script_draft:    ${row.script_draft ? `✅ ${row.script_draft.length} chars` : '❌ NULL'}`)
    console.log()
  }

  header('STEP 3 — Show full scripts')
  for (const row of rows) {
    const conceptId = `FSIQ-VIDEO-AD-${row.global_number}`
    console.log(`\n━━━ ${conceptId}: ${row.concept_name} ━━━`)
    console.log(row.script_draft ?? '(no script)')
    console.log()
  }

  header('RESULT')

  const rowCount = rows.length
  const allHaveScript = rows.every(r => r.script_draft && r.script_draft.length > 100)
  const allStatusInProgress = rows.every(r => r.status === 'In Progress')

  if (rowCount === 3) {
    console.log('✅ PASS — 3 creative_pipeline rows created')
  } else {
    console.log(`❌ FAIL — expected 3 rows, got ${rowCount}`)
  }

  if (allHaveScript) {
    console.log('✅ PASS — all rows have script_draft populated')
  } else {
    console.log('❌ FAIL — one or more rows missing script_draft')
  }

  if (allStatusInProgress) {
    console.log('✅ PASS — all rows have status=In Progress')
  } else {
    console.log('⚠️  Some rows have unexpected status')
  }

  const slackNote = output?.concepts_generated === 3
    ? '✅ PASS — 3 Slack messages should be visible in #MediaBuying'
    : `⚠️  Only ${output?.concepts_generated ?? 0} concepts posted to Slack`
  console.log(slackNote)

  console.log('\n' + '═'.repeat(70))
  console.log('TEST COMPLETE')
  console.log('═'.repeat(70))
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
