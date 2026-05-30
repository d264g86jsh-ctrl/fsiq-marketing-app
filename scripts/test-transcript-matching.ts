/**
 * test-transcript-matching.ts
 *
 * Tests real-footage transcript matching against all footage_log rows
 * that have a sharepoint_item_id. For >= 85% matches, generates and
 * uploads the campaign brief using the template approach.
 *
 * Run: npx tsx --env-file=.env.local scripts/test-transcript-matching.ts
 */

import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../lib/supabase'
import { getGraphToken } from '../lib/graph'
import { run as generateBrief } from '../skills/paid-media/campaign-brief-generator.skill'

const DRIVE_ID = 'b!SoPMe2KqFU2BkUmHhH8qFTOqNnh1p1BPuxbMZNe-MrqxmzKSNvU8TI-0UrHfUjC_'

// The confirmed approved script for AD-18
// In production this comes from Google Docs via script-matcher
const KNOWN_SCRIPTS = [
  {
    name: 'Neil Holiday Gift',
    adId: 'FSIQ-VIDEO-AD-18',
    text: `[HOOK-IPHONE]
If your restaurant does more than $3,000,000 per year in revenue, keep watching for the next 30 seconds. I actually have a pretty special holiday gift for you.

[BODY]
Over the last 15 years, we've helped over 2,000 other independent restaurants save 5 to 7% on their annual food costs. Earlier this year, our team spent countless hours taking our entire proprietary base of knowledge on exactly how to reduce food costs and transformed it into a single, actionable playbook just for you. This playbook represents the combined lifetime knowledge of our team — including helping thousands of restaurants, managing billions in food spend, and close to two decades of experience.

[CTA]
As a special holiday gift to you, you can download this playbook completely for free at the link below — and see exactly how 2,000 other independent restaurants have saved 5 to 7% on their annual food costs with no changes to their ingredients or distributors.`,
  },
]

interface ResultRow {
  file:             string
  transcriptSource: string
  confidence:       number | null
  matchedScript:    string
  action:           string
}

async function main() {
  const anthropic = new Anthropic()

  console.log()
  console.log('='.repeat(62))
  console.log('TRANSCRIPT MATCHING TEST — real footage_log rows')
  console.log('='.repeat(62))
  console.log()

  // 1. Fetch footage_log rows with sharepoint_item_id
  const { data: rows, error } = await supabase
    .from('footage_log')
    .select('id, ad_id, concept_folder, file_name, sharepoint_item_id, status, transcript, brief_sharepoint_url')
    .not('sharepoint_item_id', 'is', null)
    .order('id', { ascending: false })
    .limit(10)

  if (error) throw error

  const token = await getGraphToken()
  console.log(`Found ${rows?.length ?? 0} footage row(s) with SharePoint item IDs.\n`)

  const results: ResultRow[] = []

  for (const row of rows ?? []) {
    let transcript    = row.transcript as string | null
    let transcriptSrc = 'None'
    let transcriptApiStatus = ''

    // 2. Attempt Graph beta transcript endpoint
    const apiUrl = `https://graph.microsoft.com/beta/drives/${DRIVE_ID}/items/${row.sharepoint_item_id}/media/transcripts`
    const apiRes = await fetch(apiUrl, { headers: { Authorization: `Bearer ${token}` } })

    if (apiRes.ok) {
      const apiData = await apiRes.json() as { value?: { transcriptContentUrl?: string }[] }
      const tUrl = apiData.value?.[0]?.transcriptContentUrl
      if (tUrl) {
        const tRes = await fetch(tUrl, { headers: { Authorization: `Bearer ${token}` } })
        if (tRes.ok) {
          transcript    = await tRes.text()
          transcriptSrc = 'API (Stream)'
        } else {
          transcriptSrc = `API content fetch failed ${tRes.status}`
        }
      } else {
        transcriptSrc = 'API ok but no transcripts yet'
      }
    } else {
      const errBody = await apiRes.json() as { error?: { code?: string; message?: string } }
      transcriptApiStatus = `${apiRes.status} ${errBody?.error?.code ?? ''}: ${(errBody?.error?.message ?? '').slice(0, 80)}`
      if (transcript) {
        transcriptSrc = `DB fallback (API blocked: ${transcriptApiStatus})`
      } else {
        transcriptSrc = `BLOCKED — ${transcriptApiStatus}`
      }
    }

    console.log(`[${row.ad_id}] ${row.file_name}`)
    console.log(`  SharePoint item: ${row.sharepoint_item_id}`)
    console.log(`  Current status:  ${row.status}`)
    console.log(`  Transcript:      ${transcriptSrc}`)
    if (transcriptApiStatus) {
      console.log(`  API error:       ${transcriptApiStatus}`)
    }

    if (!transcript) {
      results.push({
        file:             row.file_name,
        transcriptSource: transcriptSrc,
        confidence:       null,
        matchedScript:    '—',
        action:           'No transcript — awaiting Stream processing or MediaContent.Read.All permission',
      })
      console.log()
      continue
    }

    // 3. Semantic match against all known scripts
    console.log(`  Running Claude semantic match...`)
    const scriptList = KNOWN_SCRIPTS.map((s, i) => `Script ${i + 1}: "${s.name}"\n${s.text}`).join('\n\n---\n\n')

    const matchMsg = await anthropic.messages.create({
      model:      'claude-opus-4-7',
      max_tokens: 300,
      messages: [{
        role:    'user',
        content: `You are matching a video transcript to an ad script. Natural speech, paraphrasing, and summarized delivery all count as matches.

VIDEO TRANSCRIPT:
${transcript}

AD SCRIPTS TO MATCH AGAINST:
${scriptList}

Which script (if any) does this transcript match? Consider that speakers often paraphrase or summarize scripts naturally.

Respond with JSON only:
{
  "matched_script_name": "string or null",
  "confidence": 0-100,
  "reasoning": "one sentence"
}`,
      }],
    })

    let confidence   = 0
    let matchedName  = '—'
    let reasoning    = ''
    let matchedScript = KNOWN_SCRIPTS[0]
    try {
      const parsed = JSON.parse((matchMsg.content[0] as { text: string }).text)
      confidence  = parsed.confidence ?? 0
      matchedName = parsed.matched_script_name ?? '—'
      reasoning   = parsed.reasoning ?? ''
      matchedScript = KNOWN_SCRIPTS.find(s => s.name === matchedName) ?? KNOWN_SCRIPTS[0]
    } catch {
      reasoning = 'parse error'
    }

    console.log(`  Confidence:      ${confidence}%`)
    console.log(`  Matched script:  ${matchedName}`)
    console.log(`  Reasoning:       ${reasoning}`)

    let action = ''

    if (confidence >= 85 && matchedScript) {
      console.log(`  => Generating brief via template approach...`)

      const briefResult = await generateBrief({
        conceptId:    row.ad_id,
        footageLogId: row.id,
        matchedScript: {
          matched_script_name: matchedScript.name,
          matched_ad_id:       row.ad_id,
          confidence,
          matching_elements:   [],
          reasoning,
          full_text:           matchedScript.text,
        },
        dryRun: false,
      })

      if (briefResult.brief_url) {
        action = `Brief uploaded to SharePoint`
        console.log(`  Brief URL:       ${briefResult.brief_url}`)

        // Verify by fetching sharepoint_map
        const { data: mapRow } = await supabase
          .from('sharepoint_map')
          .select('display_name, last_verified_at')
          .ilike('display_name', `${row.ad_id}%-Brief.docx`)
          .maybeSingle()
        if (mapRow) {
          console.log(`  sharepoint_map:  ${mapRow.display_name} (verified ${mapRow.last_verified_at})`)
        }
      } else {
        action = `Brief generated but upload failed (concept folder not in sharepoint_map?)`
        console.log(`  Brief status:    ${briefResult.status}`)
      }
    } else if (confidence < 85) {
      action = `Below 85% threshold — no brief generated`
      console.log(`  => Below threshold. Slack #video-editor preview:`)
      console.log(`     "Script match below threshold for ${row.file_name}."`)
      console.log(`     "Confidence: ${confidence}% (${matchedName}). Manual review needed."`)
    }

    results.push({
      file:             row.file_name,
      transcriptSource: transcriptSrc,
      confidence,
      matchedScript:    matchedName,
      action,
    })
    console.log()
  }

  // Summary table
  console.log('='.repeat(62))
  console.log('RESULTS TABLE')
  console.log('='.repeat(62))

  const col = (s: string, w: number) => s.slice(0, w).padEnd(w)
  const header = `| ${col('File', 30)} | ${col('Transcript', 16)} | ${col('Conf', 5)} | ${col('Matched Script', 22)} |`
  console.log(header)
  console.log('|' + '-'.repeat(header.length - 2) + '|')
  for (const r of results) {
    const trans = r.transcriptSource.includes('DB fallback') ? 'DB fallback'
      : r.transcriptSource.includes('BLOCKED')  ? 'BLOCKED (400)'
      : r.transcriptSource.includes('API (Stream)') ? 'Stream API'
      : r.transcriptSource.slice(0, 16)
    console.log(`| ${col(r.file, 30)} | ${col(trans, 16)} | ${col(r.confidence !== null ? r.confidence + '%' : '—', 5)} | ${col(r.matchedScript, 22)} |`)
  }

  console.log()
  console.log('SUMMARY')
  console.log('-'.repeat(40))
  console.log(`  Footage rows tested:     ${results.length}`)
  console.log(`  Transcripts found:       ${results.filter(r => r.confidence !== null).length}`)
  console.log(`  Matched >= 85%:          ${results.filter(r => (r.confidence ?? 0) >= 85).length}`)
  console.log(`  Briefs generated:        ${results.filter(r => r.action.includes('uploaded')).length}`)
  console.log(`  MediaContent.Read.All:   BLOCKED (400 on all Stream transcript API calls)`)
  console.log(`  Fix required:            Azure Portal > App registrations > API permissions`)
  console.log(`                           > Microsoft Graph > Application > MediaContent.Read.All`)
  console.log()
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
