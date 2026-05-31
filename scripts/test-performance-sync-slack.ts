// test-performance-sync-slack.ts
// Validates the inline Slack posting architecture:
//
//   1. performance-sync runs → decisions written to Supabase →
//      Slack messages posted to #MediaBuying → slack_ts saved back to rows
//
//   2. slack-notify (catch-up) runs → finds 0 rows with null slack_ts
//      (all already handled by performance-sync)

import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function header(label: string) {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(label)
  console.log('═'.repeat(60))
}

async function clearPerfSyncRecs() {
  await sb.from('recommendations')
    .delete()
    .eq('agent', 'paid-media')
    .eq('skill', 'performance-sync')
  console.log('  [cleared prior performance-sync recommendations]')
}

async function runPerformanceSync() {
  const key = require.resolve('../skills/paid-media/performance-sync.skill')
  delete require.cache[key]
  const { run } = await import('../skills/paid-media/performance-sync.skill')
  return run()
}

async function runSlackNotify() {
  const key = require.resolve('../skills/paid-media/slack-notify.skill')
  delete require.cache[key]
  const { run } = await import('../skills/paid-media/slack-notify.skill')
  return run()
}

async function checkRecommendations() {
  const { data } = await sb
    .from('recommendations')
    .select('id, type, title, status, slack_ts, slack_channel, created_at')
    .eq('agent', 'paid-media')
    .eq('skill', 'performance-sync')
    .order('created_at', { ascending: false })
    .limit(10)

  return data ?? []
}

async function main() {
  header('STEP 1 — performance-sync: Meta → decisions → Supabase → #MediaBuying')
  await clearPerfSyncRecs()

  console.log('Running performance-sync (calls Meta API + Claude)...')
  let syncOutput: Awaited<ReturnType<typeof runPerformanceSync>> | null = null
  try {
    syncOutput = await runPerformanceSync()
    console.log('\nSKILL OUTPUT:')
    console.log(JSON.stringify(syncOutput?.summary, null, 2))
    console.log(`\nDecisions made: ${syncOutput?.decisions.length}`)
    for (const d of syncOutput?.decisions ?? []) {
      console.log(`  ${d.action.padEnd(18)} ${d.ad_set_name.slice(0, 50)}`)
    }
  } catch (err) {
    console.error('UNEXPECTED ERROR:', (err as Error).message)
  }

  header('STEP 2 — Verify recommendations + slack_ts in Supabase')
  const recs = await checkRecommendations()
  console.log(`Total recommendations written: ${recs.length}`)
  console.log()
  for (const r of recs) {
    const tsStatus = r.slack_ts ? `slack_ts=✅ ${r.slack_ts}` : 'slack_ts=❌ NULL'
    console.log(`  [${r.type}] ${r.title.slice(0, 50)}`)
    console.log(`    ${tsStatus}  channel=${r.slack_channel ?? 'null'}`)
  }

  const nullTs = recs.filter(r => !r.slack_ts).length
  const withTs  = recs.filter(r =>  r.slack_ts).length
  console.log(`\nWith slack_ts: ${withTs}  |  Missing slack_ts: ${nullTs}`)

  header('STEP 3 — slack-notify catch-up (should find 0 pending with null slack_ts)')
  let notifyOutput: Awaited<ReturnType<typeof runSlackNotify>> | null = null
  try {
    notifyOutput = await runSlackNotify()
    console.log('\nCATCH-UP OUTPUT:')
    console.log(JSON.stringify(notifyOutput, null, 2))
  } catch (err) {
    console.error('UNEXPECTED ERROR:', (err as Error).message)
  }

  header('RESULT')
  const catchUpSent = notifyOutput?.notified ?? -1
  if (catchUpSent === 0) {
    console.log('✅ PASS — slack-notify sent 0 messages (performance-sync handled all inline)')
  } else if (catchUpSent > 0) {
    console.log(`⚠️  PARTIAL — slack-notify caught up ${catchUpSent} missed notification(s)`)
  } else {
    console.log('❌ Could not verify catch-up result')
  }

  if (nullTs === 0 && recs.length > 0) {
    console.log('✅ PASS — all recommendations have slack_ts saved')
  } else if (recs.length === 0) {
    console.log('ℹ️  No non-hold decisions today — all ad sets are hold/exempt')
  } else if (nullTs > 0) {
    console.log(`⚠️  ${nullTs} recommendation(s) missing slack_ts`)
  }

  console.log('\n' + '═'.repeat(60))
  console.log('TEST COMPLETE')
  console.log('═'.repeat(60))
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
