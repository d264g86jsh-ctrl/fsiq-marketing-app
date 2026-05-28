// Naming Builder — existing tables endpoint.
//
// GET   /api/naming-builder/tables?tab=adsets&type=VIDEO&lp=LP2-EB&metaRenamed=no
// GET   /api/naming-builder/tables?tab=ads&type=VIDEO&hookType=...&awareness=...&copy=...
// PATCH /api/naming-builder/tables  { table, id, ...fields }

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const AD_SET_FIELDS = new Set([
  'type', 'concept_id', 'ad_set_token', 'talent',
  'targeting', 'lp_code', 'final_ad_set_name',
  'meta_renamed', 'status',
])

const PIPELINE_FIELDS = new Set([
  'ad_id', 'ad_type', 'concept_name', 'global_number',
  'hook_description', 'hook_type', 'awareness_level',
  'lp_code', 'copy_version', 'duration',
  'ad_set_token', 'targeting', 'status',
])

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const tab = sp.get('tab') ?? 'adsets'

  const type        = sp.get('type')
  const lp          = sp.get('lp')
  const metaRenamed = sp.get('metaRenamed')      // 'yes' | 'no' | null
  const status      = sp.get('status')
  const hookType    = sp.get('hookType')
  const awareness   = sp.get('awareness')
  const copy        = sp.get('copy')

  if (tab === 'adsets') {
    let q = supabase
      .from('ad_set_naming')
      .select('id, type, concept_id, ad_set_token, talent, targeting, lp_code, final_ad_set_name, meta_renamed, status')
      .order('created_at', { ascending: false })
      .limit(500)

    if (type)        q = q.eq('type', type)
    if (lp)          q = q.eq('lp_code', lp)
    if (status)      q = q.eq('status', status)
    if (metaRenamed === 'yes') q = q.eq('meta_renamed', true)
    if (metaRenamed === 'no')  q = q.eq('meta_renamed', false)

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rows: data ?? [] })
  }

  if (tab === 'ads') {
    let q = supabase
      .from('creative_pipeline')
      .select('id, ad_id, ad_type, concept_name, global_number, hook_description, hook_type, awareness_level, lp_code, copy_version, duration')
      .not('global_number', 'is', null)
      .order('global_number', { ascending: false })
      .limit(500)

    if (type)      q = q.eq('ad_type', type)
    if (hookType)  q = q.eq('hook_type', hookType)
    if (awareness) q = q.eq('awareness_level', awareness)
    if (copy)      q = q.eq('copy_version', copy)

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rows: data ?? [] })
  }

  return NextResponse.json({ error: 'Unknown tab. Use tab=adsets or tab=ads' }, { status: 400 })
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const table = body.table as string | undefined
  const id    = body.id as string | undefined
  if (!table || !id) return NextResponse.json({ error: 'table and id required' }, { status: 400 })

  if (table !== 'ad_set_naming' && table !== 'creative_pipeline') {
    return NextResponse.json({ error: 'Unknown table' }, { status: 400 })
  }

  const allowed = table === 'ad_set_naming' ? AD_SET_FIELDS : PIPELINE_FIELDS
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (k === 'table' || k === 'id') continue
    if (allowed.has(k)) patch[k] = v
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No updatable fields supplied' }, { status: 400 })
  }
  if (table === 'ad_set_naming') patch.updated_at = new Date().toISOString()

  const { error } = await supabase.from(table).update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
