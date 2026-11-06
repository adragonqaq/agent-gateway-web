import type { Conversation, Settings } from './types'

const SETTINGS_KEY = 'ag.web.settings'
const CONV_KEY = 'ag.web.conversations'

const defaultSettings: Settings = {
  apiKey: '',
  baseUrl: '',
  projectId: '',
  observeScope: 'project',
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...defaultSettings }
    return { ...defaultSettings, ...JSON.parse(raw) }
  } catch {
    return { ...defaultSettings }
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(CONV_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as Conversation[]
    if (!Array.isArray(list)) return []
    // 瞬时 UI 状态不恢复，避免 refresh 后一直「加载中」
    return list.map((c) => ({
      ...c,
      items: (c.items ?? []).map((it) => {
        if (it.kind !== 'answer') return it
        return {
          ...it,
          trace: undefined,
          traceLoading: false,
          traceOpen: false,
          traceError: undefined,
        }
      }),
    }))
  } catch {
    return []
  }
}

export function saveConversations(list: Conversation[]): void {
  const slim = list.map((c) => ({
    ...c,
    items: c.items.map((it) => {
      if (it.kind !== 'answer') return it
      const { trace: _t, traceLoading: _l, traceOpen: _o, traceError: _e, ...rest } = it
      return rest
    }),
  }))
  localStorage.setItem(CONV_KEY, JSON.stringify(slim))
}
