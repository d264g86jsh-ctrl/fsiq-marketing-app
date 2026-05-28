// Seed sharepoint_map with the initial Marketing folder tree gathered via M365 MCP session.
// Safe to re-run — upserts on path (UNIQUE). Does not require Graph API access.
// Run: npx tsx --env-file=.env.local scripts/seed-sharepoint-map.ts

import { supabase } from '../lib/supabase'

const DRIVE_ID = 'b!SoPMe2KqFU2BkUmHhH8qFTOqNnh1p1BPuxbMZNe-MrqxmzKSNvU8TI-0UrHfUjC_'

// Naming convention for agent-owned creative folders:
//   Video: FSIQ-VIDEO-AD-[##] | [concept name]
//   Static: FSIQ-STATIC-AD-[##] | [batch name]
const VIDEO_AD_PATTERN  = /^FSIQ-VIDEO-AD-\d{2,}\s*\|/
const STATIC_AD_PATTERN = /^FSIQ-STATIC-AD-\d{2,}\s*\|/

function isConceptFolder(path: string): boolean {
  // Direct children of Video Creatives — 6 path segments
  return path.startsWith('Sales & Marketing/Marketing/Ad Campaigns/Ad Creatives/Video Creatives/') &&
    path.split('/').length === 6
}

function isStaticFolder(path: string): boolean {
  // Direct children of Static Images — 6 path segments
  return path.startsWith('Sales & Marketing/Marketing/Ad Campaigns/Ad Creatives/Static Images/') &&
    path.split('/').length === 6
}

function checkNaming(name: string, path: string): boolean {
  if (isConceptFolder(path)) return VIDEO_AD_PATTERN.test(name)
  if (isStaticFolder(path))  return STATIC_AD_PATTERN.test(name)
  return true // structural folders not subject to naming check
}

type Row = {
  path: string
  item_type: 'folder'
  parent_path: string
  sharepoint_item_id: string
  display_name: string
  expected_name: string | null
  naming_valid: boolean
  agent_owner: string
  last_verified_at: string
}

function row(
  path: string,
  id: string,
  name: string,
  agentOwner = 'cmo'
): Row {
  const parts = path.split('/')
  const parent_path = parts.slice(0, -1).join('/')
  const naming_valid = checkNaming(name, path)
  return {
    path,
    item_type: 'folder',
    parent_path,
    sharepoint_item_id: id,
    display_name: name,
    expected_name: naming_valid ? null : (
      isConceptFolder(path) ? 'FSIQ-VIDEO-AD-XX | ' + name : 'FSIQ-STATIC-AD-XX | ' + name
    ),
    naming_valid,
    agent_owner: agentOwner,
    last_verified_at: new Date().toISOString(),
  }
}

const BASE = 'Sales & Marketing/Marketing'

const rows: Row[] = [
  // ── Structural folders ─────────────────────────────────────────────────────
  row('Sales & Marketing', '015MT6T5CXA3LHLBA5E5HY5VDEFTM27WWL', 'Sales & Marketing'),
  row(`${BASE}`, '015MT6T5DHC2ZDA2Z6NVEZJI3V2XYK2BZN', 'Marketing'),
  row(`${BASE}/Ad Campaigns`, '015MT6T5F74C2ZM4KWSBBYFGI5TMNHZBZK', 'Ad Campaigns', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives`, '015MT6T5FDUYJJL5ZHRZE2PME4FGNKE5X6', 'Ad Creatives', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives`, '015MT6T5FZ6MOQJBXMABF3DUNIQW6BQ5ON', 'Video Creatives', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Static Images`, '', 'Static Images', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Studios`, '015MT6T5HBVF7GO42BQRC3S6NX3DDVYZSF', 'Studios', 'paid-media'),
  row(`${BASE}/Ad Campaigns/_Archive`, '', '_Archive', 'paid-media'),
  row(`${BASE}/Ad Campaigns/_Archive/Hormozi_Style_Ad_Footage_Neil`, '', 'Hormozi_Style_Ad_Footage_Neil', 'paid-media'),
  row(`${BASE}/Ad Campaigns/_Archive/Hormozi_Style_Ad_Footage_Neil/Ad Set 4`, '015MT6T5AVG3T2YFBLZNGL4DDOGFJ4P432', 'Ad Set 4', 'paid-media'),

  row(`${BASE}/Food Cost Analyzer`, '015MT6T5FXKOEUKBFUT5HLQULVNKDOY7HP', 'Food Cost Analyzer'),
  row(`${BASE}/Food Cost Analyzer/Ad Campaigns`, '015MT6T5DMERCP7R35JNDL5JYLXBY2NLTV', 'Ad Campaigns', 'paid-media'),
  row(`${BASE}/Food Cost Analyzer/Architecture MD`, '015MT6T5FYRM3SRMONPVGZFVQFODOKH5NH', 'Architecture MD'),
  row(`${BASE}/Food Cost Analyzer/Copy`, '015MT6T5HDC5I46YGGLZHZSZ5DIQ3EW4GP', 'Copy'),
  row(`${BASE}/Food Cost Analyzer/Email Campaign`, '015MT6T5EO22CZ5QMHJ5HJELCFV4TKEG5U', 'Email Campaign'),
  row(`${BASE}/Food Cost Analyzer/Process`, '015MT6T5CVNQ2ALZOHAVHKHBOMQXIXGQXT', 'Process'),

  row(`${BASE}/Weekly Calls`, '015MT6T5HQAZNJVLXCH5ALRD3KHRFNQMZM', 'Weekly Calls'),
  row(`${BASE}/Weekly Calls/Agendas`, '015MT6T5CNBGXUAWWJBNBYT3ONIULC2AOG', 'Agendas'),
  row(`${BASE}/Weekly Calls/Transcripts`, '015MT6T5BMB6EQ36OVZBBJT24CCAUAP4E4', 'Transcripts'),

  row(`${BASE}/Social Media`, '015MT6T5DGV6MGYIXQEZAY3J6G3QQLQ7NR', 'Social Media', 'organic'),
  row(`${BASE}/Social Media/Viral Coach Opportunity`, '015MT6T5DPXSFC3PFYNRCJ7YF22NXI2TPW', 'Viral Coach Opportunity', 'organic'),

  row(`${BASE}/ClickFunnel`, '015MT6T5EMUWNZ3ZRQNFAKKTHSUQW2DHMI', 'ClickFunnel'),
  row(`${BASE}/GoHighLevel`, '015MT6T5BSTNMTUF4LCZHYY3NCOULDFDVX', 'GoHighLevel'),
  row(`${BASE}/Podcast Studio`, '015MT6T5FAXOLEXL4NX5GICQ5CMTBQJCYQ', 'Podcast Studio'),
  row(`${BASE}/Podcast Studio/Photos`, '015MT6T5ER4VIPEDNJMJEL7ZJMVY4ERQ4Q', 'Photos'),

  row(`${BASE}/SEO`, '015MT6T5CBX4M4BWSE2BFJYUIKV55ZEZSE', 'SEO', 'seo'),
  row(`${BASE}/SEO/Blog posts`, '015MT6T5C7RLYTEGYFT5GJWNKOO42FYKVA', 'Blog posts', 'seo'),
  row(`${BASE}/SEO/Smash Digital`, '015MT6T5FNNZE7SI4ZTBAZMCN62L5IA3O5', 'Smash Digital', 'seo'),

  row(`${BASE}/Testimonial Videos`, '015MT6T5DH6X5IBXPCN5CJPJYPPOO4VBTJ', 'Testimonial Videos', 'paid-media'),
  row(`${BASE}/5 Proven Ways E-Book`, '015MT6T5BMOLX4BPN3MREKHMY4GQ5I7K7E', '5 Proven Ways E-Book'),
  row(`${BASE}/MaryAnn Case Study`, '015MT6T5HDCKZQA247DBH24STSBFTXTVWO', 'MaryAnn Case Study'),

  // ── Video concept folders — ALL naming violations ──────────────────────────
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Dollar Saved is Dollar Earned`, '015MT6T5A4VKZTDOIKRBALDTNTVCO4RJL6', 'Dollar Saved is Dollar Earned', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/New Invention Ad`, '', 'New Invention Ad', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/New Invention Ad/iPhone`, '015MT6T5GKMFIPGN75UVCLVV7BFCC742EF', 'iPhone', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/New Invention Ad/Studio`, '015MT6T5FYO773U6O3XNE3MEWLBZDSOCON', 'Studio', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Exclusivity Ad`, '015MT6T5C5NP5RXETF7NDJ5QCBBV2L46JD', 'Exclusivity Ad', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Egg Ad`, '015MT6T5GIU7ZBGXVWGRDJUD6D6DHH4AYT', 'Egg Ad', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/VSL1`, '', 'VSL1', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/VSL2`, '015MT6T5EHATA5Q6FP6RFZUTX6O2DMROUD', 'VSL2', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Media Pouch V2`, '015MT6T5F6DOBZAV6MS5AI6VUMAXRHEMFH', 'Media Pouch V2', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Podcast 2026`, '015MT6T5HWZPDE74L4LRAL773KIBUF65MQ', 'Podcast 2026', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Neil 50k`, '015MT6T5BYPVYZYAZC2ZF27A347WKQMU2S', 'Neil 50k', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Lil Rizzos & Spirits - Testimonial`, '015MT6T5GVFGSTJNIXKNB3ND2F36XV5Q7C', 'Lil Rizzos & Spirits - Testimonial', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/iPhone Gift Ad - Short`, '015MT6T5AY6IRKCXPRNNAZYSHNTRLDJXYT', 'iPhone Gift Ad - Short', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/iPhone Gift Ad - Long`, '015MT6T5FQGE4M53H52ZFL5JVWDO3C6BSN', 'iPhone Gift Ad - Long', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Rob Tier Ad (iPhone)`, '015MT6T5FHJUUCSVXUFZHIIPRBNTHB2PFF', 'Rob Tier Ad (iPhone)', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Rob Tier Ad - 2026 (Studio)`, '015MT6T5FKYJFEWAIFV5CYH4INNSGSATXG', 'Rob Tier Ad - 2026 (Studio)', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Podcast Gift Ad - 2026`, '015MT6T5FZPJVGOBBWQNHYXQBSQQ2DHZFZ', 'Podcast Gift Ad - 2026', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Jackson Podcast 1`, '015MT6T5GTNHM5UYFG7JEZVXA7PYI7A62O', 'Jackson Podcast 1', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Success Rate Ad`, '015MT6T5DKM7HRRE3THBD3EN2FTSCVCXCH', 'Success Rate Ad', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Restaurant Data`, '015MT6T5ECHUZOGGVGYBFJ7ZRHV35YEGXI', 'Restaurant Data', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Black's Testimonial`, '015MT6T5EEGEG5BVIL35AJPBHPSDCPX6M3', "Black's Testimonial", 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/New Gift Ad`, '015MT6T5FC6IJVE5WU4FC3XQWDCMRSVPYR', 'New Gift Ad', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/iMessage Ads`, '015MT6T5AUUUD25FKDQREIFKZFPJL22D3N', 'iMessage Ads', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Dish Society - Testimonial`, '015MT6T5FZHFZAVKJPGRALUJEKU4U4JWRT', 'Dish Society - Testimonial', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Media Pouch - Neil Podcast Ads`, '015MT6T5AFOHBGDK62UFCZIRSDJP4JFMGK', 'Media Pouch - Neil Podcast Ads', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Neil Holiday Gift`, '015MT6T5ARKKDF7JG3CFB2BNVTAIB63IQW', 'Neil Holiday Gift', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Neil iPhone 2`, '015MT6T5AQ34AENAUCRVEK36HX45YKGGGM', 'Neil iPhone 2', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Neil iPhone 3`, '015MT6T5GMVXRESQF4HJAKI3JVYQCCE7AZ', 'Neil iPhone 3', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Neil iPhone 4`, '015MT6T5BTV6RGEOBBIBGLG62DKWRD4RIY', 'Neil iPhone 4', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/High Ticket No B-roll`, '015MT6T5CJXIKFASYRNFAYAYWG62WVB6NX', 'High Ticket No B-roll', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Spirits Testimonial`, '', 'Spirits Testimonial', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Video Creatives/Short_Ad_12.22.25`, '', 'Short_Ad_12.22.25', 'paid-media'),

  // ── Static image folders — ALL naming violations ───────────────────────────
  row(`${BASE}/Ad Campaigns/Ad Creatives/Static Images/Statics 7`, '015MT6T5ETYJOVCXBDK5H2DKHMWK37BGGI', 'Statics 7', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Static Images/Statics 17`, '015MT6T5DVRP7HVXXCXZA3TN4CSDDEVUF3', 'Statics 17', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Static Images/Statics 18`, '015MT6T5BFFB6HQIBBVVAIUTUNZAJT5UYH', 'Statics 18', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Static Images/Statics 19`, '015MT6T5BG5MQSYKV6XBBYMGQYSTO5ECYC', 'Statics 19', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Static Images/Statics 20`, '015MT6T5DZUKEKZBDOBZCJXIYQC4YTJAZO', 'Statics 20', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Static Images/Statics 21`, '015MT6T5FYO66SFPBA3BHL4WDYMTHSXKKE', 'Statics 21', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Static Images/Statics 22`, '015MT6T5ELNABOYBFZNRFLR3BM5ZABNDAT', 'Statics 22', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Static Images/Statics 23`, '015MT6T5ATHJEIXFKJGVH2FI5XX3KVLMYA', 'Statics 23', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Static Images/Statics 24`, '015MT6T5DH6SEIWCZJQBBKSK4PYQ737PET', 'Statics 24', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Static Images/Statics 25`, '015MT6T5DTTCYV2ELJTZB2ZSEA24EYQPBR', 'Statics 25', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Static Images/Statics 26`, '015MT6T5HLKGY4Z4A5DFAISCGQUX6UEACK', 'Statics 26', 'paid-media'),
  row(`${BASE}/Ad Campaigns/Ad Creatives/Static Images/Statics 27`, '015MT6T5EKV7J7O433JZDLCKWFVNHKGBJL', 'Statics 27', 'paid-media'),
]

// Strip rows with empty sharepoint_item_id (unknown IDs keep a record but no item_id)
// We still insert them so the path structure is complete — item_id can be filled in on next walk.

async function main() {
  console.log(`Seeding ${rows.length} rows into sharepoint_map...`)

  const violations = rows.filter(r => !r.naming_valid && (isConceptFolder(r.path) || isStaticFolder(r.path)))
  console.log(`Naming violations detected: ${violations.length}`)

  const BATCH = 50
  let inserted = 0
  let errors   = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase
      .from('sharepoint_map')
      .upsert(batch, { onConflict: 'path' })
    if (error) {
      console.error(`  Batch ${Math.floor(i / BATCH) + 1} error: ${error.message}`)
      errors++
    } else {
      inserted += batch.length
      process.stdout.write(`\r  Upserted ${inserted}/${rows.length}...`)
    }
  }

  const { count } = await supabase.from('sharepoint_map').select('*', { count: 'exact', head: true })
  console.log(`\n\n══════════ SEED RESULT ══════════`)
  console.log(`Rows upserted: ${inserted}`)
  console.log(`Total in DB:   ${count}`)
  console.log(`Errors:        ${errors}`)
  console.log(`\nNaming violations (${violations.length}):`)
  for (const v of violations) {
    console.log(`  ✗ ${v.path.split('/').pop()}`)
    console.log(`    → expected: ${v.expected_name}`)
  }
}

main().catch(e => { console.error('Seed failed:', e.message); process.exit(1) })
