// pixel-monitor.skill.ts — Skill 1.8
// Checks Meta Pixel health via Graph API:
//   - last_fired_time  → stale > 24h with active spend = warning
//   - is_unavailable   → true = warning (pixel broken/offline)
//   - /stats last 24h  → zero events with active spend = warning
//   - Critical: not fired > 48h AND spend > $200 → also pings #assistant
// On healthy: skill_runs log only, no Slack.
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

type PixelFields = {
  id: string
  name?: string
  last_fired_time?: string
  is_unavailable?: boolean
}

type EventStatBucket = {
  start_time: string
  aggregation: string
  data: { value: string; count: number }[]
}

export type SkillOutput = {
  pixel_id: string
  pixel_name: string
  last_fired_time: string | null
  hours_since_fired: number | null
  is_unavailable: boolean
  events_last_24h: number
  daily_spend: number
  alert_level: 'none' | 'warning' | 'critical'
  issues: string[]
}

// ── Meta API helpers ──────────────────────────────────────────────────────────

function metaToken(): string {
  const t = process.env.META_ACCESS_TOKEN
  if (!t) throw new Error('META_ACCESS_TOKEN not set')
  return t
}

function metaPixelId(): string {
  const id = process.env.META_PIXEL_ID
  if (!id) throw new Error('META_PIXEL_ID not set')
  return id
}

function metaAccountId(): string {
  const raw = process.env.META_AD_ACCOUNT_ID ?? ''
  // Strip leading "act_" if already prefixed in env — API adds its own
  return raw.replace(/^act_/, '')
}

async function fetchPixelFields(): Promise<PixelFields> {
  const url = `https://graph.facebook.com/v21.0/${metaPixelId()}` +
    `?fields=id,name,last_fired_time,is_unavailable&access_token=${metaToken()}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Pixel fields ${res.status}: ${await res.text()}`)
  return res.json() as Promise<PixelFields>
}

async function fetchEventsLast24h(): Promise<number> {
  const endTime   = Math.floor(Date.now() / 1000)
  const startTime = endTime - 24 * 60 * 60
  const url = `https://graph.facebook.com/v21.0/${metaPixelId()}/stats` +
    `?aggregation=event&start_time=${startTime}&end_time=${endTime}&access_token=${metaToken()}`
  try {
    const res = await fetch(url)
    if (!res.ok) return -1  // -1 = unable to fetch, don't flag as zero
    const data = await res.json() as { data?: EventStatBucket[] }
    return (data.data ?? []).reduce(
      (sum, bucket) => sum + bucket.data.reduce((s, e) => s + e.count, 0),
      0,
    )
  } catch {
    return -1
  }
}

async function fetchTodaySpend(): Promise<number> {
  const accountId = metaAccountId()
  if (!accountId) return 0
  const url = `https://graph.facebook.com/v21.0/act_${accountId}/insights` +
    `?fields=spend&date_preset=today&access_token=${metaToken()}`
  try {
    const res = await fetch(url)
    if (!res.ok) return 0
    const data = await res.json() as { data?: { spend?: string }[] }
    return parseFloat(data.data?.[0]?.spend ?? '0') || 0
  } catch {
    return 0
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function run(): Promise<SkillOutput> {
  const startedAt = new Date().toISOString()

  const [pixel, eventsLast24h, dailySpend] = await Promise.all([
    fetchPixelFields(),
    fetchEventsLast24h(),
    fetchTodaySpend(),
  ])

  console.log('\n═══ RAW PIXEL API RESPONSE ═══')
  console.log(JSON.stringify(pixel, null, 2))
  console.log(`Events last 24h: ${eventsLast24h === -1 ? 'unavailable' : eventsLast24h}`)
  console.log(`Today's spend: $${dailySpend.toFixed(2)}`)

  // ── Hours since last fire ─────────────────────────────────────────────────
  const lastFiredTime = pixel.last_fired_time ?? null
  let hoursSinceFired: number | null = null
  if (lastFiredTime) {
    hoursSinceFired = (Date.now() - new Date(lastFiredTime).getTime()) / (1000 * 60 * 60)
  }

  const isUnavailable = pixel.is_unavailable ?? false

  // ── Collect issues ────────────────────────────────────────────────────────
  const issues: string[] = []

  if (isUnavailable) {
    issues.push('Pixel is marked unavailable by Meta')
  }

  if (hoursSinceFired !== null && hoursSinceFired > 24 && dailySpend > 0) {
    issues.push(
      `Pixel not fired in ${hoursSinceFired.toFixed(1)}h with $${dailySpend.toFixed(2)} active spend today`,
    )
  }

  if (eventsLast24h === 0 && dailySpend > 0) {
    issues.push(`Zero pixel events in last 24h with $${dailySpend.toFixed(2)} active spend`)
  }

  // ── Alert level ───────────────────────────────────────────────────────────
  const is48hCritical = hoursSinceFired !== null && hoursSinceFired > 48 && dailySpend > 200
  const alertLevel: 'none' | 'warning' | 'critical' =
    is48hCritical ? 'critical' :
    issues.length > 0 ? 'warning' :
    'none'

  // ── Slack alerts ──────────────────────────────────────────────────────────
  if (alertLevel !== 'none') {
    const ts = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })

    const mediaBuyingBlocks: KnownBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: alertLevel === 'critical' ? '🚨 Meta Pixel — Critical Alert' : '⚠️ Meta Pixel — Health Warning',
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Pixel*\n${pixel.name ?? pixel.id}` },
          { type: 'mrkdwn', text: `*Status*\n${isUnavailable ? '🔴 Unavailable' : '🟡 Firing issues'}` },
          { type: 'mrkdwn', text: `*Last Fired*\n${hoursSinceFired !== null ? `${hoursSinceFired.toFixed(1)}h ago` : 'Unknown'}` },
          { type: 'mrkdwn', text: `*Today's Spend*\n$${dailySpend.toFixed(2)}` },
          { type: 'mrkdwn', text: `*Events (24h)*\n${eventsLast24h === -1 ? 'N/A' : eventsLast24h}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Issues:*\n${issues.map(i => `• ${i}`).join('\n')}` },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Checked ${ts} CT` }],
      },
    ]

    await sendBlocks('mediaBuying', mediaBuyingBlocks, `Pixel ${alertLevel}: ${issues[0]}`)

    if (is48hCritical) {
      await sendBlocks(
        'assistant',
        [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🚨 *URGENT — Meta Pixel dark ${hoursSinceFired!.toFixed(1)}h* with $${dailySpend.toFixed(2)}/day active spend.\nPixel: ${pixel.name ?? pixel.id} · Checked: ${ts} CT`,
            },
          },
        ] as KnownBlock[],
        `URGENT: Meta Pixel dark ${hoursSinceFired!.toFixed(1)}h — $${dailySpend.toFixed(2)} spend at risk`,
      )
    }
  }

  // ── Log to skill_runs ─────────────────────────────────────────────────────
  await supabase.from('skill_runs').insert({
    agent: 'paid-media',
    skill: 'pixel-monitor',
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    status: alertLevel === 'critical' ? 'alert_critical' : alertLevel === 'warning' ? 'alert_warning' : 'success',
    output_summary: {
      pixel_id:         pixel.id,
      pixel_name:       pixel.name,
      last_fired_time:  lastFiredTime,
      hours_since_fired: hoursSinceFired,
      is_unavailable:   isUnavailable,
      events_last_24h:  eventsLast24h,
      daily_spend:      dailySpend,
      alert_level:      alertLevel,
      issues,
    },
  })

  return {
    pixel_id:         pixel.id,
    pixel_name:       pixel.name ?? pixel.id,
    last_fired_time:  lastFiredTime,
    hours_since_fired: hoursSinceFired,
    is_unavailable:   isUnavailable,
    events_last_24h:  eventsLast24h,
    daily_spend:      dailySpend,
    alert_level:      alertLevel,
    issues,
  }
}
