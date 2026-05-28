// app-health-monitor.skill.ts — Skill 1.9 — monitors Vercel app health and uptime
// Loads SOP at runtime per AGENTS.md pairing rule.
// TODO: implement full skill logic

import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../../lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function run() {
  const sop = fs.readFileSync(
    path.join(process.cwd(), 'sops', 'paid-media-agent-sop.md'),
    'utf-8'
  )
  throw new Error('app-health-monitor skill not yet implemented — stub only')
}
