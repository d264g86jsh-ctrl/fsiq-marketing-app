// Run with: npx tsx --env-file=.env.local scripts/test-skill-1-2.ts
import { run } from '../skills/paid-media/slack-notify.skill'
import { supabase } from '../lib/supabase'

async function main() {
  console.log('Running Skill 1.2 — Slack Notify...\n')

  // Show what's pending before the run
  const { data: pending } = await supabase
    .from('recommendations')
    .select('id, type, title, status, slack_ts, slack_channel, created_at')
    .eq('status', 'pending')
    .eq('agent', 'paid-media')
    .is('slack_ts', null)
    .order('created_at', { ascending: false })

  console.log(`Pending recommendations (no slack_ts): ${pending?.length ?? 0}`)
  for (const r of pending ?? []) {
    console.log(`  ${r.id.slice(0, 8)}… [${r.type}] ${r.title}`)
  }
  console.log()

  const output = await run()

  console.log('══════════ SLACK NOTIFY RESULTS ══════════')
  console.log(`Run at:                 ${output.run_at}`)
  console.log(`Messages posted:        ${output.notified}`)
  console.log(`Skipped (dedup/older):  ${output.skipped_already_notified}`)
  console.log()

  if (output.recommendation_ids.length === 0) {
    console.log('No messages posted — nothing new to notify.')
    return
  }

  // Verify slack_ts was saved
  console.log('── Verifying Supabase updates ────────────')
  const { data: updated } = await supabase
    .from('recommendations')
    .select('id, title, slack_ts, slack_channel')
    .in('id', output.recommendation_ids)

  for (const r of updated ?? []) {
    const tsOk = r.slack_ts ? '✅' : '❌'
    const chOk = r.slack_channel ? '✅' : '❌'
    console.log(`\n  ${r.title}`)
    console.log(`  ${tsOk} slack_ts:      ${r.slack_ts ?? 'MISSING'}`)
    console.log(`  ${chOk} slack_channel: ${r.slack_channel ?? 'MISSING'}`)
    console.log(`  rec_id:        ${r.id}`)
  }

  console.log('\n══════════════════════════════════════════')
  console.log('Check #MediaBuying in Slack — approve/skip buttons should appear.')
  console.log('Button values contain the correct rec_id shown above.')
}

main().catch(e => {
  console.error('Skill 1.2 test failed:', e.message)
  process.exit(1)
})
