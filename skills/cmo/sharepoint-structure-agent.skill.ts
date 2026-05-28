// Skill — SharePoint Structure Agent
// Walks Marketing/Ad Campaigns/Ad Creatives/{Video Creatives,Static Images} via Graph API.
// Upserts discovered folders into sharepoint_map, flags naming violations, alerts #assistant.
// Validates required subfolders (/Campaign Brief/, /Raw Footage/, /Final/) per concept folder.
// Schedule: every 6h via Vercel cron.

import fs from 'fs'
import path from 'path'
import { supabase } from '../../lib/supabase'
import { sendBlocks } from '../../lib/slack'
import { upsertItem } from '../../lib/sharepoint-map'
import { getGraphToken, graphBase } from '../../lib/graph'
import type { KnownBlock } from '@slack/web-api'

const sop = fs.readFileSync(
  path.join(process.cwd(), 'sops', 'cmo-orchestrator-sop.md'),
  'utf-8'
)
void sop

// ── Constants ────────────────────────────────────────────────────────────────

const DRIVE_ID   = 'b!SoPMe2KqFU2BkUmHhH8qFTOqNnh1p1BPuxbMZNe-MrqxmzKSNvU8TI-0UrHfUjC_'

const VIDEO_CREATIVES_ID  = '015MT6T5FZ6MOQJBXMABF3DUNIQW6BQ5ON'
const STATIC_IMAGES_ID    = ''

const VIDEO_CREATIVES_PATH = 'Sales & Marketing/Marketing/Ad Campaigns/Ad Creatives/Video Creatives'
const STATIC_IMAGES_PATH   = 'Sales & Marketing/Marketing/Ad Campaigns/Ad Creatives/Static Images'

const REQUIRED_SUBFOLDERS = ['Campaign Brief', 'Raw Footage', 'Final']

// ── Types ─────────────────────────────────────────────────────────────────────

type GraphFolder = {
  id: string
  name: string
  lastModifiedDateTime: string
  folder?: object
}

type ViolationRow = {
  name: string
  path: string
  expected_name: string
  violation_type: 'naming' | 'missing_subfolder'
}

export type SkillOutput = {
  video_folders_scanned: number
  static_folders_scanned: number
  violations: ViolationRow[]
  subfolders_created: number
  graph_available: boolean
}

// ── Graph API helpers ─────────────────────────────────────────────────────────

async function graphRequest(url: string): Promise<unknown> {
  const token = await getGraphToken()
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Graph API ${res.status}: ${await res.text()}`)
  return res.json()
}

async function listFolderChildren(itemId: string): Promise<GraphFolder[]> {
  const url = `${graphBase()}/items/${itemId}/children?$filter=folder ne null&$select=id,name,lastModifiedDateTime,folder&$top=200`
  const json = await graphRequest(url) as { value: GraphFolder[] }
  return json.value ?? []
}

async function createSubfolder(parentId: string, folderName: string): Promise<string | null> {
  const token = await getGraphToken()
  const url = `${graphBase()}/items/${parentId}/children`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
  })
  if (!res.ok) {
    if (res.status === 409) return null // already exists
    console.warn(`[sharepoint-structure-agent] createSubfolder "${folderName}" failed: ${res.status}`)
    return null
  }
  const data = await res.json() as { id: string }
  return data.id
}

// ── Naming validation — uses sharepoint_map.expected_name as authority ────────
// The Creative Tracker (via pending_renames / sharepoint_map) is the authoritative
// source for expected folder names. Regex is only the fallback when no DB row exists.

const VIDEO_AD_PATTERN  = /^FSIQ-VIDEO-AD-\d{2,}[a-z]?\s*-/
const STATIC_AD_PATTERN = /^FSIQ-STATIC-AD-\d{2,}[a-z]?\s*-/

async function buildExpectedNameMap(parentPath: string): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('sharepoint_map')
    .select('display_name, expected_name')
    .eq('parent_path', parentPath)
    .not('expected_name', 'is', null)

  const map = new Map<string, string>()
  for (const row of data ?? []) {
    map.set(row.display_name, row.expected_name)
  }
  return map
}

function isNamingValid(name: string, type: 'video' | 'static', expectedMap: Map<string, string>): boolean {
  if (expectedMap.has(name)) return false // DB says there's an expected (different) name
  const pattern = type === 'video' ? VIDEO_AD_PATTERN : STATIC_AD_PATTERN
  return pattern.test(name)
}

function resolveExpectedName(name: string, type: 'video' | 'static', expectedMap: Map<string, string>): string {
  if (expectedMap.has(name)) return expectedMap.get(name)!
  const numMatch = name.match(/(\d+)/)
  const num = numMatch ? String(parseInt(numMatch[1])).padStart(2, '0') : 'XX'
  return type === 'video' ? `FSIQ-VIDEO-AD-${num} - ${name}` : `FSIQ-STATIC-AD-${num} - ${name}`
}

// ── Subfolder validation ──────────────────────────────────────────────────────

async function validateSubfolders(
  folder: GraphFolder,
  folderPath: string,
  violations: ViolationRow[],
  subfoldersCreated: { count: number },
): Promise<void> {
  // Only validate/create subfolders for correctly-named concept folders
  const children = await listFolderChildren(folder.id)
  const childNames = new Set(children.map(c => c.name))

  for (const sub of REQUIRED_SUBFOLDERS) {
    if (!childNames.has(sub)) {
      violations.push({
        name: `${folder.name} / ${sub}`,
        path: `${folderPath}/${sub}`,
        expected_name: sub,
        violation_type: 'missing_subfolder',
      })
      // Create the missing subfolder
      const newId = await createSubfolder(folder.id, sub)
      if (newId) {
        subfoldersCreated.count++
        await upsertItem({
          path: `${folderPath}/${sub}`,
          item_type: 'folder',
          parent_path: folderPath,
          sharepoint_item_id: newId,
          display_name: sub,
          expected_name: null,
          naming_valid: true,
          agent_owner: 'paid-media',
          last_verified_at: new Date().toISOString(),
        })
      }
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function run(): Promise<SkillOutput> {
  const startedAt = new Date().toISOString()
  const assistantChannel = process.env.SLACK_CHANNEL_ASSISTANT ?? ''

  let graphAvailable = false
  try { getGraphToken(); graphAvailable = true } catch { /* no token configured */ }

  let videoFolders: GraphFolder[] = []
  let staticFolders: GraphFolder[] = []

  if (graphAvailable) {
    try {
      videoFolders  = await listFolderChildren(VIDEO_CREATIVES_ID)
    } catch (e) {
      console.error('[sharepoint-structure-agent] Graph walk failed (video):', (e as Error).message)
    }

    const { data: staticRow } = await supabase
      .from('sharepoint_map')
      .select('sharepoint_item_id')
      .eq('path', STATIC_IMAGES_PATH)
      .single()

    const staticId = (staticRow as { sharepoint_item_id: string | null } | null)?.sharepoint_item_id ?? STATIC_IMAGES_ID
    if (staticId) {
      try {
        staticFolders = await listFolderChildren(staticId)
      } catch (e) {
        console.error('[sharepoint-structure-agent] Graph walk failed (static):', (e as Error).message)
      }
    }
  } else {
    const { data: videoRows } = await supabase
      .from('sharepoint_map')
      .select('sharepoint_item_id, display_name, last_verified_at')
      .eq('parent_path', VIDEO_CREATIVES_PATH)

    const { data: staticRows } = await supabase
      .from('sharepoint_map')
      .select('sharepoint_item_id, display_name, last_verified_at')
      .eq('parent_path', STATIC_IMAGES_PATH)

    videoFolders  = (videoRows  ?? []).map(r => ({ id: r.sharepoint_item_id ?? '', name: r.display_name, lastModifiedDateTime: r.last_verified_at, folder: {} }))
    staticFolders = (staticRows ?? []).map(r => ({ id: r.sharepoint_item_id ?? '', name: r.display_name, lastModifiedDateTime: r.last_verified_at, folder: {} }))
  }

  // Load expected_name maps from DB — tracker is the authority, not regex alone
  const [videoExpectedMap, staticExpectedMap] = await Promise.all([
    buildExpectedNameMap(VIDEO_CREATIVES_PATH),
    buildExpectedNameMap(STATIC_IMAGES_PATH),
  ])

  const violations: ViolationRow[] = []
  const subfoldersCreated = { count: 0 }

  // Process video concept folders
  for (const f of videoFolders) {
    const folderPath = `${VIDEO_CREATIVES_PATH}/${f.name}`
    const namingValid = isNamingValid(f.name, 'video', videoExpectedMap)
    const expName = namingValid ? null : resolveExpectedName(f.name, 'video', videoExpectedMap)

    if (!namingValid) {
      violations.push({ name: f.name, path: folderPath, expected_name: expName!, violation_type: 'naming' })
    }

    await upsertItem({
      path: folderPath,
      item_type: 'folder',
      parent_path: VIDEO_CREATIVES_PATH,
      sharepoint_item_id: f.id || null,
      display_name: f.name,
      expected_name: expName,
      naming_valid: namingValid,
      agent_owner: 'paid-media',
      last_verified_at: new Date().toISOString(),
    })

    // Validate required subfolders — only for correctly-named folders
    if (namingValid && graphAvailable && f.id) {
      await validateSubfolders(f, folderPath, violations, subfoldersCreated)
    }
  }

  // Process static image folders
  for (const f of staticFolders) {
    const folderPath = `${STATIC_IMAGES_PATH}/${f.name}`
    const namingValid = isNamingValid(f.name, 'static', staticExpectedMap)
    const expName = namingValid ? null : resolveExpectedName(f.name, 'static', staticExpectedMap)

    if (!namingValid) {
      violations.push({ name: f.name, path: folderPath, expected_name: expName!, violation_type: 'naming' })
    }

    await upsertItem({
      path: folderPath,
      item_type: 'folder',
      parent_path: STATIC_IMAGES_PATH,
      sharepoint_item_id: f.id || null,
      display_name: f.name,
      expected_name: expName,
      naming_valid: namingValid,
      agent_owner: 'paid-media',
      last_verified_at: new Date().toISOString(),
    })

    if (namingValid && graphAvailable && f.id) {
      await validateSubfolders(f, folderPath, violations, subfoldersCreated)
    }
  }

  const namingViolations = violations.filter(v => v.violation_type === 'naming')
  const subfolderViolations = violations.filter(v => v.violation_type === 'missing_subfolder')

  // Post to #assistant (never #operations)
  if (assistantChannel && violations.length > 0) {
    const namingLines = namingViolations
      .slice(0, 15)
      .map(v => `• *${v.name}*\n  → \`${v.expected_name}\``)
      .join('\n')

    const subfolderLines = subfolderViolations
      .slice(0, 10)
      .map(v => `• \`${v.path}\``)
      .join('\n')

    const blocks: KnownBlock[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🗂 SharePoint Structure Audit' },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Video scanned*\n${videoFolders.length}` },
          { type: 'mrkdwn', text: `*Static scanned*\n${staticFolders.length}` },
          { type: 'mrkdwn', text: `*Naming violations*\n${namingViolations.length}` },
          { type: 'mrkdwn', text: `*Missing subfolders*\n${subfolderViolations.length} (${subfoldersCreated.count} created)` },
        ],
      },
    ]

    if (namingViolations.length > 0) {
      const more = namingViolations.length > 15 ? ` (+${namingViolations.length - 15} more)` : ''
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*Naming violations${more}:*\n${namingLines}` },
      })
    }

    if (subfolderViolations.length > 0) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*Missing subfolders (auto-created where possible):*\n${subfolderLines}` },
      })
    }

    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Checked at ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT · Graph: ${graphAvailable ? '✅ live' : '⚠️ cached'}` }],
    })

    await sendBlocks(assistantChannel, blocks, `SharePoint Audit — ${namingViolations.length} naming + ${subfolderViolations.length} subfolder violations`)
  } else if (assistantChannel && violations.length === 0) {
    await sendBlocks(assistantChannel, [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `✅ *SharePoint Structure Audit* — all ${videoFolders.length + staticFolders.length} folders pass naming validation and have required subfolders.` },
      },
    ] as KnownBlock[], 'SharePoint Structure Audit — all folders valid')
  }

  await supabase.from('skill_runs').insert({
    agent: 'cmo',
    skill: 'sharepoint-structure-agent',
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    status: 'success',
    output_summary: {
      video_folders: videoFolders.length,
      static_folders: staticFolders.length,
      naming_violations: namingViolations.length,
      subfolder_violations: subfolderViolations.length,
      subfolders_created: subfoldersCreated.count,
      graph_available: graphAvailable,
    },
  })

  return {
    video_folders_scanned: videoFolders.length,
    static_folders_scanned: staticFolders.length,
    violations,
    subfolders_created: subfoldersCreated.count,
    graph_available: graphAvailable,
  }
}
