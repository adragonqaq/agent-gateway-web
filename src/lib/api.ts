import { parseMaybeJson, streamSse, type SseHandler } from './sse'
import type {
  AuditEvent,
  ConfirmCall,
  IssuedKey,
  McpServerView,
  Me,
  Settings,
  TraceView,
  UsageMetric,
} from './types'

function resolveUrl(settings: Settings, path: string): string {
  const base = settings.baseUrl.trim().replace(/\/$/, '')
  return base ? `${base}${path}` : path
}

/** 会话 Cookie + 可选 API Key；业务请求带 X-Project-Id。 */
export function authHeaders(settings: Settings, withProject = true): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  // 已选项目时走 Cookie 会话，避免本地残留 Key 抢先绑定到错误租户
  if (settings.apiKey.trim() && !settings.projectId.trim()) {
    headers.Authorization = `Bearer ${settings.apiKey.trim()}`
  }
  if (withProject && settings.projectId.trim()) {
    headers['X-Project-Id'] = settings.projectId.trim()
  }
  return headers
}

export function canCallApi(settings: Settings): boolean {
  return Boolean(settings.projectId.trim()) || Boolean(settings.apiKey.trim())
}

async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => '')
  try {
    const j = JSON.parse(body) as { error?: string }
    if (j.error) return j.error
  } catch {
    /* ignore */
  }
  return body || `HTTP ${res.status}`
}

export async function registerUser(
  settings: Settings,
  email: string,
  password: string,
): Promise<Me> {
  const res = await fetch(resolveUrl(settings, '/v1/auth/register'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as Me
}

export async function loginUser(
  settings: Settings,
  email: string,
  password: string,
): Promise<Me> {
  const res = await fetch(resolveUrl(settings, '/v1/auth/login'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as Me
}

export async function fetchMe(settings: Settings): Promise<Me | null> {
  const res = await fetch(resolveUrl(settings, '/v1/auth/me'), {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as Me
}

export async function logoutUser(settings: Settings): Promise<void> {
  await fetch(resolveUrl(settings, '/v1/auth/logout'), {
    method: 'POST',
    credentials: 'include',
  })
}

export async function chatStream(
  settings: Settings,
  body: { message: string; conversationId?: string },
  onEvent: SseHandler,
  signal?: AbortSignal,
): Promise<void> {
  await streamSse(
    resolveUrl(settings, '/v1/chat'),
    {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(settings),
      body: JSON.stringify(body),
    },
    onEvent,
    signal,
  )
}

export async function confirmStream(
  settings: Settings,
  confirmId: string,
  approved: boolean,
  onEvent: SseHandler,
  signal?: AbortSignal,
): Promise<void> {
  const action = approved ? 'approve' : 'deny'
  await streamSse(
    resolveUrl(settings, `/v1/confirms/${encodeURIComponent(confirmId)}/${action}`),
    {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(settings),
    },
    onEvent,
    signal,
  )
}

export async function cancelRun(settings: Settings, taskId: string): Promise<void> {
  const res = await fetch(resolveUrl(settings, `/v1/runs/${encodeURIComponent(taskId)}/cancel`), {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(settings),
  })
  if (!res.ok) {
    throw new Error(`取消失败 HTTP ${res.status}`)
  }
}

export function readConfirmPayload(data: string): {
  taskId: string
  conversationId: string
  calls: ConfirmCall[]
} | null {
  const parsed = parseMaybeJson(data)
  const obj = typeof parsed === 'string' ? parseMaybeJson(parsed) : parsed
  if (!obj || typeof obj !== 'object') return null
  const record = obj as Record<string, unknown>
  const callsRaw = record.calls
  if (!Array.isArray(callsRaw)) return null
  const calls: ConfirmCall[] = callsRaw
    .map((c) => {
      if (!c || typeof c !== 'object') return null
      const row = c as Record<string, unknown>
      const confirmId = String(row.confirmId ?? '')
      const name = String(row.name ?? '')
      const argsJson = String(row.argsJson ?? '{}')
      if (!confirmId) return null
      return { confirmId, name, argsJson }
    })
    .filter((x): x is ConfirmCall => x != null)
  return {
    taskId: String(record.taskId ?? ''),
    conversationId: String(record.conversationId ?? ''),
    calls,
  }
}

export function readMeta(data: string): {
  taskId?: string
  conversationId?: string
  traceId?: string
} {
  const parsed = parseMaybeJson(data)
  if (!parsed || typeof parsed !== 'object') return {}
  const record = parsed as Record<string, unknown>
  return {
    taskId: record.taskId != null ? String(record.taskId) : undefined,
    conversationId:
      record.conversationId != null ? String(record.conversationId) : undefined,
    traceId: record.traceId != null ? String(record.traceId) : undefined,
  }
}

/**
 * 拉取本轮 Trace 树（权威落库视图）。
 */
export async function fetchTrace(settings: Settings, traceId: string): Promise<TraceView> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(
      resolveUrl(settings, `/v1/observe/traces/${encodeURIComponent(traceId)}`),
      {
        credentials: 'include',
        headers: authHeaders(settings),
        signal: controller.signal,
      },
    )
    if (!res.ok) {
      throw new Error(`Trace 查询失败 HTTP ${res.status}`)
    }
    return (await res.json()) as TraceView
  } finally {
    window.clearTimeout(timer)
  }
}

export function asText(data: string): string {
  const parsed = parseMaybeJson(data)
  if (typeof parsed === 'string') return parsed
  if (parsed == null) return data
  return typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed)
}

/** 本租户最近审计事件 */
export async function fetchAudit(
  settings: Settings,
  limit = 30,
  scope?: 'me' | 'project',
): Promise<AuditEvent[]> {
  const sc = scope ?? settings.observeScope
  const res = await fetch(
    resolveUrl(
      settings,
      `/v1/observe/audit?limit=${encodeURIComponent(String(limit))}&scope=${encodeURIComponent(sc)}`,
    ),
    { credentials: 'include', headers: authHeaders(settings) },
  )
  if (!res.ok) {
    throw new Error(`审计查询失败 HTTP ${res.status}`)
  }
  return (await res.json()) as AuditEvent[]
}

export type QuotaSnapshot = {
  tokenQuota: number | null
  tokenUsed: number
  tokenRemaining: number | null
  unlimited: boolean
  myTokenUsed?: number
}

/** 本租户 token 配额快照 */
export async function fetchQuota(settings: Settings): Promise<QuotaSnapshot> {
  const res = await fetch(resolveUrl(settings, '/v1/observe/quota'), {
    credentials: 'include',
    headers: authHeaders(settings),
  })
  if (!res.ok) {
    throw new Error(`配额查询失败 HTTP ${res.status}`)
  }
  const row = (await res.json()) as Record<string, unknown>
  return {
    tokenQuota: row.tokenQuota == null ? null : Number(row.tokenQuota),
    tokenUsed: Number(row.tokenUsed ?? 0),
    tokenRemaining: row.tokenRemaining == null ? null : Number(row.tokenRemaining),
    unlimited: Boolean(row.unlimited),
    myTokenUsed: row.myTokenUsed == null ? undefined : Number(row.myTokenUsed),
  }
}

/** 本租户用量汇总 */
export async function fetchUsage(
  settings: Settings,
  scope?: 'me' | 'project',
): Promise<UsageMetric[]> {
  const sc = scope ?? settings.observeScope
  const res = await fetch(
    resolveUrl(settings, `/v1/observe/usage?scope=${encodeURIComponent(sc)}`),
    { credentials: 'include', headers: authHeaders(settings) },
  )
  if (!res.ok) {
    throw new Error(`用量查询失败 HTTP ${res.status}`)
  }
  const rows = (await res.json()) as Array<Record<string, unknown>>
  return rows.map((r) => ({
    metric: String(r.metric ?? ''),
    total: Number(r.total ?? 0),
  }))
}

/** 按任务回填本轮 token */
export async function fetchTaskUsage(
  settings: Settings,
  taskId: string,
): Promise<{ promptTokens?: number; completionTokens?: number; totalTokens?: number }> {
  const res = await fetch(
    resolveUrl(settings, `/v1/observe/usage/tasks/${encodeURIComponent(taskId)}`),
    { credentials: 'include', headers: authHeaders(settings) },
  )
  if (!res.ok) {
    throw new Error(`任务用量查询失败 HTTP ${res.status}`)
  }
  const row = (await res.json()) as Record<string, unknown>
  const prompt = Number(row.prompt_tokens ?? row.promptTokens)
  const completion = Number(row.completion_tokens ?? row.completionTokens)
  const total = Number(row.total_tokens ?? row.totalTokens)
  return {
    promptTokens: Number.isFinite(prompt) ? prompt : undefined,
    completionTokens: Number.isFinite(completion) ? completion : undefined,
    totalTokens: Number.isFinite(total)
      ? total
      : Number.isFinite(prompt) && Number.isFinite(completion)
        ? prompt + completion
        : undefined,
  }
}

/** 项目成员只读 MCP 列表 */
export async function fetchProjectMcp(
  settings: Settings,
  projectId: string,
): Promise<McpServerView[]> {
  const res = await fetch(
    resolveUrl(settings, `/v1/projects/${encodeURIComponent(projectId)}/mcp-servers`),
    { credentials: 'include', headers: authHeaders(settings) },
  )
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as McpServerView[]
}

/** owner：登记 MCP */
export async function upsertMcpServer(
  settings: Settings,
  tenantId: string,
  body: { id?: string; name: string; transportUrl: string; status?: string },
): Promise<McpServerView> {
  const res = await fetch(
    resolveUrl(settings, `/admin/tenants/${encodeURIComponent(tenantId)}/mcp-servers`),
    {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(settings),
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as McpServerView
}

export async function disableMcpServer(
  settings: Settings,
  tenantId: string,
  serverId: string,
): Promise<McpServerView> {
  const res = await fetch(
    resolveUrl(
      settings,
      `/admin/tenants/${encodeURIComponent(tenantId)}/mcp-servers/${encodeURIComponent(serverId)}/disable`,
    ),
    { method: 'POST', credentials: 'include', headers: authHeaders(settings) },
  )
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as McpServerView
}

export async function setProjectQuota(
  settings: Settings,
  tenantId: string,
  tokenQuota: number | null,
): Promise<QuotaSnapshot> {
  const res = await fetch(
    resolveUrl(settings, `/admin/tenants/${encodeURIComponent(tenantId)}/quota`),
    {
      method: 'PUT',
      credentials: 'include',
      headers: authHeaders(settings),
      body: JSON.stringify({ tokenQuota }),
    },
  )
  if (!res.ok) throw new Error(await readError(res))
  const row = (await res.json()) as Record<string, unknown>
  return {
    tokenQuota: row.tokenQuota == null ? null : Number(row.tokenQuota),
    tokenUsed: Number(row.tokenUsed ?? 0),
    tokenRemaining: row.tokenRemaining == null ? null : Number(row.tokenRemaining),
    unlimited: Boolean(row.unlimited),
    myTokenUsed: row.myTokenUsed == null ? undefined : Number(row.myTokenUsed),
  }
}

export async function issueApiKey(
  settings: Settings,
  tenantId: string,
  role = 'RUNTIME',
): Promise<IssuedKey> {
  const res = await fetch(
    resolveUrl(settings, `/admin/tenants/${encodeURIComponent(tenantId)}/api-keys`),
    {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(settings),
      body: JSON.stringify({ role }),
    },
  )
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as IssuedKey
}
