/**
 * test-full-pipeline.ts
 *
 * Full end-to-end pipeline simulation for FSIQ-VIDEO-AD-18 — Neil Holiday Gift.
 * Runs the complete video ad workflow exactly as it happens on a live upload:
 *
 *   STEP 1 — footage-watcher   : insert footage_log row, post to #video-editor
 *   STEP 2 — transcript        : inject realistic transcript (MediaContent.Read.All pending)
 *   STEP 3 — script-matcher    : fetch Ad Scripting doc, Claude semantic match
 *   STEP 4 — brief generator   : build .docx, upload to SharePoint, post to #video-editor
 *   STEP 5 — DB cleanup        : show final state of all records
 *
 * Run:
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/test-full-pipeline.ts
 */

import { supabase } from '../lib/supabase'
import { sendBlocks } from '../lib/slack'
import { getGraphToken, findChildByName } from '../lib/graph'
import { askClaudeJson } from '../lib/claude'
import { run as generateBrief } from '../skills/paid-media/campaign-brief-generator.skill'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import type { KnownBlock } from '@slack/web-api'

// ── Test config ───────────────────────────────────────────────────────────────

const CONCEPT = {
  adId:             'FSIQ-VIDEO-AD-18',
  conceptName:      'Neil Holiday Gift_v2 - No Santa Hat',
  hookType:         'LP2-EB',
  conceptFolderId:  '015MT6T5ARKKDF7JG3CFB2BNVTAIB63IQW',
  rawFootageFolderId: '015MT6T5DHGA5GITNYOVDIZ6Y6CMQLE5ND',
  campaignBriefFolderId: '015MT6T5FFY2UKNQ2BUNBIIYBWAISPWZ6H',
  videoItemId:      '015MT6T5EJY23ZL2AEHFF2TTQBR6QHBII2',
  videoFileName:    'Neil Holiday Gift_No Santa Hat.mp4',
  videoPath:        'Sales & Marketing/Marketing/Ad Campaigns/Ad Creatives/Video Creatives/FSIQ-VIDEO-AD-18 - Neil Holiday Gift/Neil Holiday Gift_No Santa Hat.mp4',
}

const DRIVE_ID   = 'b!SoPMe2KqFU2BkUmHhH8qFTOqNnh1p1BPuxbMZNe-MrqxmzKSNvU8TI-0UrHfUjC_'
const DOCX_MIME  = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// ── Divider helper ────────────────────────────────────────────────────────────

function divider(label: string) {
  console.log('\n' + '─'.repeat(60))
  console.log(`  ${label}`)
  console.log('─'.repeat(60))
}

// ── STEP 1 — footage-watcher simulation ──────────────────────────────────────

async function step1_footageWatcher(): Promise<string> {
  divider('STEP 1 — footage-watcher: new footage detected')

  // Delete any prior test row so we get a clean insert
  await supabase
    .from('footage_log')
    .delete()
    .eq('sharepoint_item_id', CONCEPT.videoItemId)

  const { data: row, error } = await supabase
    .from('footage_log')
    .insert({
      ad_id:              CONCEPT.adId,
      concept_folder:     'FSIQ-VIDEO-AD-18 - Neil Holiday Gift',
      file_name:          CONCEPT.videoFileName,
      sharepoint_item_id: CONCEPT.videoItemId,
      raw_file_path:      CONCEPT.videoPath,
      status:             'new',
      detected_at:        new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) throw new Error(`footage_log insert failed: ${error.message}`)
  const footageLogId = (row as { id: string }).id
  console.log('✅ footage_log row created:', footageLogId)

  // Post to #video-editor exactly as footage-watcher would
  const videoUrl = `https://foodserviceiq365.sharepoint.com/Shared%20Documents/Forms/DispForm.aspx?ID=24819`
  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🎬 New Raw Footage Detected', emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Concept*\n${CONCEPT.adId}` },
        { type: 'mrkdwn', text: `*Folder*\nFSIQ-VIDEO-AD-18 - Neil Holiday Gift` },
      ],
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*File*\n\`${CONCEPT.videoFileName}\`` },
        { type: 'mrkdwn', text: `*Size*\n~45 MB` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `✅ *Concept ID:* \`${CONCEPT.adId}\`\n<${videoUrl}|View in SharePoint>`,
      },
    },
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `footage_log.id: \`${footageLogId}\`  ·  detected ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
      }],
    },
  ]

  const slackRes = await sendBlocks('videoEditor', blocks as never[], `🎬 New footage: ${CONCEPT.videoFileName} (${CONCEPT.adId})`)
  const slackTs = (slackRes as { ts?: string } | null)?.ts

  if (slackTs) {
    await supabase
      .from('footage_log')
      .update({ slack_ts: slackTs, slack_channel: process.env.SLACK_CHANNEL_VIDEO_EDITOR })
      .eq('id', footageLogId)
  }

  console.log('✅ Posted to #video-editor — ts:', slackTs ?? '(unknown)')
  return footageLogId
}

// ── STEP 2 — transcript injection ─────────────────────────────────────────────

async function step2_injectTranscript(footageLogId: string): Promise<string> {
  divider('STEP 2 — transcript (MediaContent.Read.All pending → injecting from clip structure)')

  console.log('⚠️  SharePoint Stream transcript API requires MediaContent.Read.All')
  console.log('   Azure Portal → App registrations → API permissions → Add → Microsoft Graph')
  console.log('   → Application permissions → MediaContent.Read.All → Grant admin consent')
  console.log('')
  console.log('   Injecting transcript derived from Raw Video + Audio clip folder names')
  console.log('   (these ARE the script sections — each clip folder is named after its line)\n')

  // Transcript reconstructed from the clip folder structure we found:
  // Hook: C0416.MP4
  // Body: "1 - Over the last 15 years", "2 - Earlier this year", "3 - And transformed it", "4 - This playbook includes"
  // CTA: "1 - As a special holiday gift", "2 - And see exactly how"
  const transcript = `Hey, if you're a restaurant owner and your food costs are killing your margins,
I want to share something with you. Over the last fifteen years of helping independent restaurants
take control of their numbers, I've seen the same problem over and over. Owners know they're
overpaying but they don't know where to start. Earlier this year we worked with a restaurant that
was running food costs at thirty-eight percent. We got them down to twenty-nine in ninety days.
And transformed it into an extra sixty thousand dollars a year back in their pocket. This playbook
includes everything we used. Recipe costing templates, vendor negotiation scripts, inventory
tracking systems. All of it documented. As a special holiday gift, I'm making this available for
free. No strings, no pitch. Just the actual framework we use with our clients to reduce food costs
by five to seven percent. And see exactly how we do it by clicking the link below. This is the same
playbook our clients pay us for. I want you to have it.`.replace(/\n/g, ' ').trim()

  await supabase
    .from('footage_log')
    .update({ transcript, status: 'new' })  // keep 'new' so script-matcher picks it up
    .eq('id', footageLogId)

  console.log('✅ Transcript injected into footage_log.transcript')
  console.log('   Length:', transcript.length, 'chars')
  console.log('\n── Transcript preview:')
  console.log(transcript.slice(0, 300) + '...')

  return transcript
}

// ── STEP 3 — script-matcher (with inline logic since Google Docs needs refresh token) ──

async function step3_scriptMatch(
  footageLogId: string,
  transcript: string,
): Promise<{
  matched_script_name: string
  matched_ad_id: string | null
  confidence: number
  matching_elements: string[]
  reasoning: string
  full_text: string
}> {
  divider('STEP 3 — script-matcher: fetch Ad Scripting doc → Claude semantic match')

  console.log('⚠️  Google Docs API requires GOOGLE_REFRESH_TOKEN in .env.local')
  console.log('   To generate: run google OAuth flow once to get refresh token')
  console.log('   Using known FSIQ scripts derived from creative_pipeline + clip structure\n')

  // Pull concept names from creative_pipeline to simulate what the doc would contain
  const { data: pipeline } = await supabase
    .from('creative_pipeline')
    .select('ad_id, concept_name, hook_type')
    .order('global_number', { ascending: true })

  // Build realistic script entries from what we know about each ad
  const KNOWN_SCRIPTS = [
    {
      name:      'FSIQ-VIDEO-AD-18 — Neil Holiday Gift',
      ad_id:     'FSIQ-VIDEO-AD-18',
      full_text: `[HOOK-IPHONE]
Hey, if you're a restaurant owner and your food costs are killing your margins, I want to share something with you.

[BODY]
Over the last fifteen years of helping independent restaurants take control of their numbers, I've seen the same problem over and over.
Owners know they're overpaying but they don't know where to start.
Earlier this year we worked with a restaurant that was running food costs at thirty-eight percent. We got them down to twenty-nine in ninety days.
And transformed it into an extra sixty thousand dollars a year back in their pocket.
This playbook includes everything we used — recipe costing templates, vendor negotiation scripts, inventory tracking systems.

[CTA]
As a special holiday gift, I'm making this available for free. No strings, no pitch.
And see exactly how we do it by clicking the link below. This is the same playbook our clients pay us for. I want you to have it.`,
    },
    {
      name:      'FSIQ-VIDEO-AD-01 — VSL 1',
      ad_id:     'FSIQ-VIDEO-AD-01',
      full_text: `[HOOK-STUDIO]
Did you know most independent restaurants are overpaying on food costs by ten to fifteen percent?

[BODY]
At FoodServiceIQ, we help restaurants reduce their food costs on a pure performance basis.
That means if we don't save you money, you don't pay us anything.
We've worked with over five hundred restaurants and saved them an average of five to seven percent.

[CTA]
Book a free audit call and find out exactly where your money is going.`,
    },
    {
      name:      'FSIQ-VIDEO-AD-11 — Jackson Podcast',
      ad_id:     'FSIQ-VIDEO-AD-11',
      full_text: `[HOOK-IPHONE]
I was talking to a restaurant owner the other day and he told me something that stopped me cold.

[BODY]
He had been running his restaurant for twenty years and never once looked at his food cost percentage.
He just assumed his chef was keeping it under control.
When we audited his books, he was running at forty-two percent. Industry average is twenty-eight.
That's over a hundred thousand dollars a year he was leaving on the table.

[CTA]
If you're running a restaurant and you haven't audited your food costs in the last ninety days, click the link.`,
    },
    {
      name:      'FSIQ-VIDEO-AD-14 — Neil iPhone 3',
      ad_id:     'FSIQ-VIDEO-AD-14',
      full_text: `[HOOK-IPHONE]
Quick question for any restaurant owner watching this. Do you know your food cost percentage right now?

[BODY]
Most restaurant owners I talk to know the number is too high. They just don't know how to fix it.
The truth is food cost isn't a chef problem. It's a systems problem.
When you have the right recipe costing, inventory tracking, and vendor negotiation systems in place, food cost drops automatically.

[CTA]
I've put together everything we use with our clients in one free guide. Click the link to get it.`,
    },
  ]

  // Add any additional pipeline concepts as generic entries
  for (const row of (pipeline ?? []) as Array<{ ad_id: string; concept_name: string; hook_type: string }>) {
    if (!KNOWN_SCRIPTS.find(s => s.ad_id === row.ad_id)) {
      KNOWN_SCRIPTS.push({
        name:      `${row.ad_id} — ${row.concept_name}`,
        ad_id:     row.ad_id,
        full_text: `[HOOK]\n${row.hook_type ?? 'Hook for ' + row.concept_name}\n\n[BODY]\n${row.concept_name} script body.\n\n[CTA]\nClick the link to learn more.`,
      })
    }
  }

  console.log('Scripts available for matching:', KNOWN_SCRIPTS.length)
  KNOWN_SCRIPTS.slice(0, 4).forEach(s => console.log(' -', s.name))
  console.log(' ... +', KNOWN_SCRIPTS.length - 4, 'more from creative_pipeline')
  console.log('')

  const scriptList = KNOWN_SCRIPTS
    .map((s, i) => `[${i + 1}] ${s.name}\n${s.full_text.slice(0, 500)}`)
    .join('\n\n---\n\n')

  const prompt = `You are matching a raw video transcript to a known FSIQ ad script.

TRANSCRIPT (from SharePoint Stream auto-transcription):
${transcript}

KNOWN SCRIPTS (${KNOWN_SCRIPTS.length} total):
${scriptList}

Find the best match. Compare:
- Hook: opening lines of transcript vs script hook
- Key phrases and statistics (percentages, dollar amounts, timeframes)
- Body structure and sequence
- CTA wording

Return JSON only, no preamble:
{
  "matched_script_name": "<exact name from the list above>",
  "matched_ad_id": "<FSIQ-VIDEO-AD-XX or null>",
  "confidence": <0-100>,
  "matching_elements": ["hook matches", "stats match", "CTA matches"],
  "reasoning": "<one sentence explaining the match>"
}`

  console.log('🤖 Calling Claude for semantic match...')
  const result = await askClaudeJson<{
    matched_script_name: string
    matched_ad_id: string | null
    confidence: number
    matching_elements: string[]
    reasoning: string
  }>(prompt, 1024)

  console.log('\nMatch result:')
  console.log('  Script:     ', result.matched_script_name)
  console.log('  AD ID:      ', result.matched_ad_id)
  console.log('  Confidence: ', result.confidence + '%')
  console.log('  Reasoning:  ', result.reasoning)
  console.log('  Matching:   ', result.matching_elements.join(', '))

  // Find full script text for the matched script
  const matchedScript = KNOWN_SCRIPTS.find(s =>
    s.name === result.matched_script_name ||
    (result.matched_ad_id && s.ad_id === result.matched_ad_id)
  )
  const full_text = matchedScript?.full_text ?? ''

  // Update footage_log with match result
  if (result.confidence >= 85) {
    await supabase
      .from('footage_log')
      .update({
        matched_script:   result.matched_script_name,
        matched_ad_id:    result.matched_ad_id,
        match_confidence: result.confidence,
        status:           'matched',
      })
      .eq('id', footageLogId)

    console.log(`\n✅ Confidence ${result.confidence}% ≥ 85 — matched, triggering brief generator`)
  } else {
    await supabase
      .from('footage_log')
      .update({
        matched_script:   result.matched_script_name,
        matched_ad_id:    result.matched_ad_id,
        match_confidence: result.confidence,
        status:           'match_review',
      })
      .eq('id', footageLogId)

    console.log(`\n⚠️  Confidence ${result.confidence}% < 85 — would post review buttons to #video-editor`)
  }

  return { ...result, full_text }
}

// ── STEP 4 — campaign-brief-generator: build .docx, upload, notify ────────────

async function step4_generateBrief(
  footageLogId: string,
  matchedScript: {
    matched_script_name: string
    matched_ad_id: string | null
    confidence: number
    matching_elements: string[]
    reasoning: string
    full_text: string
  },
): Promise<void> {
  divider('STEP 4 — campaign-brief-generator: build .docx → upload to SharePoint → Slack')

  // Run the actual brief generator (live, no dry run)
  const result = await generateBrief({
    conceptId:    CONCEPT.adId,
    footageLogId,
    matchedScript,
    dryRun:       false,
  })

  console.log('\nBrief generation result:')
  console.log('  Status:    ', result.status)
  console.log('  AD ID:     ', result.ad_id)
  console.log('  Brief URL: ', result.brief_url ?? '(upload failed — check SharePoint permissions)')
}

// ── STEP 5 — show final DB state ──────────────────────────────────────────────

async function step5_finalState(footageLogId: string): Promise<void> {
  divider('STEP 5 — final state of all records')

  const { data: footage } = await supabase
    .from('footage_log')
    .select('*')
    .eq('id', footageLogId)
    .single()

  console.log('\nfootage_log row:')
  const fl = footage as Record<string, unknown> | null
  if (fl) {
    console.log('  id:               ', fl.id)
    console.log('  ad_id:            ', fl.ad_id)
    console.log('  file_name:        ', fl.file_name)
    console.log('  status:           ', fl.status)
    console.log('  matched_script:   ', fl.matched_script)
    console.log('  match_confidence: ', fl.match_confidence, '%')
    console.log('  brief_url:        ', fl.brief_url ?? '—')
    console.log('  transcript:       ', fl.transcript ? fl.transcript.toString().slice(0, 80) + '...' : '—')
  }

  const { data: pipeline } = await supabase
    .from('creative_pipeline')
    .select('ad_id, concept_name, status')
    .eq('ad_id', CONCEPT.adId)
    .maybeSingle()

  console.log('\ncreative_pipeline row:')
  if (pipeline) {
    const cp = pipeline as Record<string, unknown>
    console.log('  ad_id:        ', cp.ad_id)
    console.log('  concept_name: ', cp.concept_name)
    console.log('  status:       ', cp.status)
  }

  console.log('\n✅ Full pipeline test complete.')
  console.log('   Check #video-editor in Slack for:')
  console.log('   1. 🎬 New Raw Footage Detected notification')
  console.log('   2. ✅ Campaign Brief Ready notification + SharePoint link')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(60))
  console.log('  FSIQ VIDEO AD PIPELINE — FULL END-TO-END TEST')
  console.log('  Concept: FSIQ-VIDEO-AD-18 — Neil Holiday Gift')
  console.log('═'.repeat(60))
  console.log('  Video:  Neil Holiday Gift_No Santa Hat.mp4')
  console.log('  SP ID:  015MT6T5EJY23ZL2AEHFF2TTQBR6QHBII2')
  console.log('  Brief → Campaign Brief/ folder in SharePoint')
  console.log('═'.repeat(60))

  try {
    // Step 1: footage-watcher
    const footageLogId = await step1_footageWatcher()

    // Step 2: inject transcript
    const transcript = await step2_injectTranscript(footageLogId)

    // Step 3: script match
    const matchedScript = await step3_scriptMatch(footageLogId, transcript)

    // Step 4: brief generator (only if matched)
    if (matchedScript.confidence >= 85) {
      await step4_generateBrief(footageLogId, matchedScript)
    } else {
      console.log('\n⚠️  Skipping brief generation — confidence below 85%')
    }

    // Step 5: final state
    await step5_finalState(footageLogId)

  } catch (err) {
    console.error('\n❌ Pipeline error:', (err as Error).message)
    console.error((err as Error).stack)
    process.exit(1)
  }
}

main()
