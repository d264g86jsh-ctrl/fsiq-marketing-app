// Run with: npx tsx --env-file=.env.local scripts/test-skill-1-1.ts
import { runPerformanceSync } from '../skills/paid-media/performance-sync.skill'

async function main() {
  console.log('Running Skill 1.1 — Performance Sync...\n')

  const output = await runPerformanceSync()

  console.log('══════════ PERFORMANCE SYNC RESULTS ══════════')
  console.log(`Run at: ${output.run_at}`)
  console.log(`Active ad sets: ${output.summary.total_active}`)
  console.log(`Total daily budget: $${output.summary.total_daily_budget_usd.toFixed(0)}/day`)
  console.log(`Total spend (7d): $${output.summary.total_spend_7d.toFixed(0)}`)
  console.log()
  console.log('Decision summary:')
  console.log(`  ⬆️  SCALE UP:          ${output.summary.scale_up}`)
  console.log(`  ✅  HOLD:              ${output.summary.hold}`)
  console.log(`  ⬇️  SCALE DOWN:        ${output.summary.scale_down}`)
  console.log(`  🔴  KILL:              ${output.summary.kill}`)
  console.log(`  🔒  EXEMPT:            ${output.summary.exempt}`)
  console.log(`  ❓  INSUFFICIENT DATA: ${output.summary.insufficient_data}`)
  console.log()
  console.log('── Per-ad-set decisions ──────────────────────')

  for (const d of output.decisions) {
    const icon = {
      scale_up: '⬆️ ',
      hold: '✅',
      scale_down: '⬇️ ',
      kill: '🔴',
      exempt: '🔒',
      insufficient_data: '❓',
    }[d.action] ?? '  '

    const budgetChange = d.recommended_budget_usd !== null && d.recommended_budget_usd !== d.current_budget_usd
      ? ` → $${d.recommended_budget_usd}/day`
      : ''

    const ds: string = (d as any).data_source ?? 'unknown'
    const DS_LABELS: Record<string, string> = {
      supabase_verified:   '✅ Dual verified',
      sheet_sot:           '📊 Sheet SOT',
      conflict_sheet_used: '⚠️  Conflict→Sheet',
      attribution_pending: '⏳ Attr pending',
    }
    const dsLabel = DS_LABELS[ds] ?? ds

    console.log(`\n${icon} ${d.ad_set_name}`)
    console.log(`   Action:     ${d.action.toUpperCase().replace('_', ' ')} [${d.confidence} confidence]`)
    console.log(`   Budget:     $${d.current_budget_usd}/day${budgetChange}`)
    console.log(`   Data src:   ${dsLabel}`)
    console.log(`   Reason:     ${d.reason}`)
    console.log(`   Metrics:    ${d.metrics_used.join(', ')}`)
  }

  console.log('\n══════════════════════════════════════════════')
  console.log(`Recommendations written to Supabase: ${
    output.decisions.filter(d => d.action !== 'hold' && d.action !== 'exempt').length
  }`)
}

main().catch(e => {
  console.error('Skill 1.1 failed:', e.message)
  process.exit(1)
})
