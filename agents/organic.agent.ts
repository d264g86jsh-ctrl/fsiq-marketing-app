// organic.agent.ts — FSIQ organic Agent
// Orchestrates all skills in skills/organic/
// Loads its SOP at runtime and routes tasks to the appropriate skill.
// TODO: implement full orchestration logic

import fs from 'fs'
import path from 'path'

export const agentName = 'organic'

export async function run(task: string, context?: Record<string, unknown>) {
  // SOP loaded at runtime per AGENTS.md rule
  // const sop = fs.readFileSync(path.join(process.cwd(), 'sops', 'organic-agent-sop.md'), 'utf-8')
  throw new Error('organic agent not yet implemented — stub only')
}
