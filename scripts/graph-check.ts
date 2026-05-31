import { getGraphToken } from '../lib/graph'

const DRIVE_ID = 'b!SoPMe2KqFU2BkUmHhH8qFTOqNnh1p1BPuxbMZNe-MrqxmzKSNvU8TI-0UrHfUjC_'

async function main() {
  console.log('════════════════════════════════════════════════')
  console.log('GRAPH API DIAGNOSTIC')
  console.log('════════════════════════════════════════════════')
  console.log()

  try {
    const token = await getGraphToken()
    console.log('✓ Token acquired')

    const parts = token.split('.')
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
      console.log(`  Expires: ${new Date(payload.exp * 1000).toISOString()}`)
      console.log(`  Scopes: ${payload.scp || 'none'}`)
    }
    console.log()

    console.log('Test 1: Drive root')
    const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    console.log(`  Status: ${res.status}`)
    if (!res.ok) {
      const body = await res.json()
      console.log(`  Error: ${body.error?.code}`)
      console.log(`  ${body.error?.message || body.error?.innerError?.message}`)
    } else {
      const data = await res.json()
      console.log(`  ✓ Drive: ${data.name}`)
    }

  } catch (err) {
    console.error('FAILED:', (err as Error).message)
  }

  console.log()
}

main()
