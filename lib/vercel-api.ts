// vercel-api.ts — Vercel REST API client
// Used for app health monitoring and deployment status.
// Token: VERCEL_TOKEN | App URL: VERCEL_FOOD_COST_APP_URL

const BASE = 'https://api.vercel.com'

async function vercelApi(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
  })
  if (!res.ok) throw new Error(`Vercel API ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function getDeployments(projectName: string, limit = 5) {
  return vercelApi(`/v6/deployments?app=${projectName}&limit=${limit}`)
}

export async function getLatestDeploymentStatus(projectName: string) {
  const { deployments } = await getDeployments(projectName, 1)
  return deployments?.[0] ?? null
}
