// test-ads-library-scraper.ts
// Tests the ads-library-scraper skill.
//
// Shows:
//   1. Raw API response for the batch call (first page only)
//   2. Permission diagnosis — if error code 10/2332002, explains what's needed
//   3. POLITICAL_AND_ISSUE_ADS test to confirm if token can reach the API at all
//   4. Full skill run output
//   5. inspiration_catalog row count after insert

import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const META_TOKEN = process.env.META_ACCESS_TOKEN!
const API_BASE   = 'https://graph.facebook.com/v19.0/ads_archive'

function header(label: string) {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(label)
  console.log('═'.repeat(60))
}

// ── Step 1: raw API probe ─────────────────────────────────────────────────────

async function probeRawApi() {
  header('STEP 1 — Raw API response (keyword search: gymlaunch)')

  const params = new URLSearchParams({
    access_token: META_TOKEN,
    search_terms: 'gymlaunch',
    search_type: 'KEYWORD_UNORDERED',
    ad_type: 'ALL',
    ad_reached_countries: '["US"]',
    ad_active_status: 'ACTIVE',
    fields: 'id,ad_creative_bodies,ad_creative_link_titles,ad_snapshot_url,ad_delivery_start_time,page_name,publisher_platforms,media_type',
    limit: '3',
  })

  const res = await fetch(`${API_BASE}?${params.toString()}`)
  const data = await res.json()
  console.log(JSON.stringify(data, null, 2))

  if (data.error) {
    const { code, error_subcode, message } = data.error
    console.log(`\n[ERROR] code=${code}, subcode=${error_subcode}`)

    if (code === 10 && error_subcode === 2332002) {
      console.log(`
[DIAGNOSIS] Token lacks Ads Library API access.
Required steps:
  1. Go to: https://www.facebook.com/ads/library/api
  2. Sign up for API access with your Meta App
  3. Once approved, your access token will work with ad_type=ALL for general advertisers
  NOTE: Political/issue ads (ad_type=POLITICAL_AND_ISSUE_ADS) may work without special approval.
      `)
    }
  }

  return data
}

// ── Step 2: political ads probe (broader access) ──────────────────────────────

async function probePoliticalApi() {
  header('STEP 2 — Political ads probe (ad_type=POLITICAL_AND_ISSUE_ADS)')

  const params = new URLSearchParams({
    access_token: META_TOKEN,
    search_terms: 'food',
    ad_type: 'POLITICAL_AND_ISSUE_ADS',
    ad_reached_countries: '["US"]',
    ad_active_status: 'ACTIVE',
    fields: 'id,ad_snapshot_url,page_name,media_type',
    limit: '2',
  })

  const res = await fetch(`${API_BASE}?${params.toString()}`)
  const data = await res.json()
  console.log(JSON.stringify(data, null, 2))

  if (data.data?.length > 0) {
    console.log('\n[OK] Token can reach Ads Library API — issue is ad_type=ALL permission scope only')
  } else if (data.error) {
    console.log(`\n[FAIL] Even political ads blocked: ${data.error.message}`)
  }
}

// ── Step 3: seed config + run skill ──────────────────────────────────────────

async function seedConfig() {
  const { error } = await sb.from('config').upsert(
    {
      key: 'ads_library_pages',
      value: [
        { name: 'Gymlaunch', search_terms: 'gymlaunch' },
      ],
    },
    { onConflict: 'key' },
  )
  if (error) console.warn('  [seed error]', error.message)
  else console.log('  [config seeded: Gymlaunch keyword search]')
}

async function clearTestEntries() {
  await sb.from('inspiration_catalog').delete().eq('source_page', 'Gymlaunch')
}

async function runSkill() {
  header('STEP 3 — Full skill run')

  const key = require.resolve('../skills/paid-media/ads-library-scraper.skill')
  delete require.cache[key]
  const { run } = await import('../skills/paid-media/ads-library-scraper.skill')

  try {
    const out = await run()
    console.log('\nOUTPUT:', JSON.stringify(out, null, 2))
  } catch (err) {
    console.error('UNEXPECTED ERROR:', (err as Error).message)
  }
}

async function showRows() {
  header('STEP 4 — inspiration_catalog rows after insert')
  const { data, count } = await sb
    .from('inspiration_catalog')
    .select('*', { count: 'exact' })
    .eq('source_page', 'Gymlaunch')
    .order('scraped_at', { ascending: false })
    .limit(5)

  console.log(`Total Gymlaunch rows: ${count}`)
  console.log(JSON.stringify(data, null, 2))
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('ADS LIBRARY SCRAPER — TEST RUN')
  console.log('Token present:', Boolean(META_TOKEN))

  const rawResult = await probeRawApi()

  // Only run political probe if main call failed with permission error
  if (rawResult.error?.code === 10) {
    await probePoliticalApi()
  }

  await clearTestEntries()
  await seedConfig()
  await runSkill()
  await showRows()

  console.log('\n' + '═'.repeat(60))
  console.log('COMPLETE')
  console.log('═'.repeat(60))
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
