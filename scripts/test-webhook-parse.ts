// Run with: npx tsx --env-file=.env.local scripts/test-webhook-parse.ts
// Tests parseSpend + classifyStage logic without hitting Supabase.

function parseSpend(raw: unknown): number | null {
  if (raw == null) return null
  let s = String(raw).trim()
  s = s.replace(/<[^>]+>/g, ' ').trim()
  s = s.replace(/\s+/g, ' ')
  s = s.replace(/[$,]/g, '')
  const rangeMatch = s.match(/^([\d.]+[kmb]?)\s*[-–to]\s*([\d.]+[kmb]?)$/i)
  if (rangeMatch) s = rangeMatch[1]
  const multiplierMatch = s.match(/^([\d.]+)\s*([kmb])$/i)
  if (multiplierMatch) {
    const num = parseFloat(multiplierMatch[1])
    const mult = multiplierMatch[2].toLowerCase()
    if (!isNaN(num)) {
      if (mult === 'k') return Math.round(num * 1_000)
      if (mult === 'm') return Math.round(num * 1_000_000)
      if (mult === 'b') return Math.round(num * 1_000_000_000)
    }
  }
  const parsed = parseFloat(s)
  return isNaN(parsed) ? null : Math.round(parsed)
}

function classifyStage(spend: number | null) {
  if (spend == null) return 'unqualified'
  if (spend >= 2_000_000) return 'cp3ql'
  if (spend >= 1_000_000) return 'cp2ql'
  if (spend >= 600_000)   return 'cpql'
  return 'unqualified'
}

const cases: [unknown, number | null, string][] = [
  ['1200000',          1200000, 'cp2ql'],
  ['$1,200,000',       1200000, 'cp2ql'],
  ['<p>$1,200,000</p>', 1200000, 'cp2ql'],
  ['$1.2M',            1200000, 'cp2ql'],
  ['1.5m',             1500000, 'cp2ql'],
  ['800k',             800000,  'cpql'],
  ['800K',             800000,  'cpql'],
  ['$1M - $2M',        1000000, 'cp2ql'],
  ['1000000 - 2000000', 1000000, 'cp2ql'],
  ['2500000',          2500000, 'cp3ql'],
  ['500000',           500000,  'unqualified'],
  [null,               null,    'unqualified'],
  ['',                 null,    'unqualified'],
  ['unknown',          null,    'unqualified'],
]

let passed = 0
for (const [input, expectedSpend, expectedStage] of cases) {
  const spend = parseSpend(input)
  const stage = classifyStage(spend)
  const ok = spend === expectedSpend && stage === expectedStage
  console.log(`${ok ? '✅' : '❌'} input=${JSON.stringify(input)} → spend=${spend} stage=${stage}`)
  if (ok) passed++
}
console.log(`\n${passed}/${cases.length} tests passed`)
