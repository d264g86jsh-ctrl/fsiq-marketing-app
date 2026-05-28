// Run with: npx tsx --env-file=.env.local scripts/test-accuracy-audit.ts
import { run } from '../skills/paid-media/supabase-accuracy-audit.skill'

async function main() {
  console.log('Running Supabase Accuracy Audit...\n')

  const output = await run()

  const scoreBar = '█'.repeat(output.score / 10) + '░'.repeat(10 - output.score / 10)

  console.log('══════════ ACCURACY AUDIT RESULTS ══════════')
  console.log(`Date:    ${output.date}`)
  console.log(`Score:   ${output.score}/100  [${scoreBar}]`)
  console.log(`Streak:  ${output.consecutive_passing_days} consecutive passing day(s)`)
  console.log()

  const { checks } = output
  const icon = (pass: boolean) => pass ? '✅' : '❌'

  console.log(`${icon(checks.lead_count.pass)} CHECK 1 — Lead Count Parity`)
  for (const w of checks.lead_count.windows) {
    const wIcon = w.pass ? '  ✓' : '  ✗'
    console.log(`${wIcon} ${w.label.padEnd(8)} supabase=${w.supabase}  sheet=${w.sheet}  delta=${(w.delta * 100).toFixed(1)}%`)
  }
  if (checks.lead_count.failed_windows.length > 0) {
    console.log(`  Failed: ${checks.lead_count.failed_windows.join(', ')}`)
  }
  console.log()

  console.log(`${icon(checks.spend_parsing.pass)} CHECK 2 — Food Spend Parsing`)
  console.log(`  Mismatches > $50k: ${checks.spend_parsing.mismatches}`)
  console.log()

  console.log(`${icon(checks.cpql_window.pass)} CHECK 3 — CPQL Window Accuracy`)
  console.log(`  Avg delta: ${checks.cpql_window.delta_pct !== null ? checks.cpql_window.delta_pct + '%' : 'n/a (no matching ad sets)'}`)
  console.log()

  console.log(`${icon(checks.webhook_latency.pass)} CHECK 4 — Webhook Latency`)
  if (checks.webhook_latency.warning) {
    console.log(`  ⚠️  ${checks.webhook_latency.warning}`)
  } else {
    console.log(`  Median latency: ${checks.webhook_latency.median_seconds ?? 'n/a'}s`)
  }
  console.log()

  console.log(`${icon(checks.attribution.pass)} CHECK 5 — UTM Attribution Coverage`)
  console.log(`  Coverage: ${checks.attribution.coverage_pct !== null ? checks.attribution.coverage_pct + '%' : 'n/a'}`)
  console.log()

  console.log('══════════════════════════════════════════')

  if (output.consecutive_passing_days >= 14 && output.score === 100) {
    console.log('🎯 14-day clean streak reached — Slack notification sent to #operations')
  } else if (output.score === 100) {
    const daysLeft = 14 - output.consecutive_passing_days
    console.log(`📈 Score 100/100 today. ${daysLeft} more day(s) until Sheet fallback can be disabled.`)
  } else {
    console.log(`⚠️  Score ${output.score}/100 — fix failing checks before 14-day streak can start.`)
  }
}

main().catch(e => {
  console.error('Audit failed:', e.message)
  process.exit(1)
})
