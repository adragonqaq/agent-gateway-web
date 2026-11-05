export type TimelineItem =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'thinking'; text: string }
  | { id: string; kind: 'tool'; text: string }
  | { id: string; kind: 'answer'; text: string }
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
