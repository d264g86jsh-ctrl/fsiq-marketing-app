// Slack interactivity webhook — handles approve/skip button clicks from Block Kit messages.
// IMPORTANT: Slack signature verification requires the exact raw request bytes.
// We use req.arrayBuffer() → Buffer to guarantee we get the raw bytes, not a
// decoded/normalized string that Next.js might produce from req.text().

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { supabase } from '@/lib/supabase'
import { updateMessage } from '@/lib/slack'
import { updateAdSetBudget, pauseAdSet } from '@/lib/meta'
import { createTask } from '@/lib/clickup'

type ActionFamily = 'recommendation' | 'script'

function classifyAction(action_id: string): ActionFamily | null {
  if (action_id === 'approve_recommendation' || action_id === 'skip_recommendation') return 'recommendation'
  if (action_id.startsWith('approve_script_') || action_id.startsWith('skip_script_')) return 'script'
  return null
}

function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  slackSignature: string,
): boolean {
  // Reject replays older than 5 minutes
  const reqTimestamp = parseInt(timestamp, 10)
  if (isNaN(reqTimestamp)) return false
  if (Math.abs(Math.floor(Date.now() / 1000) - reqTimestamp) > 300) return false

  const sigBaseString = `v0:${timestamp}:${rawBody}`
  const hmac = createHmac('sha256', signingSecret.trim())
  hmac.update(sigBaseString)
  const computedSig = `v0=${hmac.digest('hex')}`

  // timingSafeEqual requires equal-length buffers
  const a = Buffer.from(computedSig,   'utf8')
  const b = Buffer.from(slackSignature, 'utf8')
  if (a.length !== b.length) return false

  return timingSafeEqual(a, b)
}

interface RecBody {
  ad_set_id: string
  ad_set_name: string
  action: string
  current_budget_usd: number
  recommended_budget_usd: number | null
  confidence: string
  reason: string
}

export async function POST(req: NextRequest) {
  // Read body as raw bytes — arrayBuffer guarantees we get exactly what Slack signed
  const arrayBuf = await req.arrayBuffer()
  const rawBodyBuf = Buffer.from(arrayBuf)
  const rawBody = rawBodyBuf.toString('utf8')

  const signingSecret = process.env.SLACK_SIGNING_SECRET
  if (!signingSecret) {
    console.error('[slack-webhook] SLACK_SIGNING_SECRET not set')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const timestamp = req.headers.get('x-slack-request-timestamp') ?? ''
  const slackSig  = req.headers.get('x-slack-signature') ?? ''

  if (!verifySlackSignature(signingSecret, timestamp, rawBody, slackSig)) {
    console.error('[slack-webhook] Signature mismatch', {
      timestamp,
      slackSig: slackSig.slice(0, 10) + '…',
      bodyLen: rawBody.length,
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Parse payload (Slack sends application/x-www-form-urlencoded)
  const params = new URLSearchParams(rawBody)
  const rawPayload = params.get('payload')
  if (!rawPayload) return NextResponse.json({ error: 'Missing payload' }, { status: 400 })

  let payload: {
    type: string
    actions?: Array<{ action_id: string; value: string }>
    message?: { ts: string; blocks?: unknown[] }
    channel?: { id: string }
    user?: { id: string; name: string }
  }

  try {
    payload = JSON.parse(rawPayload)
  } catch {
    return NextResponse.json({ error: 'Invalid payload JSON' }, { status: 400 })
  }

  if (payload.type !== 'block_actions' || !payload.actions?.length) {
    return NextResponse.json({ ok: true })
  }

  const action = payload.actions[0]
  const { action_id, value } = action
  const recommendationId = value

  const actionFamily = classifyAction(action_id)
  if (!actionFamily) return NextResponse.json({ ok: true })

  const actorName = payload.user?.name ?? payload.user?.id ?? 'unknown'
  const now = new Date().toISOString()

  // ── Script approve/skip ───────────────────────────────────────────────────
  if (actionFamily === 'script') {
    const isApprove = action_id.startsWith('approve_script_')
    const pipelineId = value

    const newStatus = isApprove ? 'Recording Pending' : 'Killed'

    const { error: updateError } = await supabase
      .from('creative_pipeline')
      .update({ status: newStatus })
      .eq('id', pipelineId)

    if (updateError) {
      console.error('[slack-webhook] creative_pipeline update failed:', updateError.message)
      return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
    }

    let taskNote = ''
    if (isApprove) {
      try {
        const { data: row } = await supabase
          .from('creative_pipeline')
          .select('concept_name, global_number, hook_type')
          .eq('id', pipelineId)
          .single()

        const conceptId = row?.global_number ? `FSIQ-VIDEO-AD-${row.global_number}` : pipelineId
        const today = new Date().toISOString().slice(0, 10)

        const task = await createTask({
          name: `[SCRIPT] Ready for recording — ${row?.concept_name ?? conceptId} | ${today}`,
          description: [
            `Approved by: @${actorName}`,
            `Concept: ${row?.concept_name ?? 'unknown'}`,
            `Hook type: ${row?.hook_type ?? 'unknown'}`,
            `Pipeline ID: ${pipelineId}`,
          ].join('\n'),
          priority: 2,
          tags: ['script', 'recording'],
        })
        taskNote = `ClickUp: ${task.url}`
      } catch (err) {
        console.error('[slack-webhook] ClickUp task creation failed:', (err as Error).message)
        taskNote = '⚠️ ClickUp task creation failed'
      }
    }

    // Update Slack message — replace buttons with confirmation
    const messageTs = payload.message?.ts
    const channelId = payload.channel?.id
    if (messageTs && channelId) {
      const statusEmoji = isApprove ? '✅' : '❌'
      const statusLabel = isApprove ? 'Approved for Recording' : 'Skipped'
      const original = (payload.message?.blocks ?? []) as Array<{ type: string }>
      const withoutActions = original.filter(b => b.type !== 'actions')
      const confirmElements: unknown[] = [
        { type: 'mrkdwn', text: `${statusEmoji} *${statusLabel}* by @${actorName} at <!date^${Math.floor(Date.now() / 1000)}^{time}|now>` },
      ]
      if (taskNote) confirmElements.push({ type: 'mrkdwn', text: taskNote })
      await updateMessage(channelId, messageTs, `${statusEmoji} ${statusLabel} by ${actorName}`, [
        ...withoutActions,
        { type: 'context', elements: confirmElements },
      ] as never[])
    }

    return NextResponse.json({ ok: true, status: newStatus, task: taskNote || null })
  }

  // ── Recommendation approve/skip (original logic) ──────────────────────────
  const newStatus = action_id === 'approve_recommendation' ? 'approved' : 'skipped'

  // 1. Fetch the recommendation
  const { data: rec, error: fetchError } = await supabase
    .from('recommendations')
    .select('id, type, title, body')
    .eq('id', recommendationId)
    .single()

  if (fetchError || !rec) {
    console.error('[slack-webhook] Recommendation not found:', fetchError?.message)
    return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 })
  }

  const body = rec.body as RecBody

  // 2. Update Supabase status
  const updateFields: Record<string, unknown> = {
    status: newStatus,
    executed_by: actorName,
    executed_at: now,
  }
  if (newStatus === 'approved') updateFields.approved_at = now

  await supabase
    .from('recommendations')
    .update(updateFields)
    .eq('id', recommendationId)

  // 3. Execute the action if approved
  let executionNote = ''

  if (newStatus === 'approved') {
    try {
      const recType = rec.type as string

      if ((recType === 'ad_set_scale_up' || recType === 'ad_set_scale_down') && body.recommended_budget_usd) {
        const budgetCents = Math.round(body.recommended_budget_usd * 100)
        await updateAdSetBudget(body.ad_set_id, budgetCents)
        executionNote = `Budget updated: $${body.current_budget_usd} → $${body.recommended_budget_usd}/day`
      } else if (recType === 'ad_set_kill') {
        await pauseAdSet(body.ad_set_id)
        executionNote = `Ad set paused`
      }

      const actionLabel = body.action.toUpperCase().replace('_', ' ')
      const task = await createTask({
        name: `✅ [${actionLabel}] ${body.ad_set_name}`,
        description: [
          `Approved by: @${actorName}`,
          `Action: ${actionLabel}`,
          executionNote ? `Executed: ${executionNote}` : '',
          `Reason: ${body.reason}`,
          `Confidence: ${body.confidence}`,
          `Recommendation ID: ${recommendationId}`,
        ].filter(Boolean).join('\n'),
        priority: 3,
        tags: ['media-buying', 'auto-executed'],
      })
      executionNote += executionNote ? ` · ClickUp: ${task.url}` : `ClickUp: ${task.url}`

    } catch (execErr) {
      const msg = execErr instanceof Error ? execErr.message : String(execErr)
      console.error('[slack-webhook] Execution error:', msg)
      executionNote = `⚠️ Execution error: ${msg}`
    }
  }

  // 4. Update Slack message — replace buttons with confirmation
  const messageTs = payload.message?.ts
  const channelId = payload.channel?.id

  if (messageTs && channelId) {
    const statusEmoji = newStatus === 'approved' ? '✅' : '❌'
    const statusLabel = newStatus === 'approved' ? 'Approved' : 'Skipped'

    const originalBlocks = (payload.message?.blocks ?? []) as Array<{ type: string }>
    const blocksWithoutActions = originalBlocks.filter(b => b.type !== 'actions')

    const confirmationElements: unknown[] = [
      {
        type: 'mrkdwn',
        text: `${statusEmoji} *${statusLabel}* by @${actorName} at <!date^${Math.floor(Date.now() / 1000)}^{time}|${new Date().toLocaleTimeString()}>`,
      },
    ]
    if (executionNote) {
      confirmationElements.push({ type: 'mrkdwn', text: executionNote })
    }

    const updatedBlocks = [
      ...blocksWithoutActions,
      { type: 'context', elements: confirmationElements },
    ]

    await updateMessage(channelId, messageTs, `${statusEmoji} ${statusLabel} by ${actorName}`, updatedBlocks as never[])
  }

  return NextResponse.json({ ok: true, status: newStatus, executed: executionNote || null })
}
