// GHL → Supabase real-time webhook
// Fires on contact.created and contact.updated events from GoHighLevel.
// Upserts contact into leads table, classifying lead_stage from annual_food_spend.
// contact.updated events are diffed against existing record — no-change events are skipped.

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// ── parseSpend ────────────────────────────────────────────────────────────────
// GHL stores annual_food_spend as a custom field whose value may come in as:
//   - A plain number string: "1200000"
//   - A formatted string: "$1,200,000"
//   - An HTML snippet: "<p>$1,200,000</p>"
//   - A range string: "$1M - $2M" or "1000000 - 2000000"
//   - A shorthand: "$1.2M", "1.5m", "800k", "800K"
// Returns a number (the lower bound for ranges) or null if unparseable.

function parseSpend(raw: unknown): number | null {
  if (raw == null) return null

  let s = String(raw).trim()

  // Strip HTML tags
  s = s.replace(/<[^>]+>/g, ' ').trim()

  // Normalize whitespace
  s = s.replace(/\s+/g, ' ')

  // Remove currency symbols and commas
  s = s.replace(/[$,]/g, '')

  // For ranges like "1M - 2M" or "1000000 - 2000000", take the lower bound
  const rangeMatch = s.match(/^([\d.]+[kmb]?)\s*[-–to]\s*([\d.]+[kmb]?)$/i)
  if (rangeMatch) {
    s = rangeMatch[1]
  }

  // Expand shorthand multipliers
  const multiplierMatch = s.match(/^([\d.]+)\s*([kmb])$/i)
  if (multiplierMatch) {
    const num = parseFloat(multiplierMatch[1])
    const mult = multiplierMatch[2].toLowerCase()
    if (!isNaN(num)) {
      if (mult === 'k') return Math.round(num * 1_000)
      if (mult === 'm') return Math.round(num * 1_000_000)
      if (mult === 'b') return Math.round(num * 1_000_000_000)
    }
  }

  const parsed = parseFloat(s)
  return isNaN(parsed) ? null : Math.round(parsed)
}

// ── classifyStage ─────────────────────────────────────────────────────────────

function classifyStage(spend: number | null): 'cp3ql' | 'cp2ql' | 'cpql' | 'unqualified' {
  if (spend == null) return 'unqualified'
  if (spend >= 2_000_000) return 'cp3ql'
  if (spend >= 1_000_000) return 'cp2ql'
  if (spend >= 600_000)   return 'cpql'
  return 'unqualified'
}

// ── extractCustomField ────────────────────────────────────────────────────────

function getField(fields: { id?: string; key?: string; value?: unknown; field_value?: unknown }[], key: string): unknown {
  const f = fields.find(f => f.key === key || f.id === key)
  // GHL sends custom field values as 'field_value' in webhook payloads; 'value' in API responses
  return f?.value ?? f?.field_value ?? null
}

// ── Meaningful field diff ─────────────────────────────────────────────────────
// Returns true if the incoming record differs from the existing DB record in any
// field that would affect lead scoring, attribution, or identity.

type LeadRecord = {
  first_name: string | null
  last_name: string | null
  restaurant_name: string | null
  annual_food_spend: number | null
  ad_attribution: string | null
  adset_id: string | null
  ghl_pipeline_stage: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
}

function hasMeaningfulChange(incoming: LeadRecord, existing: LeadRecord): boolean {
  const fields = [
    'first_name',
    'last_name',
    'restaurant_name',
    'annual_food_spend',
    'ad_attribution',
    'adset_id',
    'ghl_pipeline_stage',
    'utm_source',
    'utm_medium',
    'utm_campaign',
  ] as const

  for (const f of fields) {
    const a = incoming[f] ?? null
    const b = existing[f] ?? null
    // Normalize to string for comparison so null vs '' doesn't cause false positives
    if (String(a ?? '') !== String(b ?? '')) return true
  }
  return false
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startedAt = new Date().toISOString()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const type = body.type as string | undefined
  if (type !== 'contact.created' && type !== 'contact.updated') {
    return NextResponse.json({ ok: true, skipped: true, type })
  }

  // GHL sends the contact under body.contact (webhook v2) or directly as body (v1)
  const contact = (body.contact ?? body) as Record<string, unknown>

  const ghl_contact_id = contact.id as string | undefined
  if (!ghl_contact_id) {
    return NextResponse.json({ error: 'Missing contact.id' }, { status: 400 })
  }

  const customFields = (contact.customFields ?? contact.custom_fields ?? []) as {
    id?: string; key?: string; value?: unknown
  }[]

  // Parse annual_food_spend — GHL field key may vary; try both common forms
  const rawSpend =
    getField(customFields, 'annual_food_spend') ??
    getField(customFields, 'annual_food_cost') ??
    contact.annual_food_spend

  const annual_food_spend = parseSpend(rawSpend)
  const lead_stage        = classifyStage(annual_food_spend)

  const firstName = (contact.firstName ?? contact.first_name ?? '') as string
  const lastName  = (contact.lastName  ?? contact.last_name  ?? '') as string

  // Attribution fields — GHL passes UTM params as custom fields or under attributionSource
  const attribution = (contact.attributionSource ?? {}) as Record<string, unknown>
  const utm_source   = (getField(customFields, 'utm_source')   ?? attribution.utmSource   ?? contact.utm_source   ?? null) as string | null
  const utm_medium   = (getField(customFields, 'utm_medium')   ?? attribution.utmMedium   ?? contact.utm_medium   ?? null) as string | null
  const utm_campaign = (getField(customFields, 'utm_campaign') ?? attribution.utmCampaign ?? contact.utm_campaign ?? null) as string | null
  // utm_content = ad set name in Meta campaigns
  const utm_content  = (getField(customFields, 'utm_content')  ?? attribution.utmContent  ?? contact.utm_content  ?? null) as string | null
  const utm_term     = (getField(customFields, 'utm_term')     ?? attribution.utmTerm     ?? contact.utm_term     ?? null) as string | null
  // adset_id — GHL passes Meta attribution IDs; also available as utmContent in attributionSource
  const adset_id     = (getField(customFields, 'adset_id')     ?? attribution.adSetId     ?? attribution.utmContent ?? contact.adset_id ?? null) as string | null
  const ad_id        = (getField(customFields, 'ad_id')        ?? attribution.adId        ?? contact.ad_id        ?? null) as string | null
  const campaign_id  = (getField(customFields, 'campaign_id')  ?? attribution.campaignId  ?? contact.campaign_id  ?? null) as string | null

  const incoming: LeadRecord = {
    first_name:          firstName || null,
    last_name:           lastName  || null,
    restaurant_name:     (contact.companyName ?? contact.company_name ?? null) as string | null,
    annual_food_spend,
    ad_attribution:      utm_content,
    adset_id,
    ghl_pipeline_stage:  (contact.pipelineStageId ?? contact.pipeline_stage ?? null) as string | null,
    utm_source,
    utm_medium,
    utm_campaign,
  }

  // ── Field-level diff for contact.updated ─────────────────────────────────
  // Skip events where nothing meaningful changed to avoid unnecessary DB writes.
  if (type === 'contact.updated') {
    const { data: existing } = await supabase
      .from('leads')
      .select('first_name, last_name, restaurant_name, annual_food_spend, ad_attribution, adset_id, ghl_pipeline_stage, utm_source, utm_medium, utm_campaign')
      .eq('ghl_contact_id', ghl_contact_id)
      .single()

    if (existing && !hasMeaningfulChange(incoming, existing as LeadRecord)) {
      // Log the skip so the weekly summary can count it
      await supabase.from('skill_runs').insert({
        agent: 'ghl',
        skill: 'webhook',
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        status: 'skipped',
        output_summary: { ghl_contact_id, skipped_reason: 'no_meaningful_change', event_type: type },
      })
      return NextResponse.json({ ok: true, skipped: true, skipped_reason: 'no_meaningful_change' })
    }
  }

  const record = {
    ghl_contact_id,
    first_name:        incoming.first_name,
    last_name:         incoming.last_name,
    restaurant_name:   incoming.restaurant_name,
    annual_food_spend_raw: rawSpend != null ? String(rawSpend) : null,
    annual_food_spend,
    lead_stage,
    ghl_pipeline_stage: incoming.ghl_pipeline_stage,
    source:            (contact.source ?? null) as string | null,
    // UTM attribution — links leads back to Meta ad sets for CPQL computation
    ad_attribution:    utm_content,
    adset_id,
    ad_id,
    campaign_id,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    landing_page:      (getField(customFields, 'landing_page') ?? attribution.url ?? null) as string | null,
    created_at:        contact.dateAdded
                         ? new Date(contact.dateAdded as string).toISOString()
                         : new Date().toISOString(),
    updated_at:        new Date().toISOString(),
    synced_from:       type === 'contact.created' ? 'ghl_webhook_created' : 'ghl_webhook_updated',
  }

  const { error } = await supabase
    .from('leads')
    .upsert(record, { onConflict: 'ghl_contact_id' })

  if (error) {
    console.error('[GHL webhook] Supabase upsert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Log processed event for weekly summary
  await supabase.from('skill_runs').insert({
    agent: 'ghl',
    skill: 'webhook',
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    status: 'success',
    output_summary: { ghl_contact_id, event_type: type, lead_stage, annual_food_spend },
  })

  return NextResponse.json({
    ok: true,
    ghl_contact_id,
    lead_stage,
    annual_food_spend,
  })
}
