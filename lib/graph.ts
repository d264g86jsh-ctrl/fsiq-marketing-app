// lib/graph.ts — Microsoft Graph API client
//
// Authentication: uses MICROSOFT_ACCESS_TOKEN from .env.local.
// Token is a short-lived (~75 min) JWT obtained from Graph Explorer.
//
// To set up / refresh:
//   npx tsx --env-file=.env.local scripts/setup-graph-auth.ts --token eyJ0eXAi...
//
// When the token expires this module throws a clear error with instructions.
// A permanent refresh-token flow can be wired in later once a redirect URI
// is registered on the connected app.

// ── Token retrieval ───────────────────────────────────────────────────────────

function decodeJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'))
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

export function getGraphToken(): string {
  const token = process.env.MICROSOFT_ACCESS_TOKEN

  if (!token) {
    throw new Error(
      'MICROSOFT_ACCESS_TOKEN is not set.\n' +
      'Run: npx tsx --env-file=.env.local scripts/setup-graph-auth.ts --token <paste token>',
    )
  }

  const exp = decodeJwtExp(token)
  if (exp && Date.now() > exp * 1000) {
    throw new Error(
      'MICROSOFT_ACCESS_TOKEN has expired.\n' +
      'Get a fresh token from Graph Explorer and re-run:\n' +
      'npx tsx --env-file=.env.local scripts/setup-graph-auth.ts --token <paste token>',
    )
  }

  // Warn when less than 10 minutes remain
  if (exp) {
    const remaining = Math.round((exp * 1000 - Date.now()) / 60000)
    if (remaining < 10) {
      console.warn(`⚠  Graph token expires in ${remaining} min — refresh soon.`)
    }
  }

  return token
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
  const token = getGraphToken()
  const res = await fetch(`${graphBase()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Graph GET ${path} → ${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

export async function graphPatch(path: string, body: object): Promise<Response> {
  const token = getGraphToken()
  return fetch(`${graphBase()}${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function graphPost(path: string, body: object): Promise<Response> {
  const token = getGraphToken()
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
