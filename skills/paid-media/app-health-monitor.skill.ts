// app-health-monitor.skill.ts — Skill 1.9
// Pings VERCEL_FOOD_COST_APP_URL every 30 min (see vercel.json cron).
// Expects HTTP 200 within 5 seconds.
//
// On success:   skill_runs log only (status='up'), no Slack.
// On failure:   posts to #assistant immediately.
// 2 consecutive failures (≈1h down): triggers Vercel redeployment.
// Recovery (down → up): posts recovery message + resets counter.
// URL not set:  logs status='not_configured', exits cleanly — safe to deploy now.
//
// Uptime %: (up checks / total checks) × 100 over rolling 7-day window.

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
  status: 'up' | 'down' | 'not_configured'
  url: string | null
  http_status_code: number | null
  response_time_ms: number | null
  error_message: string | null
  consecutive_failures: number
  redeployment_triggered: boolean
  recovery: boolean
  uptime_pct: number
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

type PriorRun = {
  status: string
  output_summary: {
    consecutive_failures?: number
    checked_at?: string
  }
}

async function getRecentRuns(limit: number): Promise<PriorRun[]> {
  const { data } = await supabase
    .from('skill_runs')
    .select('status, output_summary')
    .eq('skill', 'app-health-monitor')
    .order('completed_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as PriorRun[]
}

async function getConsecutiveFailures(): Promise<number> {
  const runs = await getRecentRuns(10)
  let count = 0
  for (const r of runs) {
    if (r.status === 'down') count++
    else break
  }
  return count
}

async function getDowntimeStart(): Promise<string | null> {
  // Walk back through 'down' runs to find when the outage began
  const runs = await getRecentRuns(50)
  let lastDownRun: PriorRun | null = null
  for (const r of runs) {
    if (r.status === 'down') lastDownRun = r
    else break
  }
  return lastDownRun?.output_summary?.checked_at ?? null
}

async function wasLastRunDown(): Promise<boolean> {
  const runs = await getRecentRuns(1)
  return runs[0]?.status === 'down'
}

async function getUptimePct(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await supabase
    .from('skill_runs')
    .select('status')
    .eq('skill', 'app-health-monitor')
    .in('status', ['up', 'down'])
    .gte('completed_at', cutoff)

  if (!data || data.length === 0) return 100
  const upCount = data.filter(r => r.status === 'up').length
  return Math.round((upCount / data.length) * 1000) / 10
}

// ── Vercel redeployment ───────────────────────────────────────────────────────

async function triggerRedeployment(): Promise<boolean> {
  // Deploy hook is the most reliable trigger across all Vercel plan types.
  // Set up: vercel.com → food cost analyzer project → Settings → Git → Deploy Hooks
  // Add hook name "app-health-monitor", branch "main" → copy URL to VERCEL_FOOD_COST_DEPLOY_HOOK
  const hookUrl = process.env.VERCEL_FOOD_COST_DEPLOY_HOOK
  if (!hookUrl) {
    console.warn('[app-health-monitor] VERCEL_FOOD_COST_DEPLOY_HOOK not set — cannot auto-redeploy')
    return false
  }

  const res = await fetch(hookUrl, { method: 'POST' })
  if (!res.ok) {
    console.warn(`[app-health-monitor] Deploy hook failed: ${res.status}`)
    return false
  }
  return true
}

// ── Ping ──────────────────────────────────────────────────────────────────────

async function ping(url: string): Promise<{ statusCode: number | null; responseMs: number; error: string | null }> {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    return { statusCode: res.status, responseMs: Date.now() - start, error: null }
  } catch (err) {
    const ms = Date.now() - start
    const isTimeout = (err as Error).name === 'AbortError'
    return {
      statusCode: null,
      responseMs: ms,
      error: isTimeout ? 'timeout' : (err as Error).message,
    }
  }
}

// ── Slack block builders ──────────────────────────────────────────────────────

function downBlocks(url: string, statusCode: number | null, responseMs: number, consecutiveFailures: number): KnownBlock[] {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })
  const statusText = statusCode !== null ? `HTTP ${statusCode}` : 'timeout'
  const responseText = statusCode !== null ? `${responseMs}ms` : 'timed out'

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `🔴 *Food Cost Analyzer is down.*`,
          `URL: ${url}`,
          `Status: ${statusText}`,
          `Response time: ${responseText}`,
          `Time: ${ts} CT`,
          `Consecutive failures: ${consecutiveFailures}`,
        ].join('\n'),
      },
    },
  ]
}

function redeployBlocks(consecutiveFailures: number, triggered: boolean): KnownBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: triggered
          ? `🔁 *Redeployment triggered* for Food Cost Analyzer.\nConsecutive failures: ${consecutiveFailures}\nWill recheck in 30 minutes.`
          : `⚠️ *Redeployment could not be triggered* (check VERCEL_TOKEN).\nConsecutive failures: ${consecutiveFailures} — manual action required.`,
      },
    },
  ]
}

function recoveryBlocks(url: string, responseMs: number, downtimeStart: string | null): KnownBlock[] {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })
  let downDuration = 'unknown'
  if (downtimeStart) {
    const diffMs = Date.now() - new Date(downtimeStart).getTime()
    const mins   = Math.round(diffMs / 60000)
    downDuration = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
  }

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `✅ *Food Cost Analyzer is back online.*`,
          `Was down for: ${downDuration}`,
          `Response time: ${responseMs}ms`,
          `Recovered at: ${ts} CT`,
        ].join('\n'),
      },
    },
  ]
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function run(): Promise<SkillOutput> {
  const startedAt   = new Date().toISOString()
  const checkedAt   = startedAt
  const url         = process.env.VERCEL_FOOD_COST_APP_URL ?? null

  // ── Not configured — safe exit ────────────────────────────────────────────
  if (!url) {
    console.log('[app-health-monitor] VERCEL_FOOD_COST_APP_URL not set — skipping (not_configured)')
    await supabase.from('skill_runs').insert({
      agent: 'paid-media',
      skill: 'app-health-monitor',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status: 'not_configured',
      output_summary: { checked_at: checkedAt },
    })
    return {
      status: 'not_configured', url: null, http_status_code: null,
      response_time_ms: null, error_message: null,
      consecutive_failures: 0, redeployment_triggered: false,
      recovery: false, uptime_pct: 100,
    }
  }

  // ── Ping ──────────────────────────────────────────────────────────────────
  const { statusCode, responseMs, error } = await ping(url)
  const isUp = statusCode === 200

  console.log(`[app-health-monitor] ${url} → ${statusCode ?? error} in ${responseMs}ms — ${isUp ? '✅ UP' : '❌ DOWN'}`)

  // ── Context from prior runs ───────────────────────────────────────────────
  const [prevConsecutive, prevWasDown, downtimeStart, uptime] = await Promise.all([
    isUp ? Promise.resolve(0) : getConsecutiveFailures(),
    wasLastRunDown(),
    isUp ? getDowntimeStart() : Promise.resolve(null),
    getUptimePct(),
  ])

  const consecutiveFailures   = isUp ? 0 : prevConsecutive + 1
  const isRecovery             = isUp && prevWasDown
  let   redeploymentTriggered  = false

  // ── Slack: failure ────────────────────────────────────────────────────────
  if (!isUp) {
    await sendBlocks('assistant', downBlocks(url, statusCode, responseMs, consecutiveFailures),
      `Food Cost Analyzer is down — ${statusCode ?? 'timeout'}`)

    if (consecutiveFailures >= 2) {
      redeploymentTriggered = await triggerRedeployment()
      await sendBlocks('assistant', redeployBlocks(consecutiveFailures, redeploymentTriggered),
        redeploymentTriggered ? 'Food Cost Analyzer redeployment triggered' : 'Redeployment failed — manual action needed')
    }
  }

  // ── Slack: recovery ───────────────────────────────────────────────────────
  if (isRecovery) {
    await sendBlocks('assistant', recoveryBlocks(url, responseMs, downtimeStart),
      'Food Cost Analyzer is back online')
  }

  // ── Log to skill_runs ─────────────────────────────────────────────────────
  await supabase.from('skill_runs').insert({
    agent: 'paid-media',
    skill: 'app-health-monitor',
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    status: isUp ? 'up' : 'down',
    output_summary: {
      url,
      http_status_code:       statusCode,
      response_time_ms:       responseMs,
      error_message:          error,
      consecutive_failures:   consecutiveFailures,
      redeployment_triggered: redeploymentTriggered,
      recovery:               isRecovery,
      uptime_pct:             uptime,
      checked_at:             checkedAt,
    },
  })

  return {
    status:                 isUp ? 'up' : 'down',
    url,
    http_status_code:       statusCode,
    response_time_ms:       responseMs,
    error_message:          error,
    consecutive_failures:   consecutiveFailures,
    redeployment_triggered: redeploymentTriggered,
    recovery:               isRecovery,
    uptime_pct:             uptime,
  }
}
