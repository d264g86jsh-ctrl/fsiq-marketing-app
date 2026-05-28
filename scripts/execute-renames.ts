// execute-renames.ts
//
// Executes all approved pending_renames + special-case operations:
//   - AD-30 merge  (Podcast 2026 vs Media Pouch - Neil Podcast Ads)
//   - AD-17 merge  (Spirits Testimonial vs Lil Rizzos & Spirits - Testimonial)
//   - Short_Ad_12.22.25 → _Archive
//   - iMessage Ads → rename + move to Static Images
//   - All 39 confirmed renames
//
// Run: npx tsx --env-file=.env.local scripts/execute-renames.ts
// (requires MICROSOFT_ACCESS_TOKEN in .env.local — see scripts/setup-graph-auth.ts)

import { Pool } from 'pg'
import { createClient } from '@supabase/supabase-js'
import {
  listChildren,
  renameItem,
  moveItem,
  findChildByName,
  createFolderIfMissing,
  getGraphToken,
} from '../lib/graph'

// ── Config ────────────────────────────────────────────────────────────────────

const VIDEO_CREATIVES_ID  = '015MT6T5FZ6MOQJBXMABF3DUNIQW6BQ5ON'
const VIDEO_CREATIVES_PATH = 'Sales & Marketing/Marketing/Ad Campaigns/Ad Creatives/Video Creatives'
const STATIC_IMAGES_PATH   = 'Sales & Marketing/Marketing/Ad Campaigns/Ad Creatives/Static Images'
const AD_CAMPAIGNS_PATH    = 'Sales & Marketing/Marketing/Ad Campaigns'

// Known IDs from sharepoint_map
const PODCAST_2026_ID       = '015MT6T5HWZPDE74L4LRAL773KIBUF65MQ'
const MEDIA_POUCH_NEIL_ID   = '015MT6T5AFOHBGDK62UFCZIRSDJP4JFMGK'
const IMESSAGE_ADS_ID       = '015MT6T5AUUUD25FKDQREIFKZFPJL22D3N'
const LIL_RIZZOS_SPIRITS_ID = '015MT6T5GVFGSTJNIXKNB3ND2F36XV5Q7C'

// ── DB clients ────────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
const sb   = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ── DB helpers ────────────────────────────────────────────────────────────────

async function updateSharepointMap(opts: {
  sharepoint_item_id: string
  display_name?: string
  path?: string
  parent_path?: string
  naming_valid?: boolean
  expected_name?: string | null
  folder_status?: string
}) {
  const sets: string[] = []
  const vals: unknown[] = []
  let idx = 1
  if (opts.display_name  !== undefined) { sets.push(`display_name = $${idx++}`);  vals.push(opts.display_name) }
  if (opts.path          !== undefined) { sets.push(`path = $${idx++}`);           vals.push(opts.path) }
  if (opts.parent_path   !== undefined) { sets.push(`parent_path = $${idx++}`);    vals.push(opts.parent_path) }
  if (opts.naming_valid  !== undefined) { sets.push(`naming_valid = $${idx++}`);   vals.push(opts.naming_valid) }
  if (opts.expected_name !== undefined) { sets.push(`expected_name = $${idx++}`);  vals.push(opts.expected_name) }
  if (opts.folder_status !== undefined) { sets.push(`folder_status = $${idx++}`);  vals.push(opts.folder_status) }
  if (sets.length === 0) return
  sets.push(`last_verified_at = now()`)
  vals.push(opts.sharepoint_item_id)
  await pool.query(
    `UPDATE sharepoint_map SET ${sets.join(', ')} WHERE sharepoint_item_id = $${idx}`,
    vals,
  )
}

async function updatePipelineSharepointPath(conceptId: string | null, folderPath: string) {
  if (!conceptId) return
  await pool.query(
    `UPDATE creative_pipeline SET sharepoint_path = $1 WHERE ad_id LIKE $2`,
    [folderPath, conceptId + '%'],
  )
}

async function logSkillRun(agent: string, skill: string, status: string, summary: string) {
  await sb.from('skill_runs').insert({
    agent,
    skill,
    status,
    output_summary: summary,
    started_at:  new Date().toISOString(),
    completed_at: new Date().toISOString(),
  })
}

async function getStaticImagesId(): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT sharepoint_item_id FROM sharepoint_map WHERE path = $1`,
    [STATIC_IMAGES_PATH],
  )
  if (rows[0]?.sharepoint_item_id) return rows[0].sharepoint_item_id

  // Fallback: find Static Images by listing siblings of Video Creatives via Graph
  try {
    const vcMeta = await import('../lib/graph').then(m =>
      m.graphGet<{ parentReference: { id: string } }>(`/items/${VIDEO_CREATIVES_ID}?$select=parentReference`),
    )
    const adCreativesId = vcMeta.parentReference.id
    const siblings = await listChildren(adCreativesId)
    const staticFolder = siblings.find(s => s.name.toLowerCase().includes('static'))
    if (staticFolder) {
      await pool.query(
        `INSERT INTO sharepoint_map (path, item_type, parent_path, sharepoint_item_id, display_name, naming_valid, agent_owner, last_verified_at)
         VALUES ($1,'folder',$2,$3,'Static Images',true,'paid-media',now())
         ON CONFLICT (path) DO UPDATE SET sharepoint_item_id=$3, last_verified_at=now()`,
        [STATIC_IMAGES_PATH, 'Sales & Marketing/Marketing/Ad Campaigns/Ad Creatives', staticFolder.id],
      )
      console.log(`  Found Static Images via Graph: ${staticFolder.id}`)
      return staticFolder.id
    }
  } catch (e) {
    console.warn('  Graph fallback for Static Images failed:', (e as Error).message)
  }
  return null
}

async function getAdCampaignsId(): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT sharepoint_item_id FROM sharepoint_map WHERE path = $1`,
    [AD_CAMPAIGNS_PATH],
  )
  return rows[0]?.sharepoint_item_id ?? null
}

// ── Merge helper ──────────────────────────────────────────────────────────────

async function mergeFolder(srcId: string, dstId: string): Promise<{ moved: number; failed: number }> {
  const children = await listChildren(srcId)
  let moved = 0, failed = 0
  for (const child of children) {
    const ok = await moveItem(child.id, dstId)
    if (ok) moved++; else failed++
  }
  return { moved, failed }
}

// ── Special case handlers ─────────────────────────────────────────────────────

async function handleAD30Merge(): Promise<string> {
  console.log('\n══ AD-30 MERGE ══')
  const podcast2026Children    = await listChildren(PODCAST_2026_ID)
  const mediaPouchNeilChildren = await listChildren(MEDIA_POUCH_NEIL_ID)
  const p2026Count  = podcast2026Children.length
  const mpNeilCount = mediaPouchNeilChildren.length

  console.log(`  Podcast 2026 files:              ${p2026Count}`)
  console.log(`  Media Pouch - Neil Podcast Ads:  ${mpNeilCount}`)

  let dominantId: string, nonDominantId: string, dominantName: string, nonDominantName: string
  if (mpNeilCount > p2026Count) {
    dominantId = MEDIA_POUCH_NEIL_ID; nonDominantId = PODCAST_2026_ID
    dominantName = 'Media Pouch - Neil Podcast Ads'; nonDominantName = 'Podcast 2026'
    console.log(`  Decision: "${dominantName}" is dominant (more files)`)
  } else {
    dominantId = PODCAST_2026_ID; nonDominantId = MEDIA_POUCH_NEIL_ID
    dominantName = 'Podcast 2026'; nonDominantName = 'Media Pouch - Neil Podcast Ads'
    console.log(`  Decision: "${dominantName}" is dominant (${p2026Count >= mpNeilCount ? 'equal — default' : 'more files'})`)
  }

  const { moved, failed } = await mergeFolder(nonDominantId, dominantId)
  console.log(`  Moved ${moved} items from "${nonDominantName}" → "${dominantName}" (${failed} failed)`)

  const newName = 'FSIQ-VIDEO-AD-30 - Media Pouch'
  const renamed = await renameItem(dominantId, newName)
  console.log(`  Renamed "${dominantName}" → "${newName}": ${renamed ? '✅' : '❌'}`)

  const newPath = `${VIDEO_CREATIVES_PATH}/${newName}`
  await updateSharepointMap({ sharepoint_item_id: dominantId, display_name: newName, path: newPath, naming_valid: true, expected_name: null })
  await updateSharepointMap({ sharepoint_item_id: nonDominantId, folder_status: 'emptied', naming_valid: false })
  await updatePipelineSharepointPath('FSIQ-VIDEO-AD-30', newPath)
  await pool.query(`UPDATE pending_renames SET approved = true WHERE concept_id = 'FSIQ-VIDEO-AD-30'`)

  return `AD-30: dominant="${dominantName}" (${dominantId === PODCAST_2026_ID ? p2026Count : mpNeilCount} files), moved ${moved}, renamed ${renamed ? '✅' : '❌'}`
}

async function handleAD17Merge(): Promise<string> {
  console.log('\n══ AD-17 MERGE (Spirits Testimonial) ══')
  const spiritsChild   = await findChildByName(VIDEO_CREATIVES_ID, 'Spirits Testimonial')
  const lilRizzosCount = (await listChildren(LIL_RIZZOS_SPIRITS_ID)).length
  const spiritsCount   = spiritsChild ? (await listChildren(spiritsChild.id)).length : 0

  console.log(`  Lil Rizzos & Spirits - Testimonial: ${lilRizzosCount} files`)
  console.log(`  Spirits Testimonial:                ${spiritsCount} files`)

  let dominantId: string, nonDominantId: string | null, dominantName: string, nonDominantName: string
  if (spiritsCount > lilRizzosCount && spiritsChild) {
    dominantId = spiritsChild.id; nonDominantId = LIL_RIZZOS_SPIRITS_ID
    dominantName = 'Spirits Testimonial'; nonDominantName = 'Lil Rizzos & Spirits - Testimonial'
  } else {
    dominantId = LIL_RIZZOS_SPIRITS_ID; nonDominantId = spiritsChild?.id ?? null
    dominantName = 'Lil Rizzos & Spirits - Testimonial'; nonDominantName = 'Spirits Testimonial'
  }
  console.log(`  Decision: "${dominantName}" is dominant`)

  let moved = 0, failed = 0
  if (nonDominantId) {
    const r = await mergeFolder(nonDominantId, dominantId)
    moved = r.moved; failed = r.failed
    console.log(`  Moved ${moved} items from "${nonDominantName}" (${failed} failed)`)
  }

  const newName = 'FSIQ-VIDEO-AD-17 - Spirits Testimonial Ad'
  const renamed = await renameItem(dominantId, newName)
  console.log(`  Renamed "${dominantName}" → "${newName}": ${renamed ? '✅' : '❌'}`)

  const newPath = `${VIDEO_CREATIVES_PATH}/${newName}`
  await updateSharepointMap({ sharepoint_item_id: dominantId, display_name: newName, path: newPath, naming_valid: true, expected_name: null })
  await updatePipelineSharepointPath('FSIQ-VIDEO-AD-17', newPath)

  if (nonDominantId === LIL_RIZZOS_SPIRITS_ID) {
    await updateSharepointMap({ sharepoint_item_id: LIL_RIZZOS_SPIRITS_ID, folder_status: 'emptied', naming_valid: false })
  } else if (nonDominantId && spiritsChild) {
    await pool.query(
      `INSERT INTO sharepoint_map (path, item_type, parent_path, sharepoint_item_id, display_name, naming_valid, folder_status, agent_owner, last_verified_at)
       VALUES ($1,'folder',$2,$3,'Spirits Testimonial',false,'emptied','paid-media',now())
       ON CONFLICT (path) DO UPDATE SET folder_status='emptied', last_verified_at=now()`,
      [`${VIDEO_CREATIVES_PATH}/Spirits Testimonial`, VIDEO_CREATIVES_PATH, spiritsChild.id],
    )
  }
  await pool.query(`UPDATE pending_renames SET approved = true WHERE concept_id = 'FSIQ-VIDEO-AD-17'`)

  return `AD-17: dominant="${dominantName}", moved ${moved}, renamed to "${newName}" ${renamed ? '✅' : '❌'}`
}

async function handleShortAdArchive(): Promise<string> {
  console.log('\n══ Short_Ad_12.22.25 → _Archive ══')
  const shortAd = await findChildByName(VIDEO_CREATIVES_ID, 'Short_Ad_12.22.25')
  if (!shortAd) return 'Short_Ad_12.22.25: not found in Video Creatives — skipped'
  console.log(`  Found: ${shortAd.id}`)

  const adCampaignsId = await getAdCampaignsId()
  if (!adCampaignsId) return 'Short_Ad_12.22.25: Ad Campaigns ID not in sharepoint_map — skipped'

  const archive = await createFolderIfMissing(adCampaignsId, '_Archive')
  if (!archive) return 'Short_Ad_12.22.25: could not create _Archive — skipped'
  console.log(`  _Archive: ${archive.id}`)

  const moved = await moveItem(shortAd.id, archive.id)
  console.log(`  Moved to _Archive: ${moved ? '✅' : '❌'}`)

  if (moved) {
    await pool.query(
      `INSERT INTO sharepoint_map (path, item_type, parent_path, sharepoint_item_id, display_name, naming_valid, folder_status, agent_owner, last_verified_at)
       VALUES ($1,'folder',$2,$3,'Short_Ad_12.22.25',false,'archived','paid-media',now())
       ON CONFLICT (path) DO UPDATE SET folder_status='archived', parent_path=$2, sharepoint_item_id=$3, last_verified_at=now()`,
      [`${AD_CAMPAIGNS_PATH}/_Archive/Short_Ad_12.22.25`, `${AD_CAMPAIGNS_PATH}/_Archive`, shortAd.id],
    )
    await pool.query(`UPDATE pending_renames SET approved = true WHERE current_name = 'Short_Ad_12.22.25'`)
  }

  return `Short_Ad_12.22.25: ${moved ? 'moved to _Archive ✅' : 'move failed ❌'}`
}

async function handleIMessageAds(): Promise<string> {
  console.log('\n══ iMessage Ads → rename + move to Static Images ══')
  const staticImagesId = await getStaticImagesId()
  if (!staticImagesId) return 'iMessage Ads: Static Images ID not in sharepoint_map — skipped'

  const newName = 'FSIQ-STATIC-AD-19b - iMsg'
  const renamed = await renameItem(IMESSAGE_ADS_ID, newName)
  console.log(`  Renamed → "${newName}": ${renamed ? '✅' : '❌'}`)

  const moved = await moveItem(IMESSAGE_ADS_ID, staticImagesId)
  console.log(`  Moved to Static Images: ${moved ? '✅' : '❌'}`)

  const newPath = `${STATIC_IMAGES_PATH}/${newName}`
  await updateSharepointMap({
    sharepoint_item_id: IMESSAGE_ADS_ID,
    display_name: newName,
    path: newPath,
    parent_path: STATIC_IMAGES_PATH,
    naming_valid: true,
    expected_name: null,
  })
  await updatePipelineSharepointPath('FSIQ-STATIC-AD-19b', newPath)
  await pool.query(
    `UPDATE pending_renames SET approved = true WHERE sharepoint_item_id = $1 OR current_name = 'iMessage Ads'`,
    [IMESSAGE_ADS_ID],
  )

  return `iMessage Ads: renamed ${renamed ? '✅' : '❌'} + moved to Static Images ${moved ? '✅' : '❌'}`
}

// ── Confirmed renames ─────────────────────────────────────────────────────────

async function executeConfirmedRenames(): Promise<{ success: number; failed: string[] }> {
  console.log('\n══ CONFIRMED RENAMES ══')

  const { rows } = await pool.query<{
    id: string
    concept_id: string | null
    sharepoint_item_id: string | null
    current_name: string
    proposed_name: string
    path: string
  }>(
    `SELECT id, concept_id, sharepoint_item_id, current_name, proposed_name, path
     FROM pending_renames
     WHERE flag = 'confirmed' AND approved = false`,
  )
  console.log(`  ${rows.length} confirmed renames remaining`)

  let success = 0
  const failed: string[] = []

  for (const row of rows) {
    // Resolve item ID: from pending_renames, sharepoint_map, or Graph lookup
    let itemId = row.sharepoint_item_id ?? ''
    if (!itemId) {
      const { rows: sm } = await pool.query(
        `SELECT sharepoint_item_id FROM sharepoint_map WHERE path = $1`,
        [row.path],
      )
      itemId = sm[0]?.sharepoint_item_id ?? ''
    }
    if (!itemId) {
      const child = await findChildByName(VIDEO_CREATIVES_ID, row.current_name)
      if (!child) {
        failed.push(`${row.current_name}: no item ID found`)
        console.warn(`  ❌ ${row.current_name}: not found`)
        continue
      }
      itemId = child.id
      await pool.query(`UPDATE sharepoint_map SET sharepoint_item_id = $1 WHERE path = $2`, [itemId, row.path])
    }

    const ok = await renameItem(itemId, row.proposed_name)
    if (ok) {
      const parentPath = row.path.substring(0, row.path.lastIndexOf('/'))
      const newPath    = `${parentPath}/${row.proposed_name}`
      await updateSharepointMap({ sharepoint_item_id: itemId, display_name: row.proposed_name, path: newPath, naming_valid: true, expected_name: null })
      await updatePipelineSharepointPath(row.concept_id, newPath)
      await pool.query(`UPDATE pending_renames SET approved = true WHERE id = $1`, [row.id])
      success++
      console.log(`  ✅ ${row.current_name} → ${row.proposed_name}`)
    } else {
      failed.push(`${row.current_name}: rename failed`)
    }
  }

  return { success, failed }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Verify token is present and not expired before doing anything
  console.log('Verifying Graph token...')
  getGraphToken()
  console.log('✅ Token OK\n')

  const summaryLines: string[] = []

  try {
    summaryLines.push(await handleAD30Merge())
    summaryLines.push(await handleAD17Merge())
    summaryLines.push(await handleShortAdArchive())
    summaryLines.push(await handleIMessageAds())

    const { success, failed } = await executeConfirmedRenames()
    summaryLines.push(`Confirmed renames: ${success} succeeded, ${failed.length} failed`)
    failed.forEach(f => summaryLines.push(`  ❌ ${f}`))

    const { rows: stats } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE naming_valid = true)  AS valid,
         COUNT(*) FILTER (WHERE naming_valid = false) AS invalid,
         COUNT(*) AS total
       FROM sharepoint_map WHERE item_type = 'folder'`,
    )
    const { valid, invalid, total } = stats[0]
    summaryLines.push(`sharepoint_map: ${valid}/${total} naming_valid=true, ${invalid} still false`)

    const { rows: stillInvalid } = await pool.query(
      `SELECT display_name, path FROM sharepoint_map
       WHERE naming_valid = false AND item_type = 'folder'
         AND (folder_status IS NULL OR folder_status = 'active')
       ORDER BY path`,
    )
    if (stillInvalid.length > 0) {
      summaryLines.push('Still naming_valid=false (active):')
      stillInvalid.forEach(r => summaryLines.push(`  • ${r.display_name}`))
    }

    await logSkillRun('naming-builder', 'execute-renames', 'completed', summaryLines.join('\n'))

    console.log('\n══════════════════════════════')
    console.log('SUMMARY')
    console.log('══════════════════════════════')
    summaryLines.forEach(l => console.log(l))

  } catch (err) {
    console.error('Fatal:', err)
    await logSkillRun('naming-builder', 'execute-renames', 'failed', String(err))
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
