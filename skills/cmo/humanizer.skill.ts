// humanizer.skill.ts — Final-pass AI writing pattern remover
// Used by every writing skill before content is saved or posted.
// Loads fsiq-humanizer-sop.md + the context-specific voice SOP at runtime.
// SOP pairing: fsiq-humanizer-sop.md (always) + context voice SOP
//
// Usage:
//   import { humanize } from '../cmo/humanizer.skill'
//   const cleanScript = await humanize(rawScript, 'paid-ads')

import fs from 'fs'
import path from 'path'
import { askClaude } from '../../lib/claude'

function loadSop(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'sops', name), 'utf-8')
}

const VOICE_SOP: Record<string, string> = {
  'paid-ads': 'fsiq-brand-voice-paid-ads.md',
  'organic':  'fsiq-brand-voice-organic.md',
  'linkedin': 'fsiq-brand-voice-linkedin.md',
  'blog':     'fsiq-brand-voice-blog.md',
}

export type HumanizerContext = 'paid-ads' | 'organic' | 'linkedin' | 'blog' | 'general'

export async function humanize(text: string, context: HumanizerContext): Promise<string> {
  const humanizerSop    = loadSop('fsiq-humanizer-sop.md')
  const companyProfile  = loadSop('fsiq-company-profile.md')
  const voiceSopFile    = VOICE_SOP[context]
  const voiceSop        = voiceSopFile ? loadSop(voiceSopFile) : null

  const prompt = `You are an editor removing AI writing patterns from FSIQ content.

## Humanizer SOP (patterns to identify and fix)
${humanizerSop}

## Company Profile (use for specific proof points when rewriting vague claims)
${companyProfile}
${voiceSop ? `\n## Voice Guide for this content type (${context})\n${voiceSop}` : ''}

## Text to humanize
${text}

## Instructions
Internally apply the 3-step process from the Humanizer SOP (identify patterns → draft rewrite →
final pass) but do NOT output your reasoning, steps, notes, or corrections.

Final pass checks (complete before outputting):
  - Em dashes (— or –): if any remain, replace before returning (paid-ads → ellipsis; linkedin/blog → period)
  - Ellipses: if channel is linkedin or blog, every ellipsis must be a period before returning
  - AI vocabulary, "It's not X it's Y" frames, math out loud, fear-mongering: fix all before returning
  - Strong specific lines preserved (same concrete claim count as original)

Your output must be ONLY the final rewritten text.
No commentary. No "here's what I changed." No "Wait, correction." No markup. No dashes or section dividers.
No meta-text of any kind. Just the clean post or script, start to finish, nothing else.`

  const result = await askClaude(prompt, 4096)
  return result.trim()
}
