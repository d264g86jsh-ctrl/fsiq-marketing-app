// Seed pending_renames and update sharepoint_map.expected_name for all 42 naming violations.
// Safe to re-run — upserts on path (UNIQUE).
// Run AFTER migrate-schema.sql has been applied in Supabase.
//
// Run: npx tsx --env-file=.env.local scripts/seed-pending-renames.ts
//
// All rows are inserted with approved=false.
// DO NOT rename any SharePoint folder until Rodrigo approves each row.

import { supabase } from '../lib/supabase'

const BASE = 'Sales & Marketing/Marketing/Ad Campaigns/Ad Creatives'
const VIDEO = `${BASE}/Video Creatives`
const STATIC = `${BASE}/Static Images`

type RenameRow = {
  sharepoint_item_id: string | null
  current_name: string
  path: string
  proposed_name: string
  concept_id: string | null
  item_type: string
  approved: boolean
  flag: 'confirmed' | 'needs_review' | 'never_produced' | 'duplicate'
  notes: string | null
}

// ── Video concept folder renames ───────────────────────────────────────────────
//
// Confidence levels:
//   confirmed    — verified by Rodrigo explicitly in Step 4 review
//   high         — direct match to Creative Review Tracker concept name/ID (stored as 'confirmed')
//   needs_review — uncertain mapping, awaiting Rodrigo verification
//   duplicate    — second folder for same concept; consolidate into primary
//   never_produced — Short_Ad_12.22.25; never reached production

const videoRenames: RenameRow[] = [
  // ── CONFIRMED by Rodrigo ──────────────────────────────────────────────────
  {
    sharepoint_item_id: '015MT6T5HWZPDE74L4LRAL773KIBUF65MQ',
    current_name: 'Podcast 2026',
    path: `${VIDEO}/Podcast 2026`,
    proposed_name: 'FSIQ-VIDEO-AD-30 | Podcast Media Pouch',
    concept_id: 'FSIQ-VIDEO-AD-30',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Contains footage for AD-30. Confirmed by Rodrigo.',
  },
  {
    sharepoint_item_id: '015MT6T5FKYJFEWAIFV5CYH4INNSGSATXG',
    current_name: 'Rob Tier Ad - 2026 (Studio)',
    path: `${VIDEO}/Rob Tier Ad - 2026 (Studio)`,
    proposed_name: 'FSIQ-VIDEO-AD-27b | Food Spend Tiers',
    concept_id: 'FSIQ-VIDEO-AD-27b',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Studio sub-variant of AD-27. Confirmed by Rodrigo.',
  },
  {
    sharepoint_item_id: '015MT6T5GVFGSTJNIXKNB3ND2F36XV5Q7C',
    current_name: 'Lil Rizzos & Spirits - Testimonial',
    path: `${VIDEO}/Lil Rizzos & Spirits - Testimonial`,
    proposed_name: 'FSIQ-VIDEO-AD-17 | Spirits Testimonial',
    concept_id: 'FSIQ-VIDEO-AD-17',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Primary AD-17 folder. Keep this one; delete the empty "Spirits Testimonial" duplicate after file migration.',
  },
  {
    sharepoint_item_id: '015MT6T5AUUUD25FKDQREIFKZFPJL22D3N',
    current_name: 'iMessage Ads',
    path: `${VIDEO}/iMessage Ads`,
    proposed_name: 'FSIQ-STATIC-AD-19b | iMsg',
    concept_id: 'FSIQ-STATIC-AD-19b',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: '⚠️ FOLDER MOVE REQUIRED: after rename, this folder must be moved from Video Creatives to Static Images. Sub-variant b of AD-19 (letter suffix on concept ID, not a new AD number). SOP ad-set naming confirms: FSIQ-STATIC-AD-19b | iMsg | Broad | LP2-EB.',
  },
  // iPhone → AD-27 (same concept as 27b, iPhone is the original execution)
  {
    sharepoint_item_id: '015MT6T5FHJUUCSVXUFZHIIPRBNTHB2PFF',
    current_name: 'Rob Tier Ad (iPhone)',
    path: `${VIDEO}/Rob Tier Ad (iPhone)`,
    proposed_name: 'FSIQ-VIDEO-AD-27 | Food Spend Tiers',
    concept_id: 'FSIQ-VIDEO-AD-27',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'iPhone execution of AD-27 (original). Derived from confirmed AD-27b → Studio mapping.',
  },

  // ── AD-17 duplicate: mark for deletion after files moved to primary ────────
  {
    sharepoint_item_id: null,
    current_name: 'Spirits Testimonial',
    path: `${VIDEO}/Spirits Testimonial`,
    proposed_name: 'DELETE — duplicate of FSIQ-VIDEO-AD-17',
    concept_id: 'FSIQ-VIDEO-AD-17',
    item_type: 'folder',
    approved: false,
    flag: 'duplicate',
    notes: 'Duplicate of Lil Rizzos & Spirits - Testimonial (same AD-17 concept). Migrate any unique files to primary folder first, then delete this folder.',
  },

  // ── Archive: never reached production ──────────────────────────────────────
  {
    sharepoint_item_id: null,
    current_name: 'Short_Ad_12.22.25',
    path: `${VIDEO}/Short_Ad_12.22.25`,
    proposed_name: 'archive — never produced',
    concept_id: null,
    item_type: 'folder',
    approved: false,
    flag: 'never_produced',
    notes: 'Never made it to production. No rename needed. Move to _Archive or delete.',
  },

  // ── High-confidence matches from Creative Review Tracker ──────────────────
  {
    sharepoint_item_id: '015MT6T5A4VKZTDOIKRBALDTNTVCO4RJL6',
    current_name: 'Dollar Saved is Dollar Earned',
    path: `${VIDEO}/Dollar Saved is Dollar Earned`,
    proposed_name: 'FSIQ-VIDEO-AD-35 | Dollar Saved is Dollar Earned',
    concept_id: 'FSIQ-VIDEO-AD-35',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-VIDEO-AD-35 "A Dollar Saved is a Dollar Earned | iPhone".',
  },
  {
    sharepoint_item_id: null,
    current_name: 'New Invention Ad',
    path: `${VIDEO}/New Invention Ad`,
    proposed_name: 'FSIQ-VIDEO-AD-34 | New Invention Ad',
    concept_id: 'FSIQ-VIDEO-AD-34',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-VIDEO-AD-34 "New Invention Video Ad". Contains iPhone and Studio sub-folders — these are execution variants, not separate concepts.',
  },
  {
    sharepoint_item_id: '015MT6T5C5NP5RXETF7NDJ5QCBBV2L46JD',
    current_name: 'Exclusivity Ad',
    path: `${VIDEO}/Exclusivity Ad`,
    proposed_name: 'FSIQ-VIDEO-AD-33 | Exclusivity Ad',
    concept_id: 'FSIQ-VIDEO-AD-33',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-VIDEO-AD-33 "Exclusivity Video Ad | Podcast".',
  },
  {
    sharepoint_item_id: '015MT6T5GIU7ZBGXVWGRDJUD6D6DHH4AYT',
    current_name: 'Egg Ad',
    path: `${VIDEO}/Egg Ad`,
    proposed_name: 'FSIQ-VIDEO-AD-32 | Egg Ad',
    concept_id: 'FSIQ-VIDEO-AD-32',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-VIDEO-AD-32 "Egg iPhone Ad".',
  },
  {
    sharepoint_item_id: '015MT6T5GTNHM5UYFG7JEZVXA7PYI7A62O',
    current_name: 'Jackson Podcast 1',
    path: `${VIDEO}/Jackson Podcast 1`,
    proposed_name: 'FSIQ-VIDEO-AD-11 | Jackson Podcast 1',
    concept_id: 'FSIQ-VIDEO-AD-11',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-VIDEO-AD-11 "Jackson Podcast 1 | Broad Targeting | LP2 (eBook)".',
  },
  {
    sharepoint_item_id: '015MT6T5EEGEG5BVIL35AJPBHPSDCPX6M3',
    current_name: "Black's Testimonial",
    path: `${VIDEO}/Black's Testimonial`,
    proposed_name: "FSIQ-VIDEO-AD-12 | Black's Testimonial",
    concept_id: 'FSIQ-VIDEO-AD-12',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: "Tracker: FSIQ-VIDEO-AD-12 \"Black's Testimonial | Broad Targeting | LP2 (eBook)\".",
  },
  {
    sharepoint_item_id: '015MT6T5GMVXRESQF4HJAKI3JVYQCCE7AZ',
    current_name: 'Neil iPhone 3',
    path: `${VIDEO}/Neil iPhone 3`,
    proposed_name: 'FSIQ-VIDEO-AD-14 | Neil iPhone 3',
    concept_id: 'FSIQ-VIDEO-AD-14',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-VIDEO-AD-14 "Neil iPhone 3 | Broad Targeting | LP2 (eBook)".',
  },
  {
    sharepoint_item_id: '015MT6T5BTV6RGEOBBIBGLG62DKWRD4RIY',
    current_name: 'Neil iPhone 4',
    path: `${VIDEO}/Neil iPhone 4`,
    proposed_name: 'FSIQ-VIDEO-AD-15 | Neil iPhone 4',
    concept_id: 'FSIQ-VIDEO-AD-15',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-VIDEO-AD-15 "Neil iPhone 4 | Broad Targeting | LP2 (eBook)".',
  },
  {
    sharepoint_item_id: '015MT6T5AQ34AENAUCRVEK36HX45YKGGGM',
    current_name: 'Neil iPhone 2',
    path: `${VIDEO}/Neil iPhone 2`,
    proposed_name: 'FSIQ-VIDEO-AD-10 | Neil iPhone 2',
    concept_id: 'FSIQ-VIDEO-AD-10',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-VIDEO-AD-10 "Neil iPhone 2 | LP2 (eBook)".',
  },
  {
    sharepoint_item_id: '015MT6T5BYPVYZYAZC2ZF27A347WKQMU2S',
    current_name: 'Neil 50k',
    path: `${VIDEO}/Neil 50k`,
    proposed_name: 'FSIQ-VIDEO-AD-19 | Neil 50k',
    concept_id: 'FSIQ-VIDEO-AD-19',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-VIDEO-AD-19 "Neil 50k | LP2 (eBook) | Broad Targeting".',
  },
  {
    sharepoint_item_id: '015MT6T5ARKKDF7JG3CFB2BNVTAIB63IQW',
    current_name: 'Neil Holiday Gift',
    path: `${VIDEO}/Neil Holiday Gift`,
    proposed_name: 'FSIQ-VIDEO-AD-18 | Neil Holiday Gift',
    concept_id: 'FSIQ-VIDEO-AD-18',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-VIDEO-AD-18 "Neil Holiday Gift_v2 - No Santa Hat".',
  },
  {
    sharepoint_item_id: '015MT6T5DKM7HRRE3THBD3EN2FTSCVCXCH',
    current_name: 'Success Rate Ad',
    path: `${VIDEO}/Success Rate Ad`,
    proposed_name: 'FSIQ-VIDEO-AD-22 | Success Rate Ad',
    concept_id: 'FSIQ-VIDEO-AD-22',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-VIDEO-AD-22 "Success Rate | LP2 (eBook)".',
  },
  {
    sharepoint_item_id: '015MT6T5ECHUZOGGVGYBFJ7ZRHV35YEGXI',
    current_name: 'Restaurant Data',
    path: `${VIDEO}/Restaurant Data`,
    proposed_name: 'FSIQ-VIDEO-AD-25 | Restaurant Data',
    concept_id: 'FSIQ-VIDEO-AD-25',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-VIDEO-AD-25 "Restaurant Data Ad | LP2 (eBook) | LP1 (Case Study)".',
  },
  {
    sharepoint_item_id: '015MT6T5FC6IJVE5WU4FC3XQWDCMRSVPYR',
    current_name: 'New Gift Ad',
    path: `${VIDEO}/New Gift Ad`,
    proposed_name: 'FSIQ-VIDEO-AD-23 | New Gift Ad',
    concept_id: 'FSIQ-VIDEO-AD-23',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-VIDEO-AD-23 "Neil New Gift Ad | LP2 (eBook)".',
  },
  {
    sharepoint_item_id: '015MT6T5CJXIKFASYRNFAYAYWG62WVB6NX',
    current_name: 'High Ticket No B-roll',
    path: `${VIDEO}/High Ticket No B-roll`,
    proposed_name: 'FSIQ-VIDEO-AD-26 | High Ticket No B-roll',
    concept_id: 'FSIQ-VIDEO-AD-26',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-VIDEO-AD-26 "High Ticket No B-Roll | Video | LP2 (eBook)".',
  },

  // ── Needs review: mapping derived from tracker but uncertain ──────────────
  {
    sharepoint_item_id: null,
    current_name: 'VSL1',
    path: `${VIDEO}/VSL1`,
    proposed_name: 'FSIQ-VIDEO-AD-01 | VSL 1',
    concept_id: 'FSIQ-VIDEO-AD-01',
    item_type: 'folder',
    approved: false,
    flag: 'needs_review',
    notes: 'Tracker: FSIQ-VIDEO-AD-01 is VSL_1. Verify this folder contains AD-01 footage only (not AD-02/VSL_3 which may share this folder).',
  },
  {
    sharepoint_item_id: '015MT6T5EHATA5Q6FP6RFZUTX6O2DMROUD',
    current_name: 'VSL2',
    path: `${VIDEO}/VSL2`,
    proposed_name: 'FSIQ-VIDEO-AD-02 | VSL 2',
    concept_id: 'FSIQ-VIDEO-AD-02',
    item_type: 'folder',
    approved: false,
    flag: 'needs_review',
    notes: 'Tracker: FSIQ-VIDEO-AD-02 is VSL_3 (no VSL_2 exists). Verify this is AD-02 and not another concept.',
  },
  {
    sharepoint_item_id: '015MT6T5F6DOBZAV6MS5AI6VUMAXRHEMFH',
    current_name: 'Media Pouch V2',
    path: `${VIDEO}/Media Pouch V2`,
    proposed_name: 'FSIQ-VIDEO-AD-30b | Podcast Media Pouch',
    concept_id: 'FSIQ-VIDEO-AD-30b',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Sub-variant b of AD-30 (not AD-31). AD-30 now has two concept folders: AD-30 (from Podcast 2026 / Media Pouch - Neil Podcast Ads merge) and AD-30b (this folder). Both are correct — do not merge them. AD-31 mapping is unaffected.',
  },
  {
    sharepoint_item_id: '015MT6T5AY6IRKCXPRNNAZYSHNTRLDJXYT',
    current_name: 'iPhone Gift Ad - Short',
    path: `${VIDEO}/iPhone Gift Ad - Short`,
    proposed_name: 'FSIQ-VIDEO-AD-21 | iPhone Gift Ad Short',
    concept_id: 'FSIQ-VIDEO-AD-21',
    item_type: 'folder',
    approved: false,
    flag: 'needs_review',
    notes: 'Tracker: FSIQ-VIDEO-AD-21 "Neil Gift Ads Short". Verify this folder matches AD-21.',
  },
  {
    sharepoint_item_id: '015MT6T5FQGE4M53H52ZFL5JVWDO3C6BSN',
    current_name: 'iPhone Gift Ad - Long',
    path: `${VIDEO}/iPhone Gift Ad - Long`,
    proposed_name: 'FSIQ-VIDEO-AD-20 | iPhone Gift Ad Long',
    concept_id: 'FSIQ-VIDEO-AD-20',
    item_type: 'folder',
    approved: false,
    flag: 'needs_review',
    notes: 'Tracker: FSIQ-VIDEO-AD-20 "Neil Gift Ads Long". Verify this folder matches AD-20.',
  },
  {
    sharepoint_item_id: '015MT6T5FZPJVGOBBWQNHYXQBSQQ2DHZFZ',
    current_name: 'Podcast Gift Ad - 2026',
    path: `${VIDEO}/Podcast Gift Ad - 2026`,
    proposed_name: 'FSIQ-VIDEO-AD-29 | Gift Ad New Studio',
    concept_id: 'FSIQ-VIDEO-AD-29',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Confirmed by Rodrigo as AD-29. Tracker: FSIQ-VIDEO-AD-29 "New Gift Ad | Santa Hat + New Studio".',
  },
  {
    sharepoint_item_id: '015MT6T5FZHFZAVKJPGRALUJEKU4U4JWRT',
    current_name: 'Dish Society - Testimonial',
    path: `${VIDEO}/Dish Society - Testimonial`,
    proposed_name: 'FSIQ-VIDEO-AD-04 | Dish Society Testimonial',
    concept_id: 'FSIQ-VIDEO-AD-04',
    item_type: 'folder',
    approved: false,
    flag: 'needs_review',
    notes: 'Tracker has two Dish Society concepts: AD-04 (original) and AD-16 (new version). Verify which this folder represents. AD-16 may need its own separate folder.',
  },
  {
    sharepoint_item_id: '015MT6T5AFOHBGDK62UFCZIRSDJP4JFMGK',
    current_name: 'Media Pouch - Neil Podcast Ads',
    path: `${VIDEO}/Media Pouch - Neil Podcast Ads`,
    proposed_name: 'MERGE INTO: FSIQ-VIDEO-AD-30 | Podcast Media Pouch',
    concept_id: 'FSIQ-VIDEO-AD-30',
    item_type: 'folder',
    approved: false,
    flag: 'duplicate',
    notes: '⚠️ MERGE REQUIRED: both this folder and "Podcast 2026" are AD-30. Move all files from this folder into "Podcast 2026" (which renames to FSIQ-VIDEO-AD-30 | Podcast Media Pouch), then delete this folder. Verify which folder has more content before moving — cannot determine from metadata alone.',
  },
]

// ── Static image folder renames ────────────────────────────────────────────────
// All statics are high-confidence: direct 1:1 match from Creative Review Tracker.
// Tracker confirms: FSIQ-STATIC-AD-10 = Statics 7, AD-23 = Statics 17, etc.

const staticRenames: RenameRow[] = [
  {
    sharepoint_item_id: '015MT6T5ETYJOVCXBDK5H2DKHMWK37BGGI',
    current_name: 'Statics 7',
    path: `${STATIC}/Statics 7`,
    proposed_name: 'FSIQ-STATIC-AD-10 | Statics 7',
    concept_id: 'FSIQ-STATIC-AD-10',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-STATIC-AD-10 "Statics 7 | Broad Targeting | LP2 (eBook)".',
  },
  {
    sharepoint_item_id: '015MT6T5DVRP7HVXXCXZA3TN4CSDDEVUF3',
    current_name: 'Statics 17',
    path: `${STATIC}/Statics 17`,
    proposed_name: 'FSIQ-STATIC-AD-23 | Statics 17',
    concept_id: 'FSIQ-STATIC-AD-23',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-STATIC-AD-23 "Statics 17 | LP2 (eBook)".',
  },
  {
    sharepoint_item_id: '015MT6T5BFFB6HQIBBVVAIUTUNZAJT5UYH',
    current_name: 'Statics 18',
    path: `${STATIC}/Statics 18`,
    proposed_name: 'FSIQ-STATIC-AD-24 | Statics 18',
    concept_id: 'FSIQ-STATIC-AD-24',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-STATIC-AD-24 "Statics 18 | LP2 (eBook)".',
  },
  {
    sharepoint_item_id: '015MT6T5BG5MQSYKV6XBBYMGQYSTO5ECYC',
    current_name: 'Statics 19',
    path: `${STATIC}/Statics 19`,
    proposed_name: 'FSIQ-STATIC-AD-25 | Statics 19',
    concept_id: 'FSIQ-STATIC-AD-25',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-STATIC-AD-25 "Statics 19 | Video | LP2 (eBook)".',
  },
  {
    sharepoint_item_id: '015MT6T5DZUKEKZBDOBZCJXIYQC4YTJAZO',
    current_name: 'Statics 20',
    path: `${STATIC}/Statics 20`,
    proposed_name: 'FSIQ-STATIC-AD-26 | Statics 20',
    concept_id: 'FSIQ-STATIC-AD-26',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-STATIC-AD-26 "Statics 20 | LP2 (eBook)".',
  },
  {
    sharepoint_item_id: '015MT6T5FYO66SFPBA3BHL4WDYMTHSXKKE',
    current_name: 'Statics 21',
    path: `${STATIC}/Statics 21`,
    proposed_name: 'FSIQ-STATIC-AD-27 | Statics 21',
    concept_id: 'FSIQ-STATIC-AD-27',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-STATIC-AD-27 "Statics 21 | LP2 (eBook)".',
  },
  {
    sharepoint_item_id: '015MT6T5ELNABOYBFZNRFLR3BM5ZABNDAT',
    current_name: 'Statics 22',
    path: `${STATIC}/Statics 22`,
    proposed_name: 'FSIQ-STATIC-AD-28 | Statics 22',
    concept_id: 'FSIQ-STATIC-AD-28',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-STATIC-AD-28 "Statics 22 | Logos | LP2 (eBook)".',
  },
  {
    sharepoint_item_id: '015MT6T5ATHJEIXFKJGVH2FI5XX3KVLMYA',
    current_name: 'Statics 23',
    path: `${STATIC}/Statics 23`,
    proposed_name: 'FSIQ-STATIC-AD-29 | Statics 23',
    concept_id: 'FSIQ-STATIC-AD-29',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-STATIC-AD-29 "Statics 23 | Testimonial | LP2 (eBook)".',
  },
  {
    sharepoint_item_id: '015MT6T5DH6SEIWCZJQBBKSK4PYQ737PET',
    current_name: 'Statics 24',
    path: `${STATIC}/Statics 24`,
    proposed_name: 'FSIQ-STATIC-AD-30 | Statics 24',
    concept_id: 'FSIQ-STATIC-AD-30',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-STATIC-AD-30 "Statics 24 | Post-it | LP2 (eBook)".',
  },
  {
    sharepoint_item_id: '015MT6T5DTTCYV2ELJTZB2ZSEA24EYQPBR',
    current_name: 'Statics 25',
    path: `${STATIC}/Statics 25`,
    proposed_name: 'FSIQ-STATIC-AD-31 | Statics 25',
    concept_id: 'FSIQ-STATIC-AD-31',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-STATIC-AD-31 "Statics 25 | Printed Book | LP2 (eBook)".',
  },
  {
    sharepoint_item_id: '015MT6T5HLKGY4Z4A5DFAISCGQUX6UEACK',
    current_name: 'Statics 26',
    path: `${STATIC}/Statics 26`,
    proposed_name: 'FSIQ-STATIC-AD-32 | Statics 26',
    concept_id: 'FSIQ-STATIC-AD-32',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-STATIC-AD-32 "Statics 26 | Hand + Book | LP2 (eBook)".',
  },
  {
    sharepoint_item_id: '015MT6T5EKV7J7O433JZDLCKWFVNHKGBJL',
    current_name: 'Statics 27',
    path: `${STATIC}/Statics 27`,
    proposed_name: 'FSIQ-STATIC-AD-33 | Statics 27',
    concept_id: 'FSIQ-STATIC-AD-33',
    item_type: 'folder',
    approved: false,
    flag: 'confirmed',
    notes: 'Tracker: FSIQ-STATIC-AD-33 "Statics 27 | Hormozi | LP3 (eBook)".',
  },
]

const allRenames = [...videoRenames, ...staticRenames]

async function main() {
  console.log(`\n═══════════ seed-pending-renames ═══════════`)
  console.log(`Total rows to seed: ${allRenames.length}`)

  // Step 1: Update sharepoint_map.expected_name for each violation row
  console.log(`\n[1/2] Updating sharepoint_map.expected_name...`)
  let smUpdated = 0
  let smErrors  = 0

  for (const r of allRenames) {
    if (r.flag === 'never_produced') continue // no rename, just archive
    if (r.flag === 'duplicate') {
      // Mark duplicate with a distinctive expected_name
      const { error } = await supabase
        .from('sharepoint_map')
        .update({ expected_name: r.proposed_name, naming_valid: false })
        .eq('path', r.path)
      if (error) { console.error(`  ✗ ${r.current_name}: ${error.message}`); smErrors++ }
      else smUpdated++
      continue
    }
    const { error } = await supabase
      .from('sharepoint_map')
      .update({ expected_name: r.proposed_name })
      .eq('path', r.path)
    if (error) { console.error(`  ✗ ${r.current_name}: ${error.message}`); smErrors++ }
    else smUpdated++
  }

  console.log(`  ✅ sharepoint_map updated: ${smUpdated} rows (${smErrors} errors)`)

  // Step 2: Upsert all rows into pending_renames
  console.log(`\n[2/2] Upserting pending_renames...`)
  let prInserted = 0
  let prErrors   = 0

  for (const r of allRenames) {
    const { error } = await supabase
      .from('pending_renames')
      .upsert(r, { onConflict: 'path' })
    if (error) { console.error(`  ✗ ${r.current_name}: ${error.message}`); prErrors++ }
    else prInserted++
  }

  console.log(`  ✅ pending_renames upserted: ${prInserted} rows (${prErrors} errors)`)

  // Step 3: Summary report
  const { data: allPending } = await supabase
    .from('pending_renames')
    .select('flag, proposed_name, current_name, concept_id')
    .order('concept_id')

  const confirmed     = (allPending ?? []).filter(r => r.flag === 'confirmed')
  const needsReview   = (allPending ?? []).filter(r => r.flag === 'needs_review')
  const duplicates    = (allPending ?? []).filter(r => r.flag === 'duplicate')
  const neverProduced = (allPending ?? []).filter(r => r.flag === 'never_produced')

  console.log(`\n════ PENDING RENAMES TABLE ════`)
  console.log(`Total: ${(allPending ?? []).length}`)
  console.log(`  confirmed:     ${confirmed.length}`)
  console.log(`  needs_review:  ${needsReview.length}`)
  console.log(`  duplicate:     ${duplicates.length}`)
  console.log(`  never_produced:${neverProduced.length}`)

  console.log(`\n─── confirmed ────────────────────────────────────────────────`)
  for (const r of confirmed) {
    console.log(`  ${(r.concept_id ?? '').padEnd(22)} ${r.current_name} → ${r.proposed_name}`)
  }

  console.log(`\n─── needs_review ─────────────────────────────────────────────`)
  for (const r of needsReview) {
    console.log(`  ${(r.concept_id ?? '?').padEnd(22)} ${r.current_name} → ${r.proposed_name}`)
  }

  console.log(`\n─── duplicate ────────────────────────────────────────────────`)
  for (const r of duplicates) {
    console.log(`  ${(r.concept_id ?? '').padEnd(22)} ${r.current_name} → ${r.proposed_name}`)
  }

  console.log(`\n─── never_produced ───────────────────────────────────────────`)
  for (const r of neverProduced) {
    console.log(`  ${r.current_name} → ${r.proposed_name}`)
  }

  if (prErrors > 0) {
    console.error(`\n⚠️  ${prErrors} error(s) — check if pending_renames table exists (run migrate-schema.sql first)`)
    process.exit(1)
  }
}

main().catch(e => { console.error('Seed failed:', e.message); process.exit(1) })
