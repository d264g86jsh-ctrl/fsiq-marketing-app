// morning-brief-compiler.skill.ts — compiles cross-agent morning brief for CMO
import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function run() {
  const sop = fs.readFileSync(path.join(process.cwd(), 'sops', 'cmo-orchestrator-sop.md'), 'utf-8')
  throw new Error('morning-brief-compiler skill not yet implemented — stub only')
}
