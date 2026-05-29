// review-all-outputs.ts
// Generates outputs for all working channels and posts to Slack for human review.
// NO Supabase writes. NO approval buttons. Review-only.
//
// PAID ADS     → #MediaBuying
// NEIL LI      → #organic-agent
// FSIQ LI      → #organic-agent
// BLOG ARTICLE → #seo-agent
// ORGANIC      → stub (skipped)

import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { sendBlocks } from '../lib/slack'
import { humanize } from '../skills/cmo/humanizer.skill'
import type { KnownBlock } from '@slack/web-api'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

function loadSop(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'sops', name), 'utf-8')
}

const DIVIDER = '─'.repeat(29)

function toUnits(text: string): string[] {
  return text.split(/(?<=[\.\?\!…])\s+|\n+/).map(s => s.trim()).filter(Boolean)
}

function countChanges(raw: string, clean: string): number {
  const rawSet   = new Set(toUnits(raw))
  const cleanSet = new Set(toUnits(clean))
  const removed  = toUnits(raw).filter(u => !cleanSet.has(u))
  const added    = toUnits(clean).filter(u => !rawSet.has(u))
  return Math.max(removed.length, added.length)
}

function qualityCheck(text: string, channel: 'paid-ads' | 'neil-personal' | 'fsiq-company' | 'blog'): string[] {
  const issues: string[] = []
  if (text.includes('—') || text.includes('–')) issues.push('Em dash found')
  if (channel === 'blog') {
    if (text.includes('…')) issues.push('Ellipsis found (blog uses periods)')
    const wordCount = text.split(/\s+/).length
    if (wordCount < 700)  issues.push(`Word count ${wordCount} — below 700`)
    if (wordCount > 1100) issues.push(`Word count ${wordCount} — above 1,100`)
    const aiWords = ['pivotal', 'groundbreaking', 'transformational', 'innovative', 'cutting-edge', 'testament', 'underscore', 'foster', 'delve', 'landscape']
    const found = aiWords.filter(w => text.toLowerCase().includes(w))
    if (found.length > 0) issues.push(`AI vocabulary: ${found.join(', ')}`)
    if (!text.toLowerCase().includes('audit') && !text.toLowerCase().includes('foodserviceiq.com')) {
      issues.push('Missing CTA / contact reference')
    }
    return issues
  }
  if (channel === 'neil-personal') {
    if (text.includes('…')) issues.push('Ellipsis found (LinkedIn uses periods)')
    const emojiTest = text.replace(/#\w+/g, '').replace(/\p{So}/gu, '')
    const hasEmoji = /\p{Emoji_Presentation}/u.test(emojiTest)
    if (hasEmoji) issues.push('Emoji found (Neil personal: none)')
    const hashtagCount = (text.match(/#\w+/g) ?? []).length
    if (hashtagCount > 0) issues.push(`Hashtags found (${hashtagCount}) — Neil personal has none`)
  }
  if (channel === 'fsiq-company') {
    if (text.includes('…')) issues.push('Ellipsis found (LinkedIn uses periods)')
    const hashtagCount = (text.match(/#\w+/g) ?? []).length
    if (hashtagCount < 4) issues.push(`Hashtag count ${hashtagCount} — expected 4–5`)
  }
  const aiWords = ['pivotal', 'groundbreaking', 'transformational', 'innovative', 'cutting-edge', 'testament', 'underscore', 'foster', 'delve']
  const found = aiWords.filter(w => text.toLowerCase().includes(w))
  if (found.length > 0) issues.push(`AI vocabulary: ${found.join(', ')}`)
  return issues
}

// Split text into ≤2900-char chunks for Slack block limits
function textChunks(text: string): string[] {
  const max = 2900
  if (text.length <= max) return [text]
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= max) {
      chunks.push(remaining)
      break
    }
    // Try to break at a newline before the limit
    let cut = remaining.lastIndexOf('\n', max)
    if (cut < max / 2) cut = max
    chunks.push(remaining.slice(0, cut))
    remaining = remaining.slice(cut).trimStart()
  }
  return chunks
}

// Build Slack blocks in the exact review format the user specified
function buildReviewBlocks(
  skillName: string,
  voiceSop: string,
  humanEdits: number,
  cleanText: string,
  issues: string[],
): KnownBlock[] {
  const voiceCheck = issues.length === 0 ? 'pass' : 'fail'
  const issueList = issues.length === 0 ? 'none' : issues.map(i => `• ${i}`).join('\n')

  const headerSection = `${DIVIDER}\nREVIEW: ${skillName} Output\nVoice SOP used: ${voiceSop}\nHumanizer edits: ${humanEdits}\n${DIVIDER}`
  const footerSection = `${DIVIDER}\nVoice check: ${voiceCheck}\nIssues found: ${issueList}\n${DIVIDER}`

  const blocks: KnownBlock[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `\`\`\`${headerSection}\`\`\`` },
    },
  ]

  // Full output — split into chunks to avoid Slack's 3000-char block limit
  for (const chunk of textChunks(cleanText)) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `\`\`\`${chunk}\`\`\`` },
    })
  }

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `\`\`\`${footerSection}\`\`\`` },
  })

  return blocks
}

// ── Generators ────────────────────────────────────────────────────────────────

async function generatePaidAdsScript(
  topic: string,
  brandVoice: string,
  companyProfile: string,
): Promise<string> {
  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are writing a paid video ad script for FoodServiceIQ (FSIQ).

## Company Profile
${companyProfile}

## Brand Voice Guide
${brandVoice}

## Topic / Hook
${topic}

## Task
Write one complete paid video ad script. Single continuous script (not labeled sections).

Requirements:
- Hook: grab attention in first 3 seconds — direct challenge or case study setup
- Body: 2–3 paragraphs with momentum. No choppy sentences. No em dashes. Use ellipses for pauses.
- No math out loud. No adversarial distributor framing. No fear-mongering.
- CTA: soft and low pressure. End with "…so yeah, check it out."
- Length: 150–250 words

Return ONLY the script text. No labels, no section headers, no markdown fences.`,
    }],
  })
  const block = response.content[0]
  return block.type === 'text' ? block.text.trim() : ''
}

async function generateLinkedInDraft(
  target: 'neil-personal' | 'fsiq-company',
  topic: string,
  brandVoice: string,
  companyProfile: string,
): Promise<string> {
  const isNeil = target === 'neil-personal'
  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are writing a LinkedIn post for FoodServiceIQ (FSIQ).

## Company Profile
${companyProfile}

## LinkedIn Brand Voice Guide
${brandVoice}

## Target
${isNeil
  ? "Neil Chand's personal LinkedIn page. First person as Neil. Analytical, operator-to-operator. No emojis. No hashtags. Full sentences, formal grammar. No ellipses — use periods."
  : 'FSIQ company LinkedIn page. Write as "We" / "Our". Structured. No emojis except one 🎉 for celebration posts.'}

## Topic
${topic}

## Task
Write one LinkedIn post. Follow the brand voice guide exactly.
- Opening line: one of the four approved patterns from the voice guide
- Length: 150–350 words
- No em dashes. No fear-mongering. No math out loud. No "It's not X, it's Y".
- No downstream outcome claims.
- End with correct soft CTA.
${isNeil ? '- No emojis. No hashtags. No ellipses — use periods.' : '- Add 4–5 hashtags from the approved core set at the end.'}

Return ONLY the post text. No commentary, no markdown fences.`,
    }],
  })
  const block = response.content[0]
  return block.type === 'text' ? block.text.trim() : ''
}

async function generateBlogArticle(
  topic: string,
  blogVoice: string,
  companyProfile: string,
): Promise<string> {
  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `You are writing an SEO blog article for FoodServiceIQ (foodserviceiq.com/blog).

## Company Profile
${companyProfile}

## Blog Voice Guide (follow every rule exactly)
${blogVoice}

## Topic
${topic}

## Task
Write one complete SEO blog article. Follow the blog voice guide exactly.

Requirements:
- Title: SEO-optimized, descriptive noun phrase (not clever, not witty)
- Intro: 2–4 sentences, no header. Short declarative opener → gap → article premise. No "In today's landscape."
- Body: 4–7 H2 sections. Each section 80–150 words. Descriptive, benefit-oriented headers.
- Close: "The Bottom Line" or strategy-beats-disruption close, then CTA section with soft audit ask + contact info.
- Length: 700–1,100 words total
- No em dashes. No ellipses. Hyphens in compound modifiers only.
- No urgency in CTAs. No adversarial distributor framing. No math out loud.
- End with: "If you want to understand where the biggest opportunities exist in your current procurement environment, reach out to our team for a quick audit conversation."

Return ONLY the article text. No commentary, no markdown fences.`,
    }],
  })
  const block = response.content[0]
  return block.type === 'text' ? block.text.trim() : ''
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const brandVoicePaidAds  = loadSop('fsiq-brand-voice-paid-ads.md')
  const brandVoiceLinkedIn = loadSop('fsiq-brand-voice-linkedin.md')
  const companyProfile     = loadSop('fsiq-company-profile.md')

  const paidAdsTopic  = 'Most independent restaurant operators have never seen a national chain-level distributor contract — and that gap is where the savings live'
  const linkedInTopic = 'Why distributor loyalty over many years often preserves the distributor\'s margin rather than the operator\'s — and what operators can do about it'

  const posted:  string[] = []
  const skipped: string[] = []
  const errors:  string[] = []

  // ── 1. Paid Ads → #MediaBuying ───────────────────────────────────────────────

  console.log('\n' + '█'.repeat(70))
  console.log('CHANNEL 1 — PAID ADS → #MediaBuying')
  console.log('█'.repeat(70))

  try {
    console.log('Generating...')
    const rawScript = await generatePaidAdsScript(paidAdsTopic, brandVoicePaidAds, companyProfile)

    console.log('\nRAW SCRIPT:\n' + rawScript)

    console.log('\nHumanizing...')
    const cleanScript = await humanize(rawScript, 'paid-ads')

    console.log('\nHUMANIZED SCRIPT:\n' + cleanScript)

    const edits  = countChanges(rawScript, cleanScript)
    const issues = qualityCheck(cleanScript, 'paid-ads')

    console.log(`\nHumanizer: ${edits} edit(s) | Quality: ${issues.length === 0 ? 'PASS' : 'FAIL — ' + issues.join(', ')}`)

    const blocks = buildReviewBlocks(
      'Paid Ads Script (Variation A)',
      'fsiq-brand-voice-paid-ads.md',
      edits,
      cleanScript,
      issues,
    )

    await sendBlocks('mediaBuying', blocks as never[], `REVIEW: Paid Ads Script — ${paidAdsTopic.slice(0, 60)}`)
    posted.push('#MediaBuying — Paid Ads Script (Variation A)')
  } catch (err) {
    const msg = (err as Error).message
    console.error('  ERROR:', msg)
    errors.push(`Paid Ads: ${msg}`)
  }

  // ── 2. Neil LinkedIn → #organic-agent ───────────────────────────────────────

  console.log('\n' + '█'.repeat(70))
  console.log('CHANNEL 2 — NEIL PERSONAL → #organic-agent')
  console.log('█'.repeat(70))

  try {
    console.log('Generating...')
    const rawNeil = await generateLinkedInDraft('neil-personal', linkedInTopic, brandVoiceLinkedIn, companyProfile)

    console.log('\nRAW DRAFT:\n' + rawNeil)

    console.log('\nHumanizing...')
    const cleanNeil = await humanize(rawNeil, 'linkedin')

    console.log('\nHUMANIZED DRAFT:\n' + cleanNeil)

    const edits  = countChanges(rawNeil, cleanNeil)
    const issues = qualityCheck(cleanNeil, 'neil-personal')

    console.log(`\nHumanizer: ${edits} edit(s) | Quality: ${issues.length === 0 ? 'PASS' : 'FAIL — ' + issues.join(', ')}`)

    const blocks = buildReviewBlocks(
      'Neil Personal LinkedIn Draft',
      'fsiq-brand-voice-linkedin.md + voice/neil-linkedin-voice.md',
      edits,
      cleanNeil,
      issues,
    )

    await sendBlocks('organic', blocks as never[], `REVIEW: Neil LinkedIn Draft — ${linkedInTopic.slice(0, 60)}`)
    posted.push('#organic-agent — Neil Personal LinkedIn Draft')
  } catch (err) {
    const msg = (err as Error).message
    console.error('  ERROR:', msg)
    errors.push(`Neil LinkedIn: ${msg}`)
  }

  // ── 3. FSIQ Company LinkedIn → #organic-agent ───────────────────────────────

  console.log('\n' + '█'.repeat(70))
  console.log('CHANNEL 3 — FSIQ COMPANY → #organic-agent')
  console.log('█'.repeat(70))

  try {
    console.log('Generating...')
    const rawFsiq = await generateLinkedInDraft('fsiq-company', linkedInTopic, brandVoiceLinkedIn, companyProfile)

    console.log('\nRAW DRAFT:\n' + rawFsiq)

    console.log('\nHumanizing...')
    const cleanFsiq = await humanize(rawFsiq, 'linkedin')

    console.log('\nHUMANIZED DRAFT:\n' + cleanFsiq)

    const edits  = countChanges(rawFsiq, cleanFsiq)
    const issues = qualityCheck(cleanFsiq, 'fsiq-company')

    console.log(`\nHumanizer: ${edits} edit(s) | Quality: ${issues.length === 0 ? 'PASS' : 'FAIL — ' + issues.join(', ')}`)

    const blocks = buildReviewBlocks(
      'FSIQ Company LinkedIn Draft',
      'fsiq-brand-voice-linkedin.md + voice/fsiq-linkedin-voice.md',
      edits,
      cleanFsiq,
      issues,
    )

    await sendBlocks('organic', blocks as never[], `REVIEW: FSIQ LinkedIn Draft — ${linkedInTopic.slice(0, 60)}`)
    posted.push('#organic-agent — FSIQ Company LinkedIn Draft')
  } catch (err) {
    const msg = (err as Error).message
    console.error('  ERROR:', msg)
    errors.push(`FSIQ LinkedIn: ${msg}`)
  }

  // ── 4. Blog Article → #seo-agent ────────────────────────────────────────────

  console.log('\n' + '█'.repeat(70))
  console.log('CHANNEL 4 — BLOG ARTICLE → #seo-agent')
  console.log('█'.repeat(70))

  try {
    const blogVoice = loadSop('voice/fsiq-blog-voice.md')

    const blogTopic = 'How independent restaurants can access national chain-level distributor pricing without switching suppliers or changing their menu'

    console.log('Generating...')
    const rawBlog = await generateBlogArticle(blogTopic, blogVoice, companyProfile)

    console.log('\nRAW ARTICLE:\n' + rawBlog)

    console.log('\nHumanizing...')
    const cleanBlog = await humanize(rawBlog, 'blog')

    console.log('\nHUMANIZED ARTICLE:\n' + cleanBlog)

    const edits  = countChanges(rawBlog, cleanBlog)
    const issues = qualityCheck(cleanBlog, 'blog')

    console.log(`\nHumanizer: ${edits} edit(s) | Quality: ${issues.length === 0 ? 'PASS' : 'FAIL — ' + issues.join(', ')}`)

    const blocks = buildReviewBlocks(
      'SEO Blog Article',
      'voice/fsiq-blog-voice.md',
      edits,
      cleanBlog,
      issues,
    )

    await sendBlocks('seo', blocks as never[], `REVIEW: SEO Blog Article — ${blogTopic.slice(0, 60)}`)
    posted.push('#seo-agent — SEO Blog Article')
  } catch (err) {
    const msg = (err as Error).message
    console.error('  ERROR:', msg)
    errors.push(`Blog Article: ${msg}`)
  }

  // ── Stubs ─────────────────────────────────────────────────────────────────────

  skipped.push('#organic-agent — FSIQ Organic (skills/organic/content-ideation.skill.ts — stub)')

  // ── Terminal summary ──────────────────────────────────────────────────────────

  console.log('\n' + '═'.repeat(70))
  console.log('REVIEW-ALL-OUTPUTS COMPLETE')
  console.log('═'.repeat(70))
  console.log('\nPosted to Slack:')
  for (const p of posted)  console.log(`  ✅ ${p}`)
  if (skipped.length > 0) {
    console.log('\nStubs (skipped):')
    for (const s of skipped) console.log(`  ⏭️  ${s}`)
  }
  if (errors.length > 0) {
    console.log('\nErrors:')
    for (const e of errors) console.log(`  ❌ ${e}`)
  }
  console.log('\nNo Supabase writes. No approval buttons.\n')

  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
