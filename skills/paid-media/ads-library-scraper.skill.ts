// ads-library-scraper.skill.ts — Skill 1.3
// Scrapes Meta Ads Library for competitor/inspiration creatives via Apify.
//
// Actor: apify/facebook-ads-scraper
// Endpoint: POST /v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items
//
// Run flow:
//   1. Read startUrls from Supabase config key='ads_library_pages'
//   2. POST to Apify sync endpoint (120s timeout) with all URLs
//   3. Map fields from Apify response to InspirationEntry
//   4. Skip items where snapshot.displayFormat is not IMAGE or VIDEO
//   5. Dedup on library_id before inserting
//   6. Save to inspiration_catalog
//   7. Post digest to #organic-agent
//   8. Log to skill_runs
// Schedule: daily via Vercel cron.

import fs from 'fs'
import path from 'path'
import { supabase } from '../../lib/supabase'
import { sendBlocks } from '../../lib/slack'
import type { KnownBlock } from '@slack/web-api'

const sop = fs.readFileSync(
  path.join(process.cwd(), 'sops', 'paid-media-agent-sop.md'),
  'utf-8',
)
void sop

// ── Types ─────────────────────────────────────────────────────────────────────

type ConfigPage = {
  name: string
  url: string
}

type ApifySnapshot = {
  displayFormat?: string          // 'IMAGE' | 'VIDEO' | ...
  title?: string
  body?: { text?: string }
  ctaText?: string
  ctaType?: string
  linkUrl?: string
  images?: { originalImageUrl?: string }[]
  videos?: {
    videoHdUrl?: string
    videoPreviewImageUrl?: string
  }[]
  pageName?: string
}

type ApifyAd = {
  adArchiveID?: string
  pageName?: string
  publisherPlatform?: string[]
  startDateFormatted?: string     // ISO string
  isActive?: boolean
  snapshot?: ApifySnapshot
}

export type InspirationEntry = {
  library_id: string
  source_page: string
  ad_type: 'video' | 'static'
  media_type: string
  headline: string | null
  body_text: string | null
  snapshot_url: string
  video_url: string | null
  video_thumbnail: string | null
  image_url: string | null
  cta_text: string | null
  cta_type: string | null
  link_url: string | null
  publisher_platforms: string[] | null
  delivery_start_time: string | null
  is_active: boolean
  scraped_at: string
  used: boolean
}

export type SkillOutput = {
  pages_scraped: number
  ads_returned: number
  ads_skipped_format: number
  ads_skipped_duplicate: number
  ads_saved: number
  digest_posted: boolean
  errors: string[]
}

// ── Apify ─────────────────────────────────────────────────────────────────────

const APIFY_ENDPOINT =
  'https://api.apify.com/v2/acts/apify~facebook-ads-scraper/run-sync-get-dataset-items'

function apifyToken(): string {
  const t = process.env.APIFY_API_TOKEN
  if (!t) throw new Error('APIFY_API_TOKEN not set')
  return t
}

async function runApifyScraper(startUrls: { url: string }[], resultsLimit = 10): Promise<ApifyAd[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)

  try {
    const res = await fetch(`${APIFY_ENDPOINT}?token=${apifyToken()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        includeAboutPage: false,
        isDetailsPerAd: false,
        onlyTotal: false,
        resultsLimit,
        startUrls,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Apify HTTP ${res.status}: ${text.slice(0, 200)}`)
    }

    const data = await res.json() as ApifyAd[]
    return Array.isArray(data) ? data : []
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('Apify scraper timed out after 120s')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

// ── Field mapping ─────────────────────────────────────────────────────────────

function mapAdType(displayFormat: string | undefined): 'video' | 'static' | null {
  if (displayFormat === 'VIDEO') return 'video'
  if (displayFormat === 'IMAGE') return 'static'
  return null
}

function mapEntry(ad: ApifyAd, scrapedAt: string): InspirationEntry | null {
  // Apify includes pageInfo summary rows alongside ads — skip them (no adArchiveID)
  if (!ad.adArchiveID) return null
  const snap = ad.snapshot ?? {}
  const adType = mapAdType(snap.displayFormat)
  if (!adType) return null

  return {
    library_id:          ad.adArchiveID,
    source_page:         ad.pageName ?? snap.pageName ?? 'unknown',
    ad_type:             adType,
    media_type:          snap.displayFormat ?? '',
    headline:            snap.title ?? null,
    body_text:           snap.body?.text ?? null,
    snapshot_url:        `https://www.facebook.com/ads/library/?id=${ad.adArchiveID}`,
    video_url:           snap.videos?.[0]?.videoHdUrl ?? null,
    video_thumbnail:     snap.videos?.[0]?.videoPreviewImageUrl ?? null,
    image_url:           snap.images?.[0]?.originalImageUrl ?? null,
    cta_text:            snap.ctaText ?? null,
    cta_type:            snap.ctaType ?? null,
    link_url:            snap.linkUrl ?? null,
    publisher_platforms: ad.publisherPlatform ?? null,
    delivery_start_time: ad.startDateFormatted ?? null,
    is_active:           ad.isActive ?? true,
    scraped_at:          scrapedAt,
    used:                false,
  }
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function getConfigPages(): Promise<ConfigPage[]> {
  const { data, error } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'ads_library_pages')
    .single()

  if (error || !data) {
    console.warn('[ads-library-scraper] No ads_library_pages config found')
    return []
  }

  const pages = data.value as ConfigPage[]
  return Array.isArray(pages) ? pages.filter(p => p.url) : []
}

async function getExistingLibraryIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const { data } = await supabase
    .from('inspiration_catalog')
    .select('library_id')
    .in('library_id', ids)
  return new Set((data ?? []).map(r => r.library_id as string))
}

async function saveEntries(entries: InspirationEntry[]): Promise<number> {
  if (entries.length === 0) return 0
  const { data, error } = await supabase
    .from('inspiration_catalog')
    .insert(entries)
    .select('id')
  if (error) {
    console.warn('[ads-library-scraper] Insert error:', error.message)
    return 0
  }
  return data?.length ?? 0
}

// ── Slack digest ──────────────────────────────────────────────────────────────

function truncate(text: string | null, len: number): string {
  if (!text) return '_No text_'
  return text.length > len ? text.slice(0, len) + '…' : text
}

function formatDeliveryDate(iso: string | null): string {
  if (!iso) return 'unknown'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatAdBlock(e: InspirationEntry, i: number): string {
  const type  = e.ad_type === 'video' ? 'VIDEO' : 'STATIC'
  const lines = [
    `${i + 1}. *${e.source_page}* — ${type}`,
    e.headline ? `*${e.headline}*` : '',
    truncate(e.body_text, 100),
    `CTA: ${e.cta_text ?? '—'} · Launched: ${formatDeliveryDate(e.delivery_start_time)}`,
    `<${e.snapshot_url}|View ad>`,
  ]
  return lines.filter(Boolean).join('\n')
}

function digestBlocks(
  entries: InspirationEntry[],
  pagesScraped: number,
  adsReturned: number,
  adsSaved: number,
): KnownBlock[] {
  const ts        = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })
  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const sorted  = [...entries].sort((a, b) => {
    const ta = a.delivery_start_time ? new Date(a.delivery_start_time).getTime() : 0
    const tb = b.delivery_start_time ? new Date(b.delivery_start_time).getTime() : 0
    return tb - ta
  })

  const videos  = sorted.filter(e => e.ad_type === 'video').slice(0, 3)
  const statics = sorted.filter(e => e.ad_type === 'static').slice(0, 3)

  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📚 Ads Library — ${dateLabel}` },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${adsReturned}* ads returned across *${pagesScraped}* page(s) · *${adsSaved}* new saved\n_Sorted by recency — most recently launched first_`,
      },
    },
  ]

  if (videos.length > 0) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*NEW VIDEO ADS*\n\n${videos.map(formatAdBlock).join('\n\n')}` },
      },
    )
  }

  if (statics.length > 0) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*NEW STATIC ADS*\n\n${statics.map(formatAdBlock).join('\n\n')}` },
      },
    )
  }

  if (videos.length === 0 && statics.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_No new ads found today._' },
    })
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `Checked ${ts} CT` }],
  })

  return blocks
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function run(): Promise<SkillOutput> {
  const startedAt = new Date().toISOString()
  const scrapedAt = startedAt
  const errors: string[] = []

  // ── Load config ───────────────────────────────────────────────────────────
  const pages = await getConfigPages()

  if (pages.length === 0) {
    console.log('[ads-library-scraper] No pages configured — exiting')
    await supabase.from('skill_runs').insert({
      agent: 'paid-media', skill: 'ads-library-scraper',
      started_at: startedAt, completed_at: new Date().toISOString(),
      status: 'not_configured',
      output_summary: { pages_scraped: 0, ads_returned: 0, ads_saved: 0, digest_posted: false },
    })
    return { pages_scraped: 0, ads_returned: 0, ads_skipped_format: 0, ads_skipped_duplicate: 0, ads_saved: 0, digest_posted: false, errors: ['No pages configured'] }
  }

  console.log(`[ads-library-scraper] Scraping ${pages.length} page(s) via Apify`)

  // ── Run Apify scraper ─────────────────────────────────────────────────────
  const startUrls = pages.map(p => ({ url: p.url }))
  let rawAds: ApifyAd[] = []

  try {
    rawAds = await runApifyScraper(startUrls, 10)
    console.log(`[ads-library-scraper] Apify returned ${rawAds.length} items`)
  } catch (err) {
    const msg = `Apify error: ${(err as Error).message}`
    console.error('[ads-library-scraper]', msg)
    errors.push(msg)
  }

  // ── Map + filter ──────────────────────────────────────────────────────────
  let skippedFormat = 0
  const mapped: InspirationEntry[] = []

  for (const ad of rawAds) {
    const entry = mapEntry(ad, scrapedAt)
    if (!entry) {
      skippedFormat++
      console.log(`  [skip] adArchiveID=${ad.adArchiveID} displayFormat=${ad.snapshot?.displayFormat ?? 'none'}`)
      continue
    }
    mapped.push(entry)
  }

  console.log(`[ads-library-scraper] ${mapped.length} mapped, ${skippedFormat} skipped (non IMAGE/VIDEO)`)

  // ── Dedup ─────────────────────────────────────────────────────────────────
  const incomingIds  = mapped.map(e => e.library_id)
  const existingIds  = await getExistingLibraryIds(incomingIds)
  const fresh        = mapped.filter(e => !existingIds.has(e.library_id))
  const skippedDupes = mapped.length - fresh.length
  console.log(`[ads-library-scraper] ${skippedDupes} duplicate(s) skipped, ${fresh.length} new`)

  // ── Save ──────────────────────────────────────────────────────────────────
  const adsSaved = await saveEntries(fresh)
  console.log(`[ads-library-scraper] Saved ${adsSaved} entries to inspiration_catalog`)

  // ── Slack digest ──────────────────────────────────────────────────────────
  let digestPosted = false
  try {
    await sendBlocks(
      'organic',
      digestBlocks(fresh, pages.length, rawAds.length, adsSaved),
      `Ads Library digest: ${rawAds.length} returned, ${adsSaved} new — ${pages.length} page(s)`,
    )
    digestPosted = true
    console.log('[ads-library-scraper] Digest posted to #organic-agent')
  } catch (err) {
    const msg = `Slack error: ${(err as Error).message}`
    console.warn('[ads-library-scraper]', msg)
    errors.push(msg)
  }

  // ── Log skill_run ─────────────────────────────────────────────────────────
  await supabase.from('skill_runs').insert({
    agent: 'paid-media',
    skill: 'ads-library-scraper',
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    status: errors.length > 0 ? 'warning' : 'success',
    output_summary: {
      pages_scraped:         pages.length,
      ads_returned:          rawAds.length,
      ads_skipped_format:    skippedFormat,
      ads_skipped_duplicate: skippedDupes,
      ads_saved:             adsSaved,
      digest_posted:         digestPosted,
      errors,
    },
  })

  return {
    pages_scraped:         pages.length,
    ads_returned:          rawAds.length,
    ads_skipped_format:    skippedFormat,
    ads_skipped_duplicate: skippedDupes,
    ads_saved:             adsSaved,
    digest_posted:         digestPosted,
    errors,
  }
}
