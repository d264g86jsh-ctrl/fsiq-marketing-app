// Full Sheet → Supabase backfill
// Inserts all Sheet Leads rows missing from Supabase.
// Idempotent: safe to re-run. Synthetic ghl_contact_id = 'sheet-backfill-{md5}'.
// Run: npx tsx --env-file=.env.local scripts/backfill-leads.ts

import { createHash } from 'crypto'
import { supabase } from '../lib/supabase'

const SHEET_ID = '1nx5PXn6AnLWdskroFwkNLXPPcvBy9spy_2ggNAnvRFI'
const API_KEY  = process.env.GOOGLE_SHEETS_API_KEY!
const BATCH    = 500

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseSpend(raw: unknown): number | null {
  if (raw == null) return null
  let s = String(raw).trim()
  s = s.replace(/<[^>]+>/g, ' ').trim()
  s = s.replace(/\s+/g, ' ')
  s = s.replace(/[$,]/g, '')
  const rangeMatch = s.match(/^([\d.]+[kmb]?)\s*[-–to]\s*([\d.]+[kmb]?)$/i)
  if (rangeMatch) s = rangeMatch[1]
  const m = s.match(/^([\d.]+)\s*([kmb])$/i)
  if (m) {
    const num = parseFloat(m[1])
    const mult = m[2].toLowerCase()
    if (!isNaN(num)) {
      if (mult === 'k') return Math.round(num * 1_000)
      if (mult === 'm') return Math.round(num * 1_000_000)
      if (mult === 'b') return Math.round(num * 1_000_000_000)
    }
  }
  const parsed = parseFloat(s)
  return isNaN(parsed) ? null : Math.round(parsed)
}

function classifyStage(spend: number | null): string {
  if (spend == null) return 'unqualified'
  if (spend >= 2_000_000) return 'cp3ql'
  if (spend >= 1_000_000) return 'cp2ql'
  if (spend >= 600_000)   return 'cpql'
  return 'unqualified'
}

function synthId(fn: string, ln: string, dt: string, restaurant: string, rowIdx: number): string {
  // Include restaurant and rowIdx to eliminate hash collisions from same-name/same-date entries
  const hash = createHash('md5').update(`${fn}|${ln}|${dt}|${restaurant}|${rowIdx}`).digest('hex').slice(0, 12)
  return `sheet-backfill-${hash}`
}

function parseBool(v: string | null): boolean | null {
  if (v == null) return null
  const lower = v.toLowerCase().trim()
  if (lower === '1' || lower === 'yes' || lower === 'true') return true
  if (lower === '0' || lower === 'no'  || lower === 'false') return false
  return null
}

function parseDate(v: string | null): string {
  if (!v) return new Date().toISOString()
  const d = new Date(v)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

// ── Sheet fetch ───────────────────────────────────────────────────────────────

async function fetchAllSheetRows(): Promise<string[][]> {
  const range = encodeURIComponent('Leads!A:U')
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`)
  const json = await res.json() as { values?: string[][] }
  return json.values ?? []
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Step 1: Fetching all Sheet rows...')
  const allRows = await fetchAllSheetRows()
  const headers = allRows[0].map(h => h.trim())
  const dataRows = allRows.slice(1).filter(r => r.some(c => c?.trim()))

  const get = (row: string[], col: string): string | null => {
    const i = headers.indexOf(col)
    return i >= 0 && i < row.length ? row[i]?.trim() || null : null
  }

  const leadRows = dataRows.filter(r => {
    const v = get(r, 'Is Lead?')
    return v === '1' || v?.toLowerCase() === 'true' || v?.toLowerCase() === 'yes'
  })

  console.log(`Sheet lead rows: ${leadRows.length}`)

  // Step 2: Load all existing Supabase leads for deduplication
  // Match by: (a) synthetic backfill ID already in DB, or (b) name+date matches a real GHL lead
  console.log('\nStep 2: Loading existing Supabase leads for deduplication...')
  const existingIds = new Set<string>()     // all ghl_contact_ids already in DB
  const existingNameDate = new Set<string>() // "fn|ln|date" for real GHL leads
  let from = 0
  while (true) {
    const { data } = await supabase.from('leads').select('ghl_contact_id, first_name, last_name, created_at').range(from, from + 999)
    if (!data?.length) break
    for (const r of data) {
      existingIds.add(r.ghl_contact_id)
      // Build name+date key so we can skip Sheet rows already captured via GHL webhook
      const fn = (r.first_name ?? '').toLowerCase().trim()
      const ln = (r.last_name  ?? '').toLowerCase().trim()
      const dt = r.created_at ? r.created_at.slice(0, 10) : ''
      if (fn || ln) existingNameDate.add(`${fn}|${ln}|${dt}`)
    }
    from += data.length
    if (data.length < 1000) break
  }
  console.log(`Existing Supabase IDs: ${existingIds.size}, name+date keys: ${existingNameDate.size}`)

  // Step 3: Build insert records for rows not in Supabase
  console.log('\nStep 3: Building backfill records...')
  const records: Record<string, unknown>[] = []

  for (let rowIdx = 0; rowIdx < leadRows.length; rowIdx++) {
    const row  = leadRows[rowIdx]
    const fn   = get(row, 'First Name') ?? ''
    const ln   = get(row, 'Last Name')  ?? ''
    const dt   = get(row, 'Date') ?? ''
    const rs   = get(row, 'Restaurant') ?? ''
    const dtKey = dt ? new Date(dt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)

    const fnNorm = fn.toLowerCase().trim()
    const lnNorm = ln.toLowerCase().trim()
    const rsNorm = rs.toLowerCase().trim()
    const id = synthId(fnNorm, lnNorm, dtKey, rsNorm, rowIdx)

    // Skip if already in Supabase — either via synthetic backfill ID or via GHL webhook (name+date match)
    if (existingIds.has(id)) continue
    const nameDate = `${fnNorm}|${lnNorm}|${dtKey}`
    if (existingNameDate.has(nameDate)) continue

    const spendRaw = get(row, 'Annual Spend Num') ?? get(row, 'Annual Spend')
    const spend    = parseSpend(spendRaw)

    // Ad attribution: prefer the resolved "Final" value
    const adAttr = get(row, 'Ad Attribution (Final)') ?? get(row, 'Ad Attribution')

    records.push({
      ghl_contact_id:        id,
      first_name:            fn || null,
      last_name:             ln || null,
      restaurant_name:       rs || null,
      num_locations:         get(row, 'Number of Locations') ? parseInt(get(row, 'Number of Locations')!, 10) || null : null,
      annual_food_spend_raw: spendRaw,
      annual_food_spend:     spend,
      lead_stage:            classifyStage(spend),
      ad_attribution:        adAttr,
      ad_id:                 get(row, 'Ad ID (Hidden)') ?? get(row, 'Ad ID'),
      adset_id:              get(row, 'Ad Set ID'),
      landing_page:          get(row, 'Landing Page'),
      call_booked:           parseBool(get(row, 'Call Booked?')),
      source:                get(row, 'Source'),
      ghl_pipeline_stage:    null,
      campaign_id:           null,
      created_at:            parseDate(dt),
      updated_at:            new Date().toISOString(),
      synced_from:           'sheet_backfill',
    })
  }

  console.log(`Records to insert: ${records.length}`)

  if (records.length === 0) {
    console.log('\n✅ Nothing to insert — Supabase already mirrors the Sheet.')
    return
  }

  // Step 4: Batch upsert
  console.log(`\nStep 4: Upserting in batches of ${BATCH}...`)
  let inserted = 0
  let errors   = 0

  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH)
    const { error } = await supabase.from('leads').upsert(batch, { onConflict: 'ghl_contact_id' })
    if (error) {
      console.error(`  Batch ${Math.floor(i / BATCH) + 1} error: ${error.message}`)
      errors++
    } else {
      inserted += batch.length
      process.stdout.write(`\r  Inserted ${inserted}/${records.length}...`)
    }
  }

  console.log(`\n\nStep 5: Verifying parity...`)
  const { count: sbCount } = await supabase.from('leads').select('*', { count: 'exact', head: true })
  const sheetCount = leadRows.length
  const delta = Math.abs(sheetCount - (sbCount ?? 0))

  console.log(`\n══════════ PARITY CHECK ══════════`)
  console.log(`Sheet count:    ${sheetCount}`)
  console.log(`Supabase count: ${sbCount}`)
  console.log(`Delta:          ${delta}`)
  console.log(`Errors:         ${errors}`)

  if (delta === 0) {
    console.log(`\n✅ DELTA = 0 — Supabase is a 1:1 mirror of the Sheet.`)
  } else {
    console.log(`\n⚠️  Delta = ${delta} — ${delta} rows still missing. Investigate errors above.`)
  }
}

main().catch(e => { console.error('Backfill failed:', e.message); process.exit(1) })
