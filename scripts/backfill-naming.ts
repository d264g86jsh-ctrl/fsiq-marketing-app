// Backfill ad_set_naming + creative_pipeline ad-level fields from the
// FSIQ_Creative_Tracker.xlsx tracker.
//
// Run: npx tsx --env-file=.env.local scripts/backfill-naming.ts
//
// Strategy:
//   1. Spawn a Python helper that reads the xlsx with openpyxl and emits JSON
//      with the two relevant sheets ("Ad Set Naming Conventions",
//      "Ad Naming Conventions").
//   2. For each ad-set row, insert/upsert into ad_set_naming.
//   3. For each ad row with a Global # (Ad ID column), match an existing
//      creative_pipeline row by global_number and UPDATE; otherwise INSERT.
//   4. Print summary counts.

import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { supabase } from '../lib/supabase'

const XLSX_PATH = '/Users/rodrigoavendano/Downloads/FSIQ_Creative_Tracker.xlsx'

// ── Python helper (written to a temp file, then executed) ────────────────────
const PY_HELPER = `
import json, sys
from openpyxl import load_workbook

wb = load_workbook(sys.argv[1], data_only=True, read_only=True)

def sheet_to_rows(name):
    if name not in wb.sheetnames:
        return None
    ws = wb[name]
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return {"headers": [], "rows": []}
    headers = [str(c) if c is not None else "" for c in rows[0]]
    data = []
    for r in rows[1:]:
        rec = {}
        for h, v in zip(headers, r):
            rec[h] = v
        data.append(rec)
    return {"headers": headers, "rows": data}

out = {
    "ad_set":  sheet_to_rows("Ad Set Naming Conventions"),
    "ad":      sheet_to_rows("Ad Naming Conventions"),
    "sheets":  wb.sheetnames,
}
print(json.dumps(out, default=str))
`

type Sheet = { headers: string[]; rows: Record<string, string | number | null>[] }

function loadTracker(): { ad_set: Sheet | null; ad: Sheet | null; sheets: string[] } {
  if (!fs.existsSync(XLSX_PATH)) {
    throw new Error(`Tracker file not found at ${XLSX_PATH}`)
  }
  const tmp = path.join('/tmp', `read_tracker_${Date.now()}.py`)
  fs.writeFileSync(tmp, PY_HELPER)
  try {
    const res = spawnSync('python3', [tmp, XLSX_PATH], { encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024 })
    if (res.status !== 0) {
      throw new Error(`Python helper failed: ${res.stderr}`)
    }
    return JSON.parse(res.stdout)
  } finally {
    try { fs.unlinkSync(tmp) } catch { /* ignore */ }
  }
}

function s(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const str = String(v).trim()
  return str === '' || str.toLowerCase() === 'none' ? null : str
}

function i(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

function bool(v: unknown): boolean {
  if (v === null || v === undefined) return false
  const str = String(v).trim().toLowerCase()
  return str === 'true' || str === 'yes' || str === 'active' || str === 'renamed' || str === 'done' || str === '✓' || str === 'y' || str === '1'
}

// ── Step 1: ad_set_naming ─────────────────────────────────────────────────────

async function backfillAdSets(sheet: Sheet) {
  let inserted = 0, skipped = 0, errors = 0
  for (const row of sheet.rows) {
    const type     = s(row['Type'])
    const concept  = s(row['Concept ID'])
    const adSetRaw = s(row['Ad Set'])
    if (!type || !concept) { skipped++; continue }

    const targeting = s(row['Targeting']) ?? 'Broad'
    const lpCode    = s(row['Landing Page'])
    const finalName = s(row['Final']) ?? `${concept} | ${adSetRaw ?? ''} | ${targeting} | ${lpCode ?? ''}`
    const status    = s(row['Status'])
    const metaRenamed = bool(status)

    // Talent: only for VIDEO and only if Ad Set token contains " | "
    let token = adSetRaw ?? ''
    let talent: string | null = null
    if (type.toUpperCase() === 'VIDEO' && adSetRaw && adSetRaw.includes(' | ')) {
      const parts = adSetRaw.split(' | ').map(p => p.trim())
      token  = parts[0] ?? ''
      talent = parts.slice(1).join(' | ') || null
    }

    const { error } = await supabase
      .from('ad_set_naming')
      .upsert(
        [{
          type:              type.toUpperCase(),
          concept_id:        concept,
          ad_set_token:      token,
          talent,
          targeting,
          lp_code:           lpCode,
          final_ad_set_name: finalName,
          meta_renamed:      metaRenamed,
          status:            status ?? 'active',
        }],
        { onConflict: 'concept_id,final_ad_set_name' },
      )
    if (error) {
      console.error(`  ✗ ${concept} :: ${finalName} — ${error.message}`)
      errors++
    } else {
      inserted++
    }
  }
  return { inserted, skipped, errors }
}

// ── Step 2: creative_pipeline ad-level fields ────────────────────────────────

async function backfillAdRows(sheet: Sheet) {
  let updated = 0, insertedNew = 0, skipped = 0, errors = 0

  // Pre-load existing pipeline rows so we can match by global_number quickly.
  const { data: existing } = await supabase
    .from('creative_pipeline')
    .select('id, ad_id, global_number')
  const byGlobal = new Map<number, { id: string; ad_id: string }>()
  for (const r of existing ?? []) {
    const g = (r as { global_number: number | null }).global_number
    if (typeof g === 'number') byGlobal.set(g, { id: (r as { id: string }).id, ad_id: (r as { ad_id: string }).ad_id })
  }

  for (const row of sheet.rows) {
    const type     = s(row['Type'])
    const concept  = s(row['Concept ID'])
    const globalNo = i(row['Ad ID'])
    if (!globalNo) { skipped++; continue }

    const awareness = s(row['Awareness'])
    const variant   = s(row['Variant'])
    const lp        = s(row['LP'])
    const copyId    = s(row['Copy ID'])
    const hookType  = s(row['Hook Type'])
    const duration  = s(row['Duration'])
    const finalName = s(row['Final'])

    // Extract concept name from Final string position 2 (0-indexed: split[2]).
    // Final example: "FSIQ-VIDEO-AD-30 | 151 | Media Pouch | …"
    let conceptName: string | null = null
    if (finalName) {
      const parts = finalName.split('|').map(p => p.trim())
      conceptName = parts[2] ?? null
    }

    const adType = (type ?? '').toUpperCase() || null
    const fields: Record<string, unknown> = {
      concept_name:     conceptName,
      global_number:    globalNo,
      hook_description: variant,
      hook_type:        hookType,
      awareness_level:  awareness,
      lp_code:          lp,
      funnel:           lp,
      copy_version:     copyId,
      duration,
    }
    if (adType) fields.ad_type = adType

    const match = byGlobal.get(globalNo)
    if (match) {
      const { error } = await supabase
        .from('creative_pipeline')
        .update(fields)
        .eq('id', match.id)
      if (error) { console.error(`  ✗ update global#${globalNo} — ${error.message}`); errors++ }
      else updated++
    } else {
      if (!concept) { skipped++; continue }
      // Use concept + global# as a deterministic ad_id so re-runs are idempotent.
      const adId = `${concept}-v${globalNo}`
      const { error } = await supabase
        .from('creative_pipeline')
        .upsert([{ ad_id: adId, ...fields, status: 'Backfilled', is_active: false }], { onConflict: 'ad_id' })
      if (error) { console.error(`  ✗ insert ${adId} — ${error.message}`); errors++ }
      else insertedNew++
    }
  }

  return { updated, insertedNew, skipped, errors }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Loading tracker:', XLSX_PATH)
  const tracker = loadTracker()
  console.log('Sheets found:', tracker.sheets.join(', '))

  if (!tracker.ad_set) {
    console.error('❌ "Ad Set Naming Conventions" sheet not found.')
  } else {
    console.log(`\n[1/2] Backfilling ad_set_naming (${tracker.ad_set.rows.length} rows)…`)
    const r = await backfillAdSets(tracker.ad_set)
    console.log(`   ✅ upserted=${r.inserted}  skipped=${r.skipped}  errors=${r.errors}`)
  }

  if (!tracker.ad) {
    console.error('❌ "Ad Naming Conventions" sheet not found.')
  } else {
    console.log(`\n[2/2] Backfilling creative_pipeline ad-level fields (${tracker.ad.rows.length} rows)…`)
    const r = await backfillAdRows(tracker.ad)
    console.log(`   ✅ updated=${r.updated}  inserted_new=${r.insertedNew}  skipped=${r.skipped}  errors=${r.errors}`)
  }

  console.log('\nDone.')
}

main().catch(err => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
