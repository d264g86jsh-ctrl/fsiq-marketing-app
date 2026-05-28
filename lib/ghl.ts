// ghl.ts — GoHighLevel API v2 client
// Used to read/update contacts, pipelines, and custom fields.
// API key: GHL_API_KEY | Location ID: GHL_LOCATION_ID

const BASE = 'https://services.leadconnectorhq.com'

async function ghl(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GHL_API_KEY}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`GHL API ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function getContact(contactId: string) {
  return ghl(`/contacts/${contactId}`)
}

export async function searchContacts(query: string) {
  return ghl(`/contacts/?locationId=${process.env.GHL_LOCATION_ID}&query=${encodeURIComponent(query)}`)
}

export async function updateContact(contactId: string, fields: Record<string, unknown>) {
  return ghl(`/contacts/${contactId}`, 'PUT', fields)
}

export async function getPipelines() {
  return ghl(`/opportunities/pipelines?locationId=${process.env.GHL_LOCATION_ID}`)
}
