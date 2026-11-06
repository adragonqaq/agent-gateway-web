import { parseMaybeJson, streamSse, type SseHandler } from './sse'
import type { ConfirmCall, Settings, TraceView } from './types'

function resolveUrl(settings: Settings, path: string): string {
  const base = settings.baseUrl.trim().replace(/\/$/, '')
  return base ? `${base}${path}` : path
}

function authHeaders(settings: Settings): HeadersInit {
  return {
    Authorization: `Bearer ${settings.apiKey.trim()}`,
    'Content-Type': 'application/json',
  }
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
      headers: authHeaders(settings),
    },
    onEvent,
    signal,
  )
}

export async function cancelRun(settings: Settings, taskId: string): Promise<void> {
  const res = await fetch(resolveUrl(settings, `/v1/runs/${encodeURIComponent(taskId)}/cancel`), {
    method: 'POST',
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
      { headers: authHeaders(settings), signal: controller.signal },
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
