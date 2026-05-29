// Skill 1.1 — paid-media.performance-sync.skill.ts
// Runs daily at 6 AM. Pulls all active Meta ad sets, computes multi-window metrics
// from Supabase leads table (CRM-sourced), applies SOP decision logic via Claude,
// writes decisions to Supabase recommendations, then posts each to #MediaBuying inline.
// slack-notify.skill.ts is a catch-up fallback for any that miss the inline post.

import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import {
  getActiveAdSets,
  getCampaignInsights,
  getAdSetD1Insights,
  AdSet,
  CampaignInsightRow,
} from '../../lib/meta'
import { supabase } from '../../lib/supabase'
import { sendBlocks } from '../../lib/slack'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Types ────────────────────────────────────────────────────────────────────

export interface AdSetMetrics {
  ad_set_id: string
  ad_set_name: string
  age_days: number
  daily_budget_usd: number
  // Meta-sourced (Stage 1 spend + leads)
  spend_7d: number
  spend_3d: number
  spend_1d: number
  leads_s1_7d: number
  leads_s1_3d: number
  leads_s1_1d: number
  cpl_7d: number | null
  cpl_3d: number | null
  cpl_1d: number | null
  cpm_7d: number
  cpm_d1: number | null
  // CRM-sourced from Supabase leads table (3-stage qualification)
  cpql_leads_7d: number        // ≥ $600k
  cpql_leads_lifetime: number
  cpql_7d: number | null       // spend_7d / cpql_leads_7d
  cpql_lifetime: number | null
  cp2ql_leads_7d: number       // ≥ $1M
  cp2ql_leads_lifetime: number
  cp2ql_7d: number | null      // spend_7d / cp2ql_leads_7d
  cp2ql_lifetime: number | null
  cp3ql_leads_7d: number       // ≥ $2M
  cp3ql_leads_lifetime: number
  cp3ql_7d: number | null
  cp3ql_lifetime: number | null
  data_source_note: string
  // Dual-source verification (Section 15 of SOP)
  data_source: 'supabase_verified' | 'sheet_sot' | 'conflict_sheet_used' | 'attribution_pending'
}

export interface PerformanceDecision {
  ad_set_id: string
  ad_set_name: string
  action: 'scale_up' | 'hold' | 'scale_down' | 'kill' | 'exempt' | 'insufficient_data'
  current_budget_usd: number
  recommended_budget_usd: number | null
  reason: string
  confidence: 'high' | 'medium' | 'low'
  metrics_used: string[]
  data_source?: string
}

export interface PerformanceSyncOutput {
  run_at: string
  decisions: PerformanceDecision[]
  summary: {
    total_active: number
    scale_up: number
    hold: number
    scale_down: number
    kill: number
    exempt: number
    insufficient_data: number
    total_daily_budget_usd: number
    total_spend_7d: number
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractLeads(actions: { action_type: string; value: string }[] = []): number {
  return actions
    .filter(a => a.action_type.includes('lead'))
    .reduce((sum, a) => sum + parseFloat(a.value || '0'), 0)
}

function safeDivide(numerator: number, denominator: number): number | null {
  if (!denominator || denominator === 0) return null
  return numerator / denominator
}

function ageDays(startTime: string): number {
  return Math.floor((Date.now() - new Date(startTime).getTime()) / (1000 * 60 * 60 * 24))
}

function launchDateString(startTime: string): string {
  return new Date(startTime).toISOString().split('T')[0]
}

function buildInsightMap(rows: CampaignInsightRow[]): Map<string, CampaignInsightRow> {
  const map = new Map<string, CampaignInsightRow>()
  for (const row of rows) map.set(row.adset_id, row)
  return map
}

function isoAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

// ── Supabase leads CPQL computation ──────────────────────────────────────────
// Leads are attributed to ad sets via leads.adset_id (set by GHL webhook from UTM).
// When adset_id is null (pre-attribution data), falls back to account-wide totals.

interface LeadCounts {
  cpql_leads_7d: number
  cpql_leads_lifetime: number
  cp2ql_leads_7d: number
  cp2ql_leads_lifetime: number
  cp3ql_leads_7d: number
  cp3ql_leads_lifetime: number
  cp2ql_7d: number | null
  cp2ql_lifetime: number | null
  cp3ql_7d: number | null
  cp3ql_lifetime: number | null
  has_attribution: boolean
}

async function getLeadCountsForAdSet(
  metaAdSetId: string,
  accountWideCounts: LeadCounts,
  totalActiveAdSets: number,
): Promise<LeadCounts> {
  // Try per-ad-set first (requires adset_id attribution flowing through GHL UTMs)
  const { data: attributed } = await supabase
    .from('leads')
    .select('lead_stage, created_at')
    .eq('adset_id', metaAdSetId)
    .in('lead_stage', ['cpql', 'cp2ql', 'cp3ql'])

  if (attributed && attributed.length > 0) {
    const cutoff7d = isoAgo(7)
    const cpql7d  = attributed.filter(r => r.lead_stage === 'cpql'  && r.created_at >= cutoff7d).length
    const cp2ql7d = attributed.filter(r => r.lead_stage === 'cp2ql' && r.created_at >= cutoff7d).length
    const cp3ql7d = attributed.filter(r => r.lead_stage === 'cp3ql' && r.created_at >= cutoff7d).length
    // cpql count includes cp2ql+cp3ql (they cleared the $600k threshold too)
    const cpqlTotal  = attributed.filter(r => ['cpql','cp2ql','cp3ql'].includes(r.lead_stage)).length
    const cp2qlTotal = attributed.filter(r => ['cp2ql','cp3ql'].includes(r.lead_stage)).length
    const cp3qlTotal = attributed.filter(r => r.lead_stage === 'cp3ql').length

    return {
      cpql_leads_7d:        cpql7d + cp2ql7d + cp3ql7d,
      cpql_leads_lifetime:  cpqlTotal,
      cp2ql_leads_7d:       cp2ql7d + cp3ql7d,
      cp2ql_leads_lifetime: cp2qlTotal,
      cp3ql_leads_7d:       cp3ql7d,
      cp3ql_leads_lifetime: cp3qlTotal,
      cp2ql_7d:             null, // computed from spend7d in mergeDataSources
      cp2ql_lifetime:       null,
      cp3ql_7d:             null,
      cp3ql_lifetime:       null,
      has_attribution: true,
    }
  }

  // No per-ad-set data — return zero counts (Sheet SOT will be authoritative)
  return {
    cpql_leads_7d:        0,
    cpql_leads_lifetime:  0,
    cp2ql_leads_7d:       0,
    cp2ql_leads_lifetime: 0,
    cp3ql_leads_7d:       0,
    cp3ql_leads_lifetime: 0,
    cp2ql_7d:             null,
    cp2ql_lifetime:       null,
    cp3ql_7d:             null,
    cp3ql_lifetime:       null,
    has_attribution: false,
  }
}

async function getAccountWideLeadCounts(): Promise<LeadCounts> {
  const cutoff7d = isoAgo(7)

  const [all7d, allLifetime] = await Promise.all([
    supabase
      .from('leads')
      .select('lead_stage')
      .in('lead_stage', ['cpql', 'cp2ql', 'cp3ql'])
      .gte('created_at', cutoff7d),
    supabase
      .from('leads')
      .select('lead_stage')
      .in('lead_stage', ['cpql', 'cp2ql', 'cp3ql']),
  ])

  const rows7d       = all7d.data ?? []
  const rowsLifetime = allLifetime.data ?? []

  return {
    cpql_leads_7d:        rows7d.filter(r => ['cpql','cp2ql','cp3ql'].includes(r.lead_stage)).length,
    cpql_leads_lifetime:  rowsLifetime.filter(r => ['cpql','cp2ql','cp3ql'].includes(r.lead_stage)).length,
    cp2ql_leads_7d:       rows7d.filter(r => ['cp2ql','cp3ql'].includes(r.lead_stage)).length,
    cp2ql_leads_lifetime: rowsLifetime.filter(r => ['cp2ql','cp3ql'].includes(r.lead_stage)).length,
    cp3ql_leads_7d:       rows7d.filter(r => r.lead_stage === 'cp3ql').length,
    cp3ql_leads_lifetime: rowsLifetime.filter(r => r.lead_stage === 'cp3ql').length,
    cp2ql_7d:             null,
    cp2ql_lifetime:       null,
    cp3ql_7d:             null,
    cp3ql_lifetime:       null,
    has_attribution: false,
  }
}

// ── Sheet SOT lookup ─────────────────────────────────────────────────────────
// Fetches sheet_sot row for a given Meta ad set ID.
// Returns null if no sheet entry exists (new ad set not yet in sheet).

interface SheetSotData {
  cp2ql_leads_7d: number | null
  cp2ql_leads_14d: number | null
  cp2ql_leads_lt: number | null
  cp2ql_7d: number | null
  cp2ql_14d: number | null
  cp2ql_lt: number | null
  cp3ql_leads_7d: number | null
  cp3ql_leads_lt: number | null
  cp3ql_7d: number | null
  cp3ql_lt: number | null
  spend_7d: number | null
  leads_s1_7d: number | null
  cpl_7d: number | null
}

async function getSheetSotData(metaAdSetId: string): Promise<SheetSotData | null> {
  const { data } = await supabase
    .from('sheet_sot')
    .select(
      'cp2ql_leads_7d,cp2ql_leads_14d,cp2ql_leads_lt,' +
      'cp2ql_7d,cp2ql_14d,cp2ql_lt,' +
      'cp3ql_leads_7d,cp3ql_leads_lt,' +
      'cp3ql_7d,cp3ql_lt,' +
      'spend_7d,leads_s1_7d,cpl_7d'
    )
    .eq('meta_ad_set_id', metaAdSetId)
    .single()
  return (data as SheetSotData | null) ?? null
}

// ── Dual-source merge ─────────────────────────────────────────────────────────
// Section 15 of SOP: merge Supabase leads data with Sheet SOT.
// Rules:
//   - Supabase 0, Sheet has data → use Sheet; flag 'sheet_sot'
//   - Both agree → flag 'supabase_verified'
//   - Sources conflict → use Sheet; flag 'conflict_sheet_used'
//   - Sheet missing → flag 'attribution_pending'; hold, no kill

interface MergedCpql {
  cp2ql_leads_7d: number
  cp2ql_leads_lifetime: number
  cp2ql_7d: number | null
  cp2ql_lifetime: number | null
  cp3ql_leads_7d: number
  cp3ql_leads_lifetime: number
  cp3ql_7d: number | null
  cp3ql_lifetime: number | null
  data_source: AdSetMetrics['data_source']
  data_source_note: string
}

function mergeDataSources(
  supabaseCounts: LeadCounts,
  sheetData: SheetSotData | null,
  spend7d: number,
): MergedCpql {
  const supaHasData = supabaseCounts.cp2ql_leads_lifetime > 0

  // Compute CPQL ratios from Supabase lead counts + current spend window
  const safe = (n: number) => n > 0 ? spend7d / n : null
  const supa_cp2ql_7d      = supabaseCounts.cp2ql_7d      ?? safe(supabaseCounts.cp2ql_leads_7d)
  const supa_cp2ql_lifetime = supabaseCounts.cp2ql_lifetime ?? null  // lifetime spend not available
  const supa_cp3ql_7d      = supabaseCounts.cp3ql_7d      ?? safe(supabaseCounts.cp3ql_leads_7d)
  const supa_cp3ql_lifetime = supabaseCounts.cp3ql_lifetime ?? null

  if (!sheetData) {
    // Sheet has no entry for this ad set — hold, never kill
    return {
      cp2ql_leads_7d:       supabaseCounts.cp2ql_leads_7d,
      cp2ql_leads_lifetime: supabaseCounts.cp2ql_leads_lifetime,
      cp2ql_7d:             supabaseCounts.cp2ql_7d ?? null,
      cp2ql_lifetime:       supabaseCounts.cp2ql_lifetime ?? null,
      cp3ql_leads_7d:       supabaseCounts.cp3ql_leads_7d,
      cp3ql_leads_lifetime: supabaseCounts.cp3ql_leads_lifetime,
      cp3ql_7d:             supabaseCounts.cp3ql_7d ?? null,
      cp3ql_lifetime:       supabaseCounts.cp3ql_lifetime ?? null,
      data_source:          'attribution_pending',
      data_source_note:     'No Sheet SOT entry — new ad set or sheet not yet synced. Hold only, no KILL.',
    }
  }

  const sheetHasData = (sheetData.cp2ql_leads_lt ?? 0) > 0
  const safeDivide = (n: number, d: number | null) => (d && d > 0) ? n / d : null

  // Compute CPQL from sheet data using current spend_7d
  const sheet_cp2ql_7d = sheetData.cp2ql_7d  // sheet computes this directly
  const sheet_cp2ql_lt = sheetData.cp2ql_lt
  const sheet_cp3ql_7d = sheetData.cp3ql_7d
  const sheet_cp3ql_lt = sheetData.cp3ql_lt

  if (!supaHasData && sheetHasData) {
    // Supabase attribution pending — use Sheet as authority
    return {
      cp2ql_leads_7d:       sheetData.cp2ql_leads_7d ?? 0,
      cp2ql_leads_lifetime: sheetData.cp2ql_leads_lt ?? 0,
      cp2ql_7d:             sheet_cp2ql_7d,
      cp2ql_lifetime:       sheet_cp2ql_lt,
      cp3ql_leads_7d:       sheetData.cp3ql_leads_7d ?? 0,
      cp3ql_leads_lifetime: sheetData.cp3ql_leads_lt ?? 0,
      cp3ql_7d:             sheet_cp3ql_7d,
      cp3ql_lifetime:       sheet_cp3ql_lt,
      data_source:          'sheet_sot',
      data_source_note:     'Sheet SOT used — Supabase attribution pending (webhook not yet live or UTMs not flowing)',
    }
  }

  if (supaHasData && sheetHasData) {
    // Both have data — check for agreement
    const supaLeads7d = supabaseCounts.cp2ql_leads_7d
    const sheetLeads7d = sheetData.cp2ql_leads_7d ?? 0
    const supaBad  = supabaseCounts.cp2ql_7d != null && supabaseCounts.cp2ql_7d > 450
    const sheetBad = sheet_cp2ql_7d != null && sheet_cp2ql_7d > 450
    const bothBad  = supaBad && sheetBad

    if (bothBad) {
      // Both agree: underperforming — allow KILL/SCALE DOWN
      return {
        cp2ql_leads_7d:       supabaseCounts.cp2ql_leads_7d,
        cp2ql_leads_lifetime: supabaseCounts.cp2ql_leads_lifetime,
        cp2ql_7d:             supabaseCounts.cp2ql_7d ?? null,
        cp2ql_lifetime:       supabaseCounts.cp2ql_lifetime ?? null,
        cp3ql_leads_7d:       supabaseCounts.cp3ql_leads_7d,
        cp3ql_leads_lifetime: supabaseCounts.cp3ql_leads_lifetime,
        cp3ql_7d:             supabaseCounts.cp3ql_7d ?? null,
        cp3ql_lifetime:       supabaseCounts.cp3ql_lifetime ?? null,
        data_source:          'supabase_verified',
        data_source_note:     'Dual source verified ✅ — both Supabase and Sheet agree on underperformance',
      }
    }

    if (!bothBad) {
      // Sources conflict or both look fine — Sheet wins, use its data
      return {
        cp2ql_leads_7d:       sheetData.cp2ql_leads_7d ?? supabaseCounts.cp2ql_leads_7d,
        cp2ql_leads_lifetime: sheetData.cp2ql_leads_lt ?? supabaseCounts.cp2ql_leads_lifetime,
        cp2ql_7d:             sheet_cp2ql_7d ?? supabaseCounts.cp2ql_7d ?? null,
        cp2ql_lifetime:       sheet_cp2ql_lt ?? supabaseCounts.cp2ql_lifetime ?? null,
        cp3ql_leads_7d:       sheetData.cp3ql_leads_7d ?? supabaseCounts.cp3ql_leads_7d,
        cp3ql_leads_lifetime: sheetData.cp3ql_leads_lt ?? supabaseCounts.cp3ql_leads_lifetime,
        cp3ql_7d:             sheet_cp3ql_7d ?? supabaseCounts.cp3ql_7d ?? null,
        cp3ql_lifetime:       sheet_cp3ql_lt ?? supabaseCounts.cp3ql_lifetime ?? null,
        data_source:          supaBad !== sheetBad ? 'conflict_sheet_used' : 'supabase_verified',
        data_source_note:     supaBad !== sheetBad
          ? '⚠️ Source conflict — Sheet data used (Sheet is higher authority per SOP Section 15)'
          : 'Dual source verified ✅ — both sources agree on performance',
      }
    }
  }

  // supaHasData && !sheetHasData — Sheet is empty for this ad set; use Supabase but flag it
  return {
    cp2ql_leads_7d:       supabaseCounts.cp2ql_leads_7d,
    cp2ql_leads_lifetime: supabaseCounts.cp2ql_leads_lifetime,
    cp2ql_7d:             supabaseCounts.cp2ql_7d ?? null,
    cp2ql_lifetime:       supabaseCounts.cp2ql_lifetime ?? null,
    cp3ql_leads_7d:       supabaseCounts.cp3ql_leads_7d,
    cp3ql_leads_lifetime: supabaseCounts.cp3ql_leads_lifetime,
    cp3ql_7d:             supabaseCounts.cp3ql_7d ?? null,
    cp3ql_lifetime:       supabaseCounts.cp3ql_lifetime ?? null,
    data_source:          'supabase_verified',
    data_source_note:     'Supabase data used — Sheet has no CPQL entries for this ad set (may be new or zeroed)',
  }
}

// ── Main skill function ───────────────────────────────────────────────────────

export async function runPerformanceSync(): Promise<PerformanceSyncOutput> {
  // 1. Load both SOPs at runtime — passed as context to every Claude API call
  const paidMediaSop = fs.readFileSync(
    path.join(process.cwd(), 'sops', 'paid-media-agent-sop.md'),
    'utf-8'
  )
  const creativePipelineSop = fs.readFileSync(
    path.join(process.cwd(), 'sops', 'creative-pipeline-sop.md'),
    'utf-8'
  )

  // 2. Pull active ad sets + insights from Meta (3 windows)
  const [adSetsRes, insights7d, insights3d, insights1d] = await Promise.all([
    getActiveAdSets(),
    getCampaignInsights('last_7d'),
    getCampaignInsights('last_3d'),
    getCampaignInsights('yesterday'),
  ])

  const adSets = adSetsRes.data
  const map7d  = buildInsightMap(insights7d.data)
  const map3d  = buildInsightMap(insights3d.data)
  const map1d  = buildInsightMap(insights1d.data)

  // 3. D1 CPM for new ad sets (≤7 days old)
  const newAdSets = adSets.filter(a => a.start_time && ageDays(a.start_time) <= 7)
  const d1Results = await Promise.all(
    newAdSets.map(async a => {
      try {
        const res = await getAdSetD1Insights(a.id, launchDateString(a.start_time!))
        return { id: a.id, cpm_d1: parseFloat(res.data[0]?.cpm ?? '0') }
      } catch {
        return { id: a.id, cpm_d1: null }
      }
    })
  )
  const d1Map = new Map(d1Results.map(r => [r.id, r.cpm_d1]))

  // 4. Account-wide lead counts from Supabase leads table
  const accountWideCounts = await getAccountWideLeadCounts()

  // 5. Per-ad-set: Supabase leads (CRM) + sheet_sot (Sheet SOT) — fetched in parallel
  const perAdSetData = await Promise.all(
    adSets.map(async adSet => {
      const [supaLeads, sheetData] = await Promise.all([
        getLeadCountsForAdSet(adSet.id, accountWideCounts, adSets.length),
        getSheetSotData(adSet.id),
      ])
      return { adSetId: adSet.id, supaLeads, sheetData }
    })
  )
  const supaLeadMap  = new Map(perAdSetData.map(d => [d.adSetId, d.supaLeads]))
  const sheetSotMap  = new Map(perAdSetData.map(d => [d.adSetId, d.sheetData]))

  // 6. Build per-ad-set metric snapshots with dual-source merge (SOP Section 15)
  const metrics: AdSetMetrics[] = adSets.map(adSet => {
    const row7d  = map7d.get(adSet.id)
    const row3d  = map3d.get(adSet.id)
    const row1d  = map1d.get(adSet.id)
    const supaLeads = supaLeadMap.get(adSet.id)!
    const sheetData = sheetSotMap.get(adSet.id) ?? null

    const spend7d = parseFloat(row7d?.spend ?? '0')
    const spend3d = parseFloat(row3d?.spend ?? '0')
    const spend1d = parseFloat(row1d?.spend ?? '0')
    const s1_7d   = extractLeads(row7d?.actions)
    const s1_3d   = extractLeads(row3d?.actions)
    const s1_1d   = extractLeads(row1d?.actions)
    const age     = adSet.start_time ? ageDays(adSet.start_time) : 999
    const budget  = parseFloat(adSet.daily_budget ?? '0') / 100

    // Dual-source merge per SOP Section 15
    const merged = mergeDataSources(supaLeads, sheetData, spend7d)

    // cpql ($600k+) is not tracked in the Sheet — derive from Supabase only
    const cpql7d = safeDivide(spend7d, supaLeads.cpql_leads_7d)
    const cpqlLt = supaLeads.has_attribution ? safeDivide(spend7d, supaLeads.cpql_leads_lifetime) : null

    return {
      ad_set_id:        adSet.id,
      ad_set_name:      adSet.name,
      age_days:         age,
      daily_budget_usd: budget,
      spend_7d:  spend7d,
      spend_3d:  spend3d,
      spend_1d:  spend1d,
      leads_s1_7d: s1_7d,
      leads_s1_3d: s1_3d,
      leads_s1_1d: s1_1d,
      cpl_7d: safeDivide(spend7d, s1_7d),
      cpl_3d: safeDivide(spend3d, s1_3d),
      cpl_1d: safeDivide(spend1d, s1_1d),
      cpm_7d: parseFloat(row7d?.cpm ?? '0'),
      cpm_d1: d1Map.has(adSet.id) ? d1Map.get(adSet.id)! : parseFloat(row7d?.cpm ?? '0'),
      cpql_leads_7d:        supaLeads.cpql_leads_7d,
      cpql_leads_lifetime:  supaLeads.cpql_leads_lifetime,
      cpql_7d:              cpql7d,
      cpql_lifetime:        cpqlLt,
      // These come from the dual-source merge
      cp2ql_leads_7d:       merged.cp2ql_leads_7d,
      cp2ql_leads_lifetime: merged.cp2ql_leads_lifetime,
      cp2ql_7d:             merged.cp2ql_7d,
      cp2ql_lifetime:       merged.cp2ql_lifetime,
      cp3ql_leads_7d:       merged.cp3ql_leads_7d,
      cp3ql_leads_lifetime: merged.cp3ql_leads_lifetime,
      cp3ql_7d:             merged.cp3ql_7d,
      cp3ql_lifetime:       merged.cp3ql_lifetime,
      data_source:          merged.data_source,
      data_source_note:     merged.data_source_note,
    }
  })

  // 7. Claude: apply SOP decision logic with full context + dual-source awareness
  const prompt = `You are the FSIQ Paid Media performance analysis skill.

## PAID MEDIA SOP (follow all rules exactly):
${paidMediaSop}

## CREATIVE PIPELINE SOP (for naming and classification):
${creativePipelineSop}

## Active Ad Set Metrics (sourced from Meta API + dual-source CPQL verification):
${JSON.stringify(metrics, null, 2)}

## Instructions:
For each ad set, apply the decision logic from SOP Section 6 AND the dual-source verification rules from SOP Section 15.

Key rules:
- If ad_set_name contains "AW-AD" → action = "exempt"
- If age_days ≤ 7 → evaluate by CPM band (SOP section 5)
- If data_source = "attribution_pending" → action = "hold" only, NEVER kill or scale_down
- If data_source = "sheet_sot" → use the Sheet CPQL values provided; they are the authoritative source
- If data_source = "conflict_sheet_used" → Sheet data is already selected; apply normal thresholds to it
- If data_source = "supabase_verified" → both sources agree; normal decision logic applies
- KILL requires: data_source is "supabase_verified" AND cp2ql_7d > $450; OR age_days > 21 AND cp2ql_leads_lifetime == 0 AND data_source != "attribution_pending"
- SCALE DOWN requires: data_source is NOT "attribution_pending" AND $300 < cp2ql_7d ≤ $450
- SCALE UP: cp2ql_7d < $150 AND cpql_7d < $200 (or cpql_7d null is OK if cp2ql_7d < $150)
- scale_up budget = current + min(25%, $35), rounded to $5
- scale_down budget = current × 0.5, rounded to $5
- kill budget = 0; hold/exempt/insufficient_data budget = no change
- confidence = "high" if cp2ql_7d present from Sheet or verified Supabase, "medium" if CPL-only, "low" if < 2 days

Return ONLY valid JSON — no markdown:
{
  "decisions": [
    {
      "ad_set_id": "string",
      "ad_set_name": "string",
      "action": "scale_up|hold|scale_down|kill|exempt|insufficient_data",
      "current_budget_usd": number,
      "recommended_budget_usd": number | null,
      "reason": "one sentence",
      "confidence": "high|medium|low",
      "metrics_used": ["array of metric names"],
      "data_source": "supabase_verified|sheet_sot|conflict_sheet_used|attribution_pending"
    }
  ]
}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
  let decisions: PerformanceDecision[]
  try {
    decisions = JSON.parse(rawText).decisions
  } catch {
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    decisions = JSON.parse(cleaned).decisions
  }

  // 8. Write non-hold decisions to Supabase recommendations (include data_source)
  const now = new Date().toISOString()
  const toInsert = decisions
    .filter(d => d.action !== 'hold' && d.action !== 'exempt')
    .map(d => ({
      agent: 'paid-media',
      skill: 'performance-sync',
      type: `ad_set_${d.action}`,
      title: `[${d.action.toUpperCase().replace('_', ' ')}] ${d.ad_set_name}`,
      body: { ...d, data_source: d.data_source ?? metrics.find(m => m.ad_set_id === d.ad_set_id)?.data_source },
      status: 'pending',
    }))

  type InsertedRec = { id: string; body: PerformanceDecision }
  let insertedRecs: InsertedRec[] = []
  if (toInsert.length > 0) {
    const { data: recRows } = await supabase
      .from('recommendations')
      .insert(toInsert)
      .select('id, body')
    insertedRecs = (recRows ?? []) as InsertedRec[]
  }

  // 9. Post each non-hold/exempt decision to #MediaBuying inline
  //    Saves slack_ts back so slack-notify.skill.ts (catch-up) skips these
  const ACTION_ICONS: Record<string, string> = {
    scale_up: '⬆️', scale_down: '⬇️', kill: '🔴', insufficient_data: '❓',
  }
  const DS_LABELS: Record<string, string> = {
    supabase_verified: '✅ Dual verified', sheet_sot: '📊 Sheet SOT',
    conflict_sheet_used: '⚠️ Conflict→Sheet', attribution_pending: '⏳ Attr pending',
  }

  for (const inserted of insertedRecs) {
    const d = inserted.body as PerformanceDecision
    const m = metrics.find(x => x.ad_set_id === d.ad_set_id)
    const icon = ACTION_ICONS[d.action] ?? '📋'
    const actionLabel = d.action.toUpperCase().replace('_', ' ')
    const adName = d.ad_set_name.length > 55 ? d.ad_set_name.slice(0, 52) + '…' : d.ad_set_name
    const budgetLine = d.recommended_budget_usd && d.recommended_budget_usd !== d.current_budget_usd
      ? `$${d.current_budget_usd}/day → *$${d.recommended_budget_usd}/day*`
      : `$${d.current_budget_usd}/day (no change)`
    const dsLabel = DS_LABELS[d.data_source ?? ''] ?? (d.data_source ?? 'unknown')
    const fmt = (v: number | null | undefined) => v != null ? `$${v.toFixed(0)}` : 'n/a'
    const metricsLine = [
      `CP2QL 7d: ${fmt(m?.cp2ql_7d)}`,
      `Leads (7d): ${m?.cp2ql_leads_7d ?? 'n/a'}`,
      `CP3QL 7d: ${fmt(m?.cp3ql_7d)}`,
      `CPL 7d: ${fmt(m?.cpl_7d)}`,
      `Spend 7d: ${fmt(m?.spend_7d)}`,
    ].join('  |  ')

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `${icon} ${actionLabel} — ${adName}`, emoji: true } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Budget*\n${budgetLine}` },
          { type: 'mrkdwn', text: `*Confidence*\n${d.confidence}` },
          { type: 'mrkdwn', text: `*Data Source*\n${dsLabel}` },
          { type: 'mrkdwn', text: `*Action*\n${actionLabel}` },
        ],
      },
      { type: 'section', text: { type: 'mrkdwn', text: `\`${metricsLine}\`` } },
      { type: 'section', text: { type: 'mrkdwn', text: `*Reason:* ${d.reason}` } },
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: '✅ Approve', emoji: true }, style: 'primary', action_id: 'approve_recommendation', value: inserted.id },
          { type: 'button', text: { type: 'plain_text', text: '❌ Skip', emoji: true }, style: 'danger', action_id: 'skip_recommendation', value: inserted.id },
        ],
      },
    ] as never[]

    try {
      const result = await sendBlocks('mediaBuying', blocks, `${icon} ${actionLabel}: ${d.ad_set_name}`)
      if (result.ok && result.ts && result.channel) {
        await supabase.from('recommendations')
          .update({ slack_ts: result.ts, slack_channel: result.channel })
          .eq('id', inserted.id)
      }
    } catch (err) {
      console.warn(`[performance-sync] Slack post failed for ${d.ad_set_name}:`, (err as Error).message)
    }
  }

  // 10. Upsert snapshot to ad_performance for history
  const perfUpserts = metrics.map(m => ({
    ad_set_id:    m.ad_set_id,
    ad_set_name:  m.ad_set_name,
    status:       'ACTIVE',
    daily_budget: m.daily_budget_usd,
    spend_7d:     m.spend_7d,
    spend_3d:     m.spend_3d,
    spend_1d:     m.spend_1d,
    leads_s1_7d:  m.leads_s1_7d,
    leads_s1_3d:  m.leads_s1_3d,
    leads_s1_1d:  m.leads_s1_1d,
    cpl_7d:           m.cpl_7d,
    cpm_d1:           m.cpm_d1,
    cpql_leads_7d:    m.cpql_leads_7d,
    cpql_leads_lifetime: m.cpql_leads_lifetime,
    cpql_7d:          m.cpql_7d,
    cpql_lifetime:    m.cpql_lifetime,
    cp2ql_leads_7d:   m.cp2ql_leads_7d,
    cp2ql_leads_lifetime: m.cp2ql_leads_lifetime,
    cp2ql_7d:         m.cp2ql_7d,
    cp2ql_lifetime:   m.cp2ql_lifetime,
    cp3ql_leads_7d:   m.cp3ql_leads_7d,
    cp3ql_leads_lifetime: m.cp3ql_leads_lifetime,
    cp3ql_7d:         m.cp3ql_7d,
    cp3ql_lifetime:   m.cp3ql_lifetime,
    last_synced:  now,
  }))
  await supabase.from('ad_performance').upsert(perfUpserts, { onConflict: 'ad_set_id' })

  // 11. Log skill run
  const actionCounts = decisions.reduce(
    (acc, d) => { acc[d.action] = (acc[d.action] ?? 0) + 1; return acc },
    {} as Record<string, number>
  )
  await supabase.from('skill_runs').insert({
    agent:    'paid-media',
    skill:    'performance-sync',
    started_at:  now,
    completed_at: new Date().toISOString(),
    status:   'success',
    output_summary: JSON.stringify(actionCounts),
    recommendations_created: toInsert.length,
  })

  return {
    run_at: now,
    decisions,
    summary: {
      total_active:           adSets.length,
      scale_up:               actionCounts['scale_up'] ?? 0,
      hold:                   actionCounts['hold'] ?? 0,
      scale_down:             actionCounts['scale_down'] ?? 0,
      kill:                   actionCounts['kill'] ?? 0,
      exempt:                 actionCounts['exempt'] ?? 0,
      insufficient_data:      actionCounts['insufficient_data'] ?? 0,
      total_daily_budget_usd: metrics.reduce((s, m) => s + m.daily_budget_usd, 0),
      total_spend_7d:         metrics.reduce((s, m) => s + m.spend_7d, 0),
    },
  }
}

// Standard skill entry point expected by app/api/agents/run/route.ts
export const run = runPerformanceSync
