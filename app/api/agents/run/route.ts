// Agent skill runner — used by Vercel Cron (GET) and dashboard UI (POST).
// GET /api/agents/run?agent=paid-media&skill=performance-sync
// POST /api/agents/run  { agent: 'paid-media', skill: 'slack-notify' }

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Static skill registry — dynamic template imports don't tree-shake well in Next.js.
// Add every new skill here when you create it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SKILL_REGISTRY: Record<string, () => Promise<any>> = {
  'paid-media:performance-sync':        () => import('@/skills/paid-media/performance-sync.skill'),
  'paid-media:slack-notify':            () => import('@/skills/paid-media/slack-notify.skill'),
  'paid-media:supabase-accuracy-audit': () => import('@/skills/paid-media/supabase-accuracy-audit.skill'),
  'paid-media:ghl-webhook-summary':     () => import('@/skills/paid-media/ghl-webhook-summary.skill'),
  'paid-media:pixel-monitor':    () => import('@/skills/paid-media/pixel-monitor.skill'),
  'paid-media:app-health-monitor': () => import('@/skills/paid-media/app-health-monitor.skill'),
  'paid-media:footage-watcher':  () => import('@/skills/paid-media/footage-watcher.skill'),
  'paid-media:ads-library-scraper': () => import('@/skills/paid-media/ads-library-scraper.skill'),
  'paid-media:script-generator': () => import('@/skills/paid-media/script-generator.skill'),
  'paid-media:campaign-brief-generator': () => import('@/skills/paid-media/campaign-brief-generator.skill'),
  'paid-media:static-creator':   () => import('@/skills/paid-media/static-creator.skill'),
  'seo:rank-tracker':            () => import('@/skills/seo/rank-tracker.skill'),
  'seo:blog-writer':             () => import('@/skills/seo/blog-writer.skill'),
  'seo:gmb-manager':             () => import('@/skills/seo/gmb-manager.skill'),
  'seo:technical-audit':         () => import('@/skills/seo/technical-audit.skill'),
  'seo:backlink-manager':        () => import('@/skills/seo/backlink-manager.skill'),
  'seo:weekly-report':           () => import('@/skills/seo/weekly-report.skill'),
  'organic:content-ideation':    () => import('@/skills/organic/content-ideation.skill'),
  'organic:linkedin-writer':     () => import('@/skills/organic/linkedin-writer.skill'),
  'organic:content-calendar':    () => import('@/skills/organic/content-calendar.skill'),
  'organic:reporting':           () => import('@/skills/organic/reporting.skill'),
  'comms:morning-brief':         () => import('@/skills/comms/morning-brief.skill'),
  'comms:triweekly-email':       () => import('@/skills/comms/triweekly-email.skill'),
  'comms:zapier-monitor':        () => import('@/skills/comms/zapier-monitor.skill'),
  'comms:sharepoint-organizer':  () => import('@/skills/comms/sharepoint-organizer.skill'),
  'comms:monthly-review':        () => import('@/skills/comms/monthly-review.skill'),
  'comms:leadership-creative-pick': () => import('@/skills/comms/leadership-creative-pick.skill'),
  'cmo:sharepoint-structure-agent': () => import('@/skills/cmo/sharepoint-structure-agent.skill'),
  'cmo:cross-agent-audit':       () => import('@/skills/cmo/cross-agent-audit.skill'),
  'cmo:morning-brief-compiler':  () => import('@/skills/cmo/morning-brief-compiler.skill'),
  'sync:sheet-sot':              () => import('@/skills/sync/sheet-sot.skill'),
}

async function resolveParams(req: NextRequest): Promise<{ agent: string; skill: string } | null> {
  if (req.method === 'GET') {
    const agent = req.nextUrl.searchParams.get('agent')
    const skill = req.nextUrl.searchParams.get('skill')
    if (!agent || !skill) return null
    return { agent, skill }
  }
  try {
    const body = await req.json() as { agent?: string; skill?: string }
    if (!body.agent || !body.skill) return null
    return { agent: body.agent, skill: body.skill }
  } catch {
    return null
  }
}

async function handler(req: NextRequest) {
  const params = await resolveParams(req)

  if (!params) {
    return NextResponse.json(
      { error: 'Missing required params: agent, skill' },
      { status: 400 }
    )
  }

  const { agent, skill } = params
  const key = `${agent}:${skill}`
  const loader = SKILL_REGISTRY[key]

  if (!loader) {
    return NextResponse.json(
      { error: `Unknown skill: ${key}` },
      { status: 404 }
    )
  }

  const startedAt = new Date().toISOString()

  try {
    const mod = await loader()
    const output = await mod.run()

    return NextResponse.json({
      ok: true,
      agent,
      skill,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      output,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agents/run] ${key} failed:`, message)

    // Write failure to skill_runs if Supabase is reachable
    try {
      await supabase.from('skill_runs').insert({
        agent,
        skill,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        status: 'error',
        output: { error: message },
      })
    } catch { /* best-effort log — don't mask the original error */ }

    return NextResponse.json(
      { ok: false, agent, skill, error: message },
      { status: 500 }
    )
  }
}

export const GET  = handler
export const POST = handler
