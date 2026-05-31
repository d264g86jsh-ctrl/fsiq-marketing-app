/**
 * test-sharepoint-endpoints.ts
 *
 * Tests multiple SharePoint endpoints to determine if 503 is:
 * - FSIQ-specific (only FSIQ drive fails)
 * - Tenant-wide (all SharePoint fails)
 * - Account-specific (personal drive also fails)
 */

import { getGraphToken } from './lib/graph'

async function testEndpoint(label: string, url: string): Promise<{label: string; status: number; error: string | null}> {
  try {
    const token = await getGraphToken()
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    })

    let error: string | null = null
    if (!res.ok) {
      try {
        const body = await res.json()
        error = body.error?.code || body.error?.message || 'Unknown error'
      } catch {
        error = `HTTP ${res.status}`
      }
    }

    return { label, status: res.status, error }
  } catch (err) {
    return { label, status: 0, error: (err as Error).message }
  }
}

async function main() {
  console.log('════════════════════════════════════════════════════════════')
  console.log('SHAREPOINT ENDPOINT DIAGNOSTIC')
  console.log('════════════════════════════════════════════════════════════')
  console.log()

  const endpoints = [
    {
      label: '1. FSIQ Drive (the problematic one)',
      url: 'https://graph.microsoft.com/v1.0/drives/b!SoPMe2KqFU2BkUmHhH8qFTOqNnh1p1BPuxbMZNe-MrqxmzKSNvU8TI-0UrHfUjC_'
    },
    {
      label: '2. My Drive (personal)',
      url: 'https://graph.microsoft.com/v1.0/me/drive'
    },
    {
      label: '3. List all my drives',
      url: 'https://graph.microsoft.com/v1.0/me/drives'
    },
    {
      label: '4. Organization info',
      url: 'https://graph.microsoft.com/v1.0/organization'
    },
    {
      label: '5. Me (current user)',
      url: 'https://graph.microsoft.com/v1.0/me'
    },
  ]

  const results: {label: string; status: number; error: string | null}[] = []

  for (const endpoint of endpoints) {
    process.stdout.write(`Testing ${endpoint.label}... `)
    const result = await testEndpoint(endpoint.label, endpoint.url)
    results.push(result)

    if (result.status === 200) {
      console.log(`✓ 200 OK`)
    } else if (result.status === 0) {
      console.log(`✗ EXCEPTION: ${result.error}`)
    } else {
      console.log(`✗ ${result.status} - ${result.error}`)
    }
  }

  console.log()
  console.log('════════════════════════════════════════════════════════════')
  console.log('DIAGNOSIS')
  console.log('════════════════════════════════════════════════════════════')
  console.log()

  const fsiqStatus = results[0].status
  const otherStatuses = results.slice(1).map(r => r.status)
  const allOthersOK = otherStatuses.every(s => s === 200)

  if (fsiqStatus === 503 && allOthersOK) {
    console.log('✗ FSIQ-SPECIFIC ISSUE')
    console.log()
    console.log('The 503 is ONLY affecting the FSIQ drive.')
    console.log('Other SharePoint endpoints work fine.')
    console.log()
    console.log('→ The FSIQ drive/site may be locked, in recovery, or under maintenance')
    console.log('→ Contact your SharePoint admin or Microsoft support')
  } else if (otherStatuses.some(s => s === 503)) {
    console.log('✗ TENANT-WIDE ISSUE')
    console.log()
    console.log('Multiple SharePoint endpoints returning 503.')
    console.log()
    console.log('→ Check https://status.office.com/ for regional issues')
    console.log('→ Wait 15-30 minutes and retry')
  } else {
    console.log('? UNEXPECTED RESULT')
    console.log('Status codes:', results.map(r => `${r.label}: ${r.status}`).join(' | '))
  }

  console.log()
}

main().catch(err => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
