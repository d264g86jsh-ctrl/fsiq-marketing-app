// Skill 1.2 — slack-notify.skill.ts  [CATCH-UP ONLY]
// performance-sync.skill.ts posts to #MediaBuying inline immediately after writing
// recommendations. This skill is a safety net — it runs after performance-sync and
// picks up any recommendations that still have no slack_ts (e.g. if the inline post
// failed due to a transient Slack error). Under normal operation it sends nothing.

import fs from 'fs'
import path from 'path'
import { supabase } from '../../lib/supabase'
import { sendBlocks } from '../../lib/slack'

const ACTION_ICONS: Record<string, string> = {
  scale_up:          '⬆️',
  scale_down:        '⬇️',
  kill:              '🔴',
  insufficient_data: '❓',
}

const DATA_SOURCE_LABELS: Record<string, string> = {
  supabase_verified:   '✅ Dual verified',
  sheet_sot:           '📊 Sheet SOT',
  conflict_sheet_used: '⚠️ Conflict→Sheet',
  attribution_pending: '⏳ Attr pending',
}

interface RecBody {
  ad_set_id: string
  ad_set_name: string
  action: string
  current_budget_usd: number
  recommended_budget_usd: number | null
  confidence: string
  reason: string
  metrics_used: string[]
  data_source?: string
}

interface PendingRec {
  id: string
  type: string
  title: string
  body: RecBody
  created_at: string
}

interface AdPerf {
  ad_set_id: string
  cp2ql_7d: number | null
  cp2ql_leads_7d: number | null
  cp3ql_7d: number | null
  spend_7d: number | null
  cpl_7d: number | null
  cpm_d1: number | null
}

export interface SlackNotifyOutput {
  run_at: string
  notified: number
  skipped_already_notified: number
  recommendation_ids: string[]
}

export async function run(): Promise<SlackNotifyOutput> {
  const sop = fs.readFileSync(
    path.join(process.cwd(), 'sops', 'paid-media-agent-sop.md'),
    'utf-8'
  )
  void sop // loaded per AGENTS.md pairing rule; referenced in prompt context if needed

  const channel = 'mediaBuying'
  const runAt = new Date().toISOString()

  // 1. Fetch pending recommendations that haven't been posted to Slack yet
  const { data: rows, error } = await supabase
    .from('recommendations')
    .select('id, type, title, body, created_at')
    .eq('status', 'pending')
    .eq('agent', 'paid-media')
    .is('slack_ts', null)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch recommendations: ${error.message}`)
  if (!rows || rows.length === 0) {
    await logSkillRun(runAt, 0, 0)
    return { run_at: runAt, notified: 0, skipped_already_notified: 0, recommendation_ids: [] }
  }

  const recs = rows as PendingRec[]

  // 2. Deduplicate by ad_set_id — keep only the most recent per ad set
  const seen = new Set<string>()
  const dedupedRecs: PendingRec[] = []
  for (const rec of recs) {
    const adSetId = rec.body?.ad_set_id
    if (!adSetId || seen.has(adSetId)) continue
    seen.add(adSetId)
    dedupedRecs.push(rec)
  }

  const skippedCount = recs.length - dedupedRecs.length

  // 3. Fetch ad_performance metrics for all relevant ad_set_ids
  const adSetIds = dedupedRecs.map(r => r.body.ad_set_id).filter(Boolean)
  const { data: perfRows } = await supabase
    .from('ad_performance')
    .select('ad_set_id, cp2ql_7d, cp2ql_leads_7d, cp3ql_7d, spend_7d, cpl_7d, cpm_d1')
    .in('ad_set_id', adSetIds)

  const perfMap = new Map<string, AdPerf>()
  for (const p of (perfRows ?? []) as AdPerf[]) {
    perfMap.set(p.ad_set_id, p)
  }

  // 4. Build and send a Block Kit message for each recommendation
  const notifiedIds: string[] = []

  for (const rec of dedupedRecs) {
    const body = rec.body
    const perf = perfMap.get(body.ad_set_id)

    const icon = ACTION_ICONS[body.action] ?? '📋'
    const actionLabel = body.action.toUpperCase().replace('_', ' ')
    const adDisplayName = body.ad_set_name.length > 55
      ? body.ad_set_name.slice(0, 52) + '…'
      : body.ad_set_name

    const budgetLine = body.recommended_budget_usd && body.recommended_budget_usd !== body.current_budget_usd
      ? `$${body.current_budget_usd}/day → *$${body.recommended_budget_usd}/day*`
      : `$${body.current_budget_usd}/day (no change)`

    const dsLabel = DATA_SOURCE_LABELS[body.data_source ?? ''] ?? (body.data_source ?? 'unknown')

    // Metrics line from ad_performance
    const fmt = (v: number | null | undefined, prefix = '$') =>
      v != null ? `${prefix}${v.toFixed(0)}` : 'n/a'

    const metricsText = [
      `CP2QL 7d: ${fmt(perf?.cp2ql_7d)}`,
      `Leads (7d): ${perf?.cp2ql_leads_7d ?? 'n/a'}`,
      `CP3QL 7d: ${fmt(perf?.cp3ql_7d)}`,
      `CPL 7d: ${fmt(perf?.cpl_7d)}`,
      `Spend 7d: ${fmt(perf?.spend_7d)}`,
    ].join('  |  ')

    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${icon} ${actionLabel} — ${adDisplayName}`, emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Budget*\n${budgetLine}` },
          { type: 'mrkdwn', text: `*Confidence*\n${body.confidence}` },
          { type: 'mrkdwn', text: `*Data Source*\n${dsLabel}` },
          { type: 'mrkdwn', text: `*Action*\n${actionLabel}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `\`${metricsText}\`` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Reason:* ${body.reason}` },
      },
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ Approve', emoji: true },
            style: 'primary',
            action_id: 'approve_recommendation',
            value: rec.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '❌ Skip', emoji: true },
            style: 'danger',
            action_id: 'skip_recommendation',
            value: rec.id,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `rec_id: \`${rec.id}\`  ·  ${new Date(rec.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
          },
        ],
      },
    ]

    const fallbackText = `${icon} ${actionLabel}: ${body.ad_set_name} — $${body.current_budget_usd}/day → ${body.recommended_budget_usd ? `$${body.recommended_budget_usd}/day` : 'no change'}`

    const result = await sendBlocks(channel, blocks as never[], fallbackText)

    if (!result.ok || !result.ts || !result.channel) {
      console.error(`Failed to send Slack message for rec ${rec.id}:`, result.error)
      continue
    }

    // 5. Save slack_ts and slack_channel back to the recommendation row
    await supabase
      .from('recommendations')
      .update({ slack_ts: result.ts, slack_channel: result.channel })
      .eq('id', rec.id)

    notifiedIds.push(rec.id)
  }

  // 6. Log skill run
  await logSkillRun(runAt, notifiedIds.length, skippedCount)

  return {
    run_at: runAt,
    notified: notifiedIds.length,
    skipped_already_notified: skippedCount,
    recommendation_ids: notifiedIds,
  }
}

async function logSkillRun(startedAt: string, notified: number, skipped: number) {
  await supabase.from('skill_runs').insert({
    agent: 'paid-media',
    skill: 'slack-notify',
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    status: 'success',
    output: { notified, skipped_already_notified: skipped },
  })
}
