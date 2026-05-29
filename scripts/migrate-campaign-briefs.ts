// migrate-campaign-briefs.ts
// Moves all 33 briefs from Raw Campaign Briefs into their concept folder's
// /Campaign Brief/ subfolder. Creates new concept folders where needed.
// Seeds sharepoint_map with all new folder entries.

import { createClient } from '@supabase/supabase-js'
import {
  getGraphToken,
  listChildren,
  createFolderIfMissing,
  moveItem,
  graphPost,
  graphBase,
  DriveItem,
} from '../lib/graph'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const VIDEO_CREATIVES_ID = '015MT6T5FZ6MOQJBXMABF3DUNIQW6BQ5ON'
const VC_PATH = 'Sales & Marketing/Marketing/Ad Campaigns/Ad Creatives/Video Creatives'

// ── Migration manifest ────────────────────────────────────────────────────────
// isNew=true → create concept folder + Raw Footage + Final subfolders first

const MIGRATIONS: Array<{
  ad: string
  fileId: string
  conceptFolderId: string | null  // null = isNew
  conceptFolderName: string
  isNew: boolean
}> = [
  // ── Group 1: Exact FSIQ-VIDEO-AD-## matches (22) ──────────────────────────
  { ad: '01', fileId: '015MT6T5EMICYFMYGENZGZXRNVN53PLTD4', conceptFolderId: '015MT6T5EKJH3N2HGK7VBIMLPW3MD7FYBN', conceptFolderName: 'FSIQ-VIDEO-AD-01 - VSL 1',                          isNew: false },
  { ad: '02', fileId: '015MT6T5HZ7XAK4PI2AZCLLVKPYGDO7WB3', conceptFolderId: '015MT6T5EHATA5Q6FP6RFZUTX6O2DMROUD', conceptFolderName: 'FSIQ-VIDEO-AD-02 - VSL 2',                          isNew: false },
  { ad: '10', fileId: '015MT6T5GRTWPCX3JDHNAI6RIPNNL24LEI', conceptFolderId: '015MT6T5AQ34AENAUCRVEK36HX45YKGGGM', conceptFolderName: 'FSIQ-VIDEO-AD-10 - Neil iPhone 2',               isNew: false },
  { ad: '11', fileId: '015MT6T5H6JGBEGCHYCFD324HUJOCH5R5W', conceptFolderId: '015MT6T5GTNHM5UYFG7JEZVXA7PYI7A62O', conceptFolderName: 'FSIQ-VIDEO-AD-11 - Jackson Podcast 1',          isNew: false },
  { ad: '12', fileId: '015MT6T5GHQOYWUMFKARD2IJFVN6SAI2VF', conceptFolderId: '015MT6T5EEGEG5BVIL35AJPBHPSDCPX6M3', conceptFolderName: "FSIQ-VIDEO-AD-12 - Black's Testimonial",       isNew: false },
  { ad: '14', fileId: '015MT6T5GEEXF76XZFPNCYLEHTESFPVKPV', conceptFolderId: '015MT6T5GMVXRESQF4HJAKI3JVYQCCE7AZ', conceptFolderName: 'FSIQ-VIDEO-AD-14 - Neil iPhone 3',               isNew: false },
  { ad: '15', fileId: '015MT6T5A7R6WG2QAARRA3O6JSDDR6QFML', conceptFolderId: '015MT6T5BTV6RGEOBBIBGLG62DKWRD4RIY', conceptFolderName: 'FSIQ-VIDEO-AD-15 - Neil iPhone 4',               isNew: false },
  { ad: '16', fileId: '015MT6T5F4ZD7KZNVI5BHZNPZEH6USXGJH', conceptFolderId: '015MT6T5FZHFZAVKJPGRALUJEKU4U4JWRT', conceptFolderName: 'FSIQ-VIDEO-AD-16 - Dish Society Testimonial New', isNew: false },
  { ad: '17', fileId: '015MT6T5D5TMXNBTGB3ZC2RQPQQLQZNCMZ', conceptFolderId: '015MT6T5AGZQ6KOVZ7BFFZ6UWE6A2BDDGD', conceptFolderName: 'FSIQ-VIDEO-AD-17 - Spirits Testimonial Ad',     isNew: false },
  { ad: '18', fileId: '015MT6T5COJOJZPZF3JFALVAJHYH7MM45K', conceptFolderId: '015MT6T5ARKKDF7JG3CFB2BNVTAIB63IQW', conceptFolderName: 'FSIQ-VIDEO-AD-18 - Neil Holiday Gift',            isNew: false },
  { ad: '19', fileId: '015MT6T5FKMVVXHHFYONBJ2BSCOUTTYVLK', conceptFolderId: '015MT6T5BYPVYZYAZC2ZF27A347WKQMU2S', conceptFolderName: 'FSIQ-VIDEO-AD-19 - Neil 50k',                     isNew: false },
  { ad: '20', fileId: '015MT6T5HIHHTQBUJ64RAKJ5UJEJKNZ3GN', conceptFolderId: '015MT6T5FQGE4M53H52ZFL5JVWDO3C6BSN', conceptFolderName: 'FSIQ-VIDEO-AD-20 - Neil Gift Ads Long',           isNew: false },
  { ad: '21', fileId: '015MT6T5AAFJ2MX3MMWNG3D2SNOIMVDHSI', conceptFolderId: '015MT6T5AY6IRKCXPRNNAZYSHNTRLDJXYT', conceptFolderName: 'FSIQ-VIDEO-AD-21 - Neil Gift Ads Short',          isNew: false },
  { ad: '22', fileId: '015MT6T5CEVGF45EMFSZE3GHTU6T3IPD6W', conceptFolderId: '015MT6T5DKM7HRRE3THBD3EN2FTSCVCXCH', conceptFolderName: 'FSIQ-VIDEO-AD-22 - Success Rate',                isNew: false },
  { ad: '23', fileId: '015MT6T5FBKIGEAHW7OZH3GXO2CRKQHUD5', conceptFolderId: '015MT6T5FC6IJVE5WU4FC3XQWDCMRSVPYR', conceptFolderName: 'FSIQ-VIDEO-AD-23 - Neil New Gift Ad',             isNew: false },
  { ad: '25', fileId: '015MT6T5BHJ6MZU26IKNFYCL3BIKXO5YK6', conceptFolderId: '015MT6T5ECHUZOGGVGYBFJ7ZRHV35YEGXI', conceptFolderName: 'FSIQ-VIDEO-AD-25 - Restaurant Data Ad',          isNew: false },
  { ad: '26', fileId: '015MT6T5GD7JV6E6PBYJAZCZDNEPR3PFVI', conceptFolderId: '015MT6T5CJXIKFASYRNFAYAYWG62WVB6NX', conceptFolderName: 'FSIQ-VIDEO-AD-26 - High Ticket No B-roll',       isNew: false },
  { ad: '27', fileId: '015MT6T5CSNMWMHLFXVBAKQCUOAWUUNPKK', conceptFolderId: '015MT6T5FHJUUCSVXUFZHIIPRBNTHB2PFF', conceptFolderName: 'FSIQ-VIDEO-AD-27 - Food Spend Tiers',             isNew: false },
  { ad: '29', fileId: '015MT6T5BUANVBPURGMZFYYVFXNI5B5CPH', conceptFolderId: '015MT6T5FZPJVGOBBWQNHYXQBSQQ2DHZFZ', conceptFolderName: 'FSIQ-VIDEO-AD-29 - Gift Ad New Studio',          isNew: false },
  { ad: '30', fileId: '015MT6T5EN6FBXHIKE5VB22UGPT24RKV3T', conceptFolderId: '015MT6T5HWZPDE74L4LRAL773KIBUF65MQ', conceptFolderName: 'FSIQ-VIDEO-AD-30 - Media Pouch',                  isNew: false },
  { ad: '32', fileId: '015MT6T5GU7JZQZZMI5ZBKOWZWQS5UUOXE', conceptFolderId: '015MT6T5GIU7ZBGXVWGRDJUD6D6DHH4AYT', conceptFolderName: 'FSIQ-VIDEO-AD-32 - Egg iPhone Ad',               isNew: false },
  { ad: '33', fileId: '015MT6T5FTIX3LLPXVR5HZEERGWMYUPZTL', conceptFolderId: '015MT6T5C5NP5RXETF7NDJ5QCBBV2L46JD', conceptFolderName: 'FSIQ-VIDEO-AD-33 - Exclusivity Podcast',          isNew: false },
  // ── Group 2: Legacy folders (3) ───────────────────────────────────────────
  { ad: '05', fileId: '015MT6T5AQVI3ECHUEJ5DJM6CBJ5WP2SIT', conceptFolderId: '015MT6T5ET6XJX7GH5NFFZ3YGX7TGG5RSP', conceptFolderName: 'VSL 4',                                           isNew: false },
  { ad: '06', fileId: '015MT6T5A5ZEMSDBW6NNCKSWKOEKUNBIGU', conceptFolderId: '015MT6T5BMT3OW7A6XZRE2ZWEGSFZ2BSXL', conceptFolderName: 'VSL 5 - Ad Set 1 - High Ticket',                   isNew: false },
  { ad: '09', fileId: '015MT6T5HPT6TRH5YWAZFIERZ7T423WDN7', conceptFolderId: '015MT6T5A7YNLG4NF2DJHI7UPDNCKG3O53', conceptFolderName: 'Neil iPhone 1',                                    isNew: false },
  // ── AD-08: resolved to AD-26 folder (V1 of High Ticket No B-Roll) ─────────
  { ad: '08', fileId: '015MT6T5EFXWGDLAKOYVBJ4ZXBOSUOEJG4', conceptFolderId: '015MT6T5CJXIKFASYRNFAYAYWG62WVB6NX', conceptFolderName: 'FSIQ-VIDEO-AD-26 - High Ticket No B-roll',       isNew: false },
  // ── Group 3: New folders needed (7) ──────────────────────────────────────
  { ad: '03', fileId: '015MT6T5DD4VO4JHJVXJCZDQLEEWT73SFR', conceptFolderId: null, conceptFolderName: 'FSIQ-VIDEO-AD-03 - Tdome Testimonial',          isNew: true },
  { ad: '04', fileId: '015MT6T5F2EZS2WUZ7QNBISB67SLFPEHI5', conceptFolderId: null, conceptFolderName: 'FSIQ-VIDEO-AD-04 - Dish Society Testimonial',    isNew: true },
  { ad: '07', fileId: '015MT6T5H23KL2J72O7RC2JHIMLZW3LODW', conceptFolderId: null, conceptFolderName: 'FSIQ-VIDEO-AD-07 - Podcast 1',                   isNew: true },
  { ad: '13', fileId: '015MT6T5FIK5CCKPAUZJBLKXIIAHTC6L5T', conceptFolderId: null, conceptFolderName: 'FSIQ-VIDEO-AD-13 - Oasis Testimonial',           isNew: true },
  { ad: '24', fileId: '015MT6T5FARUDJTRWEEFAI2S5W3TCDWIFA', conceptFolderId: null, conceptFolderName: 'FSIQ-VIDEO-AD-24 - Testimonials V2',              isNew: true },
  { ad: '28', fileId: '015MT6T5FT4B4RFEOIOVEYP4Z2RJQ3KHFO', conceptFolderId: null, conceptFolderName: 'FSIQ-VIDEO-AD-28 - Podcast Ad Blurred Book',     isNew: true },
  { ad: '31', fileId: '015MT6T5ETBRLJKKO3BFHIXJIANU4C5M2K', conceptFolderId: null, conceptFolderName: 'FSIQ-VIDEO-AD-31 - Media Pouch + New Studio',    isNew: true },
]

// ── sharepoint_map helpers ────────────────────────────────────────────────────

async function mapUpsert(entries: Array<{
  path: string
  parent_path: string
  sharepoint_item_id: string
  display_name: string
  item_type: string
}>) {
  for (const e of entries) {
    const { error } = await sb.from('sharepoint_map').upsert(
      {
        path:                e.path,
        parent_path:         e.parent_path,
        sharepoint_item_id:  e.sharepoint_item_id,
        display_name:        e.display_name,
        item_type:           e.item_type,
        naming_valid:        true,
        agent_owner:         'paid-media',
        last_verified_at:    new Date().toISOString(),
        folder_status:       'active',
      },
      { onConflict: 'path' },
    )
    if (error) console.warn(`  ⚠ map upsert failed for ${e.path}: ${error.message}`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await getGraphToken()  // warm the cache once

  let moved = 0
  let failed = 0
  const mapEntries: Parameters<typeof mapUpsert>[0] = []

  for (const m of MIGRATIONS) {
    const briefLabel = `FSIQ-VIDEO-AD-${m.ad}_Creative_Brief.docx`
    process.stdout.write(`\nAD-${m.ad.padStart(2, '0')}: ${m.conceptFolderName.slice(0, 50)}\n`)

    let conceptFolderId = m.conceptFolderId

    // Step 1 — Create concept folder + standard subfolders if new
    if (m.isNew) {
      process.stdout.write(`  → Creating concept folder…\n`)
      const newFolder = await createFolderIfMissing(VIDEO_CREATIVES_ID, m.conceptFolderName)
      if (!newFolder) { console.error(`  ✗ Failed to create ${m.conceptFolderName}`); failed++; continue }
      conceptFolderId = newFolder.id
      process.stdout.write(`  ✓ Concept folder: ${newFolder.id}\n`)

      // Create Raw Footage and Final (Campaign Brief created below)
      for (const sub of ['Raw Footage', 'Final']) {
        const subFolder = await createFolderIfMissing(conceptFolderId, sub)
        if (subFolder) {
          mapEntries.push({
            path:               `${VC_PATH}/${m.conceptFolderName}/${sub}`,
            parent_path:        `${VC_PATH}/${m.conceptFolderName}`,
            sharepoint_item_id: subFolder.id,
            display_name:       sub,
            item_type:          'folder',
          })
          process.stdout.write(`  ✓ Created /${sub}\n`)
        }
      }

      // Seed concept folder itself in map
      mapEntries.push({
        path:               `${VC_PATH}/${m.conceptFolderName}`,
        parent_path:        VC_PATH,
        sharepoint_item_id: conceptFolderId,
        display_name:       m.conceptFolderName,
        item_type:          'folder',
      })
    }

    // Step 2 — Create /Campaign Brief/ subfolder
    const briefFolder = await createFolderIfMissing(conceptFolderId!, 'Campaign Brief')
    if (!briefFolder) { console.error(`  ✗ Failed to create Campaign Brief subfolder`); failed++; continue }
    process.stdout.write(`  ✓ Campaign Brief folder: ${briefFolder.id}\n`)

    mapEntries.push({
      path:               `${VC_PATH}/${m.conceptFolderName}/Campaign Brief`,
      parent_path:        `${VC_PATH}/${m.conceptFolderName}`,
      sharepoint_item_id: briefFolder.id,
      display_name:       'Campaign Brief',
      item_type:          'folder',
    })

    // Also seed AD-17 concept folder if missing from map (no isNew needed, folder exists)
    if (m.ad === '17') {
      mapEntries.push({
        path:               `${VC_PATH}/${m.conceptFolderName}`,
        parent_path:        VC_PATH,
        sharepoint_item_id: conceptFolderId!,
        display_name:       m.conceptFolderName,
        item_type:          'folder',
      })
    }

    // Step 3 — Move brief into Campaign Brief folder
    const ok = await moveItem(m.fileId, briefFolder.id)
    if (ok) {
      process.stdout.write(`  ✓ Moved ${briefLabel}\n`)
      moved++
    } else {
      console.error(`  ✗ Move failed for ${briefLabel}`)
      failed++
    }
  }

  // Step 4 — Seed sharepoint_map
  if (mapEntries.length > 0) {
    console.log(`\nSeeding ${mapEntries.length} sharepoint_map entries…`)
    await mapUpsert(mapEntries)
    console.log('Done.')
  }

  // Summary
  console.log('\n' + '═'.repeat(60))
  console.log(`MIGRATION COMPLETE`)
  console.log(`  Moved:  ${moved}/33`)
  console.log(`  Failed: ${failed}`)
  console.log(`  Map entries added: ${mapEntries.length}`)
  console.log('═'.repeat(60))
}

main().catch(e => { console.error(e); process.exit(1) })
