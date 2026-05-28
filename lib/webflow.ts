// webflow.ts — Webflow Data API v2 client
// Used by SEO agent for blog publishing to getfoodserviceiq.com.
// API token: WEBFLOW_API_TOKEN | Site ID: WEBFLOW_SITE_ID

const BASE = 'https://api.webflow.com/v2'

async function webflow(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.WEBFLOW_API_TOKEN}`,
      'Content-Type': 'application/json',
      'accept-version': '2.0.0',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Webflow API ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function getSiteCollections() {
  return webflow(`/sites/${process.env.WEBFLOW_SITE_ID}/collections`)
}

export async function createCmsItem(collectionId: string, fields: Record<string, unknown>) {
  return webflow(`/collections/${collectionId}/items`, 'POST', { fieldData: fields })
}

export async function publishCmsItem(collectionId: string, itemId: string) {
  return webflow(`/collections/${collectionId}/items/${itemId}/live`, 'PUT')
}
