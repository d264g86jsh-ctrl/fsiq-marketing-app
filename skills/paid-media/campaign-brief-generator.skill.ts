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
  AD_ID:     '00000004',
  NUM_HOOKS: '00000006',
  NUM_BODIES:'00000008',
  NUM_CTAS:  '0000000A',
  HOOK_TEXT: '0000000C',
  BODY_TEXT: '0000000E',
  CTA_TEXT:  '00000010',
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

// ── Script parser ─────────────────────────────────────────────────────────────

function stripTags(text: string): string {
  return text
    .replace(/\[HOOK-IPHONE[^\]]*\]/gi, '')
    .replace(/\[HOOK-STUDIO[^\]]*\]/gi, '')
    .replace(/\[HOOK\s*-?\s*\d+[^\]]*\]/gi, '')
    .replace(/\[HOOK[^\]]*\]/gi, '')
    .replace(/\[BODY[^\]]*\]/gi, '')
    .replace(/\[MIDDLE[^\]]*\]/gi, '')
    .replace(/\[CALL TO ACTION[^\]]*\]/gi, '')
    .replace(/\[CTA[^\]]*\]/gi, '')
    .trim()
}

function extractBetween(text: string, startRe: RegExp, endRes: RegExp[]): string {
  const sm = startRe.exec(text)
  if (!sm) return ''
  let end = text.length
  for (const re of endRes) {
    re.lastIndex = sm.index + sm[0].length
    const em = re.exec(text)
    if (em && em.index < end) end = em.index
  }
  return stripTags(text.slice(sm.index + sm[0].length, end))
}

interface ParsedScript {
  hookText:  string
  bodyText:  string
  ctaText:   string
  numHooks:  number
}

function parseScript(fullText: string): ParsedScript {
  const hasBrackets = /\[HOOK/i.test(fullText)

  if (!hasBrackets) {
    const lines = fullText.split('\n').filter(l => l.trim())
    return {
      hookText: lines.slice(0, 3).join(' '),
      bodyText: lines.slice(3, -2).join(' '),
      ctaText:  lines.slice(-2).join(' '),
      numHooks: 1,
    }
  }

  const endAll = [
    /\[HOOK-IPHONE[^\]]*\]/gi,
    /\[HOOK-STUDIO[^\]]*\]/gi,
    /\[HOOK\s*-?\s*\d+[^\]]*\]/gi,
    /\[HOOK[^\]]*\]/gi,
    /\[BODY[^\]]*\]/gi,
    /\[MIDDLE[^\]]*\]/gi,
    /\[CALL TO ACTION[^\]]*\]/gi,
    /\[CTA[^\]]*\]/gi,
  ]

  // Count distinct hook sections
  const hookTags = fullText.match(/\[HOOK[^\]]*\]/gi) ?? []
  const numHooks = Math.max(hookTags.length, 1)

  // Use the first hook tag's text
  const hookText =
    extractBetween(fullText, /\[HOOK-IPHONE[^\]]*\]/i, endAll.slice(1)) ||
    extractBetween(fullText, /\[HOOK-STUDIO[^\]]*\]/i, endAll.slice(2)) ||
    extractBetween(fullText, /\[HOOK[^\]]*\]/i,        endAll.slice(4))

  const bodyText =
    extractBetween(fullText, /\[(?:BODY|MIDDLE)[^\]]*\]/i,
      [/\[CALL TO ACTION[^\]]*\]/gi, /\[CTA[^\]]*\]/gi])

  const ctaText =
    extractBetween(fullText, /\[(?:CALL TO ACTION|CTA)[^\]]*\]/i, [])

  return { hookText, bodyText, ctaText, numHooks }
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
          // First run: replace (or inject) the <w:t> with new text
          let newRI = rInner.replace(
            /<w:t[^>]*>[\s\S]*?<\/w:t>/g,
            `<w:t xml:space="preserve">${escaped}</w:t>`,
          )
          if (!/<w:t/.test(newRI)) {
            newRI += `<w:t xml:space="preserve">${escaped}</w:t>`
          }
          return `${rOpen}${newRI}${rClose}`
        }
        // Extra runs: blank their text
        return `${rOpen}${rInner.replace(/<w:t[^>]*>[\s\S]*?<\/w:t>/g, '<w:t></w:t>')}${rClose}`
      },
    )
    return `${open}${newInner}${close}`
  })
}

async function fillTemplate(
  templateBuffer: Buffer,
  values: Record<string, string>,
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(templateBuffer)
  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('word/document.xml missing in template')

  let xml = await docFile.async('string')

  for (const [paraId, text] of Object.entries(values)) {
    xml = replaceParaText(xml, paraId, text)
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

  // Find _Templates folder under Video Creatives parent
  const templatesSearchRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${TEMPLATES_PATH}:/children`,
    { headers: { Authorization: `Bearer ${token}` } },
  )

  if (!templatesSearchRes.ok) {
    console.warn('[campaign-brief-generator] _Templates folder not found, falling back to local template')
    return null
  }

  const data = await templatesSearchRes.json() as { value: { name: string; id: string }[] }
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
    [PARA.NUM_HOOKS]: String(script.numHooks),
    [PARA.NUM_BODIES]:'1',
    [PARA.NUM_CTAS]:  '1',
    [PARA.HOOK_TEXT]: script.hookText,
    [PARA.BODY_TEXT]: script.bodyText,
    [PARA.CTA_TEXT]:  script.ctaText,
  }

  // ── Dry run ───────────────────────────────────────────────────────────────
  if (dryRun) {
    console.log('\n' + '═'.repeat(60))
    console.log(`CAMPAIGN BRIEF DRY RUN — ${adId}`)
    console.log('═'.repeat(60))
    console.log(`Concept:    ${conceptName}`)
    console.log(`Hook Type:  ${pipeline?.hook_type ?? '—'}`)
    console.log(`Hooks:      ${script.numHooks}`)
    console.log(`Script:     ${matchedScript.matched_script_name} (${matchedScript.confidence}%)`)
    console.log('\n── HOOK ─────────────────────────────────────────────')
    console.log(script.hookText || '(empty)')
    console.log('\n── BODY ─────────────────────────────────────────────')
    console.log(script.bodyText || '(empty)')
    console.log('\n── CTA ──────────────────────────────────────────────')
    console.log(script.ctaText  || '(empty)')
    console.log('═'.repeat(60))

    // Fetch template (fall back to local copy for dry runs)
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
      console.log('\n⚠️  No template available — skipping .docx generation')
      return { ad_id: adId, brief_url: null, status: 'dry_run' }
    }

    const buffer  = await fillTemplate(templateBuffer, templateValues)
    const outDir  = path.join(process.cwd(), 'tmp')
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
    const outPath = path.join(outDir, filename)
    fs.writeFileSync(outPath, buffer)

    console.log(`\n✅ Saved locally: ${outPath}  (${(buffer.length / 1024).toFixed(1)} KB — NOT uploaded)`)
    console.log('═'.repeat(60) + '\n')
    return { ad_id: adId, brief_url: null, status: 'dry_run' }
  }

  // ── Live run ──────────────────────────────────────────────────────────────

  // Fetch template from SharePoint
  const templateBuffer = await fetchTemplate()
  if (!templateBuffer) {
    console.error('[campaign-brief-generator] Cannot generate brief — template unavailable')
    return { ad_id: adId, brief_url: null, status: 'error', error: 'Template not found in SharePoint' }
  }

  const buffer = await fillTemplate(templateBuffer, templateValues)

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
        { type: 'mrkdwn', text: `*Awareness Level*\n${pipeline?.awareness_level ?? '—'}` },
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
      hooks_parsed: script.numHooks,
    },
  })

  return { ad_id: adId, brief_url: briefUrl, status: 'generated' }
}
