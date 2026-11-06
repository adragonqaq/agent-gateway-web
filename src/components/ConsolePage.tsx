import { useEffect, useState } from 'react'
import {
  disableMcpServer,
  fetchProjectMcp,
  fetchQuota,
  issueApiKey,
  setProjectQuota,
  upsertMcpServer,
  type QuotaSnapshot,
} from '../lib/api'
import { formatTokens } from '../lib/format'
import type { Me, McpServerView, Settings } from '../lib/types'

type Props = {
  me: Me
  settings: Settings
  isOwner: boolean
}

export function ConsolePage({ me, settings, isOwner }: Props) {
  const projectId = settings.projectId
  const project = me.projects.find((p) => p.id === projectId)
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null)
  const [mcp, setMcp] = useState<McpServerView[]>([])
  const [error, setError] = useState<string | null>(null)
  const [quotaInput, setQuotaInput] = useState('')
  const [mcpName, setMcpName] = useState('')
  const [mcpUrl, setMcpUrl] = useState('')
  const [issuedKey, setIssuedKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function reload() {
    if (!projectId) return
    setError(null)
    try {
      const [q, servers] = await Promise.all([
        fetchQuota(settings),
        fetchProjectMcp(settings, projectId),
      ])
      setQuota(q)
      setMcp(servers)
      setQuotaInput(q.tokenQuota == null ? '' : String(q.tokenQuota))
    } catch (e) {
      setError((e as Error).message || '加载失败')
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, settings.apiKey, settings.baseUrl])

  async function saveQuota() {
    if (!isOwner || !projectId) return
    setBusy(true)
    setError(null)
    try {
      const raw = quotaInput.trim()
      const value = raw === '' ? null : Number(raw)
      if (value != null && (!Number.isFinite(value) || value < 0)) {
        throw new Error('配额须为非负整数或空')
      }
      const q = await setProjectQuota(settings, projectId, value)
      setQuota(q)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function addMcp() {
    if (!isOwner || !projectId || !mcpName.trim() || !mcpUrl.trim()) return
    setBusy(true)
    setError(null)
    try {
      await upsertMcpServer(settings, projectId, {
        name: mcpName.trim(),
        transportUrl: mcpUrl.trim(),
        status: 'ACTIVE',
      })
      setMcpName('')
      setMcpUrl('')
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function onDisable(id: string) {
    if (!isOwner || !projectId) return
    setBusy(true)
    try {
      await disableMcpServer(settings, projectId, id)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function onIssueKey() {
    if (!isOwner || !projectId) return
    setBusy(true)
    setError(null)
    setIssuedKey(null)
    try {
      const issued = await issueApiKey(settings, projectId, 'RUNTIME')
      setIssuedKey(issued.apiKey)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="console-page">
      <header className="console-head">
        <h2>控制台</h2>
        <p>
          项目 <strong>{project?.name ?? projectId}</strong>
          {isOwner ? ' · owner' : ' · member（只读）'}
        </p>
      </header>
      {error ? <div className="banner">{error}</div> : null}

      <section className="console-section">
        <h3>概览 / 配额</h3>
        {quota ? (
          <div className="quota-line">
            {quota.unlimited
              ? `不限额 · 已用 ${formatTokens(quota.tokenUsed) || '0'}`
              : `已用 ${formatTokens(quota.tokenUsed) || '0'} / ${formatTokens(quota.tokenQuota ?? undefined) || '-'}`}
            {quota.myTokenUsed != null
              ? ` · 我 ${formatTokens(quota.myTokenUsed) || '0'}`
              : ''}
          </div>
        ) : (
          <div className="observe-empty">加载中…</div>
        )}
        {isOwner ? (
          <div className="console-row">
            <input
              placeholder="tokenQuota，空=不限额"
              value={quotaInput}
              onChange={(e) => setQuotaInput(e.target.value)}
            />
            <button type="button" disabled={busy} onClick={() => void saveQuota()}>
              保存配额
            </button>
          </div>
        ) : null}
      </section>

      <section className="console-section">
        <h3>MCP Servers</h3>
        <ul className="mcp-list">
          {mcp.map((s) => (
            <li key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <span className="meta">{s.transportUrl}</span>
              </div>
              {isOwner ? (
                <button type="button" disabled={busy} onClick={() => void onDisable(s.id)}>
                  停用
                </button>
              ) : null}
            </li>
          ))}
          {mcp.length === 0 ? <li className="observe-empty">暂无 MCP</li> : null}
        </ul>
        {isOwner ? (
          <div className="console-row">
            <input
              placeholder="名称"
              value={mcpName}
              onChange={(e) => setMcpName(e.target.value)}
            />
            <input
              placeholder="transport URL"
              value={mcpUrl}
              onChange={(e) => setMcpUrl(e.target.value)}
            />
            <button type="button" disabled={busy} onClick={() => void addMcp()}>
              登记
            </button>
          </div>
        ) : null}
      </section>

      <section className="console-section">
        <h3>API Key</h3>
        {isOwner ? (
          <>
            <button type="button" disabled={busy} onClick={() => void onIssueKey()}>
              签发 RUNTIME Key
            </button>
            {issuedKey ? (
              <div className="issued-key">
                <p>明文仅显示一次，请立即复制：</p>
                <code>{issuedKey}</code>
              </div>
            ) : null}
          </>
        ) : (
          <div className="observe-empty">仅 owner 可签发密钥</div>
        )}
      </section>
    </div>
  )
}
