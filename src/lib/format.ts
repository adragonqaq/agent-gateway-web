const SUMMARY_KEYS = [
  'command',
  'cmd',
  'path',
  'file',
  'filename',
  'filepath',
  'query',
  'city',
  'title',
  'url',
]

/** 毫秒 → 可读时长 */
export function formatDuration(ms: number | undefined): string {
  if (ms == null || Number.isNaN(ms) || ms < 0) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  const sec = ms / 1000
  if (sec < 60) return `${sec.toFixed(sec < 10 ? 1 : 0)}s`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}m${s}s`
}

/** token 数 → 短展示（如 1.2k） */
export function formatTokens(n: number | undefined): string {
  if (n == null || Number.isNaN(n) || n < 0) return ''
  if (n < 1000) return `${Math.round(n)}`
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`
  return `${Math.round(n / 1000)}k`
}

/** 从工具 args JSON 抽一句摘要（命令/路径优先） */
export function formatToolSummary(argsJson: string | undefined): string {
  if (!argsJson?.trim()) return ''
  try {
    const parsed = JSON.parse(argsJson) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>
      for (const key of SUMMARY_KEYS) {
        const v = obj[key]
        if (typeof v === 'string' && v.trim()) {
          const label =
            key === 'command' || key === 'cmd'
              ? '命令'
              : key === 'path' || key === 'file' || key === 'filename' || key === 'filepath'
                ? '文件'
                : key
          return `${label}: ${truncate(v.trim(), 80)}`
        }
      }
      return truncate(JSON.stringify(obj), 100)
    }
    return truncate(String(parsed), 100)
  } catch {
    return truncate(argsJson.trim(), 100)
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
