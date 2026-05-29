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
Follow the 3-step process from the Humanizer SOP exactly:

Step 1: Identify every AI pattern present in the text above.
Step 2: Write a draft rewrite fixing all flagged patterns.
Step 3: Final pass — check for remaining em dashes (hard stop), AI vocabulary,
        "It's not X it's Y" frames, math out loud, fear-mongering.
        Verify it sounds like Neil talking to an independent restaurant operator.

Return ONLY the final rewritten text.
No commentary. No "here's what I changed." No markup. Just the clean text.`

  const result = await askClaude(prompt, 4096)
  return result.trim()
}
