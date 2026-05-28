// setup-graph-auth.ts — Store a Graph Explorer access token in .env.local.
//
// Usage:
//   1. Go to https://developer.microsoft.com/en-us/graph/graph-explorer
//   2. Sign in as Rodrigo@foodserviceiq.com
//   3. Click the lock icon → "Modify permissions" → consent to:
//        Files.ReadWrite.All   Sites.ReadWrite.All
//   4. Click "Access token" tab → Copy All
//   5. Run:
//        npx tsx --env-file=.env.local scripts/setup-graph-auth.ts --token eyJ0eXAi...
//
// Verifies the token against /me, extracts tenant ID + expiry, writes to .env.local:
//   MICROSOFT_ACCESS_TOKEN
//   MICROSOFT_TENANT_ID
//
// Token lasts ~75 min. Re-run this script when execute-renames.ts reports expiry.

import fs from 'fs'
import path from 'path'

const ENV_PATH = path.join(process.cwd(), '.env.local')

// ── Parse --token from argv ───────────────────────────────────────────────────

function getTokenArg(): string {
  // Support both "--token VALUE" and "--tokenVALUE" (no space) forms
  for (const arg of process.argv) {
    if (arg.startsWith('--token') && arg.length > 7) return arg.slice(7)
  }
  const idx = process.argv.indexOf('--token')
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1]

  console.error('Usage: npx tsx --env-file=.env.local scripts/setup-graph-auth.ts --token eyJ0eXAi...')
  console.error('\nTo get the token:')
  console.error('  1. Open https://developer.microsoft.com/en-us/graph/graph-explorer')
  console.error('  2. Sign in as Rodrigo@foodserviceiq.com')
  console.error('  3. Lock icon → Modify permissions → consent to Files.ReadWrite.All + Sites.ReadWrite.All')
  console.error('  4. "Access token" tab → Copy All')
  console.error('  5. Re-run with --token <paste here>')
  process.exit(1)
}

// ── Decode JWT payload (no verification needed — Graph API verifies for us) ───

function decodeJwt(token: string): Record<string, unknown> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Not a valid JWT (expected 3 parts)')
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'))
}

// ── Write/update env var in .env.local ────────────────────────────────────────

function writeEnvVar(key: string, value: string) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf-8') : ''
  const line = `${key}=${value}`
  if (new RegExp(`^${key}=`, 'm').test(content)) {
    content = content.replace(new RegExp(`^${key}=.*`, 'm'), line)
  } else {
    content = content.trimEnd() + `\n${line}\n`
  }
  fs.writeFileSync(ENV_PATH, content, 'utf-8')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const token = getTokenArg()

  // Decode to extract claims
  let payload: Record<string, unknown>
  try {
    payload = decodeJwt(token)
  } catch {
    console.error('Failed to decode token — make sure you copied the full JWT.')
    process.exit(1)
  }

  const exp      = payload.exp as number | undefined
  const tid      = payload.tid as string | undefined
  const upn      = payload.upn as string | undefined
  const scp      = payload.scp as string | undefined
  const expDate  = exp ? new Date(exp * 1000) : null

  console.log('\n=== Graph Token Verification ===')
  console.log(`  User:    ${upn ?? '(unknown)'}`)
  console.log(`  Tenant:  ${tid ?? '(unknown)'}`)
  console.log(`  Expires: ${expDate?.toISOString() ?? '(unknown)'} (${expDate ? Math.round((expDate.getTime() - Date.now()) / 60000) : '?'} min remaining)`)
  console.log(`  Scopes:  ${scp ?? '(unknown)'}`)

  if (exp && Date.now() > exp * 1000) {
    console.error('\n❌ Token is already expired. Get a fresh one from Graph Explorer.')
    process.exit(1)
  }

  // Check for required scopes
  const scopes = (scp ?? '').split(' ')
  const hasFiles = scopes.some(s => s.includes('Files.ReadWrite') || s.includes('Sites.ReadWrite'))
  if (!hasFiles) {
    console.warn('\n⚠  Warning: token may not have Files.ReadWrite.All or Sites.ReadWrite.All.')
    console.warn('   SharePoint write operations will fail. Add those scopes in Graph Explorer first.')
  }

  // Verify against Graph API
  console.log('\nVerifying against Graph API...')
  const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!meRes.ok) {
    const body = await meRes.text()
    console.error(`\n❌ Graph API rejected the token: ${meRes.status} ${body}`)
    process.exit(1)
  }

  const me = await meRes.json() as { displayName?: string; mail?: string }
  console.log(`✅ Verified — signed in as: ${me.displayName ?? ''} <${me.mail ?? upn ?? ''}>`)

  // Test a SharePoint drive read
  const DRIVE_ID = 'b!SoPMe2KqFU2BkUmHhH8qFTOqNnh1p1BPuxbMZNe-MrqxmzKSNvU8TI-0UrHfUjC_'
  const VIDEO_ID = '015MT6T5FZ6MOQJBXMABF3DUNIQW6BQ5ON'
  console.log('\nTesting SharePoint drive read...')
  const driveRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${VIDEO_ID}?$select=id,name`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!driveRes.ok) {
    console.warn(`⚠  Drive read returned ${driveRes.status} — SharePoint access may be limited.`)
  } else {
    const item = await driveRes.json() as { name?: string }
    console.log(`✅ Drive read OK — folder: "${item.name}"`)
  }

  // Write to .env.local
  if (tid) writeEnvVar('MICROSOFT_TENANT_ID', tid)
  writeEnvVar('MICROSOFT_ACCESS_TOKEN', token)

  console.log('\nWrote to .env.local:')
  if (tid) console.log('  MICROSOFT_TENANT_ID    ✅')
  console.log('  MICROSOFT_ACCESS_TOKEN ✅')
  console.log(`\nToken valid for ~${expDate ? Math.round((expDate.getTime() - Date.now()) / 60000) : '?'} more minutes.`)
  console.log('When it expires, re-run this script with a fresh token from Graph Explorer.')
  console.log('\nRun now:')
  console.log('  npx tsx --env-file=.env.local scripts/execute-renames.ts')
}

main().catch(err => {
  console.error('\nSetup failed:', err.message)
  process.exit(1)
})
