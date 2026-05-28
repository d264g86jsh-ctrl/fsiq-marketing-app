// zapier-monitor.skill.ts — monitors Zapier workflow health and alerts on failures
import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../../lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function run() {
  const sop = fs.readFileSync(path.join(process.cwd(), 'sops', 'comms-agent-sop.md'), 'utf-8')
  throw new Error('zapier-monitor skill not yet implemented — stub only')
}
