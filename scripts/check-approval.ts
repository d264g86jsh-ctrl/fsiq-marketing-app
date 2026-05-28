// Run after clicking Approve in Slack:
// npx tsx --env-file=.env.local scripts/check-approval.ts
import { supabase } from '../lib/supabase'

const REC_ID = '63c9445c-1034-41b6-9924-ed7687349ddf'
const AD_SET_ID = '120242005635690546'
const META_TOKEN = process.env.META_ACCESS_TOKEN!
const CLICKUP_TOKEN = process.env.CLICKUP_API_TOKEN!
const CLICKUP_LIST_ID = process.env.CLICKUP_LIST_ID!

async function main() {
  console.log('═══ 1. SUPABASE RECOMMENDATION ═══')
  const { data: rec } = await supabase
    .from('recommendations')
    .select('status, approved_at, executed_at, executed_by')
    .eq('id', REC_ID)
    .single()

  const statusIcon = rec?.status === 'approved' ? '✅' : rec?.status === 'skipped' ? '❌' : '⏳'
  console.log(`  ${statusIcon} Status:      ${rec?.status ?? '?'}`)
  console.log(`  Approved at: ${rec?.approved_at ?? 'null'}`)
  console.log(`  Executed by: ${rec?.executed_by ?? 'null'}`)
  console.log()

  console.log('═══ 2. META AD SET BUDGET ═══')
  const metaRes = await fetch(
    `https://graph.facebook.com/v21.0/${AD_SET_ID}?fields=id,name,daily_budget,status&access_token=${META_TOKEN}`
  )
  const adset = await metaRes.json() as { name: string; status: string; daily_budget: string }
  const budgetUsd = parseInt(adset.daily_budget ?? '0') / 100
  const budgetIcon = budgetUsd >= 95 ? '✅' : '❌'
  console.log(`  ${budgetIcon} Name:   ${adset.name}`)
  console.log(`  ${budgetIcon} Budget: $${budgetUsd}/day  (expected $95/day)`)
  console.log(`     Status: ${adset.status}`)
  console.log()

  console.log('═══ 3. CLICKUP TASK ═══')
  const cuRes = await fetch(
    `https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task?order_by=created&reverse=true&page=0`,
    { headers: { Authorization: CLICKUP_TOKEN } }
  )
  const cuData = await cuRes.json() as { tasks: Array<{ name: string; status: { status: string }; tags: { name: string }[]; url: string }> }
  const mediaTasks = cuData.tasks.filter(t => t.tags.some(tag => tag.name === 'media-buying'))
  if (mediaTasks.length > 0) {
    console.log(`  ✅ Found ${mediaTasks.length} media-buying task(s):`)
    for (const t of mediaTasks.slice(0, 3)) {
      console.log(`     [${t.status.status.toUpperCase()}] ${t.name}`)
      console.log(`     ${t.url}`)
    }
  } else {
    console.log('  ⏳ No media-buying tagged tasks found yet')
  }
  console.log()

  if (rec?.status !== 'approved') {
    console.log('⚠️  Recommendation is still pending — did you click Approve in #MediaBuying?')
  } else {
    console.log('✅ End-to-end loop confirmed.')
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
