// seo.agent.ts — FSIQ seo Agent
// Orchestrates all skills in skills/seo/
// Loads its SOP at runtime and routes tasks to the appropriate skill.
// TODO: implement full orchestration logic

import fs from 'fs'
import path from 'path'

export const agentName = 'seo'

export async function run(task: string, context?: Record<string, unknown>) {
  // SOP loaded at runtime per AGENTS.md rule
  // const sop = fs.readFileSync(path.join(process.cwd(), 'sops', 'seo-agent-sop.md'), 'utf-8')
  throw new Error('seo agent not yet implemented — stub only')
}
