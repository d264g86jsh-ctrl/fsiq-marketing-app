// ads-library-scraper.skill.ts — Skill 1.3
// Scrapes Meta Ads Library for competitor/inspiration creatives.
//
// Two calls per run:
//   1. Batch page IDs → search_page_ids=[all configured page IDs]
//   2. Keyword search  → search_terms=gymlaunch (or other configured terms)
//
// Pagination follows paging.next (cursor-based, ref: facebookresearch/Ad-Library-API-Script-Repository).
// Cap: 50 ads per run to avoid rate limits.
// Deduplication: skip any library_id already in inspiration_catalog.
// Sort: ad_delivery_start_time DESC (most recently launched first).
// Posts daily digest to #organic-agent.
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

type InspirationPage = {
  name: string
  page_id?: string
  search_terms?: string
}

type MediaType = 'VIDEO' | 'IMAGE' | 'MEME' | 'NONE' | string

type AdArchiveResult = {
  id: string
  ad_creative_bodies?: string[]
  ad_creative_link_titles?: string[]
  ad_creative_link_descriptions?: string[]
  ad_snapshot_url?: string
  ad_delivery_start_time?: string
  page_name?: string
  publisher_platforms?: string[]
  media_type?: MediaType
}

type AdArchivePage = {
  data: AdArchiveResult[]
  paging?: {
    cursors?: { before?: string; after?: string }
    next?: string
  }
  error?: { message: string; type: string; code: number }
}

export type InspirationEntry = {
  library_id: string
  source_page: string
  ad_type: 'video' | 'static'
  media_type: string | null
  headline: string | null
  body_text: string | null
  snapshot_url: string | null
  publisher_platforms: string[] | null
  delivery_start_time: string | null
  scraped_at: string
  used: boolean
}

export type SkillOutput = {
  pages_scraped: number
  keyword_sources: number
  ads_found: number
  ads_skipped_duplicate: number
  ads_saved: number
  digest_posted: boolean
  errors: string[]
}

// ── Config ────────────────────────────────────────────────────────────────────

const API_VERSION = 'v19.0'
const ADS_LIBRARY_BASE = `https://graph.facebook.com/${API_VERSION}/ads_archive`
const AD_FIELDS = [
  'id',
  'ad_creative_bodies',
  'ad_creative_link_titles',
  'ad_creative_link_descriptions',
  'ad_snapshot_url',
  'ad_delivery_start_time',
  'page_name',
  'publisher_platforms',
  'media_type',
].join(',')
const ADS_PER_RUN_CAP = 50
const RETRY_LIMIT = 3

// ── Meta API helpers ──────────────────────────────────────────────────────────

function metaToken(): string {
  const t = process.env.META_ACCESS_TOKEN
  if (!t) throw new Error('META_ACCESS_TOKEN not set')
  return t
}

async function fetchPageWithRetry(url: string, attempt = 0): Promise<AdArchivePage> {
  try {
    const res = await fetch(url)
    const data = await res.json() as AdArchivePage
    if (data.error) {
      // Non-transient errors (permission, auth) — fail immediately, don't retry
      if (data.error.is_transient === false) {
        throw new Error(`Meta API error: ${data.error.message} (code ${data.error.code})`)
      }
      if (attempt < RETRY_LIMIT) {
        console.warn(`[ads-library-scraper] Transient error (attempt ${attempt + 1}/${RETRY_LIMIT}): ${data.error.message}`)
        return fetchPageWithRetry(url, attempt + 1)
      }
      throw new Error(`Meta API error after ${RETRY_LIMIT} retries: ${data.error.message} (code ${data.error.code})`)
    }
    return data
  } catch (err) {
    if (attempt < RETRY_LIMIT && !(err as Error).message.startsWith('Meta API error')) {
      return fetchPageWithRetry(url, attempt + 1)
    }
    throw err
  }
}

// Follows paging.next cursor until cap reached. Ref: facebookresearch/Ad-Library-API-Script-Repository
async function* paginatedFetch(initialUrl: string, cap: number): AsyncGenerator<AdArchiveResult> {
  let nextUrl: string | null = initialUrl
  let total = 0

  while (nextUrl && total < cap) {
    const page = await fetchPageWithRetry(nextUrl)
    const ads = page.data ?? []

    for (const ad of ads) {
      if (total >= cap) return
      yield ad
      total++
    }

    nextUrl = page.paging?.next ?? null
  }
}

function buildBatchPageUrl(pageIds: string[]): string {
  const params = new URLSearchParams({
    access_token: metaToken(),
    search_page_ids: pageIds.join(','),
    ad_type: 'ALL',
    ad_reached_countries: '["US"]',
    ad_active_status: 'ACTIVE',
    fields: AD_FIELDS,
    limit: '25',
  })
  return `${ADS_LIBRARY_BASE}?${params.toString()}`
}

function buildKeywordUrl(searchTerms: string): string {
  const params = new URLSearchParams({
    access_token: metaToken(),
    search_terms: searchTerms,
    search_type: 'KEYWORD_UNORDERED',
    ad_type: 'ALL',
    ad_reached_countries: '["US"]',
    ad_active_status: 'ACTIVE',
    fields: AD_FIELDS,
    limit: '25',
  })
  return `${ADS_LIBRARY_BASE}?${params.toString()}`
}

// ── Ad type detection ─────────────────────────────────────────────────────────

function resolveAdType(mediaType: MediaType | undefined): 'video' | 'static' | null {
  if (!mediaType || mediaType === 'NONE') return null
  if (mediaType === 'VIDEO') return 'video'
  if (mediaType === 'IMAGE' || mediaType === 'MEME') return 'static'
  // Unknown media types: attempt inference from snapshot URL
  return 'static'
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function getInspirationPages(): Promise<InspirationPage[]> {
  const { data, error } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'ads_library_pages')
    .single()

  if (error || !data) {
    console.warn('[ads-library-scraper] No ads_library_pages config found')
    return []
  }

  const pages = data.value as InspirationPage[]
  return Array.isArray(pages) ? pages : []
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

function formatDeliveryDate(iso: string | null): string {
  if (!iso) return 'unknown date'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatAdLine(e: InspirationEntry, i: number): string {
  const label = e.headline
    ? e.headline.slice(0, 80)
    : (e.body_text ?? '').slice(0, 100)
  const preview = label || '_No text_'
  const link = e.snapshot_url ? `<${e.snapshot_url}|View>` : '_no preview_'
  return `${i + 1}. *${e.source_page}*: ${preview}\n   Launched: ${formatDeliveryDate(e.delivery_start_time)} · ${link}`
}

function digestBlocks(
  entries: InspirationEntry[],
  pagesScraped: number,
  keywordSources: number,
  totalFound: number,
  adsSaved: number,
): KnownBlock[] {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })
  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  // Sort by delivery_start_time DESC
  const sorted = [...entries].sort((a, b) => {
    const ta = a.delivery_start_time ? new Date(a.delivery_start_time).getTime() : 0
    const tb = b.delivery_start_time ? new Date(b.delivery_start_time).getTime() : 0
    return tb - ta
  })

  const videos  = sorted.filter(e => e.ad_type === 'video').slice(0, 3)
  const statics = sorted.filter(e => e.ad_type === 'static').slice(0, 3)

  const sources = pagesScraped + keywordSources
  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📚 Ads Library — ${dateLabel}` },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${totalFound}* active ads found across *${sources}* source(s) · *${adsSaved}* new saved\n_Sorted by recency — most recently launched first_`,
      },
    },
  ]

  if (videos.length > 0) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*NEW VIDEO ADS*\n${videos.map(formatAdLine).join('\n\n')}`,
        },
      },
    )
  }

  if (statics.length > 0) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*NEW STATIC ADS*\n${statics.map(formatAdLine).join('\n\n')}`,
        },
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
  const startedAt  = new Date().toISOString()
  const scrapedAt  = startedAt
  const errors: string[] = []

  // ── Load config ───────────────────────────────────────────────────────────
  const pages = await getInspirationPages()

  if (pages.length === 0) {
    console.log('[ads-library-scraper] No inspiration pages configured — exiting')
    await supabase.from('skill_runs').insert({
      agent: 'paid-media',
      skill: 'ads-library-scraper',
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status: 'not_configured',
      output_summary: { pages_scraped: 0, keyword_sources: 0, ads_found: 0, ads_saved: 0, digest_posted: false },
    })
    return { pages_scraped: 0, keyword_sources: 0, ads_found: 0, ads_skipped_duplicate: 0, ads_saved: 0, digest_posted: false, errors: ['No pages configured'] }
  }

  const pageIdSources  = pages.filter(p => p.page_id)
  const keywordSources = pages.filter(p => p.search_terms && !p.page_id)

  console.log(`[ads-library-scraper] ${pageIdSources.length} page-ID source(s), ${keywordSources.length} keyword source(s)`)

  // ── Collect raw ads ───────────────────────────────────────────────────────
  const rawAds: Array<{ ad: AdArchiveResult; sourcePage: string }> = []

  // Call 1: batch page IDs (one request covers all pages with page_id)
  if (pageIdSources.length > 0) {
    const pageIds = pageIdSources.map(p => p.page_id!)
    console.log(`[ads-library-scraper] Batch page-ID call for ${pageIds.length} page(s)`)
    try {
      const url = buildBatchPageUrl(pageIds)
      for await (const ad of paginatedFetch(url, ADS_PER_RUN_CAP)) {
        const sourcePage = pageIdSources.find(p => p.page_id === String(ad.id))?.name
          ?? ad.page_name
          ?? 'unknown'
        rawAds.push({ ad, sourcePage })
      }
      console.log(`  → ${rawAds.length} ads from page-ID batch`)
    } catch (err) {
      const msg = `Page-ID batch error: ${(err as Error).message}`
      console.warn('[ads-library-scraper]', msg)
      errors.push(msg)
    }
  }

  // Call 2: keyword searches (one request per keyword source)
  for (const src of keywordSources) {
    console.log(`[ads-library-scraper] Keyword call: "${src.search_terms}"`)
    try {
      const url = buildKeywordUrl(src.search_terms!)
      const before = rawAds.length
      for await (const ad of paginatedFetch(url, ADS_PER_RUN_CAP - rawAds.length)) {
        rawAds.push({ ad, sourcePage: src.name })
        if (rawAds.length >= ADS_PER_RUN_CAP) break
      }
      console.log(`  → ${rawAds.length - before} ads from "${src.search_terms}"`)
    } catch (err) {
      const msg = `Keyword "${src.search_terms}" error: ${(err as Error).message}`
      console.warn('[ads-library-scraper]', msg)
      errors.push(msg)
    }
  }

  const adsFound = rawAds.length
  console.log(`[ads-library-scraper] ${adsFound} total ads before dedup`)

  // ── Deduplicate ───────────────────────────────────────────────────────────
  const incomingIds = rawAds.map(r => r.ad.id).filter(Boolean)
  const existingIds = await getExistingLibraryIds(incomingIds)
  const fresh = rawAds.filter(r => !existingIds.has(r.ad.id))
  const skipped = rawAds.length - fresh.length
  console.log(`[ads-library-scraper] ${skipped} duplicate(s) skipped, ${fresh.length} new`)

  // ── Map to InspirationEntry ───────────────────────────────────────────────
  const entries: InspirationEntry[] = []

  for (const { ad, sourcePage } of fresh) {
    const adType = resolveAdType(ad.media_type)
    if (adType === null) {
      console.log(`  [skip] ad ${ad.id} — media_type=NONE`)
      continue
    }

    entries.push({
      library_id:          ad.id,
      source_page:         sourcePage,
      ad_type:             adType,
      media_type:          ad.media_type ?? null,
      headline:            ad.ad_creative_link_titles?.[0] ?? null,
      body_text:           ad.ad_creative_bodies?.[0] ?? null,
      snapshot_url:        ad.ad_snapshot_url ?? null,
      publisher_platforms: ad.publisher_platforms ?? null,
      delivery_start_time: ad.ad_delivery_start_time ?? null,
      scraped_at:          scrapedAt,
      used:                false,
    })
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const adsSaved = await saveEntries(entries)
  console.log(`[ads-library-scraper] Saved ${adsSaved} entries`)

  // ── Slack digest ──────────────────────────────────────────────────────────
  let digestPosted = false
  try {
    await sendBlocks(
      'organic',
      digestBlocks(entries, pageIdSources.length, keywordSources.length, adsFound, adsSaved),
      `Ads Library digest: ${adsFound} ads found, ${adsSaved} new — ${pageIdSources.length + keywordSources.length} source(s)`,
    )
    digestPosted = true
    console.log('[ads-library-scraper] Digest posted to #organic-agent')
  } catch (err) {
    const msg = `Slack post failed: ${(err as Error).message}`
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
      pages_scraped:        pageIdSources.length,
      keyword_sources:      keywordSources.length,
      ads_found:            adsFound,
      ads_skipped_duplicate: skipped,
      ads_saved:            adsSaved,
      digest_posted:        digestPosted,
      errors,
    },
  })

  return {
    pages_scraped:        pageIdSources.length,
    keyword_sources:      keywordSources.length,
    ads_found:            adsFound,
    ads_skipped_duplicate: skipped,
    ads_saved:            adsSaved,
    digest_posted:        digestPosted,
    errors,
  }
}
