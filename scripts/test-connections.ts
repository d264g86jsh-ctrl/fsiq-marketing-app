// Run with: npx tsx --env-file=.env.local scripts/test-connections.ts
import { getAdAccount } from '../lib/meta'
import { testConnection as testSlack } from '../lib/slack'
import { testConnection as testClickUp } from '../lib/clickup'
import { testConnection as testSupabase } from '../lib/supabase'

async function run() {
  const results: Record<string, { ok: boolean; detail: string }> = {}

  // META
  try {
    const account = await getAdAccount()
    results.meta = {
      ok: true,
      detail: `Account: ${account.name} (${account.id}) — status ${account.account_status}`,
    }
  } catch (e) {
    results.meta = { ok: false, detail: String(e) }
  }

  // SLACK
  try {
    const slack = await testSlack()
    results.slack = { ok: !!slack.ok, detail: `Bot: ${slack.user} | Team: ${slack.team}` }
  } catch (e) {
    results.slack = { ok: false, detail: String(e) }
  }

  // CLICKUP
  try {
    const cu = await testClickUp()
    results.clickup = { ok: true, detail: `User: ${cu.username} (${cu.email})` }
  } catch (e) {
    results.clickup = { ok: false, detail: String(e) }
  }

  // SUPABASE
  try {
    const sb = await testSupabase()
    results.supabase = { ok: sb.ok, detail: `Table '${sb.table}' accessible — ${sb.rows} rows` }
  } catch (e) {
    results.supabase = { ok: false, detail: String(e) }
  }

  // Print results
  console.log('\n══════════ CONNECTION TEST ══════════')
  for (const [name, result] of Object.entries(results)) {
    const icon = result.ok ? '✅' : '❌'
    console.log(`${icon} ${name.toUpperCase().padEnd(10)} ${result.detail}`)
  }
  console.log('═════════════════════════════════════\n')

  const failed = Object.entries(results).filter(([, r]) => !r.ok)
  if (failed.length) process.exit(1)
}

run()
