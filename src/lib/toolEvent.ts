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

export function parseDonePayload(data: string): DonePayload {
  const parsed = parseMaybeJson(data)
  if (parsed && typeof parsed === 'object') {
    const o = parsed as Record<string, unknown>
    return {
      status: o.status != null ? String(o.status) : undefined,
      elapsedMs: typeof o.elapsedMs === 'number' ? o.elapsedMs : undefined,
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
