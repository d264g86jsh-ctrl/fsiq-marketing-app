// test-linkedin-writer.ts — dry run of linkedin-writer logic
// NO Supabase writes. NO Slack posts. Terminal output only.
// Shows raw draft, humanized draft, and diff for both targets.

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import path from 'path'
import { humanize } from '../skills/cmo/humanizer.skill'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

function loadSop(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'sops', name), 'utf-8')
}

function divider(char = '═', width = 70) { return char.repeat(width) }

function toUnits(text: string): string[] {
  return text.split(/(?<=[\.\?\!…])\s+|\n+/).map(s => s.trim()).filter(Boolean)
}

function printDiff(raw: string, clean: string): void {
  const rawSet   = new Set(toUnits(raw))
  const cleanSet = new Set(toUnits(clean))
  const removed  = toUnits(raw).filter(u => !cleanSet.has(u))
  const added    = toUnits(clean).filter(u => !rawSet.has(u))
  const changes: Array<{ before: string; after: string }> = []
  const maxLen = Math.max(removed.length, added.length)
  for (let i = 0; i < maxLen; i++) {
    changes.push({ before: removed[i] ?? '(removed)', after: added[i] ?? '(line removed)' })
  }
  if (changes.length === 0) { console.log('  No changes — draft was already clean.\n'); return }
  console.log(`  ${changes.length} change(s):\n`)
  for (let i = 0; i < changes.length; i++) {
    console.log(`  ── Change ${i + 1} ${'─'.repeat(50)}`)
    console.log(`  BEFORE: ${changes[i].before}`)
    console.log(`  AFTER:  ${changes[i].after}\n`)
  }
}

async function generateDraft(
  target: 'neil-personal' | 'fsiq-company',
  topic: string,
  brandVoice: string,
  companyProfile: string,
): Promise<string> {
  const isNeil = target === 'neil-personal'

  const prompt = `You are writing a LinkedIn post for FoodServiceIQ (FSIQ).

## Company Profile (use for facts, proof points, case study data)
${companyProfile}

## LinkedIn Brand Voice Guide (follow every rule exactly)
${brandVoice}

## Target
${isNeil
    ? "Neil Chand's personal LinkedIn page. Write in first person as Neil. Analytical, operator-to-operator. No emojis. No hashtags. Full sentences, formal grammar — no ellipses."
    : 'FSIQ company LinkedIn page. Write as the brand ("We" / "Our"). Structured. No emojis except one 🎉 or 👏 for celebration posts only.'}

## Topic
${topic}

## Task
Write one LinkedIn post for the topic above. Follow the brand voice guide exactly.

Requirements:
- Opening line must use one of the four approved opening patterns from the voice guide
- Length: 150–350 words
- No em dashes — restructure the sentence instead
- No fear-mongering, no adversarial distributor framing
- No math out loud
- No "It's not X, it's Y" constructions
- No downstream outcome claims (new locations, bonuses, etc.)
- End with the correct soft CTA for the target
${isNeil ? '- No emojis. No hashtags.' : '- Add 4–5 hashtags from the approved core set at the end.'}

Return ONLY the post text. No commentary, no markdown fences. Just the post.`

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = response.content[0]
  return block.type === 'text' ? block.text.trim() : ''
}

async function main() {
  const brandVoice     = loadSop('fsiq-brand-voice-linkedin.md')
  const companyProfile = loadSop('fsiq-company-profile.md')

  // Load the voice SOPs for display
  const neilVoiceFile = 'voice/neil-linkedin-voice.md'
  const fsiqVoiceFile = 'voice/fsiq-linkedin-voice.md'

  const topic = 'Why distributor loyalty over many years often preserves the distributor\'s margin rather than the operator\'s — and what operators can do about it'

  const targets: Array<'neil-personal' | 'fsiq-company'> = ['neil-personal', 'fsiq-company']

  for (const target of targets) {
    const label = target === 'neil-personal' ? '👤 NEIL PERSONAL' : '🏢 FSIQ COMPANY'
    const voiceFile = target === 'neil-personal' ? neilVoiceFile : fsiqVoiceFile

    console.log('\n' + divider('█'))
    console.log(`TEST — ${label}`)
    console.log(divider('█'))
    console.log(`\nVoice SOP loaded: sops/fsiq-brand-voice-linkedin.md`)
    console.log(`Detailed guide:   sops/${voiceFile}`)
    console.log(`Topic: "${topic}"`)

    console.log('\n' + divider('-'))
    console.log('Calling Claude for draft...')
    console.log(divider('-'))

    const raw = await generateDraft(target, topic, brandVoice, companyProfile)

    console.log('\n' + divider('─'))
    console.log(`BEFORE HUMANIZATION — ${label}`)
    console.log(divider('─'))
    console.log(raw)

    console.log('\nHumanizing...')
    const clean = await humanize(raw, 'linkedin')

    console.log('\n' + divider('─'))
    console.log(`AFTER HUMANIZATION — ${label}`)
    console.log(divider('─'))
    console.log(clean)

    console.log('\n' + divider('─'))
    console.log(`DIFF — ${label}`)
    console.log(divider('─'))
    printDiff(raw, clean)

    // Quick format check
    const hasEmDash   = clean.includes('—') || clean.includes('–')
    const hasEllipsis = clean.includes('…')
    const wordCount   = clean.split(/\s+/).length
    const hasEmoji    = /\p{Emoji}/u.test(clean.replace(/#\w+/g, ''))
    const hashtagCount = (clean.match(/#\w+/g) ?? []).length

    console.log(divider('─'))
    console.log(`FORMAT CHECK — ${label}`)
    console.log(divider('─'))
    console.log(`  Word count:    ${wordCount} (target: 150–350)`)
    console.log(`  Em dashes:     ${hasEmDash ? '⚠️  FOUND — rule violation' : '✅ None'}`)
    console.log(`  Ellipses:      ${hasEllipsis ? (target === 'neil-personal' ? '⚠️  FOUND — LinkedIn voice uses periods not ellipses' : '⚠️  FOUND') : '✅ None'}`)
    console.log(`  Emojis:        ${hasEmoji ? (target === 'fsiq-company' ? '⚠️  Check — only allowed for celebration posts' : '❌ FOUND — rule violation for neil-personal') : '✅ None'}`)
    console.log(`  Hashtags:      ${hashtagCount} ${target === 'neil-personal' ? (hashtagCount > 0 ? '❌ FOUND — Neil personal has no hashtags' : '✅') : (hashtagCount >= 4 ? '✅' : '⚠️  Expected 4–5')}`)
  }

  console.log('\n' + divider())
  console.log('DRY RUN COMPLETE — nothing written to Supabase or Slack')
  console.log(divider() + '\n')

  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
