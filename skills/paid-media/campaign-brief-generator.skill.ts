// campaign-brief-generator.skill.ts — Skill 1.5 — generates campaign briefs from creative pipeline data
// Loads SOP at runtime per AGENTS.md pairing rule.
// TODO: implement full skill logic

import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../../lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function run() {
  const sop = fs.readFileSync(
    path.join(process.cwd(), 'sops', 'campaign-brief-template.md'),
    'utf-8'
  )
  throw new Error('campaign-brief-generator skill not yet implemented — stub only')
}
