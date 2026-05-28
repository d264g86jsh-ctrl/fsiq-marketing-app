// Naming Builder API
//
// GET  /api/naming-builder?action=next-ids   → next concept IDs + global number
// POST /api/naming-builder                   → create concept (DB rows + SP folder + Slack)
//
// This route is the source of truth for the naming convention. The client
// duplicates the string-building logic for live preview, but the values stored
// in the DB always come from here.

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendBlocks } from '@/lib/slack'
import { upsertItem } from '@/lib/sharepoint-map'
import { getGraphToken, createFolderIfMissing } from '@/lib/graph'
import type { KnownBlock } from '@slack/web-api'

// ── Constants (shared with sharepoint-structure-agent skill) ────────────────

const DRIVE_ID = 'b!SoPMe2KqFU2BkUmHhH8qFTOqNnh1p1BPuxbMZNe-MrqxmzKSNvU8TI-0UrHfUjC_'
const VIDEO_CREATIVES_ID = '015MT6T5FZ6MOQJBXMABF3DUNIQW6BQ5ON'
const VIDEO_CREATIVES_PATH = 'Sales & Marketing/Marketing/Ad Campaigns/Ad Creatives/Video Creatives'
const STATIC_IMAGES_PATH   = 'Sales & Marketing/Marketing/Ad Campaigns/Ad Creatives/Static Images'
const REQUIRED_SUBFOLDERS = ['Campaign Brief', 'Raw Footage', 'Final']

// ── Types ─────────────────────────────────────────────────────────────────────

type AdType = 'VIDEO' | 'STATIC'

type Variant = {
  globalNumber: number
  hookDesc:    string
  hookType:    string
  awareness:   string
  lpCode:      string
  copyVersion: string
  duration:    string
}

type CreateBody = {
  type:        AdType
  conceptId:   string
  conceptName: string
  adSetToken:  string
  talent:      string | null
  targeting:   string
  lpCode:      string
  variants:    Variant[]
}

// ── Name builders (mirror NamingBuilderClient.tsx) ────────────────────────────

function buildFolderName(conceptId: string, conceptName: string): string {
  return `${conceptId} - ${conceptName}`.trim()
}

function buildAdSetName(b: CreateBody): string {
  const parts = [b.conceptId, b.adSetToken]
  if (b.type === 'VIDEO' && b.talent && b.talent.trim()) parts.push(b.talent.trim())
  parts.push(b.targeting, b.lpCode)
  return parts.join(' - ')
}

function buildAdName(type: AdType, conceptId: string, conceptName: string, v: Variant): string {
  if (type === 'STATIC') {
    return [conceptId, String(v.globalNumber), conceptName, v.hookDesc, 'Static', v.awareness, v.lpCode, v.copyVersion].join(' - ')
  }
  return [conceptId, String(v.globalNumber), conceptName, v.hookDesc, v.hookType, v.awareness, v.lpCode, v.copyVersion, v.duration].join(' - ')
}

// ── Concept ID helpers ────────────────────────────────────────────────────────

const BASE_VIDEO  = /^FSIQ-VIDEO-AD-(\d+)$/
const BASE_STATIC = /^FSIQ-STATIC-AD-(\d+)$/

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

async function computeNextIds(): Promise<{
  nextVideoConceptId:  string
  nextStaticConceptId: string
  nextGlobalNumber:    number
}> {
  const { data } = await supabase
    .from('creative_pipeline')
    .select('ad_id, global_number')

  let maxV = 0, maxS = 0, maxG = 0
  for (const r of data ?? []) {
    const id = (r as { ad_id: string | null }).ad_id ?? ''
    const mv = id.match(BASE_VIDEO);  if (mv) { const n = parseInt(mv[1], 10); if (n > maxV) maxV = n }
    const ms = id.match(BASE_STATIC); if (ms) { const n = parseInt(ms[1], 10); if (n > maxS) maxS = n }
    const g = (r as { global_number: number | null }).global_number
    if (typeof g === 'number' && g > maxG) maxG = g
  }

  return {
    nextVideoConceptId:  `FSIQ-VIDEO-AD-${pad(maxV + 1)}`,
    nextStaticConceptId: `FSIQ-STATIC-AD-${pad(maxS + 1)}`,
    nextGlobalNumber:    maxG + 1,
  }
}

// ── Graph API helpers ────────────────────────────────────────────────────────

function graphAvailable(): boolean {
  try { getGraphToken(); return true } catch { return false }
}

async function graphCreateFolder(parentId: string, name: string): Promise<{ id: string; webUrl: string } | null> {
  try {
    const folder = await createFolderIfMissing(parentId, name)
    if (!folder) return null
    return { id: folder.id, webUrl: folder.webUrl }
  } catch (e) {
    console.warn(`[naming-builder] createFolder "${name}" failed:`, (e as Error).message)
    return null
  }
}

async function getStaticImagesId(): Promise<string | null> {
  const { data } = await supabase
    .from('sharepoint_map')
    .select('sharepoint_item_id')
    .eq('path', STATIC_IMAGES_PATH)
    .maybeSingle()
  return (data as { sharepoint_item_id: string | null } | null)?.sharepoint_item_id ?? null
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action')
  if (action === 'next-ids') {
    const ids = await computeNextIds()
    return NextResponse.json(ids)
  }
  return NextResponse.json({ error: 'Unknown action. Use ?action=next-ids' }, { status: 400 })
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: CreateBody
  try {
    body = (await req.json()) as CreateBody
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  // ── Validation ─────────────────────────────────────────────────────────
  if (!body.type || (body.type !== 'VIDEO' && body.type !== 'STATIC'))
    return NextResponse.json({ success: false, error: 'type must be VIDEO or STATIC' }, { status: 400 })
  if (!body.conceptId?.trim())   return NextResponse.json({ success: false, error: 'conceptId required' }, { status: 400 })
  if (!body.conceptName?.trim()) return NextResponse.json({ success: false, error: 'conceptName required' }, { status: 400 })
  if (!body.adSetToken?.trim())  return NextResponse.json({ success: false, error: 'adSetToken required' }, { status: 400 })
  if (!Array.isArray(body.variants) || body.variants.length === 0)
    return NextResponse.json({ success: false, error: 'At least one variant is required' }, { status: 400 })

  for (const [i, v] of body.variants.entries()) {
    if (!v.hookDesc?.trim()) return NextResponse.json({ success: false, error: `Variant ${i + 1}: hookDesc required` }, { status: 400 })
    if (!v.hookType?.trim()) return NextResponse.json({ success: false, error: `Variant ${i + 1}: hookType required` }, { status: 400 })
    if (!Number.isFinite(v.globalNumber) || v.globalNumber <= 0)
      return NextResponse.json({ success: false, error: `Variant ${i + 1}: globalNumber invalid` }, { status: 400 })
  }

  // Retargeting prefix is reserved — builder must not create AW- IDs.
  if (/FSIQ-(VIDEO|STATIC)-AW-AD-/.test(body.conceptId)) {
    return NextResponse.json(
      { success: false, error: 'Retargeting concept IDs (AW-) cannot be created from the builder.' },
      { status: 400 },
    )
  }

  // ── Build names ───────────────────────────────────────────────────────
  const folderName = buildFolderName(body.conceptId, body.conceptName)
  const adSetName  = buildAdSetName(body)
  const adNames    = body.variants.map(v => buildAdName(body.type, body.conceptId, body.conceptName, v))

  // ── Insert creative_pipeline rows (one per variant) ──────────────────
  // We use upsert keyed on ad_id; if a row already exists for this concept,
  // the first variant updates it and subsequent ones would clash on the unique
  // constraint. The ad_id is unique per concept, so we insert one "primary" row
  // tagged with the first variant's data, then store the remaining variants
  // as separate rows keyed on ad_id + global_number by suffixing the ad_id.
  //
  // Simpler: insert all rows with the same ad_id is impossible (UNIQUE).
  // Instead, store the first variant on the canonical ad_id and additional
  // variants on ad_id + `-v{globalNumber}` so the unique constraint holds.
  const pipelineRows = body.variants.map((v, idx) => ({
    ad_id:            idx === 0 ? body.conceptId : `${body.conceptId}-v${v.globalNumber}`,
    ad_type:          body.type,
    concept_name:     body.conceptName,
    global_number:    v.globalNumber,
    hook_description: v.hookDesc,
    hook_type:        v.hookType,
    awareness_level:  v.awareness,
    lp_code:          v.lpCode,
    funnel:           v.lpCode,
    copy_version:     v.copyVersion,
    duration:         body.type === 'VIDEO' ? v.duration : null,
    ad_set_token:     body.adSetToken,
    targeting:        body.targeting,
    status:           'In Progress',
    is_active:        false,
  }))

  const { error: pipelineErr } = await supabase
    .from('creative_pipeline')
    .upsert(pipelineRows, { onConflict: 'ad_id' })

  if (pipelineErr) {
    return NextResponse.json({ success: false, error: `creative_pipeline upsert failed: ${pipelineErr.message}` }, { status: 500 })
  }

  // ── Insert ad_set_naming row ──────────────────────────────────────────
  const { error: adSetErr } = await supabase
    .from('ad_set_naming')
    .upsert(
      [
        {
          type:              body.type,
          concept_id:        body.conceptId,
          ad_set_token:      body.adSetToken,
          talent:            body.type === 'VIDEO' && body.talent ? body.talent : null,
          targeting:         body.targeting,
          lp_code:           body.lpCode,
          final_ad_set_name: adSetName,
          meta_renamed:      false,
          status:            'active',
        },
      ],
      { onConflict: 'concept_id,final_ad_set_name' },
    )

  if (adSetErr) {
    return NextResponse.json({ success: false, error: `ad_set_naming insert failed: ${adSetErr.message}` }, { status: 500 })
  }

  // ── SharePoint folder creation (best-effort) ─────────────────────────
  let sharepointLink: string | null = null
  let folderCreatedNote: string | null = null

  if (graphAvailable()) {
    try {
      const parentId = body.type === 'VIDEO' ? VIDEO_CREATIVES_ID : await getStaticImagesId()
      const parentPath = body.type === 'VIDEO' ? VIDEO_CREATIVES_PATH : STATIC_IMAGES_PATH

      if (!parentId) {
        folderCreatedNote = 'Parent folder ID unknown; skipped SharePoint creation.'
      } else {
        const folder = await graphCreateFolder(parentId, folderName)
        if (folder) {
          sharepointLink = folder.webUrl
          await upsertItem({
            path: `${parentPath}/${folderName}`,
            item_type: 'folder',
            parent_path: parentPath,
            sharepoint_item_id: folder.id,
            display_name: folderName,
            expected_name: null,
            naming_valid: true,
            agent_owner: 'paid-media',
            last_verified_at: new Date().toISOString(),
          })
          // Create the three required subfolders
          for (const sub of REQUIRED_SUBFOLDERS) {
            const child = await graphCreateFolder(folder.id, sub)
            if (child) {
              await upsertItem({
                path: `${parentPath}/${folderName}/${sub}`,
                item_type: 'folder',
                parent_path: `${parentPath}/${folderName}`,
                sharepoint_item_id: child.id,
                display_name: sub,
                expected_name: null,
                naming_valid: true,
                agent_owner: 'paid-media',
                last_verified_at: new Date().toISOString(),
              })
            }
          }
        } else {
          folderCreatedNote = 'SharePoint folder already exists or could not be created.'
        }
      }
    } catch (e) {
      console.error('[naming-builder] SharePoint creation failed:', e)
      folderCreatedNote = `SharePoint creation error: ${(e as Error).message}`
    }
  } else {
    folderCreatedNote = 'MICROSOFT_REFRESH_TOKEN not set — SharePoint folder not created.'
  }

  // ── Slack notification ───────────────────────────────────────────────
  try {
    const channel = process.env.SLACK_CHANNEL_MEDIA_BUYING
    if (channel && process.env.SLACK_BOT_TOKEN) {
      const blocks: KnownBlock[] = [
        { type: 'header', text: { type: 'plain_text', text: '🆕 New Concept Created', emoji: true } },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Concept*\n\`${folderName}\`` },
            { type: 'mrkdwn', text: `*Ad Set*\n\`${adSetName}\`` },
            { type: 'mrkdwn', text: `*Type*\n${body.type}` },
            { type: 'mrkdwn', text: `*Variants*\n${body.variants.length}` },
          ],
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Ads:*\n${adNames.map(n => `• \`${n}\``).join('\n')}` },
        },
        ...(sharepointLink
          ? ([{ type: 'section', text: { type: 'mrkdwn', text: `<${sharepointLink}|Open in SharePoint>` } }] as KnownBlock[])
          : []),
        ...(folderCreatedNote
          ? ([{ type: 'context', elements: [{ type: 'mrkdwn', text: folderCreatedNote }] }] as KnownBlock[])
          : []),
      ]
      await sendBlocks(channel, blocks, `New concept created: ${folderName}`)
    }
  } catch (e) {
    console.warn('[naming-builder] Slack notification failed:', (e as Error).message)
  }

  return NextResponse.json({
    success: true,
    folderName,
    adSetName,
    adNames,
    sharepointLink,
    note: folderCreatedNote,
  })
}
