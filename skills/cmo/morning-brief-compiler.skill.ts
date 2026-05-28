// morning-brief-compiler.skill.ts — CMO Orchestrator Skill
// Compiles outputs from all agents into a single morning brief for leadership.
// TODO: implement full skill logic
import fs from 'fs'
import path from 'path'

export async function run(): Promise<{ status: string }> {
  const sop = fs.readFileSync(
    path.join(process.cwd(), 'sops', 'cmo-orchestrator-sop.md'),
    'utf-8'
  )
  void sop
  throw new Error('morning-brief-compiler skill not yet implemented — stub only')
}
