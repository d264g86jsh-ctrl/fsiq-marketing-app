// Run with: npx tsx --env-file=.env.local scripts/register-ghl-webhook.ts
// Registers the GHL → Supabase webhook via GHL API.
// Requires GHL_API_KEY to have webhooks/write scope.
// If this fails (token lacks scope), register manually in GHL dashboard:
//   Settings → Integrations → Webhooks → Add New Webhook
//   URL: https://fsiq-marketing-os.vercel.app/api/webhooks/ghl
//   Events: Contact Created, Contact Updated

import * as fs from 'fs'
import * as path from 'path'

const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const trimmed = line.trim()
  if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
    const [k, ...rest] = trimmed.split('=')
    process.env[k.trim()] ??= rest.join('=').trim()
  }
}

const GHL_API_KEY = process.env.GHL_API_KEY!
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!
const WEBHOOK_URL = 'https://fsiq-marketing-os.vercel.app/api/webhooks/ghl'

async function main() {
  console.log('Registering GHL webhook...')
  console.log(`  Location:  ${GHL_LOCATION_ID}`)
  console.log(`  URL:       ${WEBHOOK_URL}`)

  // GHL v2 webhook registration
  const res = await fetch('https://services.leadconnectorhq.com/webhooks/', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GHL_API_KEY}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      altType: 'location',
      altId: GHL_LOCATION_ID,
      name: 'FSIQ Marketing OS — Lead Sync',
      url: WEBHOOK_URL,
      events: ['ContactCreate', 'ContactUpdate'],
    }),
  })

  const body = await res.text()

  if (res.ok) {
    const data = JSON.parse(body)
    console.log('\n✅ Webhook registered successfully!')
    console.log(`   ID:     ${data.webhook?.id ?? data.id ?? 'unknown'}`)
    console.log(`   Events: ContactCreate, ContactUpdate`)
  } else if (res.status === 401) {
    console.error('\n⚠️  Token lacks webhooks/write scope.')
    console.error('   Register manually in GHL dashboard:')
    console.error('   Settings → Integrations → Webhooks → Add Webhook')
    console.error(`   URL: ${WEBHOOK_URL}`)
    console.error('   Events: Contact Created, Contact Updated')
  } else {
    console.error(`\n❌ Failed (${res.status}):`, body)
  }
}

main().catch(e => {
  console.error('Error:', e.message)
  process.exit(1)
})
