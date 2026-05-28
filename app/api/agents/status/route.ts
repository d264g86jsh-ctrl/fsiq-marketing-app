// Agent status endpoint — returns recent skill runs from Supabase.
// GET /api/agents/status?agent=paid-media&limit=10

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const agent = req.nextUrl.searchParams.get('agent')
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '10', 10)

  let query = supabase
    .from('skill_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit)

  if (agent) query = query.eq('agent', agent)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ runs: data })
}
