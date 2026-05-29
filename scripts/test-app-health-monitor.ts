// test-app-health-monitor.ts
// Runs all 4 production test cases in order:
//   1. Bad URL       → alert fires to #assistant
//   2. Force 2 consecutive failures via DB → redeployment attempted
//   3. Real URL      → recovery message + counter reset
//   4. No URL        → not_configured, exits cleanly (no Slack)

import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function seedDownRuns(count: number) {
  const rows = Array.from({ length: count }, (_, i) => ({
    agent:        'paid-media',
    skill:        'app-health-monitor',
    status:       'down',
    started_at:   new Date(Date.now() - (count - i) * 30 * 60 * 1000).toISOString(),
    completed_at: new Date(Date.now() - (count - i) * 30 * 60 * 1000 + 1000).toISOString(),
    output_summary: {
      url:                    'https://bad-url-test.vercel.app',
      http_status_code:       null,
      response_time_ms:       5001,
      error_message:          'timeout',
      consecutive_failures:   i + 1,
      redeployment_triggered: false,
      recovery:               false,
      uptime_pct:             100,
      checked_at:             new Date(Date.now() - (count - i) * 30 * 60 * 1000).toISOString(),
    },
  }))
  const { error } = await sb.from('skill_runs').insert(rows)
  if (error) console.warn('  [seed error]', error.message)
  else console.log(`  [seeded ${count} 'down' skill_runs rows]`)
}

async function clearTestRuns() {
  await sb.from('skill_runs')
    .delete()
    .eq('skill', 'app-health-monitor')
}

function header(label: string) {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`TEST ${label}`)
  console.log('═'.repeat(60))
}

async function runSkill(urlOverride: string | undefined): Promise<void> {
  const saved = process.env.VERCEL_FOOD_COST_APP_URL
  if (urlOverride === undefined) delete process.env.VERCEL_FOOD_COST_APP_URL
  else process.env.VERCEL_FOOD_COST_APP_URL = urlOverride

  // Fresh import each time so env reads correctly
  const key = require.resolve('../skills/paid-media/app-health-monitor.skill')
  delete require.cache[key]
  const { run } = await import('../skills/paid-media/app-health-monitor.skill')

  try {
    const out = await run()
    console.log('\nOUTPUT:', JSON.stringify(out, null, 2))
  } catch (err) {
    console.error('UNEXPECTED ERROR:', (err as Error).message)
  }

  if (saved === undefined) delete process.env.VERCEL_FOOD_COST_APP_URL
  else process.env.VERCEL_FOOD_COST_APP_URL = saved
}

async function main() {
  const realUrl = process.env.VERCEL_FOOD_COST_APP_URL

  // ── Test 1: bad URL → first failure alert ─────────────────────────────────
  header('1 — Bad URL → expect DOWN alert to #assistant (consecutive: 1)')
  await clearTestRuns()
  await runSkill('https://this-domain-does-not-exist-fsiq-test.vercel.app')

  // ── Test 2: 2 seeded 'down' rows → redeployment attempted ────────────────
  header('2 — 2 consecutive failures → expect redeployment attempt + #assistant')
  await clearTestRuns()
  await seedDownRuns(2)
  await runSkill('https://this-domain-does-not-exist-fsiq-test.vercel.app')

  // ── Test 3: real URL after 2 down rows → recovery fires ──────────────────
  header('3 — Real URL after outage → expect RECOVERY message to #assistant')
  // Leave the seeded down rows in DB so wasLastRunDown() sees 'down'
  await runSkill(realUrl)

  // ── Test 4: URL not set → not_configured, no Slack ───────────────────────
  header('4 — URL not set → expect not_configured, no Slack')
  await clearTestRuns()
  await runSkill(undefined)

  console.log('\n' + '═'.repeat(60))
  console.log('ALL 4 TESTS COMPLETE')
  console.log('═'.repeat(60))

  await clearTestRuns()
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
