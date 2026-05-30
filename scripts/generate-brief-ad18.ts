/**
 * generate-brief-ad18.ts
 *
 * Template-based campaign brief generator.
 * Clones the approved .docx template, replaces only <w:t> text nodes
 * at known paraIds, repacks — guarantees pixel-perfect formatting.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/generate-brief-ad18.ts
 */

import fs from 'fs'
import path from 'path'
import JSZip from 'jszip'

// ── Template path ─────────────────────────────────────────────────────────────

const TEMPLATE_PATH = path.join(process.env.HOME!, 'Downloads', 'FSIQ-VIDEO-AD-18_Creative_Brief.docx')
const OUT_PATH      = path.join(process.cwd(), 'tmp', 'FSIQ-VIDEO-AD-18-Brief-v2.docx')

// ── Known paraIds from template XML ──────────────────────────────────────────
//
// Every paragraph in the template carries a unique w14:paraId.
// Targeting by paraId is safer than positional index — it survives
// Word's round-trip XML rewriting.
//
// 00000004 → Ad ID value cell
// 00000006 → # of Hooks value cell
// 0000000C → Hook text paragraph
// 0000000E → Body text paragraph
// 00000010 → CTA text paragraph

const PARA_AD_ID     = '00000004'
const PARA_HOOKS_VAL = '00000006'
const PARA_HOOK_TEXT = '0000000C'
const PARA_BODY_TEXT = '0000000E'
const PARA_CTA_TEXT  = '00000010'

// ── Brief content for this run ────────────────────────────────────────────────

const VALUES = {
  adId:     'FSIQ-VIDEO-AD-18',
  numHooks: '1',
  hookText: 'If your restaurant does more than $3,000,000 per year in revenue, keep watching for the next 30 seconds. I actually have a pretty special holiday gift for you.',
  bodyText: "Over the last 15 years, we've helped over 2,000 other independent restaurants save 5 to 7% on their annual food costs. Earlier this year, our team spent countless hours taking our entire proprietary base of knowledge on exactly how to reduce food costs and transformed it into a single, actionable playbook just for you. This playbook represents the combined lifetime knowledge of our team — including helping thousands of restaurants, managing billions in food spend, and close to two decades of experience.",
  ctaText:  'As a special holiday gift to you, you can download this playbook completely for free at the link below — and see exactly how 2,000 other independent restaurants have saved 5 to 7% on their annual food costs with no changes to their ingredients or distributors.',
}

// ── XML helpers ───────────────────────────────────────────────────────────────

/**
 * Replace the text content of all <w:t> runs inside the paragraph
 * identified by the given paraId.
 *
 * Strategy:
 *   1. Locate the <w:p> element by its w14:paraId attribute.
 *   2. Remove any existing <w:t>…</w:t> runs (keeping run properties <w:rPr>).
 *   3. Set the first <w:r>'s <w:t> to the new text.
 *
 * This approach preserves every byte of run formatting (<w:rPr>) and
 * only changes the <w:t> text nodes.
 */
function replaceParaText(xml: string, paraId: string, newText: string): string {
  // Escape special XML characters in the new text
  const escaped = newText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  // Match the full <w:p> element with this paraId (non-greedy, handles nested elements)
  const paraRegex = new RegExp(
    `(<w:p\\b[^>]*w14:paraId="${paraId}"[^>]*>)([\\s\\S]*?)(</w:p>)`,
    'g',
  )

  return xml.replace(paraRegex, (_match, open, inner, close) => {
    // Replace text in all <w:t> tags within this paragraph
    // If multiple runs exist, clear all but the first, then set its <w:t>
    let runCount = 0
    const newInner = inner.replace(
      /(<w:r\b[^>]*>)([\s\S]*?)(\/w:r>)/g,
      (_rMatch: string, rOpen: string, rInner: string, rClose: string) => {
        runCount++
        if (runCount === 1) {
          // Set the text in the first run, preserve rPr
          const newRInner = rInner.replace(
            /<w:t[^>]*>[\s\S]*?<\/w:t>/g,
            `<w:t xml:space="preserve">${escaped}</w:t>`,
          )
          // If there was no <w:t> at all in this run, add one
          const hasT = /<w:t/.test(newRInner)
          const finalRInner = hasT ? newRInner : newRInner + `<w:t xml:space="preserve">${escaped}</w:t>`
          return `${rOpen}${finalRInner}${rClose}`
        }
        // Zero out additional runs — keep rPr, empty text
        const newRInner = rInner.replace(
          /<w:t[^>]*>[\s\S]*?<\/w:t>/g,
          '<w:t></w:t>',
        )
        return `${rOpen}${newRInner}${rClose}`
      },
    )
    return `${open}${newInner}${close}`
  })
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(60))
  console.log('CAMPAIGN BRIEF GENERATOR — template approach')
  console.log('═'.repeat(60))
  console.log(`Template: ${TEMPLATE_PATH}`)
  console.log(`Output:   ${OUT_PATH}`)

  // 1. Load template
  const templateBuffer = fs.readFileSync(TEMPLATE_PATH)
  const zip = await JSZip.loadAsync(templateBuffer)

  // 2. Read document.xml
  const docXmlFile = zip.file('word/document.xml')
  if (!docXmlFile) throw new Error('word/document.xml not found in template')
  let xml = await docXmlFile.async('string')

  console.log(`\nTemplate XML: ${xml.length.toLocaleString()} bytes`)
  console.log('\nApplying replacements:')

  // 3. Replace text nodes at known paraIds
  const replacements: [string, string, string][] = [
    [PARA_AD_ID,     'Ad ID value',     VALUES.adId],
    [PARA_HOOKS_VAL, '# of Hooks value', VALUES.numHooks],
    [PARA_HOOK_TEXT, 'Hook text',        VALUES.hookText],
    [PARA_BODY_TEXT, 'Body text',        VALUES.bodyText],
    [PARA_CTA_TEXT,  'CTA text',         VALUES.ctaText],
  ]

  for (const [paraId, label, value] of replacements) {
    const before = xml
    xml = replaceParaText(xml, paraId, value)
    const changed = xml !== before
    const preview = value.slice(0, 60) + (value.length > 60 ? '…' : '')
    console.log(`  ${changed ? '✓' : '✗'} [${paraId}] ${label}: "${preview}"`)
  }

  // 4. Write updated XML back into zip
  zip.file('word/document.xml', xml)

  // 5. Repack and write
  const outDir = path.dirname(OUT_PATH)
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  const outBuffer = await zip.generateAsync({
    type:               'nodebuffer',
    compression:        'DEFLATE',
    compressionOptions: { level: 9 },
  })

  fs.writeFileSync(OUT_PATH, outBuffer)

  console.log(`\n✅ Written: ${OUT_PATH}`)
  console.log(`   Size: ${(outBuffer.length / 1024).toFixed(1)} KB`)
  console.log(`   (template was ${(templateBuffer.length / 1024).toFixed(1)} KB)`)
  console.log('═'.repeat(60) + '\n')
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
