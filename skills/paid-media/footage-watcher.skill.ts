// footage-watcher.skill.ts
// Watches SharePoint Video Creatives folder hourly for new video files in /Raw Footage/ subfolders.
// For each newly detected file:
//   1. Inserts a row into footage_log (status='new')
//   2. Posts to #video-editor with file details + concept info
//   3. Triggers nomenclature-updater if the concept folder has no AD number yet
// Logs to skill_runs on completion.
// SOPs: video-review-qa-framework.md (via AGENTS.md pairing rule)
// Schedule: hourly via Vercel cron

import fs from 'fs'
import path from 'path'
import { supabase } from '../../lib/supabase'
import { sendBlocks } from '../../lib/slack'
import { getGraphToken, graphBase } from '../../lib/graph'
import type { KnownBlock } from '@slack/web-api'

const sop = fs.readFileSync(
  path.join(process.cwd(), 'sops', 'video-review-qa-framework.md'),
  'utf-8',
)
void sop

// ── Constants ─────────────────────────────────────────────────────────────────

const VIDEO_CREATIVES_ID   = '015MT6T5FZ6MOQJBXMABF3DUNIQW6BQ5ON'
const VIDEO_CREATIVES_PATH = 'Sales & Marketing/Marketing/Ad Campaigns/Ad Creatives/Video Creatives'

// File extensions treated as raw video footage
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mxf', '.m4v', '.mkv', '.wmv', '.webm'])

// A concept folder is named correctly when it matches the AD-number pattern
const CONCEPT_ID_PATTERN = /^(FSIQ-VIDEO-AD-\d{2,}[a-z]?)\s*-/

// ── Types ─────────────────────────────────────────────────────────────────────

interface GraphItem {
  id: string
  name: string
  size?: number
  webUrl: string
  folder?: object
  file?: object
  lastModifiedDateTime: string
}

export interface FootageWatcherOutput {
  concepts_scanned: number
  new_files_detected: number
  new_file_ids: string[]
  nomenclature_triggers: string[]
  graph_available: boolean
}

// ── Graph helpers ─────────────────────────────────────────────────────────────

async function graphGet<T>(urlPath: string): Promise<T> {
  const token = await getGraphToken()
  const res = await fetch(`${graphBase()}${urlPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Graph GET ${urlPath} → ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

async function listChildren(itemId: string): Promise<GraphItem[]> {
  const items: GraphItem[] = []
  let urlPath: string | null =
    `/items/${itemId}/children?$select=id,name,size,webUrl,folder,file,lastModifiedDateTime&$top=200`

  while (urlPath) {
    type Page = { value: GraphItem[]; '@odata.nextLink'?: string }
    const page: Page = await graphGet<Page>(urlPath)
    items.push(...page.value)
    const next: string | undefined = page['@odata.nextLink']
    urlPath = next ? next.replace(graphBase(), '') : null
  }
  return items
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isVideoFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase()
  return VIDEO_EXTENSIONS.has(ext)
}

function extractConceptId(folderName: string): string | null {
  const match = folderName.match(CONCEPT_ID_PATTERN)
  return match ? match[1] : null
}

function needsNomenclature(folderName: string): boolean {
  return extractConceptId(folderName) === null
}

// ── Known file IDs — fetch once to deduplicate ────────────────────────────────

async function getKnownItemIds(): Promise<Set<string>> {
  const { data } = await supabase
    .from('footage_log')
    .select('sharepoint_item_id')
    .not('sharepoint_item_id', 'is', null)
  return new Set((data ?? []).map(r => r.sharepoint_item_id as string).filter(Boolean))
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function run(): Promise<FootageWatcherOutput> {
  const startedAt = new Date().toISOString()

  // 1. Verify Graph is available
  let graphAvailable = false
  try {
    await getGraphToken()
    graphAvailable = true
  } catch (err) {
    console.warn('[footage-watcher] Graph API unavailable:', (err as Error).message)
    await supabase.from('skill_runs').insert({
      agent: 'paid-media',
      skill: 'footage-watcher',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status: 'skipped',
      output_summary: { reason: 'Graph API unavailable', graph_available: false },
    })
    return { concepts_scanned: 0, new_files_detected: 0, new_file_ids: [], nomenclature_triggers: [], graph_available: false }
  }

  // 2. Load already-known SharePoint item IDs to detect only new files
  const knownIds = await getKnownItemIds()

  // 3. List all concept folders in Video Creatives
  let conceptFolders: GraphItem[]
  try {
    const all = await listChildren(VIDEO_CREATIVES_ID)
    conceptFolders = all.filter(item => item.folder !== undefined)
  } catch (err) {
    console.error('[footage-watcher] Failed to list Video Creatives:', (err as Error).message)
    throw err
  }

  const newFileIds: string[]         = []
  const nomenclatureTriggers: string[] = []

  // 4. Walk each concept folder's /Raw Footage/ subfolder
  for (const concept of conceptFolders) {
    const conceptPath = `${VIDEO_CREATIVES_PATH}/${concept.name}`

    // Find the Raw Footage subfolder
    let subfolders: GraphItem[]
    try {
      subfolders = await listChildren(concept.id)
    } catch {
      console.warn(`[footage-watcher] Could not list children of "${concept.name}" — skipping`)
      continue
    }

    const rawFootageFolder = subfolders.find(
      s => s.folder !== undefined && s.name.toLowerCase() === 'raw footage',
    )
    if (!rawFootageFolder) continue

    const rawFootagePath = `${conceptPath}/Raw Footage`

    // List files in Raw Footage
    let files: GraphItem[]
    try {
      const children = await listChildren(rawFootageFolder.id)
      files = children.filter(item => item.file !== undefined && isVideoFile(item.name))
    } catch {
      console.warn(`[footage-watcher] Could not read Raw Footage for "${concept.name}" — skipping`)
      continue
    }

    if (files.length === 0) continue

    const conceptId = extractConceptId(concept.name)

    // 5. For each video file, check if it's new
    for (const file of files) {
      if (knownIds.has(file.id)) continue  // already tracked

      // Insert into footage_log
      const { data: row, error: insertError } = await supabase
        .from('footage_log')
        .insert({
          ad_id:               conceptId,
          concept_folder:      concept.name,
          file_name:           file.name,
          sharepoint_item_id:  file.id,
          raw_file_path:       `${rawFootagePath}/${file.name}`,
          status:              'new',
          detected_at:         new Date().toISOString(),
        })
        .select('id')
        .single()

      if (insertError) {
        if (insertError.code === '23505') {
          // Unique constraint — already inserted by a concurrent run
          continue
        }
        console.error(`[footage-watcher] Insert failed for "${file.name}":`, insertError.message)
        continue
      }

      knownIds.add(file.id)
      newFileIds.push(row.id as string)

      // 6. Post to #video-editor for each new file
      const conceptLabel = conceptId ?? concept.name
      const blocks: KnownBlock[] = [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🎬 New Raw Footage Detected', emoji: true },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Concept*\n${conceptLabel}` },
            { type: 'mrkdwn', text: `*Folder*\n${concept.name}` },
          ],
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*File*\n\`${file.name}\`` },
            { type: 'mrkdwn', text: `*Size*\n${file.size ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : 'unknown'}` },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: needsNomenclature(concept.name)
              ? `⚠️ *No AD number assigned yet* — nomenclature-updater will assign one.\n<${file.webUrl}|View in SharePoint>`
              : `✅ *Concept ID:* \`${conceptId}\`\n<${file.webUrl}|View in SharePoint>`,
          },
        },
        {
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: `footage_log.id: \`${row.id}\`  ·  detected ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
          }],
        },
      ]

      await sendBlocks(
        'videoEditor',
        blocks as never[],
        `🎬 New footage: ${file.name} (${conceptLabel})`,
      )

      // 7. Flag for nomenclature-updater if folder has no AD number
      if (needsNomenclature(concept.name) && !nomenclatureTriggers.includes(concept.id)) {
        nomenclatureTriggers.push(concept.id)
      }
    }
  }

  // 8. Trigger nomenclature-updater for any unnamed concept folders with new footage.
  // Dynamic import — skill may not exist yet during incremental build; failure is non-fatal.
  if (nomenclatureTriggers.length > 0) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports
      const mod: any = require('./nomenclature-updater.skill')
      for (const folderId of nomenclatureTriggers) {
        await mod.run({ conceptFolderId: folderId })
      }
    } catch (err) {
      console.warn('[footage-watcher] nomenclature-updater not available:', (err as Error).message)
    }
  }

  // 9. Log to skill_runs
  await supabase.from('skill_runs').insert({
    agent:        'paid-media',
    skill:        'footage-watcher',
    started_at:   startedAt,
    completed_at: new Date().toISOString(),
    status:       'success',
    output_summary: {
      concepts_scanned:      conceptFolders.length,
      new_files_detected:    newFileIds.length,
      new_file_ids:          newFileIds,
      nomenclature_triggers: nomenclatureTriggers.length,
      graph_available:       true,
    },
  })

  return {
    concepts_scanned:      conceptFolders.length,
    new_files_detected:    newFileIds.length,
    new_file_ids:          newFileIds,
    nomenclature_triggers: nomenclatureTriggers,
    graph_available:       true,
  }
}
