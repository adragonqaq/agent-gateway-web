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
  | {
      id: string
      kind: 'answer'
      text: string
      elapsedMs?: number
      /** 本轮任务 ID；用于回填 token */
      taskId?: string
      /** 本轮累计 token；模型未回传时为空 */
      promptTokens?: number
      completionTokens?: number
      totalTokens?: number
      complete?: boolean
      /** 本轮全链路 ID；done 后拉 Trace 树 */
      traceId?: string
      trace?: TraceView | null
      traceOpen?: boolean
      traceLoading?: boolean
      traceError?: string
    }
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

export type ProjectSummary = {
  id: string
  name: string
  role: string
}

export type Me = {
  id: string
  email: string
  projects: ProjectSummary[]
}

export type Settings = {
  /** 调试用 API Key；浏览器主路径用 Cookie 会话 */
  apiKey: string
  baseUrl: string
  /** 当前项目（X-Project-Id） */
  projectId: string
  /** 观测 scope：me | project */
  observeScope: 'me' | 'project'
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
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export type TraceSpan = {
  id: string
  tenantId?: string
  traceId: string
  parentSpanId?: string | null
  conversationId?: string | null
  taskId?: string | null
  name: string
  kind: string
  status: string
  startedAt?: string
  endedAt?: string | null
  durationMs?: number | null
  attrsJson?: string | null
}

export type TraceTreeNode = {
  span: TraceSpan
  children: TraceTreeNode[]
}

export type TraceView = {
  traceId: string
  spans: TraceSpan[]
  tree: TraceTreeNode[]
}

export type AuditEvent = {
  id: string
  user_id?: string
  userId?: string
  event_type?: string
  eventType?: string
  ref_id?: string
  refId?: string
  detail_json?: string
  detailJson?: string
  created_at?: string
  createdAt?: string
}

export type UsageMetric = {
  metric: string
  total: number
}

export type McpServerView = {
  id: string
  tenantId: string
  name: string
  transportUrl: string
  status: string
  hasHeaders: boolean
}

export type IssuedKey = {
  id: string
  apiKey: string
  prefix: string
  role: string
}
