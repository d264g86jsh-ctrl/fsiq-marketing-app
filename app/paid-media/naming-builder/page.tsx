// Naming Convention Builder — server page wrapper.
// Pre-fetches the next available concept IDs (VIDEO + STATIC) and the next global
// ad number from Supabase, then hands them to the client component as initial state.

import NamingBuilderClient from './NamingBuilderClient'
import { supabase } from '@/lib/supabase'

export const metadata = { title: 'Naming Builder — FSIQ' }

// Base concept ID pattern. Letter suffixes (b/c/d) and the AW- retargeting prefix
// are intentionally excluded — we only want the next *base* number.
const BASE_VIDEO  = /^FSIQ-VIDEO-AD-(\d+)$/
const BASE_STATIC = /^FSIQ-STATIC-AD-(\d+)$/

function nextNumber(adIds: string[], pattern: RegExp): number {
  let max = 0
  for (const id of adIds) {
    const m = id.match(pattern)
    if (!m) continue
    const n = parseInt(m[1], 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return max + 1
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

async function loadInitialIds() {
  // Pull all ad_id values from creative_pipeline. Page through if needed —
  // current dataset is small, so a single select is fine.
  const { data: pipeline } = await supabase
    .from('creative_pipeline')
    .select('ad_id, global_number')

  const adIds = (pipeline ?? []).map(r => (r as { ad_id: string | null }).ad_id ?? '').filter(Boolean)

  const nextV = nextNumber(adIds, BASE_VIDEO)
  const nextS = nextNumber(adIds, BASE_STATIC)

  let maxGlobal = 0
  for (const r of pipeline ?? []) {
    const g = (r as { global_number: number | null }).global_number
    if (typeof g === 'number' && g > maxGlobal) maxGlobal = g
  }

  return {
    nextVideoConceptId:  `FSIQ-VIDEO-AD-${pad(nextV)}`,
    nextStaticConceptId: `FSIQ-STATIC-AD-${pad(nextS)}`,
    nextGlobalNumber:    maxGlobal + 1,
  }
}

export default async function NamingBuilderPage() {
  const initial = await loadInitialIds()
  return <NamingBuilderClient initial={initial} />
}
