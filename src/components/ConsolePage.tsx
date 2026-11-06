import { useEffect, useMemo, useState } from 'react'
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

type Section = 'overview' | 'mcp' | 'keys'

type Props = {
  me: Me
  settings: Settings
  isOwner: boolean
  onProjectChange: (projectId: string) => void
  onBackToChat: () => void
  onLogout: () => void
}

function initials(email: string): string {
  const local = email.split('@')[0] || 'U'
  return local.slice(0, 1).toUpperCase()
}

function MetricCard({
  label,
  value,
  hint,
  tone,
  glyph,
}: {
  label: string
  value: string
  hint?: string
  tone: 'teal' | 'violet' | 'amber' | 'sky'
  glyph: string
}) {
  return (
    <article className={`admin-metric tone-${tone}`}>
      <div className="admin-metric-top">
        <span className="admin-metric-label">{label}</span>
        <span className="admin-metric-icon" aria-hidden>
          {glyph}
        </span>
      </div>
      <div className="admin-metric-value">{value}</div>
      {hint ? <div className="admin-metric-hint">{hint}</div> : null}
    </article>
  )
}

export function ConsolePage({
  me,
  settings,
  isOwner,
  onProjectChange,
  onBackToChat,
  onLogout,
}: Props) {
  const projectId = settings.projectId
  const project = me.projects.find((p) => p.id === projectId)
  const [section, setSection] = useState<Section>('overview')
  const [quota, setQuota] = useState<QuotaSnapshot | null>(null)
  const [mcp, setMcp] = useState<McpServerView[]>([])
  const [error, setError] = useState<string | null>(null)
  const [quotaInput, setQuotaInput] = useState('')
  const [mcpName, setMcpName] = useState('')
  const [mcpUrl, setMcpUrl] = useState('')
  const [issuedKey, setIssuedKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const sectionTitle = useMemo(() => {
    if (section === 'mcp') return 'MCP Servers'
    if (section === 'keys') return 'API Key'
    return 'Dashboard'
  }, [section])

  async function reload() {
    if (!projectId) return
    setError(null)
    setLoading(true)
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
    } finally {
      setLoading(false)
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

  const usedLabel = quota
    ? formatTokens(quota.tokenUsed) || '0'
    : loading
      ? '…'
      : '-'
  const remainingLabel = !quota
    ? loading
      ? '…'
      : '-'
    : quota.unlimited
      ? '∞'
      : formatTokens(quota.tokenRemaining ?? undefined) || '0'
  const mineLabel =
    quota?.myTokenUsed != null ? formatTokens(quota.myTokenUsed) || '0' : '-'

  return (
    <div className="admin-shell">
      <aside className="admin-rail">
        <div className="admin-brand">
          <div className="admin-logo">A</div>
          <div>
            <div className="admin-brand-title">Agent Gateway</div>
            <div className="admin-brand-sub">Project Console</div>
          </div>
        </div>

        <div className="admin-nav-group">
          <div className="admin-nav-label">导航</div>
          <button
            type="button"
            className={`admin-nav-item${section === 'overview' ? ' active' : ''}`}
            onClick={() => setSection('overview')}
          >
            <span className="admin-nav-ico" aria-hidden>
              ▦
            </span>
            Dashboard
          </button>
          <button
            type="button"
            className={`admin-nav-item${section === 'mcp' ? ' active' : ''}`}
            onClick={() => setSection('mcp')}
          >
            <span className="admin-nav-ico" aria-hidden>
              ⧉
            </span>
            MCP 管理
          </button>
          <button
            type="button"
            className={`admin-nav-item${section === 'keys' ? ' active' : ''}`}
            onClick={() => setSection('keys')}
          >
            <span className="admin-nav-ico" aria-hidden>
              ⌁
            </span>
            API Key
          </button>
        </div>

        <div className="admin-nav-group">
          <div className="admin-nav-label">设置</div>
          <div className="admin-project-box">
            <label htmlFor="admin-project">当前项目</label>
            <select
              id="admin-project"
              value={settings.projectId}
              onChange={(e) => onProjectChange(e.target.value)}
            >
              {me.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.role})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="admin-rail-foot">
          <button type="button" className="admin-ghost" onClick={onBackToChat}>
            ← 返回对话
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-top">
          <div className="admin-crumb">
            <span>首页</span>
            <span>/</span>
            <span>{sectionTitle}</span>
          </div>
          <div className="admin-top-actions">
            <button type="button" className="admin-chip" onClick={onBackToChat}>
              返回对话
            </button>
            <button
              type="button"
              className="admin-icon-btn"
              aria-label="刷新"
              disabled={busy || loading}
              onClick={() => void reload()}
            >
              ↻
            </button>
            <div className="admin-user">
              <span className="admin-avatar">{initials(me.email)}</span>
              <div className="admin-user-meta">
                <strong>{me.email}</strong>
                <button type="button" onClick={onLogout}>
                  退出
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="admin-content">
          <div className="admin-page-head">
            <div>
              <h1>{sectionTitle}</h1>
              <p>
                项目 <strong>{project?.name ?? projectId}</strong>
                <span className={`admin-role-pill${isOwner ? ' owner' : ''}`}>
                  {isOwner ? 'owner' : 'member · 只读'}
                </span>
              </p>
            </div>
            {section === 'overview' ? (
              <div className="admin-status">
                <span className="admin-status-dot" />
                {quota?.unlimited ? '不限额' : '配额生效中'}
              </div>
            ) : null}
          </div>

          {error ? <div className="admin-banner">{error}</div> : null}

          {section === 'overview' ? (
            <>
              <section className="admin-card">
                <div className="admin-card-head">
                  <h3>核心指标</h3>
                </div>
                <div className="admin-metric-grid">
                  <MetricCard
                    label="项目已用 Token"
                    value={usedLabel}
                    hint={
                      quota?.unlimited
                        ? '无上限'
                        : `上限 ${formatTokens(quota?.tokenQuota ?? undefined) || '-'}`
                    }
                    tone="teal"
                    glyph="◎"
                  />
                  <MetricCard
                    label="剩余配额"
                    value={remainingLabel}
                    hint={quota?.unlimited ? '不限制累计用量' : '按 total_tokens 累计'}
                    tone="violet"
                    glyph="▣"
                  />
                  <MetricCard
                    label="我的用量"
                    value={mineLabel}
                    hint="当前登录用户累计"
                    tone="amber"
                    glyph="›"
                  />
                  <MetricCard
                    label="MCP Servers"
                    value={loading ? '…' : String(mcp.length)}
                    hint="ACTIVE 连接数"
                    tone="sky"
                    glyph="⧉"
                  />
                </div>
              </section>

              <section className="admin-card">
                <div className="admin-card-head">
                  <h3>配额设置</h3>
                  <span className="admin-muted">空值表示不限额</span>
                </div>
                {isOwner ? (
                  <div className="admin-form-row">
                    <input
                      placeholder="tokenQuota，留空=不限额"
                      value={quotaInput}
                      onChange={(e) => setQuotaInput(e.target.value)}
                    />
                    <button
                      type="button"
                      className="admin-primary"
                      disabled={busy}
                      onClick={() => void saveQuota()}
                    >
                      保存配额
                    </button>
                  </div>
                ) : (
                  <div className="admin-empty">成员不可修改项目配额</div>
                )}
              </section>
            </>
          ) : null}

          {section === 'mcp' ? (
            <section className="admin-card">
              <div className="admin-card-head">
                <h3>已登记服务</h3>
                <span className="admin-muted">{mcp.length} 台</span>
              </div>
              <div className="admin-table">
                <div className="admin-table-head">
                  <span>名称</span>
                  <span>Transport</span>
                  <span>状态</span>
                  <span />
                </div>
                {mcp.map((s) => (
                  <div key={s.id} className="admin-table-row">
                    <span className="admin-strong">{s.name}</span>
                    <span className="admin-mono">{s.transportUrl}</span>
                    <span>
                      <span className="admin-badge ok">{s.status}</span>
                    </span>
                    <span className="admin-row-actions">
                      {isOwner ? (
                        <button
                          type="button"
                          className="admin-danger-text"
                          disabled={busy}
                          onClick={() => void onDisable(s.id)}
                        >
                          停用
                        </button>
                      ) : null}
                    </span>
                  </div>
                ))}
                {mcp.length === 0 && !loading ? (
                  <div className="admin-empty">暂无 MCP，登记后可在对话中调用工具</div>
                ) : null}
              </div>

              {isOwner ? (
                <div className="admin-form-row stacked">
                  <input
                    placeholder="名称，如 weather"
                    value={mcpName}
                    onChange={(e) => setMcpName(e.target.value)}
                  />
                  <input
                    placeholder="transport URL"
                    value={mcpUrl}
                    onChange={(e) => setMcpUrl(e.target.value)}
                  />
                  <button
                    type="button"
                    className="admin-primary"
                    disabled={busy || !mcpName.trim() || !mcpUrl.trim()}
                    onClick={() => void addMcp()}
                  >
                    登记 MCP
                  </button>
                </div>
              ) : (
                <div className="admin-empty">成员仅可查看 MCP 列表</div>
              )}
            </section>
          ) : null}

          {section === 'keys' ? (
            <section className="admin-card">
              <div className="admin-card-head">
                <h3>机器调用密钥</h3>
                <span className="admin-muted">明文仅显示一次</span>
              </div>
              {isOwner ? (
                <>
                  <p className="admin-lead">
                    为 CI / SDK 签发 RUNTIME Key。浏览器对话请继续使用登录会话，不必粘贴 Key。
                  </p>
                  <button
                    type="button"
                    className="admin-primary"
                    disabled={busy}
                    onClick={() => void onIssueKey()}
                  >
                    签发 RUNTIME Key
                  </button>
                  {issuedKey ? (
                    <div className="admin-secret">
                      <div className="admin-secret-label">请立即复制</div>
                      <code>{issuedKey}</code>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="admin-empty">仅 owner 可签发密钥</div>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
