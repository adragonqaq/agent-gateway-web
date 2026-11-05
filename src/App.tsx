import { useEffect, useMemo, useRef, useState } from 'react'
import {
  asText,
  cancelRun,
  chatStream,
  confirmStream,
  readConfirmPayload,
  readMeta,
} from './lib/api'
import { copyText, formatDuration, formatToolSummary } from './lib/format'
import {
  loadConversations,
  loadSettings,
  saveConversations,
  saveSettings,
} from './lib/storage'
import { mapToolStatus, parseDonePayload, parseToolPayload } from './lib/toolEvent'
import { CheckIcon, ClockIcon, CopyIcon, RefreshIcon } from './components/Icons'
import { Markdown } from './components/Markdown'
import type { Conversation, Settings, TimelineItem, ToolRun } from './lib/types'
import './styles.css'

const CHIPS = [
  '用工具查一下上海的天气',
  '直接调用 demo_ticket_submit，title=打印机坏了，detail=3楼',
  'ping 一下 MCP 是否正常',
]

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > 28 ? `${t.slice(0, 28)}…` : t || '新对话'
}

function upsertTool(tools: ToolRun[], next: ToolRun): ToolRun[] {
  const idx = tools.findIndex((t) => t.toolCallId === next.toolCallId)
  if (idx < 0) return [...tools, next]
  const merged = { ...tools[idx], ...next }
  return [...tools.slice(0, idx), merged, ...tools.slice(idx + 1)]
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadConversations(),
  )
  const [activeId, setActiveId] = useState<string | null>(
    () => loadConversations()[0]?.id ?? null,
  )
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const threadRef = useRef<HTMLDivElement | null>(null)
  const runStartedAtRef = useRef<number | null>(null)
  const streamConvIdRef = useRef<string | null>(null)

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  )
  const isEmpty = !active || active.items.length === 0

  useEffect(() => {
    saveConversations(conversations)
  }, [conversations])

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    // 只滚消息容器，避免 scrollIntoView 把整页往下拽
    const el = threadRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [active?.items, busy])

  function upsertConversation(next: Conversation) {
    setConversations((prev) => {
      const rest = prev.filter((c) => c.id !== next.id)
      return [next, ...rest].sort((a, b) => b.updatedAt - a.updatedAt)
    })
    setActiveId(next.id)
  }

  function newChat() {
    abortRef.current?.abort()
    setBusy(false)
    setTaskId(null)
    setError(null)
    setDraft('')
    const conv: Conversation = {
      id: uid('conv'),
      title: '新对话',
      updatedAt: Date.now(),
      items: [],
    }
    upsertConversation(conv)
  }

  function patchItems(
    conversationId: string,
    mutator: (items: TimelineItem[]) => TimelineItem[],
  ) {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? { ...c, items: mutator(c.items), updatedAt: Date.now() }
          : c,
      ),
    )
  }

  function appendOrGrow(
    conversationId: string,
    kind: 'thinking' | 'answer',
    chunk: string,
  ) {
    patchItems(conversationId, (items) => {
      const last = items[items.length - 1]
      if (last && last.kind === kind) {
        return [...items.slice(0, -1), { ...last, text: last.text + chunk }]
      }
      if (kind === 'answer') {
        return [...items, { id: uid('answer'), kind: 'answer', text: chunk }]
      }
      return [...items, { id: uid(kind), kind, text: chunk }]
    })
  }

  function applyToolEvent(conversationId: string, data: string) {
    const payload = parseToolPayload(data)
    if (!payload || !payload.toolCallId) return
    patchItems(conversationId, (items) => {
      const last = items[items.length - 1]
      let activityId = last?.kind === 'activity' ? last.id : null
      let tools: ToolRun[] = last?.kind === 'activity' ? [...last.tools] : []
      const base: ToolRun = {
        toolCallId: payload.toolCallId,
        name: payload.name || 'tool',
        status: 'running',
        argsJson: payload.argsJson,
      }
      if (payload.phase === 'start') {
        tools = upsertTool(tools, { ...base, status: 'running' })
      } else if (payload.phase === 'args') {
        const prev = tools.find((t) => t.toolCallId === payload.toolCallId)
        tools = upsertTool(tools, {
          ...base,
          status: prev?.status ?? 'running',
          durationMs: prev?.durationMs,
          argsJson: payload.argsJson ?? prev?.argsJson,
        })
      } else {
        tools = upsertTool(tools, {
          ...base,
          status: mapToolStatus(payload.status),
          durationMs: payload.durationMs,
          argsJson: payload.argsJson ?? tools.find((t) => t.toolCallId === payload.toolCallId)?.argsJson,
        })
      }
      if (activityId) {
        return items.map((it) =>
          it.id === activityId && it.kind === 'activity' ? { ...it, tools } : it,
        )
      }
      return [...items, { id: uid('activity'), kind: 'activity', tools }]
    })
  }

  function applyDone(conversationId: string, data: string) {
    const done = parseDonePayload(data)
    const localElapsed =
      runStartedAtRef.current != null ? Date.now() - runStartedAtRef.current : undefined
    const elapsedMs = done.elapsedMs ?? localElapsed
    patchItems(conversationId, (items) => {
      const next = [...items]
      for (let i = next.length - 1; i >= 0; i--) {
        const it = next[i]
        if (it.kind === 'answer') {
          next[i] = { ...it, complete: true, elapsedMs }
          break
        }
      }
      return next
    })
    runStartedAtRef.current = null
  }

  async function handleStreamEvents(
    conversationId: string,
    event: string,
    data: string,
  ) {
    const cid = streamConvIdRef.current || conversationId
    if (event === 'meta') {
      const meta = readMeta(data)
      if (meta.taskId) setTaskId(meta.taskId)
      runStartedAtRef.current = Date.now()
      if (meta.conversationId && meta.conversationId !== cid) {
        streamConvIdRef.current = meta.conversationId
        setConversations((prev) =>
          prev.map((c) => (c.id === cid ? { ...c, id: meta.conversationId! } : c)),
        )
        setActiveId(meta.conversationId)
      }
      return
    }
    if (event === 'thinking') {
      appendOrGrow(cid, 'thinking', asText(data))
      return
    }
    if (event === 'answer') {
      appendOrGrow(cid, 'answer', asText(data))
      return
    }
    if (event === 'tool') {
      applyToolEvent(cid, data)
      return
    }
    if (event === 'confirm') {
      const payload = readConfirmPayload(data)
      if (!payload) return
      patchItems(cid, (items) => [
        ...items,
        {
          id: uid('confirm'),
          kind: 'confirm',
          taskId: payload.taskId,
          conversationId: payload.conversationId || cid,
          calls: payload.calls,
        },
      ])
      return
    }
    if (event === 'error') {
      patchItems(cid, (items) => [
        ...items,
        { id: uid('error'), kind: 'error', text: asText(data) },
      ])
      return
    }
    if (event === 'done') {
      applyDone(cid, data)
    }
  }

  async function runChat(conversationId: string, message: string) {
    setBusy(true)
    setError(null)
    streamConvIdRef.current = conversationId
    runStartedAtRef.current = Date.now()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await chatStream(
        settings,
        { message, conversationId },
        (event, data) => {
          void handleStreamEvents(conversationId, event, data)
        },
        controller.signal,
      )
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message || '请求失败')
      }
    } finally {
      setBusy(false)
      setTaskId(null)
      abortRef.current = null
      streamConvIdRef.current = null
    }
  }

  async function sendMessage(text: string) {
    const message = text.trim()
    if (!message || busy) return
    if (!settings.apiKey.trim()) {
      setError('请先在左侧填入 RUNTIME API Key')
      return
    }

    let conv = active
    if (!conv) {
      conv = {
        id: uid('conv'),
        title: titleFrom(message),
        updatedAt: Date.now(),
        items: [],
      }
    }

    const userItem: TimelineItem = { id: uid('user'), kind: 'user', text: message }
    const next: Conversation = {
      ...conv,
      title: conv.items.length === 0 ? titleFrom(message) : conv.title,
      updatedAt: Date.now(),
      items: [...conv.items, userItem],
    }
    upsertConversation(next)
    setDraft('')
    await runChat(next.id, message)
  }

  async function onRegenerate(answerId: string) {
    if (!active || busy || !settings.apiKey.trim()) return
    const items = active.items
    const answerIdx = items.findIndex((it) => it.id === answerId && it.kind === 'answer')
    if (answerIdx < 0) return
    let userIdx = -1
    for (let i = answerIdx - 1; i >= 0; i--) {
      if (items[i].kind === 'user') {
        userIdx = i
        break
      }
    }
    if (userIdx < 0) return
    const userItem = items[userIdx]
    if (userItem.kind !== 'user') return
    const truncated = items.slice(0, userIdx + 1)
    const next: Conversation = {
      ...active,
      items: truncated,
      updatedAt: Date.now(),
    }
    upsertConversation(next)
    await runChat(next.id, userItem.text)
  }

  async function onCopy(id: string, text: string) {
    const ok = await copyText(text)
    if (ok) {
      setCopiedId(id)
      window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1200)
    }
  }

  async function onConfirm(
    itemId: string,
    confirmId: string,
    approved: boolean,
    conversationId: string,
  ) {
    if (!settings.apiKey.trim() || busy) return
    setBusy(true)
    setError(null)
    streamConvIdRef.current = conversationId
    runStartedAtRef.current = Date.now()
    patchItems(conversationId, (items) =>
      items.map((it) =>
        it.id === itemId && it.kind === 'confirm'
          ? { ...it, settled: approved ? 'approved' : 'denied' }
          : it,
      ),
    )
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await confirmStream(
        settings,
        confirmId,
        approved,
        (event, data) => {
          void handleStreamEvents(conversationId, event, data)
        },
        controller.signal,
      )
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message || '确认失败')
      }
    } finally {
      setBusy(false)
      setTaskId(null)
      abortRef.current = null
      streamConvIdRef.current = null
    }
  }

  async function onStop() {
    if (taskId) {
      try {
        await cancelRun(settings, taskId)
      } catch {
        /* ignore */
      }
    }
    abortRef.current?.abort()
    setBusy(false)
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand-row">
          <img src="/mark.svg" alt="" />
          <strong>Agent Gateway</strong>
        </div>
        <button type="button" className="btn btn-new" onClick={newChat}>
          + 新建对话
        </button>
        <div className="conv-list">
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`conv-item${c.id === activeId ? ' active' : ''}`}
              onClick={() => {
                setActiveId(c.id)
                setError(null)
              }}
            >
              <span className="title">{c.title}</span>
              <span className="meta">
                {new Date(c.updatedAt).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
        <div className="sidebar-foot">
          <div className="field">
            <label htmlFor="apiKey">RUNTIME API Key</label>
            <input
              id="apiKey"
              type="password"
              autoComplete="off"
              placeholder="sk_..."
              value={settings.apiKey}
              onChange={(e) =>
                setSettings((s) => ({ ...s, apiKey: e.target.value }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor="baseUrl">API Base（可空=走 Vite 代理）</label>
            <input
              id="baseUrl"
              placeholder="http://127.0.0.1:8080"
              value={settings.baseUrl}
              onChange={(e) =>
                setSettings((s) => ({ ...s, baseUrl: e.target.value }))
              }
            />
          </div>
        </div>
      </aside>

      <main className="main">
        {error ? <div className="banner">{error}</div> : null}

        {isEmpty ? (
          <div className="empty">
            <div className="hero-mark">
              <img src="/mark.svg" alt="" />
              <h1>Agent Gateway</h1>
            </div>
            <div className="composer-shell">
              <textarea
                value={draft}
                placeholder="问点什么，或点下面的快捷示例…"
                rows={3}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void sendMessage(draft)
                  }
                }}
              />
              <div className="composer-bar">
                <div className="composer-tools">
                  <span className="pill">ReAct</span>
                  <span className="pill">MCP</span>
                </div>
                <button
                  type="button"
                  className="send-disc"
                  aria-label="发送"
                  disabled={busy || !draft.trim()}
                  onClick={() => void sendMessage(draft)}
                >
                  ↑
                </button>
              </div>
            </div>
            <div className="chips">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="chip"
                  onClick={() => void sendMessage(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="thread" ref={threadRef}>
              <div className="thread-inner">
                {active?.items.map((item) => {
                  if (item.kind === 'user') {
                    return (
                      <div key={item.id} className="msg user">
                        <div className="bubble">{item.text}</div>
                        <div className="msg-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            title={copiedId === item.id ? '已复制' : '复制'}
                            aria-label={copiedId === item.id ? '已复制' : '复制'}
                            onClick={() => void onCopy(item.id, item.text)}
                          >
                            {copiedId === item.id ? <CheckIcon /> : <CopyIcon />}
                          </button>
                        </div>
                      </div>
                    )
                  }
                  if (item.kind === 'thinking') {
                    return (
                      <div key={item.id} className="msg thinking">
                        <span className="role">思考</span>
                        <div className="bubble">{item.text}</div>
                      </div>
                    )
                  }
                  if (item.kind === 'activity') {
                    const totalToolMs = item.tools.reduce(
                      (sum, t) => sum + (t.durationMs ?? 0),
                      0,
                    )
                    const doneCount = item.tools.filter((t) => t.status !== 'running').length
                    return (
                      <div key={item.id} className="msg activity">
                        <span className="role">活动</span>
                        <div className="activity-card">
                          <div className="activity-summary">
                            {item.tools.length} 个工具
                            {doneCount > 0 ? ` · ${doneCount}/${item.tools.length} 完成` : ''}
                            {totalToolMs > 0 ? ` · ${formatDuration(totalToolMs)}` : ''}
                          </div>
                          <ul className="activity-list">
                            {item.tools.map((tool) => (
                              <li
                                key={tool.toolCallId}
                                className={`activity-row status-${tool.status}`}
                              >
                                <span className="activity-dot" aria-hidden />
                                <div className="activity-body">
                                  <div className="activity-name">{tool.name}</div>
                                  {formatToolSummary(tool.argsJson) ? (
                                    <div className="activity-args">
                                      {formatToolSummary(tool.argsJson)}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="activity-meta">
                                  <span className="activity-status">
                                    {tool.status === 'running'
                                      ? '执行中'
                                      : tool.status === 'ok'
                                        ? '完成'
                                        : tool.status === 'interrupted'
                                          ? '中断'
                                          : '失败'}
                                  </span>
                                  {tool.durationMs != null ? (
                                    <span className="activity-ms">
                                      {formatDuration(tool.durationMs)}
                                    </span>
                                  ) : null}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )
                  }
                  if (item.kind === 'answer') {
                    return (
                      <div key={item.id} className="msg assistant">
                        <span className="role">助手</span>
                        <div className="bubble">
                          <Markdown text={item.text} />
                        </div>
                        <div className="msg-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            title={copiedId === item.id ? '已复制' : '复制'}
                            aria-label={copiedId === item.id ? '已复制' : '复制'}
                            onClick={() => void onCopy(item.id, item.text)}
                          >
                            {copiedId === item.id ? <CheckIcon /> : <CopyIcon />}
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="重新生成"
                            aria-label="重新生成"
                            disabled={busy || !item.complete}
                            onClick={() => void onRegenerate(item.id)}
                          >
                            <RefreshIcon />
                          </button>
                          {item.elapsedMs != null ? (
                            <span className="elapsed" title={`总耗时 ${formatDuration(item.elapsedMs)}`}>
                              <ClockIcon />
                              {formatDuration(item.elapsedMs)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    )
                  }
                  if (item.kind === 'error') {
                    return (
                      <div key={item.id} className="msg assistant">
                        <span className="role">错误</span>
                        <div className="bubble" style={{ color: 'var(--danger)' }}>
                          {item.text}
                        </div>
                      </div>
                    )
                  }
                  if (item.kind === 'confirm') {
                    return (
                      <div key={item.id} className="confirm-card">
                        <h3>需要确认后才能继续</h3>
                        {item.calls.map((call) => (
                          <div key={call.confirmId} className="confirm-call">
                            <strong>{call.name}</strong>
                            <div>
                              <code>{call.argsJson}</code>
                            </div>
                            {!item.settled ? (
                              <div className="confirm-actions">
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  disabled={busy}
                                  onClick={() =>
                                    void onConfirm(
                                      item.id,
                                      call.confirmId,
                                      true,
                                      active.id,
                                    )
                                  }
                                >
                                  批准
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  disabled={busy}
                                  onClick={() =>
                                    void onConfirm(
                                      item.id,
                                      call.confirmId,
                                      false,
                                      active.id,
                                    )
                                  }
                                >
                                  拒绝
                                </button>
                              </div>
                            ) : (
                              <div className="meta">
                                已{item.settled === 'approved' ? '批准' : '拒绝'}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  }
                  return null
                })}
              </div>
            </div>
            <div className="dock">
              <div className="status-line">
                <span>{busy ? '生成中…' : '就绪'}</span>
                {busy ? (
                  <button type="button" className="btn btn-ghost" onClick={() => void onStop()}>
                    停止
                  </button>
                ) : null}
              </div>
              <div className="composer-shell">
                <textarea
                  value={draft}
                  placeholder="继续提问…"
                  rows={2}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void sendMessage(draft)
                    }
                  }}
                />
                <div className="composer-bar">
                  <div className="composer-tools">
                    <span className="pill">Shift+Enter 换行</span>
                  </div>
                  <button
                    type="button"
                    className="send-disc"
                    aria-label="发送"
                    disabled={busy || !draft.trim()}
                    onClick={() => void sendMessage(draft)}
                  >
                    ↑
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
