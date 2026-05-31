/**
 * test-footage-watcher-diagnostic.ts
 *
 * Read-only diagnostic that replays the footage-watcher.skill.ts scan logic
 * and reports exactly why a given AD ID has (or hasn't) been logged in footage_log.
 *
 * Does NOT write to footage_log, Slack, or any Supabase table.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/test-footage-watcher-diagnostic.ts
 *   npx tsx --env-file=.env.local scripts/test-footage-watcher-diagnostic.ts FSIQ-VIDEO-AD-30
 *   npx tsx --env-file=.env.local scripts/test-footage-watcher-diagnostic.ts AD-30
 *
 * If no filter is provided, lists ALL concept folders and their Raw Footage status.
 */

import path from 'path'
import { supabase } from '../lib/supabase'
import { getGraphToken, graphBase } from '../lib/graph'

// ── Mirrors footage-watcher constants ────────────────────────────────────────

const VIDEO_CREATIVES_ID   = '015MT6T5FZ6MOQJBXMABF3DUNIQW6BQ5ON'
const VIDEO_CREATIVES_PATH = 'Sales & Marketing/Marketing/Ad Campaigns/Ad Creatives/Video Creatives'
const VIDEO_EXTENSIONS     = new Set(['.mp4', '.mov', '.avi', '.mxf', '.m4v', '.mkv', '.wmv', '.webm'])
const CONCEPT_ID_PATTERN   = /^(FSIQ-VIDEO-AD-\d{2,}[a-z]?)\s*-/

// ── CLI args ──────────────────────────────────────────────────────────────────

const filterRaw = process.argv[2] ?? ''

// Normalise: "AD-30", "FSIQ-VIDEO-AD-30", "30" all resolve to a keyword we
// can test against a folder name case-insensitively.
const filterKeyword = filterRaw
  ? filterRaw.replace(/^FSIQ-VIDEO-/i, '').toUpperCase()
  : ''

// ── Types ─────────────────────────────────────────────────────────────────────

interface GraphItem {
  id:                   string
  name:                 string
  size?:                number
  webUrl:               string
  folder?:              object
  file?:                object
  lastModifiedDateTime: string
}

// ── Graph helpers (mirrors footage-watcher, read-only) ────────────────────────

async function graphGet<T>(urlPath: string): Promise<T> {
  const token = await getGraphToken()
  const base  = graphBase()
  const url   = urlPath.startsWith('http') ? urlPath : `${base}${urlPath}`
  const res   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Graph GET ${urlPath} → ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const SELECT = 'id,name,size,webUrl,folder,file,lastModifiedDateTime'

async function fetchPage<T>(urlPath: string): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await graphGet<T>(urlPath)
    } catch (err) {
      const msg = (err as Error).message
      if (attempt < 3 && msg.includes('503')) {
        console.log(`    [retry ${attempt}/3] 503 — waiting 3s...`)
        await sleep(3000)
      } else {
        throw err
      }
    }
  }
  throw new Error('unreachable')
}

type GraphPage = { value: GraphItem[]; '@odata.nextLink'?: string }

async function listChildrenById(itemId: string): Promise<GraphItem[]> {
  const items: GraphItem[] = []
  let urlPath: string | null = `/items/${itemId}/children?$select=${SELECT}&$top=200`
  while (urlPath) {
    const page: GraphPage = await fetchPage<GraphPage>(urlPath)
    items.push(...page.value)
    const next: string | undefined = page['@odata.nextLink']
    urlPath = next ? next.replace(graphBase(), '') : null
  }
  return items
}

async function listChildrenByPath(encodedPath: string): Promise<GraphItem[]> {
  const items: GraphItem[] = []
  let urlPath: string | null = `/root:/${encodedPath}:/children?$select=${SELECT}&$top=200`
  while (urlPath) {
    const page: GraphPage = await fetchPage<GraphPage>(urlPath)
    items.push(...page.value)
    const next: string | undefined = page['@odata.nextLink']
    urlPath = next ? next.replace(graphBase(), '') : null
  }
  return items
}

// Used when listing children of a folder located by a prior item-ID or path lookup
async function listChildren(itemId: string): Promise<GraphItem[]> {
  return listChildrenById(itemId)
}

function isVideoFile(name: string): boolean {
  return VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase())
}

function extractConceptId(name: string): string | null {
  const m = name.match(CONCEPT_ID_PATTERN)
  return m ? m[1] : null
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const hr = '='.repeat(66)
  console.log()
  console.log(hr)
  console.log('FOOTAGE-WATCHER DIAGNOSTIC')
  if (filterKeyword) console.log(`  Filter: folders containing "${filterKeyword}"`)
  else               console.log('  Filter: none (showing all concept folders)')
  console.log(hr)
  console.log()

  // ── Step 1: Graph API ────────────────────────────────────────────────────
  console.log('Step 1 — Verifying Graph API access...')
  try {
    await getGraphToken()
    console.log('  ✓ Token acquired')
  } catch (err) {
    console.error(`  ✗ Graph API unavailable: ${(err as Error).message}`)
    console.error('    Cannot proceed — set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID in .env.local')
    process.exit(1)
  }
  console.log()

  // ── Step 2: Load known footage_log item IDs ──────────────────────────────
  console.log('Step 2 — Loading known sharepoint_item_ids from footage_log...')
  const { data: knownData } = await supabase
    .from('footage_log')
    .select('sharepoint_item_id, ad_id, concept_folder, file_name, status')
    .not('sharepoint_item_id', 'is', null)

  const knownMap = new Map<string, { ad_id: string | null; concept_folder: string; file_name: string; status: string | null }>(
    (knownData ?? []).map(r => [
      r.sharepoint_item_id as string,
      { ad_id: r.ad_id, concept_folder: r.concept_folder, file_name: r.file_name, status: r.status },
    ])
  )
  console.log(`  Known item IDs in footage_log: ${knownMap.size}`)
  console.log()

  // ── Step 3: List concept folders ─────────────────────────────────────────
  console.log(`Step 3 — Listing concept folders in Video Creatives (${VIDEO_CREATIVES_PATH})...`)
  let allFolders: GraphItem[]
  try {
    const all = await listChildrenById(VIDEO_CREATIVES_ID)
    allFolders = all.filter(i => i.folder !== undefined)
  } catch (err) {
    const msg = (err as Error).message
    console.warn(`  ! item-ID lookup failed (${msg.match(/→ (\d+)/)?.[1] ?? 'error'}). Trying path-based lookup...`)
    try {
      const encoded = encodeURIComponent(VIDEO_CREATIVES_PATH).replace(/%2F/g, '/')
      const all = await listChildrenByPath(encoded)
      allFolders = all.filter(i => i.folder !== undefined)
      console.log(`  ✓ Path-based lookup succeeded`)
    } catch (err2) {
      const msg2 = (err2 as Error).message
      console.error(`  ✗ Both item-ID and path lookup failed: ${msg2}`)
      if (msg2.includes('503') || msg.includes('503')) {
        console.error('    503 = SharePoint service error. Try again in a few minutes.')
      } else if (msg2.includes('404') || msg.includes('404')) {
        console.error('    404 = folder not found. Verify path or item ID.')
      } else if (msg2.includes('403') || msg.includes('403')) {
        console.error('    403 = permission denied. Ensure Files.Read.All is granted to the app.')
      }
      console.log()
      console.log(hr)
      console.log('DIAGNOSTIC SUMMARY')
      console.log(hr)
      console.log('  Graph API error — cannot determine C vs D blocker.')
      console.log('  Blocker A (no footage_log row) is confirmed. Re-run this diagnostic when Graph is available.')
      console.log(hr)
      console.log()
      process.exit(0)
    }
  }

  console.log(`  Total concept folders found: ${allFolders.length}`)

  const targeted = filterKeyword
    ? allFolders.filter(f => f.name.toUpperCase().includes(filterKeyword))
    : allFolders

  if (filterKeyword) {
    console.log(`  Folders matching "${filterKeyword}": ${targeted.length}`)
    if (targeted.length === 0) {
      console.log()
      console.log('  ✗ No matching folder found in Video Creatives.')
      console.log('    Blocker category D — footage-watcher never scans this AD because the folder')
      console.log('    does not exist (or is named differently) under Video Creatives.')
      console.log()
      console.log('  All concept folders (for reference):')
      for (const f of allFolders) {
        console.log(`    - ${f.name}`)
      }
      console.log()
      return
    }
  }
  console.log()

  // ── Step 4: Inspect each matched folder ──────────────────────────────────
  console.log(`Step 4 — Inspecting ${targeted.length} folder(s)...`)
  console.log()

  let anyWouldInsert = false

  for (const concept of targeted) {
    const conceptId = extractConceptId(concept.name)
    console.log(`  ┌─ ${concept.name}`)
    console.log(`  │  concept_id:  ${conceptId ?? '(none — no FSIQ-VIDEO-AD-XX prefix)'}`)
    console.log(`  │  folder id:   ${concept.id}`)

    // List children to find Raw Footage subfolder
    let subfolders: GraphItem[]
    try {
      subfolders = await listChildren(concept.id)
    } catch (err) {
      console.log(`  │  ✗ Could not list children: ${(err as Error).message}`)
      console.log(`  └─ SKIP`)
      console.log()
      continue
    }

    const rawFootage = subfolders.find(
      s => s.folder !== undefined && s.name.toLowerCase() === 'raw footage',
    )

    if (!rawFootage) {
      console.log(`  │  Raw Footage subfolder: NOT FOUND`)
      console.log(`  │  Subfolders present (${subfolders.filter(s => s.folder).length}):`)
      for (const s of subfolders.filter(f => f.folder !== undefined)) {
        console.log(`  │    - "${s.name}"`)
      }
      console.log(`  └─ BLOCKER C — footage-watcher skips this folder (no "Raw Footage" subfolder)`)
      console.log()
      continue
    }

    console.log(`  │  Raw Footage subfolder: FOUND (id=${rawFootage.id})`)
    const rawPath = `${VIDEO_CREATIVES_PATH}/${concept.name}/Raw Footage`

    // List files in Raw Footage
    let rawChildren: GraphItem[]
    try {
      rawChildren = await listChildren(rawFootage.id)
    } catch (err) {
      console.log(`  │  ✗ Could not list Raw Footage contents: ${(err as Error).message}`)
      console.log(`  └─ SKIP`)
      console.log()
      continue
    }

    const videoFiles = rawChildren.filter(i => i.file !== undefined && isVideoFile(i.name))
    const otherFiles = rawChildren.filter(i => i.file !== undefined && !isVideoFile(i.name))
    const folders    = rawChildren.filter(i => i.folder !== undefined)

    console.log(`  │  Items in Raw Footage: ${rawChildren.length} total`)
    console.log(`  │    video files:  ${videoFiles.length}`)
    console.log(`  │    other files:  ${otherFiles.length}`)
    console.log(`  │    subfolders:   ${folders.length}`)

    if (videoFiles.length === 0) {
      console.log(`  │  Non-video files present:`)
      for (const f of otherFiles.slice(0, 10)) {
        console.log(`  │    - "${f.name}"`)
      }
      console.log(`  └─ BLOCKER C — no video files in Raw Footage (footage-watcher skips empty)`)
      console.log()
      continue
    }

    // Check each video file against known footage_log
    for (const file of videoFiles) {
      const known = knownMap.get(file.id)
      if (known) {
        console.log(`  │  ✓ ALREADY LOGGED: "${file.name}"`)
        console.log(`  │      footage_log.ad_id=${known.ad_id}  status=${known.status}`)
      } else {
        anyWouldInsert = true
        console.log(`  │  ★ NEW (not in footage_log): "${file.name}"`)
        console.log(`  │      Would insert: ad_id=${conceptId ?? '(null)'}  raw_file_path=${rawPath}/${file.name}`)
        console.log(`  │      sharepoint_item_id=${file.id}`)
        console.log(`  │      size=${file.size ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : 'unknown'}`)
        console.log(`  │      modified=${file.lastModifiedDateTime}`)
      }
    }

    console.log(`  └─ ${anyWouldInsert ? 'WOULD INSERT new row(s) if watcher ran now' : 'All files already tracked'}`)
    console.log()
  }

  // ── Step 5: Summary ───────────────────────────────────────────────────────
  console.log(hr)
  console.log('DIAGNOSTIC SUMMARY')
  console.log(hr)
  if (filterKeyword && targeted.length === 0) {
    console.log(`  Blocker D — folder for "${filterKeyword}" not found in Video Creatives root.`)
    console.log(`  Action: verify the folder name in SharePoint matches FSIQ-VIDEO-AD-XX - <title> exactly.`)
  } else if (anyWouldInsert) {
    console.log(`  ★ New footage found — footage-watcher WOULD create footage_log row(s) if run now.`)
    console.log(`  Action: trigger footage-watcher, or run the pipeline test with --write-fixture-row.`)
  } else if (targeted.length > 0) {
    console.log(`  All found files are already tracked — or Raw Footage subfolder is missing/empty.`)
    console.log(`  See per-folder detail above for specific blocker (C).`)
  }
  console.log(hr)
  console.log()
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
