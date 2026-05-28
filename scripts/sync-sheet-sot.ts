// sync-sheet-sot.ts — Syncs Google Sheet "Meta Ads All Data" tab into Supabase sheet_sot table.
// Run with: npx tsx --env-file=.env.local scripts/sync-sheet-sot.ts
//
// Requires GOOGLE_SHEETS_API_KEY in .env.local.
// Get a free key: console.cloud.google.com → APIs & Services → Credentials → Create API key
// The sheet must be shared "Anyone with the link can view".
//
// Column remapping (Sheet uses old naming; we store new naming):
//   Sheet "CPQL"   = $1M+  leads → cp2ql (primary scaling signal)
//   Sheet "CP2QL"  = $2M+  leads → cp3ql (quality floor)

import fs from 'fs'
import path from 'path'
import { supabase } from '../lib/supabase'

const SHEET_ID  = '1nx5PXn6AnLWdskroFwkNLXPPcvBy9spy_2ggNAnvRFI'
const TAB_NAME  = 'Meta Ads (All Data)'
const API_KEY   = process.env.GOOGLE_SHEETS_API_KEY

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseMoney(s: unknown): number | null {
  if (s == null) return null
  const v = parseFloat(String(s).replace(/[$,]/g, ''))
  return isNaN(v) || v === 0 ? null : v
}

function parseIntVal(s: unknown): number | null {
  if (s == null) return null
  const v = parseInt(String(s).replace(/,/g, ''), 10)
  return isNaN(v) ? null : v
}

function get(row: string[], headers: string[], col: string): string | null {
  const i = headers.indexOf(col)
  return i >= 0 && i < row.length ? row[i] || null : null
}

// ── Fetch from Google Sheets API ─────────────────────────────────────────────

async function fetchSheetRows(): Promise<{ headers: string[]; rows: string[][] }> {
  if (!API_KEY) {
    throw new Error(
      'GOOGLE_SHEETS_API_KEY not set. Add it to .env.local.\n' +
      'Get a free key at console.cloud.google.com → APIs & Services → Credentials.\n' +
      'Make sure the sheet is shared "Anyone with the link can view".'
    )
  }

  const range = encodeURIComponent(`${TAB_NAME}!A:AX`)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`

  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Google Sheets API error ${res.status}: ${body}`)
  }

  const json = await res.json() as { values?: string[][] }
  const allRows = json.values ?? []
  if (allRows.length < 2) throw new Error('Sheet returned fewer than 2 rows — unexpected format')

  const headers = allRows[0].map((h: string) => h.trim())
  return { headers, rows: allRows.slice(1) }
}

// ── Parse rows into sheet_sot records ────────────────────────────────────────

interface SheetSotRow {
  meta_ad_set_id: string
  ad_set_name: string
  is_active: boolean
  last_active_date: string | null
  spend_total: number | null
  spend_7d: number | null
  spend_14d: number | null
  spend_30d: number | null
  leads_s1_7d: number | null
  leads_s1_lt: number | null
  cpl_7d: number | null
  cpl_lt: number | null
  cp2ql_leads_7d: number | null
  cp2ql_leads_14d: number | null
  cp2ql_leads_30d: number | null
  cp2ql_leads_lt: number | null
  cp2ql_7d: number | null
  cp2ql_14d: number | null
  cp2ql_30d: number | null
  cp2ql_lt: number | null
  cp3ql_leads_7d: number | null
  cp3ql_leads_14d: number | null
  cp3ql_leads_30d: number | null
  cp3ql_leads_lt: number | null
  cp3ql_7d: number | null
  cp3ql_14d: number | null
  cp3ql_30d: number | null
  cp3ql_lt: number | null
  synced_at: string
}

function parseRows(headers: string[], rows: string[][]): SheetSotRow[] {
  const now = new Date().toISOString()
  const results: SheetSotRow[] = []

  for (const row of rows) {
    const adSetName  = get(row, headers, 'Ad Set Name')?.trim()
    const metaIdRaw  = get(row, headers, 'Active Ad Set')?.trim()
    if (!adSetName || !metaIdRaw) continue
    const metaId = metaIdRaw.match(/\d{10,}/)?.[0]
    if (!metaId) continue

    const g = (col: string) => get(row, headers, col)

    results.push({
      meta_ad_set_id:  metaId,
      ad_set_name:     adSetName,
      is_active:       g('Is Active') === '1',
      last_active_date: g('Last Active Date') || null,
      spend_total:     parseMoney(g('Cost')),
      spend_7d:        parseMoney(g('Cost 7d')),
      spend_14d:       parseMoney(g('Cost 14d')),
      spend_30d:       parseMoney(g('Cost 30d')),
      leads_s1_7d:     parseIntVal(g('Leads 7d')),
      leads_s1_lt:     parseIntVal(g('Leads Lifetime')),
      cpl_7d:          parseMoney(g('CPL 7d')),
      cpl_lt:          parseMoney(g('CPL Lifetime')),
      // Sheet "CPQL" = $1M+ = new cp2ql
      cp2ql_leads_7d:  parseIntVal(g('CPQL Leads 7d')),
      cp2ql_leads_14d: parseIntVal(g('CPQL Leads 14d')),
      cp2ql_leads_30d: parseIntVal(g('CPQL Leads 30d')),
      cp2ql_leads_lt:  parseIntVal(g('CPQL Leads Lifetime')),
      cp2ql_7d:        parseMoney(g('CPQL 7d')),
      cp2ql_14d:       parseMoney(g('CPQL 14d')),
      cp2ql_30d:       parseMoney(g('CPQL 30d')),
      cp2ql_lt:        parseMoney(g('CPQL Lifetime')),
      // Sheet "CP2QL" / "CPQ2L" = $2M+ = new cp3ql
      cp3ql_leads_7d:  parseIntVal(g('CP2QL Leads 7d')),
      cp3ql_leads_14d: parseIntVal(g('CP2QL Leads 14d')),
      cp3ql_leads_30d: parseIntVal(g('CP2QL Leads 30d')),
      cp3ql_leads_lt:  parseIntVal(g('CP2QL Leads Lifetime')),
      cp3ql_7d:        parseMoney(g('CPQ2L 7d')),
      cp3ql_14d:       parseMoney(g('CPQ2L 14d')),
      cp3ql_30d:       parseMoney(g('CPQ2L 30d')),
      cp3ql_lt:        parseMoney(g('CPQ2L Lifetime')),
      synced_at:       now,
    })
  }
  return results
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Syncing Google Sheet → Supabase sheet_sot...')
  console.log(`Sheet ID: ${SHEET_ID}`)
  console.log(`Tab:      ${TAB_NAME}\n`)

  const { headers, rows } = await fetchSheetRows()
  console.log(`Fetched ${rows.length} rows from sheet.`)

  const records = parseRows(headers, rows)
  console.log(`Parsed ${records.length} ad-set rows with valid Meta IDs.\n`)

  if (records.length === 0) {
    console.log('Nothing to upsert.')
    return
  }

  const { error } = await supabase
    .from('sheet_sot')
    .upsert(records, { onConflict: 'meta_ad_set_id' })

  if (error) throw new Error(`Supabase upsert failed: ${error.message}`)

  const { count } = await supabase
    .from('sheet_sot')
    .select('*', { count: 'exact', head: true })

  console.log(`✅ sheet_sot synced — ${records.length} rows upserted, ${count} total in table.`)
  for (const r of records) {
    const flag = r.is_active ? '[ACTIVE]' : '       '
    console.log(`  ${flag} ${r.meta_ad_set_id} — ${r.ad_set_name.slice(0, 60)}`)
    console.log(`           cp2ql_7d=$${r.cp2ql_7d ?? 'n/a'}  cp2ql_leads_7d=${r.cp2ql_leads_7d ?? 'n/a'}  cp2ql_lt=$${r.cp2ql_lt ?? 'n/a'}`)
  }
}

main().catch(e => {
  console.error('sync-sheet-sot failed:', e.message)
  process.exit(1)
})
