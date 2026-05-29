// lib/graph.ts — Microsoft Graph API client
//
// Authentication priority:
//   1. client_credentials flow (primary — never expires, auto-renews)
//      Requires: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
//   2. Static token fallback (MICROSOFT_ACCESS_TOKEN) — manual refresh required
//   3. Error if both unavailable
//
// Token cache: client_credentials tokens are cached in memory with a 55-min TTL.

// ── Token cache (client_credentials only) ─────────────────────────────────────

interface TokenCache {
  token: string
  expiresAt: number  // ms since epoch
}

let tokenCache: TokenCache | null = null

async function fetchClientCredentialsToken(): Promise<string> {
  const now = Date.now()

  if (tokenCache && now < tokenCache.expiresAt) {
    return tokenCache.token
  }

  const tenantId     = process.env.AZURE_TENANT_ID
  const clientId     = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId!,
        client_secret: clientSecret!,
        scope:         'https://graph.microsoft.com/.default',
        grant_type:    'client_credentials',
      }),
    },
  )

  if (!res.ok) {
    throw new Error(`client_credentials token request failed: ${res.status} ${await res.text()}`)
  }

  const data = await res.json() as { access_token: string; expires_in: number }

  tokenCache = {
    token:     data.access_token,
    expiresAt: now + 55 * 60 * 1000,  // 55-min TTL (tokens expire at 60 min)
  }

  return tokenCache.token
}

export async function getGraphToken(): Promise<string> {
  const tenantId     = process.env.AZURE_TENANT_ID
  const clientId     = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET

  // 1. Primary: client_credentials flow
  if (tenantId && clientId && clientSecret) {
    try {
      return await fetchClientCredentialsToken()
    } catch (err) {
      console.warn('[graph] client_credentials failed, falling back to static token:', (err as Error).message)
    }
  } else {
    console.warn('[graph] client_credentials not configured, falling back to static token')
  }

  // 2. Fallback: static token from env
  const staticToken = process.env.MICROSOFT_ACCESS_TOKEN
  if (staticToken) {
    return staticToken
  }

  // 3. Nothing available
  throw new Error(
    'No valid Graph API auth configured. ' +
    'Set AZURE_CLIENT_ID + AZURE_CLIENT_SECRET + AZURE_TENANT_ID for permanent auth, ' +
    'or refresh MICROSOFT_ACCESS_TOKEN.',
  )
}

// ── Config ────────────────────────────────────────────────────────────────────

const DRIVE_ID = 'b!SoPMe2KqFU2BkUmHhH8qFTOqNnh1p1BPuxbMZNe-MrqxmzKSNvU8TI-0UrHfUjC_'

export function graphBase(): string {
  return `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}`
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type DriveItem = {
  id:      string
  name:    string
  webUrl:  string
  folder?: { childCount: number }
}

// ── Core fetch helpers ────────────────────────────────────────────────────────

export async function graphGet<T>(path: string): Promise<T> {
  const token = await getGraphToken()
  const res = await fetch(`${graphBase()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Graph GET ${path} → ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

export async function graphPatch(path: string, body: object): Promise<Response> {
  const token = await getGraphToken()
  return fetch(`${graphBase()}${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function graphPost(path: string, body: object): Promise<Response> {
  const token = await getGraphToken()
  return fetch(`${graphBase()}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── Drive operation helpers ───────────────────────────────────────────────────

export async function listChildren(itemId: string): Promise<DriveItem[]> {
  const items: DriveItem[] = []
  let url: string | null =
    `/items/${itemId}/children?$select=id,name,webUrl,folder&$top=200`
  while (url) {
    type Page = { value: DriveItem[]; '@odata.nextLink'?: string }
    const page: Page = await graphGet<Page>(url)
    items.push(...page.value)
    const next: string | undefined = page['@odata.nextLink']
    url = next ? next.replace(graphBase(), '') : null
  }
  return items
}

export async function renameItem(itemId: string, newName: string): Promise<boolean> {
  const res = await graphPatch(`/items/${itemId}`, { name: newName })
  if (!res.ok) {
    console.warn(`  ⚠ rename ${itemId} → "${newName}": ${res.status} ${await res.text()}`)
    return false
  }
  return true
}

export async function moveItem(itemId: string, newParentId: string): Promise<boolean> {
  const res = await graphPatch(`/items/${itemId}`, {
    parentReference: { driveId: DRIVE_ID, id: newParentId },
  })
  if (!res.ok) {
    console.warn(`  ⚠ move ${itemId} → parent ${newParentId}: ${res.status} ${await res.text()}`)
    return false
  }
  return true
}

export async function findChildByName(
  parentId: string,
  name: string,
): Promise<DriveItem | null> {
  const children = await listChildren(parentId)
  return children.find(c => c.name.toLowerCase() === name.toLowerCase()) ?? null
}

export async function createFolderIfMissing(
  parentId: string,
  name: string,
): Promise<DriveItem | null> {
  const existing = await findChildByName(parentId, name)
  if (existing) return existing
  const res = await graphPost(`/items/${parentId}/children`, {
    name,
    folder: {},
    '@microsoft.graph.conflictBehavior': 'fail',
  })
  if (!res.ok) {
    if (res.status === 409) return findChildByName(parentId, name)
    console.warn(`  ⚠ createFolder "${name}": ${res.status} ${await res.text()}`)
    return null
  }
  return res.json() as Promise<DriveItem>
}
