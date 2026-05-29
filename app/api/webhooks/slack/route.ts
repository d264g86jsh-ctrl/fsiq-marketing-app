// Slack interactivity webhook — handles block_actions and view_submission payloads.
// IMPORTANT: Slack signature verification requires the exact raw request bytes.
// We use req.arrayBuffer() → Buffer to guarantee we get the raw bytes.
//
// Action families handled:
//   recommendation — approve/skip paid media recommendations
//   script         — approve/skip scripts (v1 pipeline, kept for backwards compat)
//   topic          — approve/skip Stage 1 topic ideas
//   variation      — approve/edit/skip Stage 2 script variations
//   test           — approve/skip Stage 3 A/B test hooks
//   linkedin       — approve/edit/skip LinkedIn post drafts
//
// Stage 2 and Stage 3 involve Claude API calls (10–30s).
// We respond 200 immediately and schedule slow work via after().

import { NextRequest, NextResponse, after } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { supabase } from '@/lib/supabase'
import { updateMessage, openModal, postThreadReply, sendBlocks } from '@/lib/slack'
import { updateAdSetBudget, pauseAdSet } from '@/lib/meta'
import { createTask } from '@/lib/clickup'
import { askClaudeJson } from '@/lib/claude'
import fs from 'fs'
import path from 'path'

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionFamily = 'recommendation' | 'script' | 'topic' | 'variation' | 'test' | 'linkedin'

interface BlockActionsPayload {
  type: 'block_actions'
  trigger_id?: string
  actions?: Array<{ action_id: string; value: string }>
  message?: { ts: string; blocks?: unknown[] }
  channel?: { id: string }
  user?: { id: string; name: string }
}

interface ViewSubmissionPayload {
  type: 'view_submission'
  view: {
    private_metadata: string
    state: {
      values: {
        script_edit_block: {
          script_text: { value: string | null }
        }
      }
    }
  }
  user?: { id: string; name: string }
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

interface TestHook {
  label: string
  hook_iphone: string
  hook_studio: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function classifyAction(action_id: string): ActionFamily | null {
  if (action_id === 'approve_recommendation' || action_id === 'skip_recommendation') return 'recommendation'
  if (action_id.startsWith('approve_script_') || action_id.startsWith('skip_script_')) return 'script'
  if (action_id.startsWith('approve_topic_') || action_id.startsWith('skip_topic_')) return 'topic'
  if (
    action_id.startsWith('approve_variation_') ||
    action_id.startsWith('skip_variation_') ||
    action_id.startsWith('edit_variation_')
  ) return 'variation'
  if (action_id.startsWith('approve_test_') || action_id.startsWith('skip_test_')) return 'test'
  if (
    action_id.startsWith('approve_linkedin_') ||
    action_id.startsWith('skip_linkedin_') ||
    action_id.startsWith('edit_linkedin_')
  ) return 'linkedin'
  return null
}

function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  slackSignature: string,
): boolean {
  const reqTimestamp = parseInt(timestamp, 10)
  if (isNaN(reqTimestamp)) return false
  if (Math.abs(Math.floor(Date.now() / 1000) - reqTimestamp) > 300) return false

  const sigBaseString = `v0:${timestamp}:${rawBody}`
  const hmac = createHmac('sha256', signingSecret.trim())
  hmac.update(sigBaseString)
  const computedSig = `v0=${hmac.digest('hex')}`

  const a = Buffer.from(computedSig,   'utf8')
  const b = Buffer.from(slackSignature, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function loadSop(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'sops', name), 'utf-8')
}

function confirmBlock(emoji: string, label: string, actorName: string, note?: string): unknown[] {
  const elements: unknown[] = [
    {
      type: 'mrkdwn',
      text: `${emoji} *${label}* by @${actorName} at <!date^${Math.floor(Date.now() / 1000)}^{time}|now>`,
    },
  ]
  if (note) elements.push({ type: 'mrkdwn', text: note })
  return elements
}

// ── Stage 3: generate A/B test hooks (called async after variation approved) ──

async function generateTestHooks(
  pipelineId: string,
  slackChannel: string,
  slackTs: string,
): Promise<void> {
  const { data: pipeline } = await supabase
    .from('creative_pipeline')
    .select('concept_name, script_draft, hook_type')
    .eq('id', pipelineId)
    .single()

  if (!pipeline) {
    console.error('[stage3] pipeline row not found:', pipelineId)
    return
  }

  const brandVoice = loadSop('fsiq-brand-voice-paid-ads.md')

  const prompt = `You are a direct-response video ad scriptwriter for FoodServiceIQ (FSIQ).

## Brand Voice Guide
${brandVoice}

## Approved Script
${pipeline.script_draft}

## Task
Generate exactly 2 A/B hook variations for this script. The BODY and CTA sections stay identical.
Only the [HOOK-IPHONE] and [HOOK-STUDIO] sections change. Each variation must use a meaningfully
different hook execution — not just different words for the same idea.

Variation A: execute the original hook approach tighter and sharper.
Variation B: try a different hook type from the Brand Voice taxonomy that could also work for this script.

Rules: ellipses not em dashes, no short choppy sentences, in media res from word one.

Return ONLY a valid JSON array of exactly 2 objects — no preamble, no markdown:
[
  {
    "label": "Variation A",
    "hook_iphone": "Complete iPhone hook — loose, riffing, 2-3 sentences",
    "hook_studio": "Complete Studio hook — composed, confident, 2-3 sentences"
  },
  {
    "label": "Variation B",
    "hook_iphone": "Complete iPhone hook — different approach",
    "hook_studio": "Complete Studio hook — different approach"
  }
]`

  const hooks = await askClaudeJson<TestHook[]>(prompt, 2048)

  if (!Array.isArray(hooks) || hooks.length === 0) {
    console.error('[stage3] Claude did not return valid hooks for pipeline:', pipelineId)
    return
  }
  const validHooks = hooks.slice(0, 2)

  // Save test_hooks to pipeline row
  await supabase
    .from('creative_pipeline')
    .update({ test_hooks: validHooks, status: 'Hook Testing' })
    .eq('id', pipelineId)

  // Post test hooks as thread reply to the variation message
  const import_ = await import('@/lib/slack')
  const { KnownBlock } = await import('@slack/web-api') // type-only, no runtime import needed

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🔀 A/B Hook Test — Choose a Winner', emoji: true },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Concept: *${pipeline.concept_name}*  ·  pipeline_id: \`${pipelineId}\`` }],
    },
    { type: 'divider' },
  ]

  for (let i = 0; i < validHooks.length; i++) {
    const h = validHooks[i]
    blocks.push(
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `*${h.label}*`,
            `*iPhone hook:* ${h.hook_iphone}`,
            `*Studio hook:* ${h.hook_studio}`,
          ].join('\n'),
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: `✅ Use ${h.label}`, emoji: true },
            style: 'primary',
            action_id: `approve_test_${pipelineId}_${i}`,
            value: `${pipelineId}:${i}`,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: `❌ Skip ${h.label}`, emoji: true },
            style: 'danger',
            action_id: `skip_test_${pipelineId}_${i}`,
            value: `${pipelineId}:${i}`,
          },
        ],
      },
      { type: 'divider' },
    )
  }

  await import_.postThreadReply(
    slackChannel,
    slackTs,
    blocks as never[],
    `🔀 A/B hook test ready for ${pipeline.concept_name}`,
  )
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
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
    console.error('[slack-webhook] Signature mismatch', { timestamp, bodyLen: rawBody.length })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const params = new URLSearchParams(rawBody)
  const rawPayload = params.get('payload')
  if (!rawPayload) return NextResponse.json({ error: 'Missing payload' }, { status: 400 })

  let payload: BlockActionsPayload | ViewSubmissionPayload

  try {
    payload = JSON.parse(rawPayload)
  } catch {
    return NextResponse.json({ error: 'Invalid payload JSON' }, { status: 400 })
  }

  // ── view_submission (edit modal) ──────────────────────────────────────────
  if (payload.type === 'view_submission') {
    const vp = payload as ViewSubmissionPayload
    const metadata = vp.view.private_metadata
    const editedText = vp.view.state.values.script_edit_block?.script_text?.value ?? ''
    const actorName = vp.user?.name ?? vp.user?.id ?? 'unknown'

    if (metadata && editedText) {
      if (metadata.startsWith('linkedin:')) {
        // LinkedIn draft edit
        const draftId = metadata.replace('linkedin:', '')
        const { data: draft } = await supabase
          .from('linkedin_drafts')
          .update({ post_text: editedText, status: 'Edited' })
          .eq('id', draftId)
          .select('slack_ts, slack_channel, target')
          .single()

        if (draft?.slack_ts && draft?.slack_channel) {
          const preview = editedText.length > 600 ? editedText.slice(0, 597) + '…' : editedText
          await postThreadReply(
            draft.slack_channel,
            draft.slack_ts,
            [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `✏️ *Draft revised by @${actorName}*\n\`\`\`${preview}\`\`\``,
                },
              },
            ] as never[],
            `✏️ LinkedIn draft revised by @${actorName}`,
          )
        }
      } else {
        // Script edit (creative_pipeline)
        const pipelineId = metadata
        const { data: pipeline } = await supabase
          .from('creative_pipeline')
          .update({ script_draft: editedText })
          .eq('id', pipelineId)
          .select('concept_name, slack_ts, slack_channel')
          .single()

        if (pipeline?.slack_ts && pipeline?.slack_channel) {
          const preview = editedText.length > 600 ? editedText.slice(0, 597) + '…' : editedText
          await postThreadReply(
            pipeline.slack_channel,
            pipeline.slack_ts,
            [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `✏️ *Script revised by @${actorName}*\n\`\`\`${preview}\`\`\``,
                },
              },
            ] as never[],
            `✏️ Script revised by @${actorName}`,
          )
        }
      }
    }

    return NextResponse.json({ response_action: 'clear' })
  }

  // ── block_actions ─────────────────────────────────────────────────────────
  if (payload.type !== 'block_actions') return NextResponse.json({ ok: true })

  const bp = payload as BlockActionsPayload
  if (!bp.actions?.length) return NextResponse.json({ ok: true })

  const action = bp.actions[0]
  const { action_id, value } = action
  const actorName = bp.user?.name ?? bp.user?.id ?? 'unknown'
  const messageTs = bp.message?.ts
  const channelId = bp.channel?.id

  const actionFamily = classifyAction(action_id)
  if (!actionFamily) return NextResponse.json({ ok: true })

  // ── Topic approve/skip (Stage 1 → fires Stage 2) ──────────────────────────
  if (actionFamily === 'topic') {
    const isApprove = action_id.startsWith('approve_topic_')
    // value format: "{topicId}:{idx}"
    const [topicId, idxStr] = value.split(':')
    const topicIdx = parseInt(idxStr ?? '0', 10)

    if (isApprove) {
      // Fetch topic to add it to approved_topics
      const { data: topicRow } = await supabase
        .from('script_topics')
        .select('topics, approved_topics')
        .eq('id', topicId)
        .single()

      if (topicRow) {
        const topics = topicRow.topics as unknown[]
        const approvedTopics = (topicRow.approved_topics as unknown[]) ?? []
        const topic = topics[topicIdx]

        if (topic) {
          await supabase
            .from('script_topics')
            .update({
              approved_topics: [...approvedTopics, { ...topic as object, idx: topicIdx }],
              status: 'scripts_generating',
            })
            .eq('id', topicId)
        }
      }

      // Respond 200 immediately, fire Stage 2 after
      const capturedTopicId = topicId
      const capturedIdx = topicIdx
      after(async () => {
        try {
          const { run } = await import('@/skills/paid-media/script-stage2.skill')
          await run(capturedTopicId, capturedIdx)
        } catch (err) {
          console.error('[slack-webhook] Stage 2 failed:', (err as Error).message)
        }
      })
    }

    // Update Slack message — replace this topic's buttons with confirmation
    if (messageTs && channelId) {
      const original = (bp.message?.blocks ?? []) as Array<{ type: string }>
      const actionIdx = original.findIndex(
        b => b.type === 'actions' && JSON.stringify(b).includes(`_${topicId}_${topicIdx}`)
      )
      if (actionIdx !== -1) {
        const updated = [...original]
        updated[actionIdx] = {
          type: 'context',
          elements: confirmBlock(
            isApprove ? '✅' : '❌',
            isApprove ? `Topic approved — generating scripts...` : 'Topic skipped',
            actorName,
          ),
        } as never
        await updateMessage(channelId, messageTs, `${isApprove ? '✅' : '❌'} Topic ${topicIdx + 1} ${isApprove ? 'approved' : 'skipped'} by ${actorName}`, updated as never[])
      }
    }

    return NextResponse.json({ ok: true })
  }

  // ── Variation approve/edit/skip (Stage 2 actions) ─────────────────────────
  if (actionFamily === 'variation') {
    const pipelineId = value

    if (action_id.startsWith('edit_variation_')) {
      // Open edit modal — must happen synchronously within 3s
      const { data: pipeline } = await supabase
        .from('creative_pipeline')
        .select('script_draft, concept_name')
        .eq('id', pipelineId)
        .single()

      const triggerId = bp.trigger_id
      if (triggerId && pipeline) {
        await openModal(triggerId, {
          type: 'modal',
          title: { type: 'plain_text', text: 'Edit Script' },
          submit: { type: 'plain_text', text: 'Save' },
          close:  { type: 'plain_text', text: 'Cancel' },
          private_metadata: pipelineId,
          blocks: [
            {
              type: 'input',
              block_id: 'script_edit_block',
              label: { type: 'plain_text', text: pipeline.concept_name ?? 'Script' },
              element: {
                type: 'plain_text_input',
                action_id: 'script_text',
                multiline: true,
                initial_value: pipeline.script_draft ?? '',
              },
            },
          ],
        })
      }
      return NextResponse.json({ ok: true })
    }

    if (action_id.startsWith('skip_variation_')) {
      await supabase
        .from('creative_pipeline')
        .update({ status: 'Killed' })
        .eq('id', pipelineId)

      if (messageTs && channelId) {
        const original = (bp.message?.blocks ?? []) as Array<{ type: string }>
        const withoutActions = original.filter(b => b.type !== 'actions')
        await updateMessage(channelId, messageTs, `❌ Script skipped by ${actorName}`, [
          ...withoutActions,
          { type: 'context', elements: confirmBlock('❌', 'Skipped', actorName) },
        ] as never[])
      }
      return NextResponse.json({ ok: true })
    }

    // approve_variation — update status, fire Stage 3 after responding
    await supabase
      .from('creative_pipeline')
      .update({ status: 'Hook Testing' })
      .eq('id', pipelineId)

    if (messageTs && channelId) {
      const original = (bp.message?.blocks ?? []) as Array<{ type: string }>
      const withoutActions = original.filter(b => b.type !== 'actions')
      await updateMessage(channelId, messageTs, `✅ Script approved — generating A/B hooks...`, [
        ...withoutActions,
        { type: 'context', elements: confirmBlock('✅', 'Approved — generating A/B hooks…', actorName) },
      ] as never[])
    }

    const capturedPipelineId = pipelineId
    const capturedChannel = channelId ?? ''
    const capturedTs = messageTs ?? ''

    after(async () => {
      try {
        await generateTestHooks(capturedPipelineId, capturedChannel, capturedTs)
      } catch (err) {
        console.error('[slack-webhook] Stage 3 failed:', (err as Error).message)
      }
    })

    return NextResponse.json({ ok: true })
  }

  // ── Test hook approve/skip (Stage 3 → fires Stage 4) ─────────────────────
  if (actionFamily === 'test') {
    const isApprove = action_id.startsWith('approve_test_')
    // value format: "{pipelineId}:{hookIdx}"
    const [pipelineId, hookIdxStr] = value.split(':')
    const hookIdx = parseInt(hookIdxStr ?? '0', 10)

    if (!isApprove) {
      // Skip — just update the message
      if (messageTs && channelId) {
        const original = (bp.message?.blocks ?? []) as Array<{ type: string }>
        const actionIdxInBlocks = original.findIndex(
          b => b.type === 'actions' && JSON.stringify(b).includes(`_${pipelineId}_${hookIdx}`)
        )
        if (actionIdxInBlocks !== -1) {
          const updated = [...original]
          updated[actionIdxInBlocks] = {
            type: 'context',
            elements: confirmBlock('❌', `Variation ${hookIdx === 0 ? 'A' : 'B'} skipped`, actorName),
          } as never
          await updateMessage(channelId, messageTs, `❌ Hook skipped by ${actorName}`, updated as never[])
        }
      }
      return NextResponse.json({ ok: true })
    }

    // Stage 4: approve test hook → finalize
    const { data: pipeline } = await supabase
      .from('creative_pipeline')
      .select('concept_name, global_number, hook_type, awareness_level, lp_code, script_draft, test_hooks')
      .eq('id', pipelineId)
      .single()

    if (!pipeline) {
      console.error('[slack-webhook] Stage 4: pipeline row not found:', pipelineId)
      return NextResponse.json({ ok: true })
    }

    const testHooks = (pipeline.test_hooks ?? []) as TestHook[]
    const winner = testHooks[hookIdx]
    const conceptId = pipeline.global_number ? `FSIQ-VIDEO-AD-${pipeline.global_number}` : pipelineId

    // Build final script: replace hook sections with winning hooks
    const finalScript = winner
      ? (pipeline.script_draft ?? '')
          .replace(/\[HOOK-IPHONE\][^\[]*/, `[HOOK-IPHONE]\n${winner.hook_iphone}\n`)
          .replace(/\[HOOK-STUDIO\][^\[]*/, `[HOOK-STUDIO]\n${winner.hook_studio}\n`)
      : (pipeline.script_draft ?? '')

    // Update pipeline status
    await supabase
      .from('creative_pipeline')
      .update({ status: 'Recording Pending', script_draft: finalScript })
      .eq('id', pipelineId)

    // Create ClickUp task
    let taskNote = ''
    try {
      const today = new Date().toISOString().slice(0, 10)
      const task = await createTask({
        name: `[SCRIPT] Ready for recording — ${pipeline.concept_name ?? conceptId} | ${today}`,
        description: [
          `Approved by: @${actorName}`,
          `Concept: ${pipeline.concept_name ?? 'unknown'}`,
          `Hook type: ${pipeline.hook_type ?? 'unknown'}  |  Hook winner: ${winner?.label ?? 'original'}`,
          `Awareness: ${pipeline.awareness_level ?? 'unknown'}  |  LP: ${pipeline.lp_code ?? 'unknown'}`,
          `Pipeline ID: ${pipelineId}`,
        ].join('\n'),
        priority: 2,
        tags: ['script', 'recording'],
      })
      taskNote = `ClickUp: ${task.url}`
    } catch (err) {
      console.error('[slack-webhook] Stage 4 ClickUp failed:', (err as Error).message)
      taskNote = '⚠️ ClickUp task creation failed'
    }

    // Notify #video-editor
    await sendBlocks(
      'videoEditor',
      [
        {
          type: 'header',
          text: { type: 'plain_text', text: `🎬 Script Ready for Recording — ${pipeline.concept_name}`, emoji: true },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Concept ID*\n${conceptId}` },
            { type: 'mrkdwn', text: `*Hook Type*\n${pipeline.hook_type ?? 'unknown'}` },
            { type: 'mrkdwn', text: `*Awareness*\n${pipeline.awareness_level ?? 'unknown'}` },
            { type: 'mrkdwn', text: `*Landing Page*\n${pipeline.lp_code ?? 'unknown'}` },
            { type: 'mrkdwn', text: `*Approved By*\n@${actorName}` },
            { type: 'mrkdwn', text: `*Winning Hook*\n${winner?.label ?? 'original'}` },
          ],
        },
        ...(taskNote ? [{
          type: 'context' as const,
          elements: [{ type: 'mrkdwn', text: taskNote }],
        }] : []),
      ] as never[],
      `🎬 Script ready for recording: ${pipeline.concept_name} (${conceptId})`,
    )

    // Update test hooks message in #MediaBuying
    if (messageTs && channelId) {
      const original = (bp.message?.blocks ?? []) as Array<{ type: string }>
      const withoutActions = original.filter(b => b.type !== 'actions')
      await updateMessage(channelId, messageTs, `✅ Hook ${winner?.label ?? ''} approved for recording`, [
        ...withoutActions,
        { type: 'context', elements: confirmBlock('✅', `${winner?.label ?? 'Hook'} approved for recording`, actorName, taskNote) },
      ] as never[])
    }

    return NextResponse.json({ ok: true, status: 'Recording Pending', task: taskNote })
  }

  // ── LinkedIn draft approve/edit/skip ─────────────────────────────────────
  if (actionFamily === 'linkedin') {
    const draftId = value

    if (action_id.startsWith('edit_linkedin_')) {
      const { data: draft } = await supabase
        .from('linkedin_drafts')
        .select('post_text, target')
        .eq('id', draftId)
        .single()

      const triggerId = bp.trigger_id
      if (triggerId && draft) {
        const targetLabel = draft.target === 'neil-personal' ? '👤 Neil Personal' : '🏢 FSIQ Company'
        await openModal(triggerId, {
          type: 'modal',
          title: { type: 'plain_text', text: 'Edit LinkedIn Draft' },
          submit: { type: 'plain_text', text: 'Save' },
          close:  { type: 'plain_text', text: 'Cancel' },
          private_metadata: `linkedin:${draftId}`,
          blocks: [
            {
              type: 'input',
              block_id: 'script_edit_block',
              label: { type: 'plain_text', text: targetLabel },
              element: {
                type: 'plain_text_input',
                action_id: 'script_text',
                multiline: true,
                initial_value: draft.post_text ?? '',
              },
            },
          ],
        })
      }
      return NextResponse.json({ ok: true })
    }

    if (action_id.startsWith('skip_linkedin_')) {
      await supabase
        .from('linkedin_drafts')
        .update({ status: 'Skipped' })
        .eq('id', draftId)

      if (messageTs && channelId) {
        const original = (bp.message?.blocks ?? []) as Array<{ type: string }>
        const withoutActions = original.filter(b => b.type !== 'actions')
        await updateMessage(channelId, messageTs, `❌ LinkedIn draft skipped by ${actorName}`, [
          ...withoutActions,
          { type: 'context', elements: confirmBlock('❌', 'Draft skipped', actorName) },
        ] as never[])
      }
      return NextResponse.json({ ok: true })
    }

    // approve_linkedin — mark approved, update Slack message
    await supabase
      .from('linkedin_drafts')
      .update({ status: 'Approved' })
      .eq('id', draftId)

    if (messageTs && channelId) {
      const original = (bp.message?.blocks ?? []) as Array<{ type: string }>
      const withoutActions = original.filter(b => b.type !== 'actions')
      await updateMessage(channelId, messageTs, `✅ LinkedIn draft approved by ${actorName}`, [
        ...withoutActions,
        { type: 'context', elements: confirmBlock('✅', 'Draft approved — ready to post', actorName) },
      ] as never[])
    }

    return NextResponse.json({ ok: true })
  }

  // ── Script approve/skip (v1 pipeline — kept for backwards compat) ─────────
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

    if (messageTs && channelId) {
      const statusEmoji = isApprove ? '✅' : '❌'
      const statusLabel = isApprove ? 'Approved for Recording' : 'Skipped'
      const original = (bp.message?.blocks ?? []) as Array<{ type: string }>
      const withoutActions = original.filter(b => b.type !== 'actions')
      await updateMessage(channelId, messageTs, `${statusEmoji} ${statusLabel} by ${actorName}`, [
        ...withoutActions,
        { type: 'context', elements: confirmBlock(statusEmoji, statusLabel, actorName, taskNote || undefined) },
      ] as never[])
    }

    return NextResponse.json({ ok: true, status: newStatus, task: taskNote || null })
  }

  // ── Recommendation approve/skip (original logic) ──────────────────────────
  const recommendationId = value
  const newStatus = action_id === 'approve_recommendation' ? 'approved' : 'skipped'

  const { data: rec, error: fetchError } = await supabase
    .from('recommendations')
    .select('id, type, title, body')
    .eq('id', recommendationId)
    .single()

  if (fetchError || !rec) {
    console.error('[slack-webhook] Recommendation not found:', fetchError?.message)
    return NextResponse.json({ error: 'Recommendation not found' }, { status: 404 })
  }

  const recBody = rec.body as RecBody
  const now = new Date().toISOString()

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

  let executionNote = ''

  if (newStatus === 'approved') {
    try {
      const recType = rec.type as string

      if ((recType === 'ad_set_scale_up' || recType === 'ad_set_scale_down') && recBody.recommended_budget_usd) {
        const budgetCents = Math.round(recBody.recommended_budget_usd * 100)
        await updateAdSetBudget(recBody.ad_set_id, budgetCents)
        executionNote = `Budget updated: $${recBody.current_budget_usd} → $${recBody.recommended_budget_usd}/day`
      } else if (recType === 'ad_set_kill') {
        await pauseAdSet(recBody.ad_set_id)
        executionNote = `Ad set paused`
      }

      const actionLabel = recBody.action.toUpperCase().replace('_', ' ')
      const task = await createTask({
        name: `✅ [${actionLabel}] ${recBody.ad_set_name}`,
        description: [
          `Approved by: @${actorName}`,
          `Action: ${actionLabel}`,
          executionNote ? `Executed: ${executionNote}` : '',
          `Reason: ${recBody.reason}`,
          `Confidence: ${recBody.confidence}`,
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

  if (messageTs && channelId) {
    const statusEmoji = newStatus === 'approved' ? '✅' : '❌'
    const statusLabel = newStatus === 'approved' ? 'Approved' : 'Skipped'
    const originalBlocks = (bp.message?.blocks ?? []) as Array<{ type: string }>
    const blocksWithoutActions = originalBlocks.filter(b => b.type !== 'actions')

    await updateMessage(channelId, messageTs, `${statusEmoji} ${statusLabel} by ${actorName}`, [
      ...blocksWithoutActions,
      { type: 'context', elements: confirmBlock(statusEmoji, statusLabel, actorName, executionNote || undefined) },
    ] as never[])
  }

  return NextResponse.json({ ok: true, status: newStatus, executed: executionNote || null })
}
