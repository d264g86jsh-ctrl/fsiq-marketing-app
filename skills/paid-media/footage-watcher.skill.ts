// footage-watcher.skill.ts — Skill 1.6 — watches for new footage uploads and triggers QA review
// Loads SOP at runtime per AGENTS.md pairing rule.
// TODO: implement full skill logic

import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../../lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function run() {
  const sop = fs.readFileSync(
    path.join(process.cwd(), 'sops', 'video-review-qa-framework.md'),
    'utf-8'
  )
  throw new Error('footage-watcher skill not yet implemented — stub only')
}
