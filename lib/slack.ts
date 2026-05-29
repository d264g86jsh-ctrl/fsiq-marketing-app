import { WebClient, Block, KnownBlock } from '@slack/web-api'

const client = new WebClient(process.env.SLACK_BOT_TOKEN)

// Channel name → env var map so callers use readable names
const CHANNELS = {
  mediaBuying: process.env.SLACK_CHANNEL_MEDIA_BUYING ?? '#MediaBuying',
  morningBrief: process.env.SLACK_CHANNEL_MORNING_BRIEF ?? '#morning-brief',
  videoEditor: process.env.SLACK_CHANNEL_VIDEO_EDITOR ?? '#video-editor',
  seo: process.env.SLACK_CHANNEL_SEO ?? '#seo-agent',
  organic: process.env.SLACK_CHANNEL_ORGANIC ?? '#organic-agent',
  assistant: process.env.SLACK_CHANNEL_ASSISTANT ?? '#assistant',
  meetingTranscripts: process.env.SLACK_CHANNEL_MEETING_TRANSCRIPTS ?? '#operations',
} as const

// CHANNEL RULES (never violate):
//  #operations      — READ-ONLY. Agents never post here.
//  #assistant       — structural alerts, naming violations, SharePoint audit reports
//  #MediaBuying     — paid media decisions and alerts
//  #video-editor    — footage, scripts, briefs, QA
//  #seo-agent       — SEO and web alerts
//  #organic-agent   — content and LinkedIn alerts
//  #morning-brief   — daily CMO summary only

export type ChannelKey = keyof typeof CHANNELS

// Strip leading '#' — Slack's Web API accepts channel names without it,
// but channel IDs (C...) work more reliably; prefer IDs in env vars when possible.
function resolveChannel(channel: ChannelKey | string): string {
  const raw = channel in CHANNELS ? CHANNELS[channel as ChannelKey] : channel
  return raw.startsWith('#') ? raw.slice(1) : raw
}

export async function sendMessage(channel: ChannelKey | string, text: string) {
  return client.chat.postMessage({ channel: resolveChannel(channel), text })
}

export async function sendBlocks(
  channel: ChannelKey | string,
  blocks: (Block | KnownBlock)[],
  fallbackText: string
) {
  return client.chat.postMessage({ channel: resolveChannel(channel), blocks, text: fallbackText })
}

// Interactive approval message — used by all skills that need human sign-off
export async function sendApprovalMessage({
  channel,
  header,
  body,
  recommendationId,
  approveLabel = '✅ Approve',
  skipLabel = '❌ Skip',
}: {
  channel: ChannelKey | string
  header: string
  body: string
  recommendationId: string
  approveLabel?: string
  skipLabel?: string
}) {
  return client.chat.postMessage({
    channel: resolveChannel(channel),
    text: header,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: header, emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: body },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: approveLabel },
            style: 'primary',
            action_id: 'approve_recommendation',
            value: recommendationId,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: skipLabel },
            style: 'danger',
            action_id: 'skip_recommendation',
            value: recommendationId,
          },
        ],
      },
    ],
  })
}

export async function updateMessage(channel: string, ts: string, text: string, blocks?: (Block | KnownBlock)[]) {
  return client.chat.update({ channel, ts, text, ...(blocks ? { blocks } : {}) })
}

export async function postThreadReply(
  channel: ChannelKey | string,
  threadTs: string,
  blocks: (Block | KnownBlock)[],
  fallbackText: string
) {
  return client.chat.postMessage({
    channel: resolveChannel(channel),
    thread_ts: threadTs,
    blocks,
    text: fallbackText,
  })
}

export async function openModal(triggerId: string, view: unknown) {
  return client.views.open({ trigger_id: triggerId, view: view as never })
}

export async function testConnection() {
  const res = await client.auth.test()
  return { ok: res.ok, botId: res.bot_id, team: res.team, user: res.user }
}

export { client as slackClient }
