import type { Conversation, Settings } from './types'

const SETTINGS_KEY = 'ag.web.settings'
const CONV_KEY = 'ag.web.conversations'

const defaultSettings: Settings = {
  apiKey: '',
  baseUrl: '',
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
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function saveConversations(list: Conversation[]): void {
  localStorage.setItem(CONV_KEY, JSON.stringify(list))
}
