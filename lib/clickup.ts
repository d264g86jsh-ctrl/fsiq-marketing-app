const BASE = 'https://api.clickup.com/api/v2'
const TOKEN = process.env.CLICKUP_API_TOKEN!
const DEFAULT_LIST_ID = process.env.CLICKUP_LIST_ID! // Rodrigo > To-Do List

type Priority = 1 | 2 | 3 | 4 // 1=urgent, 2=high, 3=normal, 4=low

async function cuFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: TOKEN,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`ClickUp API ${res.status}: ${JSON.stringify(json)}`)
  return json as T
}

export interface CreateTaskPayload {
  name: string
  description?: string
  due_date?: number // unix ms
  priority?: Priority
  tags?: string[]
  list_id?: string
}

export async function createTask(payload: CreateTaskPayload): Promise<ClickUpTask> {
  const listId = payload.list_id ?? DEFAULT_LIST_ID
  const body = {
    name: payload.name,
    description: payload.description,
    priority: payload.priority ?? 3,
    ...(payload.due_date ? { due_date: payload.due_date, due_date_time: true } : {}),
    ...(payload.tags ? { tags: payload.tags } : {}),
  }
  return cuFetch<ClickUpTask>(`/list/${listId}/task`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateTaskStatus(taskId: string, status: string): Promise<ClickUpTask> {
  return cuFetch<ClickUpTask>(`/task/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  })
}

export async function getTasksDueToday(listId = DEFAULT_LIST_ID): Promise<ClickUpTask[]> {
  const now = Date.now()
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date()
  endOfDay.setHours(23, 59, 59, 999)

  const res = await cuFetch<{ tasks: ClickUpTask[] }>(
    `/list/${listId}/task?due_date_gt=${startOfDay.getTime()}&due_date_lt=${endOfDay.getTime()}&include_closed=false`
  )
  return res.tasks
}

export async function testConnection() {
  const res = await cuFetch<{ user: { id: number; username: string; email: string } }>('/user')
  return res.user
}

export interface ClickUpTask {
  id: string
  name: string
  status: { status: string; color: string }
  priority: { id: string; priority: string } | null
  due_date: string | null
  url: string
  tags: { name: string }[]
}
