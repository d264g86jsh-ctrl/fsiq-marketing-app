// types/index.ts — shared TypeScript types across all agents and skills

// ── Lead qualification ────────────────────────────────────────────────────────

export type LeadStage = 'cpql' | 'cp2ql' | 'cp3ql' | 'unqualified'

export interface Lead {
  id: string
  ghl_contact_id: string
  created_at: string
  first_name: string | null
  last_name: string | null
  restaurant_name: string | null
  annual_food_spend: number | null
  lead_stage: LeadStage
  adset_id: string | null
  ad_id: string | null
  campaign_id: string | null
  landing_page: string | null
  source: string | null
}

// ── Recommendations ───────────────────────────────────────────────────────────

export type RecommendationStatus = 'pending' | 'approved' | 'skipped' | 'executed'
export type RecommendationType =
  | 'ad_set_scale_up'
  | 'ad_set_hold'
  | 'ad_set_scale_down'
  | 'ad_set_kill'
  | 'ad_set_insufficient_data'

export interface Recommendation {
  id: string
  agent: string
  skill: string
  type: RecommendationType
  title: string
  body: Record<string, unknown>
  status: RecommendationStatus
  created_at: string
}

// ── Skill run log ─────────────────────────────────────────────────────────────

export interface SkillRun {
  id: string
  agent: string
  skill: string
  started_at: string
  completed_at: string | null
  status: 'success' | 'error' | 'running'
  output_summary: string | null
  recommendations_created: number
}

// ── Data source verification (SOP Section 15) ─────────────────────────────────

export type DataSource =
  | 'supabase_verified'
  | 'sheet_sot'
  | 'conflict_sheet_used'
  | 'attribution_pending'

// ── Ad creative ───────────────────────────────────────────────────────────────

export type AdType = 'Video' | 'Static'
export type AdStatus =
  | 'In Progress'
  | 'Ready to Launch'
  | 'Recording Pending'
  | 'Testing'
  | 'Live'
  | 'Killed'
  | 'Killed - Previous Winner'
  | 'Postponed'

export interface CreativePipelineAd {
  id: string
  ad_id: string
  global_number: number | null
  variant: string | null
  ad_type: AdType
  concept_name: string | null
  hook_description: string | null
  hook_type: string | null
  awareness_level: string | null
  funnel: string | null
  copy_version: string | null
  duration: string | null
  status: AdStatus | null
  launch_date: string | null
  is_active: boolean
  total_spend: number | null
  cp2ql_lifetime: number | null
  cp3ql_lifetime: number | null
}
