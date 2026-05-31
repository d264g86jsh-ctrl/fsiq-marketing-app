/**
 * test-brief-parser-fixture.ts
 *
 * Tests the campaign-brief-generator parser against a known fixture file
 * and asserts expected structure (hook/body/CTA counts and key snippets).
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/test-brief-parser-fixture.ts test-fixtures/briefs/FSIQ-VIDEO-AD-30.txt
 */

import fs from 'fs'
import path from 'path'
import { parseScript } from '../skills/paid-media/campaign-brief-generator.skill'

// ── CLI args ──────────────────────────────────────────────────────────────────

const fixturePath = process.argv[2]
if (!fixturePath) {
  console.error('Usage: npx tsx scripts/test-brief-parser-fixture.ts <fixture-file>')
  process.exit(1)
}

const resolvedPath = path.isAbsolute(fixturePath)
  ? fixturePath
  : path.join(process.cwd(), fixturePath)

if (!fs.existsSync(resolvedPath)) {
  console.error(`Fixture file not found: ${resolvedPath}`)
  process.exit(1)
}

// ── Per-fixture expectations ──────────────────────────────────────────────────

interface FixtureExpectation {
  hooks:              number
  bodies:             number
  ctas:               number
  snippets: Array<{
    field:   'hook' | 'body' | 'cta'
    index:   number  // 0-based
    excerpt: string  // must be contained in the parsed text
    label?:  string  // optional: must be contained in the parsed label
  }>
}

function getExpectation(fileName: string): FixtureExpectation | null {
  if (fileName.includes('AD-30')) {
    return {
      hooks:  13,
      bodies:  1,
      ctas:    2,
      snippets: [
        // Hook 1
        { field: 'hook', index: 0,  excerpt: '1.2 new restaurants', label: 'Hook 1' },
        // Hook 11 (index 12 — last hook)
        { field: 'hook', index: 12, excerpt: 'NOT a restaurant owner', label: 'Hook 11' },
        // Shared body
        { field: 'body', index: 0,  excerpt: '200-page playbook' },
        // CTA 1 — Book a Call / Playbook
        { field: 'cta', index: 0,   excerpt: 'food cost reduction playbook', label: '1' },
        // CTA 2 — Case Study
        { field: 'cta', index: 1,   excerpt: '$264,000 per year', label: '2' },
      ],
    }
  }
  return null
}

// ── Assertions ────────────────────────────────────────────────────────────────

interface Failure {
  assertion: string
  expected:  string
  got:       string
}

function main() {
  const rawText    = fs.readFileSync(resolvedPath, 'utf-8')
  const fileName   = path.basename(resolvedPath)
  const script     = parseScript(rawText)
  const expectation = getExpectation(fileName)

  console.log()
  console.log('='.repeat(62))
  console.log(`BRIEF PARSER FIXTURE TEST — ${fileName}`)
  console.log('='.repeat(62))
  console.log()
  console.log(`Parsed:  ${script.hooks.length} hook(s), ${script.bodies.length} body/bodies, ${script.ctas.length} CTA(s)`)
  console.log()

  // Print all parsed sections for inspection
  for (const [i, h] of script.hooks.entries()) {
    console.log(`  HOOK ${i + 1}: [${h.label}] ${h.text.slice(0, 80)}${h.text.length > 80 ? '…' : ''}`)
  }
  console.log()
  for (const [i, b] of script.bodies.entries()) {
    console.log(`  BODY ${i + 1}: [${b.label}] ${b.text.slice(0, 80)}${b.text.length > 80 ? '…' : ''}`)
  }
  console.log()
  for (const [i, c] of script.ctas.entries()) {
    console.log(`  CTA  ${i + 1}: [${c.label}] ${c.text.slice(0, 80)}${c.text.length > 80 ? '…' : ''}`)
  }
  console.log()

  if (!expectation) {
    console.log('No expectation defined for this fixture — printing parsed output only.')
    console.log('Define getExpectation() for this fixture to enable assertions.')
    console.log()
    return
  }

  // Run assertions
  const failures: Failure[] = []

  // Count assertions
  if (script.hooks.length !== expectation.hooks) {
    failures.push({
      assertion: 'hooks count',
      expected:  String(expectation.hooks),
      got:       String(script.hooks.length),
    })
  }
  if (script.bodies.length !== expectation.bodies) {
    failures.push({
      assertion: 'bodies count',
      expected:  String(expectation.bodies),
      got:       String(script.bodies.length),
    })
  }
  if (script.ctas.length !== expectation.ctas) {
    failures.push({
      assertion: 'ctas count',
      expected:  String(expectation.ctas),
      got:       String(script.ctas.length),
    })
  }

  // Snippet assertions
  for (const snip of expectation.snippets) {
    const arr = snip.field === 'hook' ? script.hooks
      : snip.field === 'body' ? script.bodies
      : script.ctas

    const section = arr[snip.index]
    if (!section) {
      failures.push({
        assertion: `${snip.field}[${snip.index}] exists`,
        expected:  'section present',
        got:       'missing',
      })
      continue
    }

    if (!section.text.includes(snip.excerpt)) {
      failures.push({
        assertion: `${snip.field}[${snip.index}] contains excerpt`,
        expected:  `"…${snip.excerpt}…"`,
        got:       `text="${section.text.slice(0, 80)}…"`,
      })
    }

    if (snip.label && !section.label.includes(snip.label)) {
      failures.push({
        assertion: `${snip.field}[${snip.index}] label contains "${snip.label}"`,
        expected:  `label containing "${snip.label}"`,
        got:       `label="${section.label}"`,
      })
    }
  }

  // Report
  console.log('='.repeat(62))
  if (failures.length === 0) {
    console.log(`PASS — all ${expectation.snippets.length + 3} assertions passed`)
    console.log(`  hooks:  ${script.hooks.length} / ${expectation.hooks} ✓`)
    console.log(`  bodies: ${script.bodies.length} / ${expectation.bodies} ✓`)
    console.log(`  ctas:   ${script.ctas.length} / ${expectation.ctas} ✓`)
  } else {
    console.log(`FAIL — ${failures.length} assertion(s) failed:`)
    for (const f of failures) {
      console.log(`  ✗ ${f.assertion}`)
      console.log(`      expected: ${f.expected}`)
      console.log(`      got:      ${f.got}`)
    }
  }
  console.log('='.repeat(62))
  console.log()

  if (failures.length > 0) process.exit(1)
}

main()
