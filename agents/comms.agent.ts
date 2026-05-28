// comms.agent.ts — FSIQ comms Agent
// Orchestrates all skills in skills/comms/
// Loads its SOP at runtime and routes tasks to the appropriate skill.
// TODO: implement full orchestration logic

import fs from 'fs'
import path from 'path'

export const agentName = 'comms'

export async function run(task: string, context?: Record<string, unknown>) {
  // SOP loaded at runtime per AGENTS.md rule
  // const sop = fs.readFileSync(path.join(process.cwd(), 'sops', 'comms-agent-sop.md'), 'utf-8')
  throw new Error('comms agent not yet implemented — stub only')
}
