// Approve / skip recommendation endpoint
// Called by Slack Block Kit button actions (routed from /api/webhooks/slack).
// Updates recommendation status in Supabase and optionally executes the action.

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { recommendation_id, action } = await req.json() as {
    recommendation_id: string
    action: 'approve' | 'skip'
  }

  if (!recommendation_id || !['approve', 'skip'].includes(action)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const { error } = await supabase
    .from('recommendations')
    .update({ status: action === 'approve' ? 'approved' : 'skipped' })
    .eq('id', recommendation_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // TODO: if approved, execute the recommended action (budget change, etc.)

  return NextResponse.json({ ok: true, recommendation_id, action })
}
