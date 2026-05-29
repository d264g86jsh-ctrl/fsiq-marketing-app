// test-ads-library-scraper.ts
// Full test against all 10 inspiration pages via Apify.
//
// Shows:
//   1. Total ads returned by Apify
//   2. After dedup: how many are new
//   3. inspiration_catalog row count after insert
//   4. Slack digest posted to #organic-agent
//   5. skill_runs log entry

import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// 10 inspiration pages — Ads Library URLs for each competitor/inspiration page
const INSPIRATION_PAGES = [
  {
    name: 'Owner.com',
    url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&search_type=page&view_all_page_id=583616842053401',
  },
  {
    name: 'Toast',
    url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&search_type=page&view_all_page_id=159730864190',
  },
  {
    name: 'Sysco',
    url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&search_type=page&view_all_page_id=126931067360297',
  },
  {
    name: 'Restaurant365',
    url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&search_type=page&view_all_page_id=167953446569558',
  },
  {
    name: 'Crunchtime',
    url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&search_type=page&view_all_page_id=190628817632718',
  },
  {
    name: 'Marqeta',
    url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&search_type=page&view_all_page_id=312886282180',
  },
  {
    name: 'HotSchedules',
    url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&search_type=page&view_all_page_id=161040877296053',
  },
  {
    name: 'Galley Solutions',
    url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&search_type=page&view_all_page_id=100666908344773',
  },
  {
    name: 'Gymlaunch',
    url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&q=gymlaunch&search_type=keyword_unordered',
  },
  {
    name: 'ClickFunnels',
    url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&media_type=all&search_type=page&view_all_page_id=116816545012',
  },
]

function header(label: string) {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(label)
  console.log('═'.repeat(60))
}

async function seedConfig() {
  const { error } = await sb.from('config').upsert(
    { key: 'ads_library_pages', value: INSPIRATION_PAGES },
    { onConflict: 'key' },
  )
  if (error) console.warn('  [seed error]', error.message)
  else console.log(`  [config seeded: ${INSPIRATION_PAGES.length} pages]`)
}

async function clearTestEntries() {
  const names = INSPIRATION_PAGES.map(p => p.name)
  const { error } = await sb
    .from('inspiration_catalog')
    .delete()
    .in('source_page', names)
  if (error) console.warn('  [clear error]', error.message)
  else console.log('  [cleared prior test entries]')
}

async function showCatalogCount() {
  const names = INSPIRATION_PAGES.map(p => p.name)
  const { count } = await sb
    .from('inspiration_catalog')
    .select('*', { count: 'exact', head: true })
    .in('source_page', names)
  console.log(`inspiration_catalog rows inserted: ${count}`)
}

async function showSkillRun() {
  const { data } = await sb
    .from('skill_runs')
    .select('status, output_summary, completed_at')
    .eq('skill', 'ads-library-scraper')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single()
  console.log('skill_runs entry:')
  console.log(JSON.stringify(data, null, 2))
}

async function runSkill() {
  const key = require.resolve('../skills/paid-media/ads-library-scraper.skill')
  delete require.cache[key]
  const { run } = await import('../skills/paid-media/ads-library-scraper.skill')

  try {
    const out = await run()
    console.log('\nSKILL OUTPUT:')
    console.log(JSON.stringify(out, null, 2))
    return out
  } catch (err) {
    console.error('UNEXPECTED ERROR:', (err as Error).message)
    return null
  }
}

async function main() {
  header('ADS LIBRARY SCRAPER — FULL TEST (10 pages via Apify)')

  await clearTestEntries()
  await seedConfig()

  console.log('\nRunning skill (Apify scraper takes 60-90s)...')
  const out = await runSkill()

  if (out) {
    header('RESULTS')
    console.log(`Ads returned by Apify:  ${out.ads_returned}`)
    console.log(`Skipped (format):       ${out.ads_skipped_format}`)
    console.log(`Skipped (duplicate):    ${out.ads_skipped_duplicate}`)
    console.log(`New ads saved:          ${out.ads_saved}`)
    console.log(`Digest posted:          ${out.digest_posted}`)
    if (out.errors.length > 0) console.log(`Errors:                 ${out.errors.join(', ')}`)
  }

  header('SUPABASE STATE')
  await showCatalogCount()
  await showSkillRun()

  console.log('\n' + '═'.repeat(60))
  console.log('TEST COMPLETE')
  console.log('═'.repeat(60))
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
