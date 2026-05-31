// script-matcher.skill.ts
// Matches raw footage to known FSIQ ad scripts via SharePoint Stream transcripts + Claude.
//
// Invocation:
//   run({ conceptId })   — triggered by nomenclature-updater after rename
//   run()                — cron/manual: retry all footage with status='awaiting_transcript'
//
// Flow per footage file:
//   1. Fetch SharePoint Stream auto-transcript (Graph beta API)
//      - Requires MediaContent.Read.All application permission in Azure AD
//      - If 400 / no transcripts yet → status='awaiting_transcript', post to #video-editor
//   2. Parse VTT/plain-text transcript
//   3. Fetch scripts from Google Docs (service account JWT auth)
//   4. Claude semantic match → JSON result with confidence score
//   5. ≥85% → update footage_log, trigger campaign-brief-generator
//   6. <85% → post to #video-editor with confirm/select/no-script buttons
//
// SOPs: video-review-qa-framework.md, ad-scripting-rules.md (AGENTS.md pairing rule)

import fs from 'fs'
import path from 'path'
import { supabase } from '../../lib/supabase'
import { sendBlocks } from '../../lib/slack'
import { getGraphToken } from '../../lib/graph'
import { askClaudeJson } from '../../lib/claude'
import type { KnownBlock } from '@slack/web-api'

const sopQa        = fs.readFileSync(path.join(process.cwd(), 'sops', 'video-review-qa-framework.md'), 'utf-8')
const sopScripting = fs.readFileSync(path.join(process.cwd(), 'sops', 'ad-scripting-rules.md'), 'utf-8')
void sopQa
void sopScripting

// ── Constants ─────────────────────────────────────────────────────────────────

const DRIVE_ID      = 'b!SoPMe2KqFU2BkUmHhH8qFTOqNnh1p1BPuxbMZNe-MrqxmzKSNvU8TI-0UrHfUjC_'
const SCRIPTS_DOC_ID = '1STeodfiSKi4EBXPBuM6iffoZtuiLPrJAaoXajaV-E-s'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScriptMatcherInput {
  conceptId?: string
}

export interface ScriptMatcherOutput {
  processed:    number
  matched:      number
  awaiting:     number
  review:       number
  errors:       string[]
}

export interface ParsedScript {
  name:      string
  ad_id:     string | null
  full_text: string
}

export interface MatchResult {
  matched_script_name: string
  matched_ad_id:       string | null
  confidence:          number
  matching_elements:   string[]
  reasoning:           string
}

// ── Google Docs auth (OAuth2 refresh token flow) ─────────────────────────────
//
// Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN.
// To generate GOOGLE_REFRESH_TOKEN, run once:
//   npx scripts/google-auth.ts
// and follow the browser flow. Paste the refresh token into .env.local.

async function getGoogleAccessToken(): Promise<string> {
  const clientId     = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Google Docs OAuth not configured. ' +
      'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.',
    )
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })

  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`)
  const data = await res.json() as { access_token: string }
  return data.access_token
}

// ── Google Docs parser ────────────────────────────────────────────────────────

interface DocTextElement {
  paragraph?: { elements: Array<{ textRun?: { content: string; textStyle?: { bold?: boolean } } }> }
  table?: unknown
}

function extractDocPlainText(content: DocTextElement[]): string {
  const lines: string[] = []
  for (const el of content) {
    if (!el.paragraph) continue
    const line = el.paragraph.elements
      .map(e => e.textRun?.content ?? '')
      .join('')
    lines.push(line)
  }
  return lines.join('')
}

async function fetchDocScriptsViaOAuth(): Promise<ParsedScript[]> {
  const token = await getGoogleAccessToken()
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${SCRIPTS_DOC_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Google Docs API error: ${res.status} ${await res.text()}`)

  const doc = await res.json() as { body?: { content?: DocTextElement[] } }
  const rawText = extractDocPlainText(doc.body?.content ?? [])

  return parseScriptsFromText(rawText)
}

// ── Script loading with fallback ──────────────────────────────────────────────
//
// Load preference:
//   1. OAuth (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN)
//   2. Public export URL (works when the doc is publicly shared)
//
// Throws if both fail so callers can surface a clear error rather than
// silently matching against zero scripts.

export interface LoadScriptsResult {
  scripts: ParsedScript[]
  source:  'oauth' | 'public_export'
}

export async function loadScripts(): Promise<LoadScriptsResult> {
  const hasOAuth =
    !!process.env.GOOGLE_CLIENT_ID &&
    !!process.env.GOOGLE_CLIENT_SECRET &&
    !!process.env.GOOGLE_REFRESH_TOKEN

  // 1. Try OAuth
  if (hasOAuth) {
    try {
      const scripts = await fetchDocScriptsViaOAuth()
      console.log(`[script-matcher] Loaded ${scripts.length} scripts via OAuth`)
      return { scripts, source: 'oauth' }
    } catch (err) {
      console.warn(`[script-matcher] OAuth script fetch failed, trying public export: ${(err as Error).message}`)
    }
  }

  // 2. Public export fallback — works when the doc is shared "Anyone with the link can view"
  const publicUrl = `https://docs.google.com/document/d/${SCRIPTS_DOC_ID}/export?format=txt`
  const res = await fetch(publicUrl)
  if (!res.ok) {
    throw new Error(
      `Script loading failed completely. OAuth configured: ${hasOAuth}. ` +
      `Public export returned ${res.status}. ` +
      'Ensure the Ad Scripting doc is publicly shared, or configure OAuth env vars.',
    )
  }
  const text = await res.text()
  const scripts = parseScriptsFromText(text)
  if (scripts.length === 0) {
    throw new Error('Public export returned 0 scripts — doc may be empty or format unrecognized.')
  }
  console.log(`[script-matcher] Loaded ${scripts.length} scripts via public export`)
  return { scripts, source: 'public_export' }
}

// Split the doc text into individual scripts.
// Google Docs plain-text export uses ________________ (16+ underscores) as section separators.
// Block 0 is a preamble/TOC containing an AD-ID→script-name cross-reference table.
function parseScriptsFromText(text: string): ParsedScript[] {
  const HR = /^_{16,}\s*$/m

  // Fast path: if no horizontal-rule separators exist, fall back to blank-line heuristic
  if (!HR.test(text)) {
    return parseScriptsFromTextLegacy(text)
  }

  const blocks = text.split(HR).map(b => b.trim()).filter(Boolean)

  // ── Build AD-ID map from preamble (block 0) ───────────────────────────────
  // Preamble format:
  //   N. FSIQ-VIDEO-AD-XX | ... (lines under "Top Performing Videos")
  //   Matching to:
  //   N. Script Title (lines following "Matching to:")
  const adIdByScriptName = new Map<string, string>()
  if (blocks.length > 0) {
    const preamble = blocks[0]
    const adEntries: Array<{ pos: number; adId: string }> = []
    for (const line of preamble.split('\n')) {
      const m = line.match(/^\s*(\d+)\.\s+(FSIQ-VIDEO-AD-\d+[a-z]?)\b/i)
      if (m) adEntries.push({ pos: parseInt(m[1], 10), adId: m[2].toUpperCase() })
    }
    // Parse "Matching to:" section
    const matchingToIdx = preamble.search(/^Matching to:/im)
    if (matchingToIdx !== -1) {
      const matchingLines = preamble.slice(matchingToIdx).split('\n').slice(1)
      for (const line of matchingLines) {
        const m = line.match(/^\s*(\d+)\.\s+(.+)/)
        if (!m) continue
        const pos   = parseInt(m[1], 10)
        const title = m[2].trim()
        const entry = adEntries.find(e => e.pos === pos)
        if (entry) adIdByScriptName.set(title.toLowerCase(), entry.adId)
      }
    }
  }

  // ── Parse blocks 1..N as individual scripts ───────────────────────────────
  const scripts: ParsedScript[] = []
  for (const block of blocks.slice(1)) {
    if (block.length < 20) continue
    const firstLine = block.split('\n').find(l => l.trim().length > 0) ?? ''
    const name      = firstLine.trim().slice(0, 120)
    // Prefer explicit FSIQ-VIDEO-AD-XX mention in block, then preamble map lookup
    const inlineM   = block.match(/\bFSIQ-VIDEO-AD-(\d+[a-z]?)\b/i)
    const adId      = inlineM
      ? `FSIQ-VIDEO-AD-${inlineM[1].toUpperCase()}`
      : (adIdByScriptName.get(name.toLowerCase()) ?? null)
    scripts.push({ name, ad_id: adId, full_text: block })
  }

  if (scripts.length === 0 && text.trim()) {
    scripts.push({ name: 'Full Ad Scripting Document', ad_id: null, full_text: text.trim() })
  }

  return scripts
}

// Legacy fallback used when no horizontal-rule separators are found.
function parseScriptsFromTextLegacy(text: string): ParsedScript[] {
  const scripts: ParsedScript[] = []
  const sections = text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
  let currentName   = ''
  let currentAdId: string | null = null
  let currentLines: string[] = []

  function flushScript() {
    if (currentName && currentLines.length > 0) {
      scripts.push({ name: currentName, ad_id: currentAdId, full_text: currentLines.join('\n').trim() })
    }
    currentLines = []
  }

  for (const section of sections) {
    const adMatch  = section.match(/\bFSIQ-VIDEO-AD-(\d+[a-z]?)\b/i)
    const isHeader = section.length < 120 && !section.includes('\n') &&
      (adMatch || /^(hook|body|cta|script\s*#?\d*|ad\s*\d+)/i.test(section))

    if (isHeader && adMatch) {
      flushScript()
      currentName  = section
      currentAdId  = adMatch ? `FSIQ-VIDEO-AD-${adMatch[1]}` : null
      currentLines = [section]
    } else if (isHeader && !currentName) {
      flushScript()
      currentName  = section
      currentAdId  = null
      currentLines = [section]
    } else {
      currentLines.push(section)
      if (!currentName) {
        currentName = section.split('\n')[0].slice(0, 80)
        flushScript()
        currentName = ''
      }
    }
  }
  flushScript()

  if (scripts.length === 0 && text.trim()) {
    scripts.push({ name: 'Full Ad Scripting Document', ad_id: null, full_text: text.trim() })
  }

  return scripts
}

// ── VTT parser — strip timestamps, return plain text ─────────────────────────

function parseVtt(content: string): string {
  return content
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      if (!trimmed) return false
      if (trimmed === 'WEBVTT') return false
      if (/^\d+$/.test(trimmed)) return false                      // cue index
      if (/^\d{2}:\d{2}/.test(trimmed)) return false              // timestamp line
      if (trimmed.startsWith('NOTE')) return false
      return true
    })
    .join(' ')
    .replace(/<[^>]+>/g, '')  // strip inline tags like <c>, <b>, etc.
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ── SharePoint Stream transcript fetch ────────────────────────────────────────
//
// Requires MediaContent.Read.All application permission in Azure AD.
// Without it, the beta endpoint returns 400 "Unsupported segment type".
// Returns null if transcript not available yet.

export interface FetchTranscriptResult {
  transcript: string | null
  source:     'stream' | 'missing' | 'error'
  error?:     string
}

export async function fetchTranscriptForSharePointItem(
  itemId: string,
): Promise<FetchTranscriptResult> {
  try {
    const transcript = await fetchTranscript(itemId)
    return { transcript, source: transcript ? 'stream' : 'missing' }
  } catch (err) {
    return { transcript: null, source: 'error', error: (err as Error).message }
  }
}

async function fetchTranscript(itemId: string): Promise<string | null> {
  const token = await getGraphToken()

  // List available transcripts
  const listRes = await fetch(
    `https://graph.microsoft.com/beta/drives/${DRIVE_ID}/items/${itemId}/media/transcripts`,
    { headers: { Authorization: `Bearer ${token}` } },
  )

  if (!listRes.ok) {
    const errorText = await listRes.text()
    if (listRes.status === 400 && errorText.includes('Unsupported segment type')) {
      // Permission missing: MediaContent.Read.All not granted in Azure AD app registration.
      // To fix: Azure Portal → App registrations → API permissions → Add Microsoft Graph →
      // Application permissions → MediaContent.Read.All → Grant admin consent
      console.warn('[script-matcher] MediaContent.Read.All permission required for transcript access')
    } else {
      console.warn(`[script-matcher] Transcript list failed for ${itemId}: ${listRes.status} ${errorText}`)
    }
    return null
  }

  const listData = await listRes.json() as { value?: Array<{ id: string }> }
  const transcripts = listData.value ?? []
  if (transcripts.length === 0) return null

  // Fetch the first (auto-generated) transcript content
  const transcriptId = transcripts[0].id
  const contentRes = await fetch(
    `https://graph.microsoft.com/beta/drives/${DRIVE_ID}/items/${itemId}/media/transcripts/${transcriptId}/content`,
    { headers: { Authorization: `Bearer ${token}` } },
  )

  if (!contentRes.ok) {
    console.warn(`[script-matcher] Transcript content fetch failed: ${contentRes.status}`)
    return null
  }

  const contentType = contentRes.headers.get('content-type') ?? ''
  const raw = await contentRes.text()

  // VTT format: starts with "WEBVTT" or has timestamp lines
  if (contentType.includes('vtt') || raw.trimStart().startsWith('WEBVTT') || /\d{2}:\d{2}:\d{2}/.test(raw)) {
    return parseVtt(raw)
  }

  return raw.trim()
}

// ── Claude semantic match ─────────────────────────────────────────────────────

export async function matchTranscriptToScript(
  transcript: string,
  scripts: ParsedScript[],
): Promise<MatchResult> {
  const scriptList = scripts
    .map((s, i) => `[Script-${i + 1}] ${s.name}\n${s.full_text.slice(0, 1000)}`)
    .join('\n\n---\n\n')

  const prompt = `You are matching a raw video transcript to a known FSIQ ad script.

QA FRAMEWORK:
${sopQa}

SCRIPTING RULES:
${sopScripting}

TRANSCRIPT (from SharePoint Stream auto-transcription):
${transcript.slice(0, 2000)}

KNOWN SCRIPTS (${scripts.length} total):
${scriptList}

Find the best match. Compare:
- Hook: first 5 seconds of transcript vs script hook
- Key phrases and statistics
- Body structure
- CTA wording
- Overall message and tone

Return JSON only, no preamble:
{
  "matched_script_name": "<exact name from the list above>",
  "matched_ad_id": "<FSIQ-VIDEO-AD-XX or null>",
  "confidence": <0-100>,
  "matching_elements": ["hook matches", "stats match", "CTA matches"],
  "reasoning": "<one sentence explaining the match>"
}`

  const result = await askClaudeJson<MatchResult>(prompt, 1024)

  // Resolve ad_id from our parsed scripts by name — always override Claude's inference.
  // Claude sees [Script-N] indices and confuses them with AD numbers (e.g. Script-18 → AD-18).
  const matched = scripts.find(
    s => s.name.toLowerCase().trim() === (result.matched_script_name ?? '').toLowerCase().trim(),
  )
  if (matched) {
    result.matched_ad_id = matched.ad_id  // null is correct when the doc has no AD-XX label
  }

  return result
}

// ── Core processor ────────────────────────────────────────────────────────────

async function processFootageRow(
  row: {
    id: string
    ad_id: string | null
    concept_folder: string
    file_name: string
    sharepoint_item_id: string
    raw_file_path: string
  },
  scripts: ParsedScript[],
  counters: { matched: number; awaiting: number; review: number; errors: string[] },
): Promise<void> {
  const transcript = await fetchTranscript(row.sharepoint_item_id)

  if (!transcript) {
    // Transcript not available — Stream hasn't processed it yet (or permission missing)
    await supabase
      .from('footage_log')
      .update({ status: 'awaiting_transcript' })
      .eq('id', row.id)

    const conceptLabel = row.ad_id ?? row.concept_folder

    const blocks: KnownBlock[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `⏳ *Video uploaded — transcript not ready yet*\n*Concept:* ${conceptLabel}\n*File:* \`${row.file_name}\`\n\nStream is processing the transcription. Will retry in 30 minutes.\n\n> If retries keep failing, check that *MediaContent.Read.All* is granted in the Azure AD app registration.`,
        },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `footage_log.id: \`${row.id}\`` }],
      },
    ]

    await sendBlocks('videoEditor', blocks as never[], `⏳ Transcript pending: ${row.file_name}`)

    const { data: posted } = await supabase
      .from('footage_log')
      .update({ slack_ts: null })  // placeholder; sendBlocks doesn't return ts here
      .eq('id', row.id)
      .select('id')
    void posted

    counters.awaiting++
    return
  }

  // Store transcript
  await supabase
    .from('footage_log')
    .update({ transcript })
    .eq('id', row.id)

  // Match against scripts
  let match: MatchResult
  try {
    match = await matchTranscriptToScript(transcript, scripts)
  } catch (err) {
    counters.errors.push(`Claude match failed for ${row.file_name}: ${(err as Error).message}`)
    return
  }

  if (match.confidence >= 85) {
    // High confidence — update footage_log and trigger brief generation
    await supabase
      .from('footage_log')
      .update({
        matched_script:    match.matched_script_name,
        matched_ad_id:     match.matched_ad_id,
        match_confidence:  match.confidence,
        status:            'matched',
      })
      .eq('id', row.id)

    // Trigger campaign-brief-generator inline (non-fatal)
    try {
      const mod = await import('./campaign-brief-generator.skill')
      await (mod as {
        run: (input: {
          conceptId:     string
          footageLogId:  string
          matchedScript: MatchResult & { full_text: string }
        }) => Promise<unknown>
      }).run({
        conceptId:    row.ad_id ?? row.concept_folder,
        footageLogId: row.id,
        matchedScript: {
          ...match,
          full_text: scripts.find(s => s.name === match.matched_script_name)?.full_text ?? '',
        },
      })
    } catch (err) {
      console.warn('[script-matcher] campaign-brief-generator failed:', (err as Error).message)
    }

    counters.matched++
  } else {
    // Low confidence — post to #video-editor for manual review
    await supabase
      .from('footage_log')
      .update({
        matched_script:   match.matched_script_name,
        matched_ad_id:    match.matched_ad_id,
        match_confidence: match.confidence,
        status:           'match_review',
      })
      .eq('id', row.id)

    const conceptLabel = row.ad_id ?? row.concept_folder

    const blocks: KnownBlock[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🎬 Script Match Below 85% — Review Needed', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*File*\n\`${row.file_name}\`` },
          { type: 'mrkdwn', text: `*Concept*\n${conceptLabel}` },
        ],
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Best match*\n${match.matched_script_name}` },
          { type: 'mrkdwn', text: `*Confidence*\n${match.confidence}%` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Reason:* ${match.reasoning}` },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ Confirm This Script', emoji: true },
            style: 'primary',
            action_id: `confirm_script_${row.id}`,
            value: row.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '🔄 Select Different Script', emoji: true },
            action_id: `select_script_${row.id}`,
            value: row.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '❌ No Script Yet', emoji: true },
            style: 'danger',
            action_id: `no_script_yet_${row.id}`,
            value: row.id,
          },
        ],
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `footage_log.id: \`${row.id}\`  ·  matching elements: ${match.matching_elements.join(', ') || 'none'}` }],
      },
    ]

    const res = await sendBlocks(
      'videoEditor',
      blocks as never[],
      `🎬 Script match review needed: ${row.file_name} (${match.confidence}% → ${match.matched_script_name})`,
    )

    // Save slack_ts for webhook handler
    const ts = (res as { ts?: string } | null)?.ts
    if (ts) {
      await supabase
        .from('footage_log')
        .update({ slack_ts: ts, slack_channel: process.env.SLACK_CHANNEL_VIDEO_EDITOR })
        .eq('id', row.id)
    }

    counters.review++
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function run(input: ScriptMatcherInput = {}): Promise<ScriptMatcherOutput> {
  const startedAt = new Date().toISOString()
  const counters  = { matched: 0, awaiting: 0, review: 0, errors: [] as string[] }

  // Fetch footage rows to process
  let query = supabase
    .from('footage_log')
    .select('id, ad_id, concept_folder, file_name, sharepoint_item_id, raw_file_path')
    .in('status', ['new', 'renaming', 'awaiting_transcript'])
    .not('sharepoint_item_id', 'is', null)

  if (input.conceptId) {
    query = query.or(`ad_id.eq.${input.conceptId},concept_folder.ilike.%${input.conceptId}%`)
  }

  const { data: rows, error } = await query

  if (error) {
    await supabase.from('skill_runs').insert({
      agent: 'paid-media', skill: 'script-matcher',
      started_at: startedAt, completed_at: new Date().toISOString(),
      status: 'error', output_summary: { error: error.message },
    })
    return { processed: 0, matched: 0, awaiting: 0, review: 0, errors: [error.message] }
  }

  if (!rows || rows.length === 0) {
    await supabase.from('skill_runs').insert({
      agent: 'paid-media', skill: 'script-matcher',
      started_at: startedAt, completed_at: new Date().toISOString(),
      status: 'success', output_summary: { processed: 0, note: 'No footage to process' },
    })
    return { processed: 0, matched: 0, awaiting: 0, review: 0, errors: [] }
  }

  // Fetch scripts once, reuse for all footage
  let scripts: ParsedScript[] = []
  try {
    const result = await loadScripts()
    scripts = result.scripts
    console.log(`[script-matcher] Loaded ${scripts.length} scripts (source: ${result.source})`)
  } catch (err) {
    const msg = `Failed to fetch Ad Scripting doc: ${(err as Error).message}`
    console.error('[script-matcher]', msg)
    counters.errors.push(msg)
  }

  // Process each footage row
  for (const row of rows as typeof rows & Array<{
    id: string; ad_id: string | null; concept_folder: string
    file_name: string; sharepoint_item_id: string; raw_file_path: string
  }>) {
    try {
      await processFootageRow(row, scripts, counters)
    } catch (err) {
      counters.errors.push(`Error processing ${row.file_name}: ${(err as Error).message}`)
    }
  }

  await supabase.from('skill_runs').insert({
    agent:        'paid-media',
    skill:        'script-matcher',
    started_at:   startedAt,
    completed_at: new Date().toISOString(),
    status:       counters.errors.length > 0 && counters.matched + counters.awaiting + counters.review === 0 ? 'error' : 'success',
    output_summary: {
      processed: rows.length,
      matched:   counters.matched,
      awaiting:  counters.awaiting,
      review:    counters.review,
      errors:    counters.errors.length,
    },
  })

  return {
    processed: rows.length,
    ...counters,
  }
}
