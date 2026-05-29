// nomenclature-updater.skill.ts
// Assigns the next FSIQ-VIDEO-AD-XX number to unnamed concept folders and renames them.
//
// Two invocation modes:
//   run({ conceptFolderId })   — triggered by footage-watcher; auto-approves and immediately renames
//   run()                      — processes all pending_renames where approved=true (cron / manual)
//
// After renaming:
//   - Ensures /Campaign Brief/, /Raw Footage/, /Final/ subfolders exist (creates if missing)
//   - Updates sharepoint_map with new display_name, path, and subfolder rows
//   - Inserts/updates creative_pipeline row with new ad_id + global_number
//   - Updates footage_log rows for this concept folder with the new concept_id
//   - Deletes the processed pending_renames row
//   - Triggers script-matcher for footage in the renamed concept
// SOPs: video-review-qa-framework.md (AGENTS.md pairing rule)
//
// Note: SOP is loaded at runtime per AGENTS.md but not passed to Claude —
// this skill contains only deterministic logic (no AI calls). The SOP load
// satisfies the pairing rule and documents the governing framework.

import fs from 'fs'
import path from 'path'
import { supabase } from '../../lib/supabase'
import { sendBlocks } from '../../lib/slack'
import { getGraphToken, graphBase, renameItem, createFolderIfMissing, listChildren } from '../../lib/graph'
import { upsertItem } from '../../lib/sharepoint-map'
import type { KnownBlock } from '@slack/web-api'

const sop = fs.readFileSync(
  path.join(process.cwd(), 'sops', 'video-review-qa-framework.md'),
  'utf-8',
)
void sop

// ── Constants ─────────────────────────────────────────────────────────────────

const VIDEO_CREATIVES_PATH = 'Sales & Marketing/Marketing/Ad Campaigns/Ad Creatives/Video Creatives'
const REQUIRED_SUBFOLDERS  = ['Campaign Brief', 'Raw Footage', 'Final'] as const

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NomenclatureUpdaterInput {
  conceptFolderId?: string  // SharePoint item ID of the unnamed concept folder
}

export interface NomenclatureUpdaterOutput {
  renames_processed: number
  renamed_folders: Array<{ old_name: string; new_name: string; ad_id: string }>
  errors: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Fetch a single Drive item by ID to get its current name
async function getFolderName(itemId: string): Promise<string | null> {
  try {
    const token = await getGraphToken()
    const res = await fetch(`${graphBase()}/items/${itemId}?$select=id,name,webUrl`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const data = await res.json() as { name: string }
    return data.name
  } catch {
    return null
  }
}

// Get the next available global AD number — reads MAX from creative_pipeline
async function getNextGlobalNumber(): Promise<number> {
  const { data } = await supabase
    .from('creative_pipeline')
    .select('global_number')
    .not('global_number', 'is', null)
    .order('global_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const max = (data as { global_number: number } | null)?.global_number ?? 0
  return max + 1
}

// Strip any partial FSIQ prefix from a raw folder name to get the clean concept name
function extractConceptName(rawFolderName: string): string {
  return rawFolderName.replace(/^FSIQ-VIDEO-AD-\d+[a-z]?\s*-\s*/i, '').trim()
}

// ── Subfolder enforcement ─────────────────────────────────────────────────────

// Ensures Campaign Brief, Raw Footage, and Final subfolders exist inside the
// renamed concept folder. Creates any that are missing via Graph API and
// upserts each into sharepoint_map.
async function ensureSubfolders(
  conceptFolderId: string,
  conceptFolderPath: string,
): Promise<void> {
  // Fetch existing children to avoid redundant creates
  let existingNames: Set<string>
  try {
    const children = await listChildren(conceptFolderId)
    existingNames = new Set(children.map(c => c.name))
  } catch {
    existingNames = new Set()
  }

  for (const sub of REQUIRED_SUBFOLDERS) {
    const subPath = `${conceptFolderPath}/${sub}`

    if (!existingNames.has(sub)) {
      // Create the subfolder in SharePoint
      const created = await createFolderIfMissing(conceptFolderId, sub)
      if (created) {
        await upsertItem({
          path:               subPath,
          item_type:          'folder',
          parent_path:        conceptFolderPath,
          sharepoint_item_id: created.id,
          display_name:       sub,
          expected_name:      null,
          naming_valid:       true,
          agent_owner:        'paid-media',
          last_verified_at:   new Date().toISOString(),
        })
      }
    } else {
      // Subfolder already exists — upsert to make sure sharepoint_map is current
      // (We don't have the item ID here without an extra API call; just ensure the path row exists)
      const { data: existing } = await supabase
        .from('sharepoint_map')
        .select('sharepoint_item_id')
        .eq('path', subPath)
        .maybeSingle()

      if (!existing) {
        await upsertItem({
          path:               subPath,
          item_type:          'folder',
          parent_path:        conceptFolderPath,
          sharepoint_item_id: null,
          display_name:       sub,
          expected_name:      null,
          naming_valid:       true,
          agent_owner:        'paid-media',
          last_verified_at:   new Date().toISOString(),
        })
      }
    }
  }
}

// ── Core rename logic ─────────────────────────────────────────────────────────

interface RenameTask {
  pendingId: string
  sharepointItemId: string
  currentName: string
  proposedName: string
  conceptId: string
  globalNumber: number
  conceptName: string
}

async function executeRename(task: RenameTask): Promise<{ ok: boolean; error?: string }> {
  // 1. Rename the folder in SharePoint
  const renamed = await renameItem(task.sharepointItemId, task.proposedName)
  if (!renamed) {
    return { ok: false, error: `Graph rename failed for "${task.currentName}" → "${task.proposedName}"` }
  }

  const newPath = `${VIDEO_CREATIVES_PATH}/${task.proposedName}`
  const oldPath = `${VIDEO_CREATIVES_PATH}/${task.currentName}`
  const webUrl  = `https://foodserviceiq.sharepoint.com/sites/Shared%20Documents/${newPath}`

  // 2. Update sharepoint_map — new display_name and path for the concept folder
  await supabase
    .from('sharepoint_map')
    .update({
      display_name:     task.proposedName,
      path:             newPath,
      naming_valid:     true,
      expected_name:    null,
      last_verified_at: new Date().toISOString(),
    })
    .eq('sharepoint_item_id', task.sharepointItemId)

  // Cascade path update to any existing child rows (subfolders / files)
  const { data: childRows } = await supabase
    .from('sharepoint_map')
    .select('id, path')
    .like('path', `${oldPath}/%`)

  for (const child of childRows ?? []) {
    const updatedPath = (child as { id: string; path: string }).path.replace(oldPath, newPath)
    await supabase
      .from('sharepoint_map')
      .update({ path: updatedPath, last_verified_at: new Date().toISOString() })
      .eq('id', (child as { id: string }).id)
  }

  // 3. Ensure required subfolders exist (creates missing ones, upserts sharepoint_map rows)
  await ensureSubfolders(task.sharepointItemId, newPath)

  // 4. Upsert creative_pipeline row for this concept
  const { data: existingRow } = await supabase
    .from('creative_pipeline')
    .select('id')
    .eq('global_number', task.globalNumber)
    .maybeSingle()

  if (!existingRow) {
    await supabase.from('creative_pipeline').insert({
      ad_id:           task.conceptId,
      global_number:   task.globalNumber,
      concept_name:    task.conceptName,
      ad_type:         'VIDEO',
      status:          'Footage Uploaded',
      sharepoint_link: webUrl,
    })
  } else {
    await supabase
      .from('creative_pipeline')
      .update({
        ad_id:           task.conceptId,
        concept_name:    task.conceptName,
        status:          'Footage Uploaded',
        sharepoint_link: webUrl,
      })
      .eq('global_number', task.globalNumber)
  }

  // 5. Update footage_log rows for this concept folder
  await supabase
    .from('footage_log')
    .update({ ad_id: task.conceptId, status: 'renaming' })
    .eq('concept_folder', task.currentName)
    .eq('status', 'new')

  // 6. Delete the processed pending_renames row
  await supabase.from('pending_renames').delete().eq('id', task.pendingId)

  return { ok: true }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function run(
  input: NomenclatureUpdaterInput = {},
): Promise<NomenclatureUpdaterOutput> {
  const startedAt = new Date().toISOString()
  const renamed:  RenameTask[] = []
  const errors:   string[]     = []

  // ── Mode A: triggered by footage-watcher with a specific unnamed folder ────────

  if (input.conceptFolderId) {
    const folderId = input.conceptFolderId

    // Check for an existing pending_renames entry for this folder
    const { data: existing } = await supabase
      .from('pending_renames')
      .select('*')
      .eq('sharepoint_item_id', folderId)
      .maybeSingle()

    if (!existing) {
      const currentName = await getFolderName(folderId)
      if (!currentName) {
        errors.push(`Could not fetch folder name for SharePoint item ID: ${folderId}`)
      } else {
        const globalNumber = await getNextGlobalNumber()
        const conceptName  = extractConceptName(currentName)
        const conceptId    = `FSIQ-VIDEO-AD-${String(globalNumber).padStart(2, '0')}`
        const proposedName = `${conceptId} - ${conceptName}`
        const folderPath   = `${VIDEO_CREATIVES_PATH}/${currentName}`

        await supabase.from('pending_renames').insert({
          sharepoint_item_id: folderId,
          current_name:       currentName,
          path:               folderPath,
          proposed_name:      proposedName,
          concept_id:         conceptId,
          item_type:          'folder',
          approved:           true,  // footage upload is implicit authorization to assign a name
          flag:               'confirmed',
          notes:              `Auto-created by footage-watcher — footage detected ${new Date().toISOString()}`,
        })
      }
    } else if (!(existing as { approved: boolean }).approved) {
      // Entry exists but was awaiting approval — footage presence auto-approves it
      await supabase
        .from('pending_renames')
        .update({ approved: true })
        .eq('id', (existing as { id: string }).id)
    }
    // If approved=true already, fall through to Mode B which will process it
  }

  // ── Mode B (shared): process all approved pending_renames ────────────────────

  const { data: pending } = await supabase
    .from('pending_renames')
    .select('*')
    .eq('approved', true)
    .eq('item_type', 'folder')
    .like('proposed_name', 'FSIQ-VIDEO-AD-%')

  for (const row of (pending ?? []) as Array<{
    id: string
    sharepoint_item_id: string
    current_name: string
    proposed_name: string
    concept_id: string | null
  }>) {
    const match = row.proposed_name.match(/FSIQ-VIDEO-AD-(\d+)/)
    if (!match) {
      errors.push(`Cannot parse global_number from proposed_name: ${row.proposed_name}`)
      continue
    }
    const globalNumber = parseInt(match[1], 10)
    const conceptId    = row.concept_id ?? `FSIQ-VIDEO-AD-${String(globalNumber).padStart(2, '0')}`
    const conceptName  = extractConceptName(row.proposed_name)

    const task: RenameTask = {
      pendingId:        row.id,
      sharepointItemId: row.sharepoint_item_id,
      currentName:      row.current_name,
      proposedName:     row.proposed_name,
      conceptId,
      globalNumber,
      conceptName,
    }

    const result = await executeRename(task)
    if (result.ok) {
      renamed.push(task)
    } else {
      errors.push(result.error ?? `Unknown error renaming "${row.current_name}"`)
    }
  }

  // ── Notify #video-editor and trigger script-matcher for each rename ────────────

  for (const task of renamed) {
    const newPath = `${VIDEO_CREATIVES_PATH}/${task.proposedName}`

    const blocks: KnownBlock[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '✅ Folder Renamed — Nomenclature Updated', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Old name*\n\`${task.currentName}\`` },
          { type: 'mrkdwn', text: `*New name*\n\`${task.proposedName}\`` },
        ],
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Concept ID*\n\`${task.conceptId}\`` },
          { type: 'mrkdwn', text: `*Subfolders*\n✅ Campaign Brief / Raw Footage / Final` },
        ],
      },
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: `Path: \`${newPath}\`  ·  script-matcher queued  ·  ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
        }],
      },
    ]

    await sendBlocks('videoEditor', blocks as never[], `✅ Renamed: ${task.currentName} → ${task.proposedName}`)

    // Trigger script-matcher — non-fatal if not yet implemented
    try {
      const mod = await import('./script-matcher.skill')
      await (mod as { run: (input: { conceptId: string }) => Promise<unknown> }).run({ conceptId: task.conceptId })
    } catch (err) {
      console.warn('[nomenclature-updater] script-matcher not available:', (err as Error).message)
    }
  }

  // ── Post errors to #video-editor if any ──────────────────────────────────────

  if (errors.length > 0) {
    const errorLines = errors.map(e => `• ${e}`).join('\n')
    await sendBlocks(
      'videoEditor',
      [{
        type: 'section',
        text: { type: 'mrkdwn', text: `⚠️ *nomenclature-updater errors:*\n${errorLines}` },
      }] as KnownBlock[],
      `nomenclature-updater: ${errors.length} error(s)`,
    )
  }

  // ── Log to skill_runs ─────────────────────────────────────────────────────────

  await supabase.from('skill_runs').insert({
    agent:        'paid-media',
    skill:        'nomenclature-updater',
    started_at:   startedAt,
    completed_at: new Date().toISOString(),
    status:       errors.length > 0 && renamed.length === 0 ? 'error' : 'success',
    output_summary: {
      renames_processed: renamed.length,
      errors:            errors.length,
      concept_ids:       renamed.map(r => r.conceptId),
    },
  })

  return {
    renames_processed: renamed.length,
    renamed_folders:   renamed.map(r => ({ old_name: r.currentName, new_name: r.proposedName, ad_id: r.conceptId })),
    errors,
  }
}
