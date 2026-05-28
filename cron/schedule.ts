// cron/schedule.ts — defines all scheduled skill runs
// Executed by Vercel Cron Jobs configured in vercel.json.
// Each cron job hits /api/agents/run with the appropriate agent + skill payload.

export const CRON_SCHEDULE = [
  // Paid Media Agent
  { cron: '0 6 * * *',  agent: 'paid-media', skill: 'performance-sync',   label: 'Daily 6AM — pull Meta metrics + decisions' },
  { cron: '5 6 * * *',  agent: 'paid-media', skill: 'slack-notify',        label: 'Daily 6:05AM — send Slack decisions' },
  { cron: '0 9 * * 1',  agent: 'paid-media', skill: 'weekly-health-check', label: 'Monday 9AM — weighted CPQL audit' },
  // SEO Agent
  { cron: '0 7 * * *',  agent: 'seo',        skill: 'rank-tracker',        label: 'Daily 7AM — Ahrefs rank pull' },
  { cron: '0 8 * * 1',  agent: 'seo',        skill: 'weekly-report',       label: 'Monday 8AM — SEO weekly report' },
  // Comms Agent
  { cron: '30 6 * * *', agent: 'comms',      skill: 'morning-brief',       label: 'Daily 6:30AM — morning brief to Slack' },
  // CMO Orchestrator
  { cron: '0 7 * * *',  agent: 'cmo',        skill: 'morning-brief-compiler', label: 'Daily 7AM — cross-agent brief' },
] as const
