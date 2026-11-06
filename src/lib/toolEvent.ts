import { parseMaybeJson } from './sse'
import type { DonePayload, ToolPhasePayload, ToolRunStatus } from './types'

export function parseToolPayload(data: string): ToolPhasePayload | null {
  const text = typeof parseMaybeJson(data) === 'string' ? String(parseMaybeJson(data)) : data
  let raw: unknown = parseMaybeJson(text)
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      // 旧格式 name#id
      const hash = text.indexOf('#')
      if (hash > 0) {
        return {
          phase: 'start',
          name: text.slice(0, hash),
          toolCallId: text.slice(hash + 1) || text,
        }
      }
      return {
        phase: 'start',
        name: text || 'tool',
        toolCallId: `legacy_${Date.now()}`,
      }
    }
  }
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const phase = String(o.phase ?? 'start') as ToolPhasePayload['phase']
  if (phase !== 'start' && phase !== 'args' && phase !== 'end') return null
  return {
    phase,
    toolCallId: String(o.toolCallId ?? ''),
    name: String(o.name ?? 'tool'),
    argsJson: o.argsJson != null ? String(o.argsJson) : undefined,
    status: o.status != null ? String(o.status) : undefined,
    durationMs: typeof o.durationMs === 'number' ? o.durationMs : undefined,
  }
}

function asNonNegInt(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return undefined
  return Math.round(v)
}

export function parseDonePayload(data: string): DonePayload {
  const parsed = parseMaybeJson(data)
  if (parsed && typeof parsed === 'object') {
    const o = parsed as Record<string, unknown>
    const promptTokens = asNonNegInt(o.promptTokens)
    const completionTokens = asNonNegInt(o.completionTokens)
    const totalTokens =
      asNonNegInt(o.totalTokens) ??
      (promptTokens != null && completionTokens != null
        ? promptTokens + completionTokens
        : undefined)
    return {
      status: o.status != null ? String(o.status) : undefined,
      elapsedMs: typeof o.elapsedMs === 'number' ? o.elapsedMs : undefined,
      promptTokens,
      completionTokens,
      totalTokens,
    }
  }
  if (typeof parsed === 'string') {
    return { status: parsed }
  }
  return { status: String(data || 'ok') }
}

export function mapToolStatus(status: string | undefined): ToolRunStatus {
  if (status === 'error') return 'error'
  if (status === 'interrupted') return 'interrupted'
  if (status === 'ok' || status === 'SUCCESS') return 'ok'
  return 'running'
}

export type ExtractedToolCall = {
  toolCallId: string
  name: string
  argsJson: string
}

const TOOL_CALL_BLOCK =
  /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi

/**
 * 去掉模型误写入的 &lt;tool_call&gt; 文本，并解析为工具卡片数据。
 * 流式过程中会隐藏未闭合标签，避免气泡出现半截 XML。
 */
export function sanitizeAssistantText(raw: string): {
  display: string
  tools: ExtractedToolCall[]
} {
  if (!raw) return { display: '', tools: [] }
  const tools: ExtractedToolCall[] = []
  let display = raw.replace(TOOL_CALL_BLOCK, (_m, body: string) => {
    const parsed = parseToolCallBody(String(body ?? ''))
    if (parsed) tools.push(parsed)
    return ''
  })
  // 未闭合的 tool_call：整段隐藏
  const openIdx = display.toLowerCase().lastIndexOf('<tool_call>')
  const closeIdx = display.toLowerCase().lastIndexOf('</tool_call>')
  if (openIdx >= 0 && openIdx > closeIdx) {
    display = display.slice(0, openIdx)
  }
  // 流式半截开标签：<t / <to / <tool_call …
  display = display.replace(/<\/?t(?:o(?:o(?:l(?:_(?:c(?:a(?:l(?:l)?)?)?)?)?)?)?)?$/i, '')
  display = display.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trimEnd()
  return { display, tools }
}

function parseToolCallBody(body: string): ExtractedToolCall | null {
  const trimmed = body.trim()
  if (!trimmed) return null
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>
    const name = String(obj.name ?? obj.tool ?? '').trim()
    if (!name) return null
    const args =
      obj.arguments ?? obj.args ?? obj.parameters ?? {}
    const argsJson =
      typeof args === 'string' ? args : JSON.stringify(args)
    const idSeed = `${name}:${argsJson}`
    let hash = 0
    for (let i = 0; i < idSeed.length; i++) {
      hash = (hash * 31 + idSeed.charCodeAt(i)) | 0
    }
    return {
      toolCallId: `markup_${Math.abs(hash).toString(36)}`,
      name,
      argsJson,
    }
  } catch {
    return null
  }
}
