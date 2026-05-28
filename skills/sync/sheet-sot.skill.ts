// sheet-sot.skill.ts — Sync Agent Skill
// Syncs the Google Sheet "Meta Ads All Data" tab into Supabase sheet_sot table.
// Wraps the logic from scripts/sync-sheet-sot.ts as a callable skill.
import fs from 'fs'
import path from 'path'
import { supabase } from '../../lib/supabase'

const SHEET_ID = '1nx5PXn6AnLWdskroFwkNLXPPcvBy9spy_2ggNAnvRFI'
const TAB_NAME = 'Meta Ads (All Data)'

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

export async function run(): Promise<{ synced: number; total: number }> {
  const sop = fs.readFileSync(
    path.join(process.cwd(), 'sops', 'paid-media-agent-sop.md'),
    'utf-8'
  )
  void sop

  const apiKey = process.env.GOOGLE_SHEETS_API_KEY
  if (!apiKey) throw new Error('GOOGLE_SHEETS_API_KEY not set')

  const range = encodeURIComponent(`${TAB_NAME}!A:AX`)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${apiKey}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Google Sheets API error ${res.status}: ${await res.text()}`)

  const json = await res.json() as { values?: string[][] }
  const allRows = json.values ?? []
  if (allRows.length < 2) throw new Error('Sheet returned fewer than 2 rows')

  const headers = allRows[0].map((h: string) => h.trim())
  const rows = allRows.slice(1)
  const now = new Date().toISOString()

  const records = []
  for (const row of rows) {
    const adSetName = get(row, headers, 'Ad Set Name')?.trim()
    const metaIdRaw = get(row, headers, 'Active Ad Set')?.trim()
    if (!adSetName || !metaIdRaw) continue
    const metaId = metaIdRaw.match(/\d{10,}/)?.[0]
    if (!metaId) continue

    const g = (col: string) => get(row, headers, col)
    records.push({
      meta_ad_set_id:   metaId,
      ad_set_name:      adSetName,
      is_active:        g('Is Active') === '1',
      last_active_date: g('Last Active Date') || null,
      spend_total:      parseMoney(g('Cost')),
      spend_7d:         parseMoney(g('Cost 7d')),
      spend_14d:        parseMoney(g('Cost 14d')),
      spend_30d:        parseMoney(g('Cost 30d')),
      leads_s1_7d:      parseIntVal(g('Leads 7d')),
      leads_s1_lt:      parseIntVal(g('Leads Lifetime')),
      cpl_7d:           parseMoney(g('CPL 7d')),
      cpl_lt:           parseMoney(g('CPL Lifetime')),
      cp2ql_leads_7d:   parseIntVal(g('CPQL Leads 7d')),
      cp2ql_leads_14d:  parseIntVal(g('CPQL Leads 14d')),
      cp2ql_leads_30d:  parseIntVal(g('CPQL Leads 30d')),
      cp2ql_leads_lt:   parseIntVal(g('CPQL Leads Lifetime')),
      cp2ql_7d:         parseMoney(g('CPQL 7d')),
      cp2ql_14d:        parseMoney(g('CPQL 14d')),
      cp2ql_30d:        parseMoney(g('CPQL 30d')),
      cp2ql_lt:         parseMoney(g('CPQL Lifetime')),
      cp3ql_leads_7d:   parseIntVal(g('CP2QL Leads 7d')),
      cp3ql_leads_14d:  parseIntVal(g('CP2QL Leads 14d')),
      cp3ql_leads_30d:  parseIntVal(g('CP2QL Leads 30d')),
      cp3ql_leads_lt:   parseIntVal(g('CP2QL Leads Lifetime')),
      cp3ql_7d:         parseMoney(g('CPQ2L 7d')),
      cp3ql_14d:        parseMoney(g('CPQ2L 14d')),
      cp3ql_30d:        parseMoney(g('CPQ2L 30d')),
      cp3ql_lt:         parseMoney(g('CPQ2L Lifetime')),
      synced_at:        now,
    })
  }

  if (records.length === 0) return { synced: 0, total: 0 }

  const { error } = await supabase
    .from('sheet_sot')
    .upsert(records, { onConflict: 'meta_ad_set_id' })
  if (error) throw new Error(`Supabase upsert failed: ${error.message}`)

  const { count } = await supabase
    .from('sheet_sot')
    .select('*', { count: 'exact', head: true })

  await supabase.from('skill_runs').insert({
    agent: 'sync',
    skill: 'sheet-sot',
    started_at: now,
    completed_at: new Date().toISOString(),
    status: 'success',
    output: { synced: records.length, total: count },
  })

  return { synced: records.length, total: count ?? 0 }
}
