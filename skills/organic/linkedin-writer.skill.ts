// linkedin-writer.skill.ts — writes LinkedIn posts in Neil's voice
import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../../lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function run() {
  const sop = fs.readFileSync(path.join(process.cwd(), 'sops', 'neil-voice-guide.md'), 'utf-8')
  throw new Error('linkedin-writer skill not yet implemented — stub only')
}
