// Skill — GHL Webhook Weekly Summary
// Runs weekly. Posts processed vs. skipped webhook event stats to #operations.
import fs from 'fs'
import path from 'path'
import { supabase } from '../../lib/supabase'
import { sendBlocks } from '../../lib/slack'

export async function run(): Promise<{ events_7d: number; processed: number; skipped: number }> {
  const sop = fs.readFileSync(
    path.join(process.cwd(), 'sops', 'paid-media-agent-sop.md'),
    'utf-8'
  )
  void sop

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)
  const cutoffStr = cutoff.toISOString()

  // Webhook events are logged to skill_runs with agent='ghl', skill='webhook'
  const { data: events } = await supabase
    .from('skill_runs')
    .select('status, output_summary, started_at')
    .eq('agent', 'ghl')
    .eq('skill', 'webhook')
    .gte('started_at', cutoffStr)
    .order('started_at', { ascending: false })

  const total = events?.length ?? 0
  const processed = events?.filter(e => e.status === 'success').length ?? 0
  const skipped   = events?.filter(e => e.status === 'skipped').length ?? 0

  // Count skip reasons
  const skipReasons: Record<string, number> = {}
  for (const e of events ?? []) {
    if (e.status === 'skipped') {
      const reason = (e.output_summary as Record<string, unknown>)?.skipped_reason as string ?? 'unknown'
      skipReasons[reason] = (skipReasons[reason] ?? 0) + 1
    }
  }

  const topSkipReason = Object.entries(skipReasons).sort(([, a], [, b]) => b - a)[0]

  const opsChannel = process.env.SLACK_CHANNEL_MEDIA_BUYING ?? ''
  if (opsChannel) {
    const skipBreakdown = Object.entries(skipReasons)
      .sort(([, a], [, b]) => b - a)
      .map(([reason, count]) => `• \`${reason}\`: ${count}`)
      .join('\n')

    await sendBlocks(opsChannel, [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📊 GHL Webhook — Weekly Summary' },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Total events (7d)*\n${total}` },
          { type: 'mrkdwn', text: `*Processed*\n${processed} (${total > 0 ? Math.round(processed / total * 100) : 0}%)` },
          { type: 'mrkdwn', text: `*Skipped*\n${skipped} (${total > 0 ? Math.round(skipped / total * 100) : 0}%)` },
          { type: 'mrkdwn', text: `*Top skip reason*\n${topSkipReason ? `\`${topSkipReason[0]}\` (${topSkipReason[1]}x)` : 'n/a'}` },
        ],
      },
      ...(skipReasons && Object.keys(skipReasons).length > 0 ? [{
        type: 'section' as const,
        text: { type: 'mrkdwn' as const, text: `*Skip reason breakdown:*\n${skipBreakdown}` },
      }] : []),
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Week ending ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` }],
      },
    ] as import('@slack/web-api').KnownBlock[], `GHL Webhook Weekly Summary — ${total} events (7d)`)
  }

  await supabase.from('skill_runs').insert({
    agent: 'paid-media',
    skill: 'ghl-webhook-summary',
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    status: 'success',
    output_summary: { events_7d: total, processed, skipped },
  })

  return { events_7d: total, processed, skipped }
}
