// campaign-brief-generator.skill.ts
// Generates a campaign brief by cloning the approved .docx template and
// replacing only the text nodes — guarantees pixel-perfect formatting.
//
// Triggered by script-matcher when confidence >= 85%.
// Can also be triggered by the Slack webhook after manual script confirmation.
//
// Flow:
//   1. Pull concept data from creative_pipeline + footage_log
//   2. Parse script sections cleanly (no visible bracket tags)
//   3. Download brief template from SharePoint (_Templates folder)
//   4. Clone template via JSZip, replace <w:t> nodes at known paraIds
//   5. Upload to SharePoint: /[concept folder]/Campaign Brief/[AD-ID]-Brief.docx
//   6. Update footage_log + creative_pipeline in Supabase
//   7. Add brief to sharepoint_map
//   8. Post to #video-editor
//
// SOPs: campaign-brief-template.md, video-review-qa-framework.md

import fs from 'fs'
import path from 'path'
import JSZip from 'jszip'
import { supabase } from '../../lib/supabase'
import { sendBlocks } from '../../lib/slack'
import { getGraphToken, findChildByName } from '../../lib/graph'
import { upsertItem } from '../../lib/sharepoint-map'
import type { KnownBlock } from '@slack/web-api'

const sopBrief = fs.readFileSync(path.join(process.cwd(), 'sops', 'campaign-brief-template.md'), 'utf-8')
const sopQa    = fs.readFileSync(path.join(process.cwd(), 'sops', 'video-review-qa-framework.md'), 'utf-8')
void sopBrief
void sopQa

// ── Constants ─────────────────────────────────────────────────────────────────

const DRIVE_ID             = 'b!SoPMe2KqFU2BkUmHhH8qFTOqNnh1p1BPuxbMZNe-MrqxmzKSNvU8TI-0UrHfUjC_'
const VIDEO_CREATIVES_PATH = 'Sales & Marketing/Marketing/Ad Campaigns/Ad Creatives/Video Creatives'
const TEMPLATES_PATH       = 'Sales & Marketing/Marketing/Ad Campaigns/Ad Creatives/_Templates'
const TEMPLATE_FILENAME    = 'campaign-brief-template.docx'
const DOCX_MIME            = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// paraIds of every replaceable text node in the template.
// These are stable identifiers baked into the approved .docx XML.
const PARA = {
  AD_ID:      '00000004',
  NUM_HOOKS:  '00000006',
  NUM_BODIES: '00000008',
  NUM_CTAS:   '0000000A',
  HOOK_LABEL: '0000000B',  // "HOOK" section header (blue, 13pt)
  HOOK_TEXT:  '0000000C',  // hook text paragraph (black, 11pt)
  BODY_LABEL: '0000000D',  // "BODY" section header
  BODY_TEXT:  '0000000E',
  CTA_LABEL:  '0000000F',  // "CALL TO ACTION" section header (blue, 13pt)
  CTA_TEXT:   '00000010',
} as const

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CampaignBriefInput {
  conceptId:     string
  footageLogId:  string
  matchedScript: {
    matched_script_name: string
    matched_ad_id:       string | null
    confidence:          number
    matching_elements:   string[]
    reasoning:           string
    full_text:           string
  }
  dryRun?: boolean
}

export interface CampaignBriefOutput {
  ad_id:     string
  brief_url: string | null
  status:    'generated' | 'dry_run' | 'error'
  error?:    string
}

export interface ParsedSection {
  label: string
  text:  string
}

export interface ParsedScript {
  hooks:  ParsedSection[]
  bodies: ParsedSection[]
  ctas:   ParsedSection[]
}

// ── Script parser ─────────────────────────────────────────────────────────────

function stripBracketTags(text: string): string {
  return text
    .replace(/\[HOOK-IPHONE[^\]]*\]/gi, '')
    .replace(/\[HOOK-STUDIO[^\]]*\]/gi, '')
    .replace(/\[HOOK\s*-?\s*[\d]+[^\]]*\]/gi, '')
    .replace(/\[HOOK[^\]]*\]/gi, '')
    .replace(/\[BODY[^\]]*\]/gi, '')
    .replace(/\[MIDDLE[^\]]*\]/gi, '')
    .replace(/\[CALL TO ACTION[^\]]*\]/gi, '')
    .replace(/\[CTA[^\]]*\]/gi, '')
    .trim()
}

// All section-marker regexes — used as "end" boundaries for extractBetween
const ALL_END_MARKERS: RegExp[] = [
  /\[HOOK-IPHONE[^\]]*\]/gi,
  /\[HOOK-STUDIO[^\]]*\]/gi,
  /\[HOOK\s*-?\s*\d+[^\]]*\]/gi,
  /\[HOOK[^\]]*\]/gi,
  /\[BODY[^\]]*\]/gi,
  /\[MIDDLE[^\]]*\]/gi,
  /\[CALL TO ACTION[^\]]*\]/gi,
  /\[CTA[^\]]*\]/gi,
]

function extractBetween(text: string, startRe: RegExp, endRes: RegExp[]): string {
  startRe.lastIndex = 0
  const sm = startRe.exec(text)
  if (!sm) return ''
  let end = text.length
  for (const re of endRes) {
    re.lastIndex = sm.index + sm[0].length
    const em = re.exec(text)
    if (em && em.index < end) end = em.index
  }
  return stripBracketTags(text.slice(sm.index + sm[0].length, end))
}

// ── Bracket format parser: [HOOK 1], [BODY], [CTA] ─────────────────────────

function parseBracketFormat(fullText: string): ParsedScript {
  const hooks:  ParsedSection[] = []
  const bodies: ParsedSection[] = []
  const ctas:   ParsedSection[] = []

  // --- Hooks ---

  // Numbered: [HOOK 1], [HOOK-1], [HOOK 2], etc.
  const numberedRe = /\[HOOK[\s-](\d+)[^\]]*\]/gi
  let m: RegExpExecArray | null
  const numberedHooks: Array<{n: number; label: string; matchStr: string}> = []
  while ((m = numberedRe.exec(fullText)) !== null) {
    numberedHooks.push({ n: parseInt(m[1]), label: `HOOK ${m[1]}`, matchStr: m[0] })
  }

  if (numberedHooks.length > 0) {
    numberedHooks.sort((a, b) => a.n - b.n)
    for (const {label, matchStr} of numberedHooks) {
      const re = new RegExp(matchStr.replace(/[[\]]/g, '\\$&'), 'i')
      const text = extractBetween(fullText, re, ALL_END_MARKERS)
      if (text) hooks.push({ label, text })
    }
  }

  // Named: [HOOK-IPHONE], [HOOK-STUDIO]
  if (hooks.length === 0) {
    const iphoneText = extractBetween(fullText, /\[HOOK-IPHONE[^\]]*\]/i, ALL_END_MARKERS.slice(1))
    if (iphoneText) hooks.push({ label: 'HOOK (iPhone)', text: iphoneText })

    const studioText = extractBetween(fullText, /\[HOOK-STUDIO[^\]]*\]/i, ALL_END_MARKERS.slice(2))
    if (studioText) hooks.push({ label: 'HOOK (Studio)', text: studioText })
  }

  // Generic: [HOOK]
  if (hooks.length === 0) {
    const genericText = extractBetween(fullText, /\[HOOK\b[^\]]*\]/i, ALL_END_MARKERS.slice(4))
    if (genericText) hooks.push({ label: 'HOOK', text: genericText })
  }

  // --- Body ---

  const bodyText = extractBetween(
    fullText,
    /\[(?:BODY|MIDDLE)[^\]]*\]/i,
    [/\[CALL TO ACTION[^\]]*\]/gi, /\[CTA[^\]]*\]/gi],
  )
  if (bodyText) bodies.push({ label: 'BODY', text: bodyText })

  // --- CTAs ---

  // Numbered: [CTA 1], [CTA 2]
  const ctaNumberedRe = /\[CTA\s+(\d+)[^\]]*\]/gi
  const numberedCtas: Array<{n: number; label: string; matchStr: string}> = []
  while ((m = ctaNumberedRe.exec(fullText)) !== null) {
    numberedCtas.push({ n: parseInt(m[1]), label: `CTA ${m[1]}`, matchStr: m[0] })
  }

  if (numberedCtas.length > 0) {
    numberedCtas.sort((a, b) => a.n - b.n)
    const ctaEnd = [/\[CALL TO ACTION[^\]]*\]/gi, /\[CTA[^\]]*\]/gi]
    for (const {label, matchStr} of numberedCtas) {
      const re = new RegExp(matchStr.replace(/[[\]]/g, '\\$&'), 'i')
      const text = extractBetween(fullText, re, ctaEnd)
      if (text) ctas.push({ label, text })
    }
  }

  // Generic: [CTA] or [CALL TO ACTION]
  if (ctas.length === 0) {
    const ctaText = extractBetween(fullText, /\[(?:CALL TO ACTION|CTA)[^\]]*\]/i, [])
    if (ctaText) ctas.push({ label: 'CTA', text: ctaText })
  }

  return { hooks, bodies, ctas }
}

// ── Section header + inline label parser ─────────────────────────────────────
//
// Handles historical doc format:
//   HOOKS                         ← section header
//   Hook 1: text...               ← inline hook label
//   Hook 1.1: text...
//   Hook 6A: text...
//   BODY                          ← section header
//   text...                       ← body continuation
//   CTAs                          ← section header
//   CTA 1 (Book a Call): text...  ← inline CTA label
//   CTA 2 (Case Study): text...
//
// Also handles:
//   Body: text...                 ← inline body label
//   Studio CTA 1: text...         ← Studio CTA prefix
//   Core Body                     ← alternate header

function parseSectionHeaderFormat(fullText: string): ParsedScript {
  const hooks:  ParsedSection[] = []
  const bodies: ParsedSection[] = []
  const ctas:   ParsedSection[] = []

  const lines = fullText.split('\n')
  type State = 'start' | 'hooks' | 'body' | 'ctas'
  let state: State = 'start'
  const bodyAccum: string[] = []

  function flushBody() {
    if (bodyAccum.length > 0) {
      const text = bodyAccum.join(' ').trim()
      if (text) bodies.push({ label: 'BODY', text })
      bodyAccum.length = 0
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue  // skip blank / comment lines

    // Section header: HOOKS / BODY / CTAs
    if (/^HOOKS?\s*$/i.test(line)) {
      flushBody()
      state = 'hooks'
      continue
    }
    if (/^(?:BODY|Core Body|SHARED BODY)\s*$/i.test(line)) {
      flushBody()
      state = 'body'
      continue
    }
    if (/^(?:Studio\s+)?CTAs?\s*$/i.test(line) || /^CALL TO ACTION\s*$/i.test(line) || /^iPhone CTAs?\s*$/i.test(line)) {
      flushBody()
      state = 'ctas'
      continue
    }

    // Hook inline: "Hook 1: text" or "Hook 1.1: text" or "Hook 6A: text"
    const hookMatch = line.match(/^Hook\s+([\w.]+)\s*:\s*(.+)$/i)
    if (hookMatch) {
      const label = `Hook ${hookMatch[1]}`
      const text  = hookMatch[2].trim()
      if (text) hooks.push({ label, text })
      if (state !== 'hooks') state = 'hooks'
      continue
    }

    // Body inline: "Body: text"
    const bodyInlineMatch = line.match(/^(?:Core\s+)?Body\s*:\s*(.+)$/i)
    if (bodyInlineMatch) {
      flushBody()
      const text = bodyInlineMatch[1].trim()
      if (text) bodies.push({ label: 'BODY', text })
      state = 'body'
      continue
    }

    // CTA inline: "CTA 1 (label): text" or "Studio CTA 1: text"
    const ctaMatch = line.match(/^(?:Studio\s+)?CTA\s+([\w\s().,-]+?)\s*:\s*(.+)$/i)
    if (ctaMatch) {
      const label = `CTA ${ctaMatch[1].trim()}`
      const text  = ctaMatch[2].trim()
      if (text) ctas.push({ label, text })
      if (state !== 'ctas') state = 'ctas'
      continue
    }

    // Continuation line
    if (state === 'body') {
      if (bodies.length > 0) {
        // Append to existing body
        bodies[bodies.length - 1].text += ' ' + line
      } else {
        bodyAccum.push(line)
      }
    }
  }

  flushBody()
  return { hooks, bodies, ctas }
}

// ── Fallback parser ───────────────────────────────────────────────────────────

function parseFallback(fullText: string): ParsedScript {
  const lines = fullText.split('\n').filter(l => l.trim())
  return {
    hooks:  [{ label: 'HOOK', text: lines.slice(0, 3).join(' ') }],
    bodies: [{ label: 'BODY', text: lines.slice(3, -2).join(' ') }],
    ctas:   [{ label: 'CTA',  text: lines.slice(-2).join(' ') }],
  }
}

// ── Main parseScript export ───────────────────────────────────────────────────

export function parseScript(fullText: string): ParsedScript {
  const hasBrackets = /\[HOOK/i.test(fullText) || /\[BODY\]/i.test(fullText)

  if (hasBrackets) {
    return parseBracketFormat(fullText)
  }

  // Section header or inline label format
  if (
    /^HOOKS?\s*$/im.test(fullText) ||
    /^(?:BODY|Core Body)\s*$/im.test(fullText) ||
    /^(?:Studio\s+)?CTAs?\s*$/im.test(fullText) ||
    /^Hook\s+[\w.]+\s*:/im.test(fullText) ||
    /^(?:Studio\s+)?CTA\s+[\w]/im.test(fullText)
  ) {
    return parseSectionHeaderFormat(fullText)
  }

  return parseFallback(fullText)
}

// ── XML / template helpers ────────────────────────────────────────────────────

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Replace the <w:t> content inside the paragraph identified by paraId.
 * Preserves all run properties (<w:rPr>) — only the text nodes change.
 */
function replaceParaText(xml: string, paraId: string, newText: string): string {
  const escaped = xmlEscape(newText)

  const paraRe = new RegExp(
    `(<w:p\\b[^>]*w14:paraId="${paraId}"[^>]*>)([\\s\\S]*?)(</w:p>)`,
    'g',
  )

  return xml.replace(paraRe, (_m, open, inner, close) => {
    let runIdx = 0
    const newInner = inner.replace(
      /(<w:r\b[^>]*>)([\s\S]*?)(<\/w:r>)/g,
      (_rm: string, rOpen: string, rInner: string, rClose: string) => {
        runIdx++
        if (runIdx === 1) {
          let newRI = rInner.replace(
            /<w:t[^>]*>[\s\S]*?<\/w:t>/g,
            `<w:t xml:space="preserve">${escaped}</w:t>`,
          )
          if (!/<w:t/.test(newRI)) {
            newRI += `<w:t xml:space="preserve">${escaped}</w:t>`
          }
          return `${rOpen}${newRI}${rClose}`
        }
        return `${rOpen}${rInner.replace(/<w:t[^>]*>[\s\S]*?<\/w:t>/g, '<w:t></w:t>')}${rClose}`
      },
    )
    return `${open}${newInner}${close}`
  })
}

// Build the XML for one extra hook paragraph pair (label + text).
// Clones the exact styling from the template's HOOK label (blue, 13pt, bold)
// and HOOK text (black, 11pt, normal) paragraphs.
function buildExtraHookXml(hookNumber: number, hookText: string): string {
  const escaped = xmlEscape(hookText)
  const labelId = `EE${String(hookNumber).padStart(6, '0')}`
  const textId  = `EF${String(hookNumber).padStart(6, '0')}`

  const labelXml = `<w:p w:rsidRDefault="00000000" w14:paraId="${labelId}" wp14:textId="77777777"><w:pPr><w:spacing w:before="320" w:after="120" w:lineRule="auto"/><w:rPr/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:b w:val="1"/><w:bCs w:val="1"/><w:color w:val="2e4057"/><w:sz w:val="26"/><w:szCs w:val="26"/><w:rtl w:val="0"/></w:rPr><w:t xml:space="preserve">HOOK ${hookNumber}</w:t></w:r></w:p>`
  const textXml  = `<w:p w:rsidRDefault="00000000" w14:paraId="${textId}" wp14:textId="77777777"><w:pPr><w:spacing w:before="40" w:after="120" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:b w:val="0"/><w:bCs w:val="0"/><w:color w:val="000000"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:rtl w:val="0"/></w:rPr><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`

  return labelXml + textXml
}

// Build the XML for one extra CTA paragraph pair (label + text).
function buildExtraCtaXml(ctaNumber: number, ctaText: string): string {
  const escaped = xmlEscape(ctaText)
  const labelId = `FC${String(ctaNumber).padStart(6, '0')}`
  const textId  = `FD${String(ctaNumber).padStart(6, '0')}`

  const labelXml = `<w:p w:rsidRDefault="00000000" w14:paraId="${labelId}" wp14:textId="77777777"><w:pPr><w:spacing w:before="320" w:after="120" w:lineRule="auto"/><w:rPr/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:b w:val="1"/><w:bCs w:val="1"/><w:color w:val="2e4057"/><w:sz w:val="26"/><w:szCs w:val="26"/><w:rtl w:val="0"/></w:rPr><w:t xml:space="preserve">CTA ${ctaNumber}</w:t></w:r></w:p>`
  const textXml  = `<w:p w:rsidRDefault="00000000" w14:paraId="${textId}" wp14:textId="77777777"><w:pPr><w:spacing w:before="40" w:after="120" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:b w:val="0"/><w:bCs w:val="0"/><w:color w:val="000000"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:rtl w:val="0"/></w:rPr><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`

  return labelXml + textXml
}

async function fillTemplate(
  templateBuffer: Buffer,
  values: Record<string, string>,
  extraHooks?: string[],  // hooks[1..n] text — hooks[0] is handled via values
  extraCtas?: string[],   // ctas[1..n] text — ctas[0] is handled via values
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(templateBuffer)
  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('word/document.xml missing in template')

  let xml = await docFile.async('string')

  // 1. Standard text replacements
  for (const [paraId, text] of Object.entries(values)) {
    xml = replaceParaText(xml, paraId, text)
  }

  // 2. Multi-hook: rename "HOOK" → "HOOK 1" and inject Hook 2, 3, …
  if (extraHooks && extraHooks.length > 0) {
    xml = replaceParaText(xml, PARA.HOOK_LABEL, 'HOOK 1')

    const injected = extraHooks
      .map((text, i) => buildExtraHookXml(i + 2, text))
      .join('')

    // Inject after the first hook text paragraph (paraId 0000000C)
    const hookTextParaRe = new RegExp(
      `(<w:p\\b[^>]*w14:paraId="${PARA.HOOK_TEXT}"[^>]*>[\\s\\S]*?</w:p>)`,
    )
    xml = xml.replace(hookTextParaRe, `$1${injected}`)
  }

  // 3. Multi-CTA: rename "CTA" / "CALL TO ACTION" → "CTA 1" and inject CTA 2, 3, …
  if (extraCtas && extraCtas.length > 0) {
    // Attempt to rename the CTA label paragraph (may be a no-op if paraId doesn't exist)
    xml = replaceParaText(xml, PARA.CTA_LABEL, 'CTA 1')

    const injected = extraCtas
      .map((text, i) => buildExtraCtaXml(i + 2, text))
      .join('')

    // Inject after the first CTA text paragraph (paraId 00000010)
    const ctaTextParaRe = new RegExp(
      `(<w:p\\b[^>]*w14:paraId="${PARA.CTA_TEXT}"[^>]*>[\\s\\S]*?</w:p>)`,
    )
    xml = xml.replace(ctaTextParaRe, `$1${injected}`)
  }

  zip.file('word/document.xml', xml)

  return zip.generateAsync({
    type:               'nodebuffer',
    compression:        'DEFLATE',
    compressionOptions: { level: 9 },
  }) as Promise<Buffer>
}

// ── SharePoint: fetch template ────────────────────────────────────────────────

async function fetchTemplate(): Promise<Buffer | null> {
  const token = await getGraphToken()

  const templatesRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${TEMPLATES_PATH}:/children`,
    { headers: { Authorization: `Bearer ${token}` } },
  )

  if (!templatesRes.ok) {
    console.warn('[campaign-brief-generator] _Templates folder not found, falling back to local template')
    return null
  }

  const data = await templatesRes.json() as { value: { name: string; id: string }[] }
  const templateItem = data.value.find(f => f.name === TEMPLATE_FILENAME)
  if (!templateItem) {
    console.warn(`[campaign-brief-generator] ${TEMPLATE_FILENAME} not found in _Templates`)
    return null
  }

  const contentRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${templateItem.id}/content`,
    { headers: { Authorization: `Bearer ${token}` } },
  )

  if (!contentRes.ok) {
    console.warn('[campaign-brief-generator] Failed to download template')
    return null
  }

  return Buffer.from(await contentRes.arrayBuffer())
}

// ── SharePoint: upload brief ──────────────────────────────────────────────────

async function uploadBrief(
  conceptFolderItemId: string,
  filename: string,
  buffer: Buffer,
): Promise<{ id: string; webUrl: string } | null> {
  const token = await getGraphToken()

  const briefFolder = await findChildByName(conceptFolderItemId, 'Campaign Brief')
  if (!briefFolder?.id) {
    console.warn('[campaign-brief-generator] Campaign Brief subfolder not found')
    return null
  }

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${briefFolder.id}:/${filename}:/content`,
    {
      method:  'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': DOCX_MIME },
      body:    buffer as unknown as BodyInit,
    },
  )

  if (!res.ok) {
    console.warn(`[campaign-brief-generator] Upload failed: ${res.status} ${await res.text()}`)
    return null
  }

  return res.json() as Promise<{ id: string; webUrl: string }>
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function run(input: CampaignBriefInput): Promise<CampaignBriefOutput> {
  const startedAt = new Date().toISOString()
  const { conceptId, footageLogId, matchedScript, dryRun = false } = input

  // Pull concept data
  const { data: pipeline } = await supabase
    .from('creative_pipeline')
    .select('id, ad_id, concept_name, hook_type, awareness_level, lp_code')
    .eq('ad_id', conceptId)
    .maybeSingle()

  const { data: footage } = await supabase
    .from('footage_log')
    .select('file_name, raw_file_path, concept_folder')
    .eq('id', footageLogId)
    .maybeSingle()

  const adId        = pipeline?.ad_id        ?? conceptId
  const conceptName = pipeline?.concept_name ?? footage?.concept_folder ?? conceptId

  const script   = parseScript(matchedScript.full_text)
  const filename = `${adId}-Brief.docx`
  const generatedAt = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET'

  // Build value map for template substitution
  const templateValues: Record<string, string> = {
    [PARA.AD_ID]:     adId,
    [PARA.NUM_HOOKS]: String(script.hooks.length),
    [PARA.NUM_BODIES]:String(script.bodies.length),
    [PARA.NUM_CTAS]:  String(script.ctas.length),
    [PARA.HOOK_TEXT]: script.hooks[0]?.text  ?? '',
    [PARA.BODY_TEXT]: script.bodies[0]?.text ?? '',
    [PARA.CTA_TEXT]:  script.ctas[0]?.text   ?? '',
  }
  const extraHooks = script.hooks.slice(1).map(h => h.text)
  const extraCtas  = script.ctas.slice(1).map(c => c.text)

  // ── Dry run ───────────────────────────────────────────────────────────────
  if (dryRun) {
    console.log('\n' + '═'.repeat(60))
    console.log(`CAMPAIGN BRIEF DRY RUN — ${adId}`)
    console.log('═'.repeat(60))
    console.log(`Concept:    ${conceptName}`)
    console.log(`Hook Type:  ${pipeline?.hook_type ?? '—'}`)
    console.log(`Hooks:      ${script.hooks.length}`)
    console.log(`Bodies:     ${script.bodies.length}`)
    console.log(`CTAs:       ${script.ctas.length}`)
    console.log(`Script:     ${matchedScript.matched_script_name} (${matchedScript.confidence}%)`)

    for (const [i, h] of script.hooks.entries()) {
      console.log(`\n── ${h.label || `HOOK ${i + 1}`} ${'─'.repeat(Math.max(0, 47 - (h.label || '').length))}`)
      console.log(h.text || '(empty)')
    }
    for (const b of script.bodies) {
      console.log(`\n── ${b.label} ─────────────────────────────────────────────`)
      console.log(b.text || '(empty)')
    }
    for (const [i, c] of script.ctas.entries()) {
      console.log(`\n── ${c.label || `CTA ${i + 1}`} ${'─'.repeat(Math.max(0, 49 - (c.label || '').length))}`)
      console.log(c.text || '(empty)')
    }
    console.log('\n' + '═'.repeat(60))

    // Fetch template
    let templateBuffer: Buffer | null = null
    try { templateBuffer = await fetchTemplate() } catch { /* ignore */ }

    if (!templateBuffer) {
      const localTemplate = path.join(process.env.HOME!, 'Downloads', 'FSIQ-VIDEO-AD-18_Creative_Brief.docx')
      if (fs.existsSync(localTemplate)) {
        templateBuffer = fs.readFileSync(localTemplate)
        console.log('\nUsing local template fallback')
      }
    }

    if (!templateBuffer) {
      console.log('\n⚠  No template available — skipping .docx generation')
      return { ad_id: adId, brief_url: null, status: 'dry_run' }
    }

    const buffer = await fillTemplate(
      templateBuffer,
      templateValues,
      extraHooks.length > 0 ? extraHooks : undefined,
      extraCtas.length  > 0 ? extraCtas  : undefined,
    )
    const outDir  = path.join(process.cwd(), 'tmp')
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
    const outPath = path.join(outDir, filename)
    fs.writeFileSync(outPath, buffer)

    console.log(`\n✅ Saved locally: ${outPath}  (${(buffer.length / 1024).toFixed(1)} KB — NOT uploaded)`)
    console.log('═'.repeat(60) + '\n')
    return { ad_id: adId, brief_url: null, status: 'dry_run' }
  }

  // ── Live run ──────────────────────────────────────────────────────────────

  const templateBuffer = await fetchTemplate()
  if (!templateBuffer) {
    console.error('[campaign-brief-generator] Cannot generate brief — template unavailable')
    return { ad_id: adId, brief_url: null, status: 'error', error: 'Template not found in SharePoint' }
  }

  const buffer = await fillTemplate(
    templateBuffer,
    templateValues,
    extraHooks.length > 0 ? extraHooks : undefined,
    extraCtas.length  > 0 ? extraCtas  : undefined,
  )

  // Find root concept folder in sharepoint_map (exclude subfolders)
  const { data: folderRow } = await supabase
    .from('sharepoint_map')
    .select('sharepoint_item_id')
    .ilike('display_name', `${adId}%`)
    .eq('item_type', 'folder')
    .ilike('path', `%Video Creatives/${adId}%`)
    .not('path', 'ilike', `%${adId}%/%`)
    .maybeSingle()

  let uploadedItem: { id: string; webUrl: string } | null = null

  if (folderRow?.sharepoint_item_id) {
    uploadedItem = await uploadBrief(folderRow.sharepoint_item_id, filename, buffer)
  } else {
    console.warn(`[campaign-brief-generator] Concept folder not found in sharepoint_map for ${adId}`)
  }

  const briefUrl = uploadedItem?.webUrl ?? null

  // Update footage_log
  await supabase
    .from('footage_log')
    .update({ status: 'brief_generated', brief_sharepoint_url: briefUrl })
    .eq('id', footageLogId)

  // Update creative_pipeline
  if (pipeline?.id) {
    await supabase
      .from('creative_pipeline')
      .update({ status: 'Recording Pending' })
      .eq('id', pipeline.id)
  }

  // Add brief to sharepoint_map
  if (uploadedItem && folderRow?.sharepoint_item_id) {
    await upsertItem({
      path:               `${VIDEO_CREATIVES_PATH}/${adId} - ${conceptName}/Campaign Brief/${filename}`,
      item_type:          'file',
      parent_path:        `${VIDEO_CREATIVES_PATH}/${adId} - ${conceptName}/Campaign Brief`,
      sharepoint_item_id: uploadedItem.id,
      display_name:       filename,
      expected_name:      filename,
      naming_valid:       true,
      agent_owner:        'paid-media',
      last_verified_at:   new Date().toISOString(),
    })
  }

  // Post to #video-editor
  const rawFootageUrl = footage?.raw_file_path
    ? `https://foodserviceiq.sharepoint.com/sites/Shared%20Documents/${footage.raw_file_path.replace(/\s/g, '%20')}`
    : null

  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `✅ Campaign Brief Ready — ${adId}`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Concept*\n${conceptName}` },
        { type: 'mrkdwn', text: `*Script Matched*\n${matchedScript.matched_script_name} (${matchedScript.confidence}%)` },
      ],
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Format*\n${pipeline?.hook_type ?? '—'}` },
        { type: 'mrkdwn', text: `*Hooks / Bodies / CTAs*\n${script.hooks.length} / ${script.bodies.length} / ${script.ctas.length}` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          briefUrl ? `📄 <${briefUrl}|View Campaign Brief>` : '📄 Brief generated (upload pending — check SharePoint)',
          rawFootageUrl ? `🎬 <${rawFootageUrl}|View Raw Footage>` : `🎬 Raw footage: \`${footage?.raw_file_path ?? '—'}\``,
        ].join('\n'),
      },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Status: *Recording Pending*  ·  ${generatedAt}` }],
    },
  ]

  await sendBlocks('videoEditor', blocks as never[], `✅ Campaign brief ready: ${adId} — ${conceptName}`)

  await supabase.from('skill_runs').insert({
    agent:          'paid-media',
    skill:          'campaign-brief-generator',
    started_at:     startedAt,
    completed_at:   new Date().toISOString(),
    status:         briefUrl ? 'success' : 'partial',
    output_summary: {
      ad_id:        adId,
      brief_url:    briefUrl,
      script_match: matchedScript.matched_script_name,
      confidence:   matchedScript.confidence,
      hooks_parsed: script.hooks.length,
      bodies_parsed:script.bodies.length,
      ctas_parsed:  script.ctas.length,
    },
  })

  return { ad_id: adId, brief_url: briefUrl, status: 'generated' }
}
