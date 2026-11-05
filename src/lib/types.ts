export type ToolRunStatus = 'running' | 'ok' | 'error' | 'interrupted'

export type ToolRun = {
  toolCallId: string
  name: string
  argsJson?: string
  status: ToolRunStatus
  durationMs?: number
}

export type TimelineItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'thinking'; text: string }
  | { id: string; kind: 'activity'; tools: ToolRun[] }
  | { id: string; kind: 'answer'; text: string; elapsedMs?: number; complete?: boolean }
  | {
      id: string
      kind: 'confirm'
      taskId: string
      conversationId: string
      calls: ConfirmCall[]
      settled?: 'approved' | 'denied'
    }
  | { id: string; kind: 'error'; text: string }

export type ConfirmCall = {
  confirmId: string
  name: string
  argsJson: string
}

export type Conversation = {
  id: string
  title: string
  updatedAt: number
  items: TimelineItem[]
}

export type Settings = {
  apiKey: string
  baseUrl: string
}

export type ToolPhasePayload = {
  phase: 'start' | 'args' | 'end'
  toolCallId: string
  name: string
  argsJson?: string
  status?: string
  durationMs?: number
}

export type DonePayload = {
  status?: string
  elapsedMs?: number
}
