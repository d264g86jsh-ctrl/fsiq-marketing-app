// Meta Pixel / Conversions API webhook
// Receives offline conversion events and syncs to Supabase.
// TODO: implement when Pixel monitor skill is built

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  // Meta webhook verification challenge
  const searchParams = req.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  // TODO: process Meta Pixel events
  return NextResponse.json({ ok: true })
}
