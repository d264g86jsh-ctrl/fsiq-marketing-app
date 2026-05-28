// ahrefs.ts — Ahrefs API v3 client
// Used by SEO agent skills for rank tracking, backlinks, keyword explorer.
// API key: AHREFS_API_KEY

const BASE = 'https://api.ahrefs.com/v3'

async function ahrefs(endpoint: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE}${endpoint}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${process.env.AHREFS_API_KEY}` },
  })
  if (!res.ok) throw new Error(`Ahrefs API ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function getOrganicKeywords(target: string, limit = 50) {
  return ahrefs('/site-explorer/organic-keywords', { target, limit: String(limit), mode: 'domain' })
}

export async function getDomainRating(target: string) {
  return ahrefs('/site-explorer/domain-rating', { target })
}

export async function getBacklinks(target: string, limit = 100) {
  return ahrefs('/site-explorer/all-backlinks', { target, limit: String(limit), mode: 'domain' })
}
