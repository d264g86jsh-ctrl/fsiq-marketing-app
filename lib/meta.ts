const BASE = 'https://graph.facebook.com/v21.0'
const TOKEN = process.env.META_ACCESS_TOKEN!
const AD_ACCOUNT = process.env.META_AD_ACCOUNT_ID! // e.g. act_1283218729838066

async function metaFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`)
  url.searchParams.set('access_token', TOKEN)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString())
  const json = await res.json()
  if (json.error) throw new Error(`Meta API: ${json.error.message} (code ${json.error.code})`)
  return json as T
}

export async function getAdAccount() {
  return metaFetch<{ id: string; name: string; account_status: number }>(`/${AD_ACCOUNT}`, {
    fields: 'id,name,account_status,currency,timezone_name',
  })
}

export async function getActiveAdSets() {
  return metaFetch<{ data: AdSet[] }>(`/${AD_ACCOUNT}/adsets`, {
    fields:
      'id,name,status,daily_budget,lifetime_budget,start_time,campaign_id',
    filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
    limit: '100',
  })
}

// All ad sets in the FSIQ campaign for a given window — 1 API call instead of N
export async function getCampaignInsights(
  datePreset: 'yesterday' | 'last_3d' | 'last_7d' | 'last_30d' | 'maximum' = 'last_7d'
) {
  const campaignId = process.env.META_CAMPAIGN_ID!
  return metaFetch<{ data: CampaignInsightRow[] }>(`/${campaignId}/insights`, {
    fields: 'adset_id,adset_name,spend,impressions,cpm,ctr,actions,cost_per_action_type',
    date_preset: datePreset,
    level: 'adset',
    limit: '100',
  })
}

// D1 CPM for a specific ad set — uses exact launch date as time_range
export async function getAdSetD1Insights(adSetId: string, launchDate: string) {
  return metaFetch<{ data: Insight[] }>(`/${adSetId}/insights`, {
    fields: 'spend,impressions,cpm,actions',
    time_range: JSON.stringify({ since: launchDate, until: launchDate }),
    level: 'adset',
  })
}

// Meta Ads Library (no auth required for transparency data)
export async function scrapeAdsLibrary(pageId: string, limit = 10) {
  const url = new URL('https://graph.facebook.com/v21.0/ads_archive')
  url.searchParams.set('access_token', TOKEN)
  url.searchParams.set('ad_reached_countries', '["US"]')
  url.searchParams.set('search_page_ids', pageId)
  url.searchParams.set('ad_active_status', 'ACTIVE')
  url.searchParams.set('fields', 'id,ad_creative_body,ad_creative_link_caption,ad_delivery_start_time,page_name,impressions')
  url.searchParams.set('limit', String(limit))

  const res = await fetch(url.toString())
  const json = await res.json()
  if (json.error) throw new Error(`Ads Library: ${json.error.message}`)
  return json as { data: AdsLibraryAd[] }
}

export async function updateAdSetBudget(adSetId: string, dailyBudgetCents: number) {
  const url = new URL(`${BASE}/${adSetId}`)
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: TOKEN, daily_budget: String(dailyBudgetCents) }),
  })
  const json = await res.json()
  if (json.error) throw new Error(`Meta API (budget update): ${json.error.message}`)
  return json as { success: boolean }
}

export async function pauseAdSet(adSetId: string) {
  const url = new URL(`${BASE}/${adSetId}`)
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: TOKEN, status: 'PAUSED' }),
  })
  const json = await res.json()
  if (json.error) throw new Error(`Meta API (pause): ${json.error.message}`)
  return json as { success: boolean }
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface AdSet {
  id: string
  name: string
  status: string
  daily_budget?: string
  lifetime_budget?: string
  start_time?: string
  campaign_id?: string
}

export interface Insight {
  spend: string
  impressions: string
  cpm: string
  ctr: string
  actions?: { action_type: string; value: string }[]
  cost_per_action_type?: { action_type: string; value: string }[]
  date_start: string
  date_stop: string
}

export interface CampaignInsightRow extends Insight {
  adset_id: string
  adset_name: string
}

export interface AdsLibraryAd {
  id: string
  ad_creative_body?: string
  ad_creative_link_caption?: string
  ad_delivery_start_time?: string
  page_name?: string
  impressions?: { lower_bound: string; upper_bound: string }
}
