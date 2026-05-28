// canva-designer.skill.ts — creates social graphics via Canva API
import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../../lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function run() {
  const sop = fs.readFileSync(path.join(process.cwd(), 'sops', 'organic-content-agent-sop.md'), 'utf-8')
  throw new Error('canva-designer skill not yet implemented — stub only')
}
