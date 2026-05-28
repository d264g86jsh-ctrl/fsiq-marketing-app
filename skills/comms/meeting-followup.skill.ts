// meeting-followup.skill.ts — processes meeting transcripts and creates follow-up tasks
import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../../lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function run() {
  const sop = fs.readFileSync(path.join(process.cwd(), 'sops', 'comms-agent-sop.md'), 'utf-8')
  throw new Error('meeting-followup skill not yet implemented — stub only')
}
