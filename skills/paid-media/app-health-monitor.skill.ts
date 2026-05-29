// app-health-monitor.skill.ts — Skill 1.9
// Pings VERCEL_FOOD_COST_APP_URL every 30 min.
// Expects HTTP 200 within 5 seconds.
// On success:  skill_runs log only, no Slack.
// On failure:  posts to #assistant.
// 2 consecutive failures: triggers Vercel redeployment + posts to #assistant.
// Tracks uptime_pct in skill_runs output_summary.
// Schedule: every 30 min via Vercel cron.

import fs from 'fs'
import path from 'path'
import { supabase } from '../../lib/supabase'
import { sendBlocks } from '../../lib/slack'
import type { KnownBlock } from '@slack/web-api'

const sop = fs.readFileSync(
  path.join(process.cwd(), 'sops', 'paid-media-agent-sop.md'),
  'utf-8',
)
void sop

// ── Types ─────────────────────────────────────────────────────────────────────

export type SkillOutput = {
  url: string
  status_code: number | null
  response_ms: number | null
  is_up: boolean
  consecutive_failures: number
  redeployment_triggered: boolean
  uptime_pct: number
}

// ── Vercel redeployment ───────────────────────────────────────────────────────

async function triggerRedeployment(): Promise<boolean> {
  const appId = process.env.VERCEL_FOOD_COST_APP_ID
  const token = process.env.VERCEL_API_TOKEN

  if (!appId || !token) {
    console.warn('[app-health-monitor] VERCEL_FOOD_COST_APP_ID or VERCEL_API_TOKEN not set — cannot redeploy')
    return false
  }

  // Get the latest deployment for the project and redeploy it
  const listRes = await fetch(
    `https://api.vercel.com/v6/deployments?projectId=${appId}&limit=1&target=production`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!listRes.ok) {
    console.warn(`[app-health-monitor] Could not list deployments: ${listRes.status}`)
    return false
  }
  const list = await listRes.json() as { deployments?: { uid: string }[] }
  const latestId = list.deployments?.[0]?.uid
  if (!latestId) return false

  const redeployRes = await fetch(
    `https://api.vercel.com/v13/deployments/${latestId}/redeploy`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'production' }),
    },
  )
  return redeployRes.ok
}

// ── Consecutive failure tracking via skill_runs ───────────────────────────────

async function getConsecutiveFailures(): Promise<number> {
  const { data } = await supabase
    .from('skill_runs')
    .select('status, output_summary')
    .eq('skill', 'app-health-monitor')
    .order('completed_at', { ascending: false })
    .limit(10)

  if (!data || data.length === 0) return 0

  let consecutive = 0
  for (const row of data) {
    if (row.status === 'down') {
      consecutive++
    } else {
      break
    }
  }
  return consecutive
}

async function getUptimePct(): Promise<number> {
  const { data } = await supabase
    .from('skill_runs')
    .select('status')
    .eq('skill', 'app-health-monitor')
    .order('completed_at', { ascending: false })
    .limit(48) // last 24h at 30-min intervals

  if (!data || data.length === 0) return 100
  const upCount = data.filter(r => r.status === 'success').length
  return Math.round((upCount / data.length) * 1000) / 10
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function run(): Promise<SkillOutput> {
  const startedAt = new Date().toISOString()
  const url = process.env.VERCEL_FOOD_COST_APP_URL ?? ''

  if (!url) throw new Error('VERCEL_FOOD_COST_APP_URL not set')

  // ── Ping with 5s timeout ──────────────────────────────────────────────────
  let statusCode: number | null = null
  let responseMs: number | null = null
  let isUp = false

  const pingStart = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)

    responseMs  = Date.now() - pingStart
    statusCode  = res.status
    isUp        = res.status === 200
  } catch (err) {
    responseMs = Date.now() - pingStart
    const isTimeout = (err as Error).name === 'AbortError'
    statusCode  = null
    isUp        = false
    console.log(`[app-health-monitor] ${isTimeout ? 'Timeout (5s)' : `Error: ${(err as Error).message}`}`)
  }

  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })
  console.log(`[app-health-monitor] ${url} → ${statusCode ?? 'timeout'} in ${responseMs}ms — ${isUp ? '✅ UP' : '❌ DOWN'}`)

  // ── Consecutive failures + uptime ─────────────────────────────────────────
  const prevConsecutive = isUp ? 0 : await getConsecutiveFailures()
  const consecutiveFailures = isUp ? 0 : prevConsecutive + 1
  const uptime = await getUptimePct()

  let redeploymentTriggered = false

  // ── Alert on failure ──────────────────────────────────────────────────────
  if (!isUp) {
    const statusText = statusCode !== null ? `HTTP ${statusCode}` : 'Timeout (5s)'

    const downBlocks: KnownBlock[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🔴 *Food Cost Analyzer is down.*\nURL: ${url}\nStatus: ${statusText}\nTime: ${ts} CT`,
        },
      },
    ]
    await sendBlocks('assistant', downBlocks, `Food Cost Analyzer is down — ${statusText}`)

    // 2+ consecutive failures → trigger redeployment
    if (consecutiveFailures >= 2) {
      redeploymentTriggered = await triggerRedeployment()

      const redeployBlocks: KnownBlock[] = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: redeploymentTriggered
              ? `🔁 *Redeployment triggered* for Food Cost Analyzer (${consecutiveFailures} consecutive failures). Vercel is rebuilding.`
              : `⚠️ *Could not trigger redeployment* — check VERCEL_FOOD_COST_APP_ID and VERCEL_API_TOKEN.\n(${consecutiveFailures} consecutive failures)`,
          },
        },
      ]
      await sendBlocks('assistant', redeployBlocks,
        redeploymentTriggered ? 'Food Cost Analyzer redeployment triggered' : 'Redeployment failed — manual action needed')
    }
  }

  // ── Log to skill_runs ─────────────────────────────────────────────────────
  await supabase.from('skill_runs').insert({
    agent: 'paid-media',
    skill: 'app-health-monitor',
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    status: isUp ? 'success' : 'down',
    output_summary: {
      url,
      status_code:            statusCode,
      response_ms:            responseMs,
      is_up:                  isUp,
      consecutive_failures:   consecutiveFailures,
      redeployment_triggered: redeploymentTriggered,
      uptime_pct:             uptime,
    },
  })

  return {
    url,
    status_code:            statusCode,
    response_ms:            responseMs,
    is_up:                  isUp,
    consecutive_failures:   consecutiveFailures,
    redeployment_triggered: redeploymentTriggered,
    uptime_pct:             uptime,
  }
}
