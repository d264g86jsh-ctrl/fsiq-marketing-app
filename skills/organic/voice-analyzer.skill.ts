// voice-analyzer.skill.ts — analyzes content for brand voice compliance
import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../../lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function run() {
  const sop = fs.readFileSync(path.join(process.cwd(), 'sops', 'fsiq-brand-voice-guide.md'), 'utf-8')
  throw new Error('voice-analyzer skill not yet implemented — stub only')
}
