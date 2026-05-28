// paid-media.agent.ts — FSIQ paid-media Agent
// Orchestrates all skills in skills/paid-media/
// Loads its SOP at runtime and routes tasks to the appropriate skill.
// TODO: implement full orchestration logic

import fs from 'fs'
import path from 'path'

export const agentName = 'paid-media'

export async function run(task: string, context?: Record<string, unknown>) {
  // SOP loaded at runtime per AGENTS.md rule
  // const sop = fs.readFileSync(path.join(process.cwd(), 'sops', 'paid-media-agent-sop.md'), 'utf-8')
  throw new Error('paid-media agent not yet implemented — stub only')
}
