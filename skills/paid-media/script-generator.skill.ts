// script-generator.skill.ts — Skill 1.4 — generates ad scripts following FSIQ scripting rules
// Loads SOP at runtime per AGENTS.md pairing rule.
// TODO: implement full skill logic

import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../../lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function run() {
  const sop = fs.readFileSync(
    path.join(process.cwd(), 'sops', 'ad-scripting-rules.md'),
    'utf-8'
  )
  throw new Error('script-generator skill not yet implemented — stub only')
}
