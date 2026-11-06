export type SseHandler = (event: string, data: string) => void

/**
 * 用 fetch 读 SSE（POST + Authorization）。浏览器 EventSource 不能自定义头。
 */
export async function streamSse(
  url: string,
  init: RequestInit,
  onEvent: SseHandler,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    ...init,
    credentials: init.credentials ?? 'include',
    signal,
    headers: {
      Accept: 'text/event-stream',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(body || `HTTP ${res.status}`)
  }
  if (!res.body) {
    throw new Error('响应无 body')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let eventName = 'message'
  let dataLines: string[] = []

  const flush = () => {
    if (dataLines.length === 0) {
      eventName = 'message'
      return
    }
    onEvent(eventName, dataLines.join('\n'))
    eventName = 'message'
    dataLines = []
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      flush()
      break
    }
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split(/\r?\n/)
    buffer = parts.pop() ?? ''
    for (const line of parts) {
      if (line === '') {
        flush()
        continue
      }
      if (line.startsWith(':')) continue
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
        continue
      }
      if (line.startsWith('data:')) {
        // SSE：只去掉 data: 后可选的一个前导空格，不能 trimStart（会吃掉正文空格）
        let payload = line.slice(5)
        if (payload.startsWith(' ')) payload = payload.slice(1)
        dataLines.push(payload)
      }
    }
  }
}

export function parseMaybeJson(data: string): unknown {
  const trimmed = data.trim()
  if (!trimmed) return data
  try {
    const parsed: unknown = JSON.parse(trimmed)
    // SseSupport 对 String 再 writeValueAsString 一次：done/tool 会变成
    // "\"{...}\"" → 第一次 parse 得到字符串 "{...}"，需再解一层对象
    if (typeof parsed === 'string') {
      const inner = parsed.trim()
      if (
        (inner.startsWith('{') && inner.endsWith('}')) ||
        (inner.startsWith('[') && inner.endsWith(']'))
      ) {
        try {
          return JSON.parse(inner)
        } catch {
          return parsed
        }
      }
    }
    return parsed
  } catch {
    // Spring 可能把 JSON 字符串再包一层引号
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      try {
        return JSON.parse(JSON.parse(trimmed))
      } catch {
        return trimmed.slice(1, -1)
      }
    }
    return data
  }
}
