import type { QuotaSnapshot } from '../lib/api'
import { formatTokens } from '../lib/format'
import type { AuditEvent, UsageMetric } from '../lib/types'

type Props = {
  usage: UsageMetric[]
  audit: AuditEvent[]
  quota?: QuotaSnapshot | null
  loading?: boolean
  error?: string | null
  scope: 'me' | 'project'
  canSwitchScope: boolean
  onScopeChange: (scope: 'me' | 'project') => void
  onRefresh: () => void
}

const METRIC_LABEL: Record<string, string> = {
  runs: '运行次数',
  prompt_tokens: '输入 Token',
  completion_tokens: '输出 Token',
  total_tokens: '合计 Token',
}

const EVENT_LABEL: Record<string, string> = {
  CHAT_COMPLETE: '对话完成',
  CHAT_ERROR: '对话错误',
  CHAT_CANCEL: '对话取消',
  CHAT_CANCEL_REQUESTED: '请求取消',
  CHAT_AWAITING_CONFIRM: '等待确认',
  CHAT_CONFIRM_RESUME_COMPLETE: '确认后续跑完成',
  CONFIRM_APPROVE: '批准确认',
  CONFIRM_DENY: '拒绝确认',
  CONFIRM_EXPIRED: '确认过期',
}

function metricLabel(metric: string): string {
  return METRIC_LABEL[metric] ?? metric
}

function eventLabel(type: string): string {
  return EVENT_LABEL[type] ?? type
}

function eventTypeOf(ev: AuditEvent): string {
  return String(ev.event_type ?? ev.eventType ?? '')
}

function createdAtOf(ev: AuditEvent): string {
  const raw = ev.created_at ?? ev.createdAt
  if (!raw) return ''
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? String(raw) : d.toLocaleString()
}

function formatMetricValue(metric: string, total: number): string {
  if (metric.includes('token')) return formatTokens(total) || '0'
  return String(total)
}

export function ObservePanel({
  usage,
  audit,
  quota,
  loading,
  error,
  scope,
  canSwitchScope,
  onScopeChange,
  onRefresh,
}: Props) {
  const ordered = ['runs', 'prompt_tokens', 'completion_tokens', 'total_tokens']
  const usageMap = new Map(usage.map((u) => [u.metric, u.total]))
  const metrics = ordered
    .filter((m) => usageMap.has(m))
    .map((m) => ({ metric: m, total: usageMap.get(m) ?? 0 }))
  for (const u of usage) {
    if (!ordered.includes(u.metric)) metrics.push(u)
  }

  return (
    <div className="observe-panel">
      <div className="observe-head">
        <span>观测</span>
        <button type="button" className="observe-refresh" onClick={onRefresh} disabled={loading}>
          {loading ? '…' : '刷新'}
        </button>
      </div>
      {canSwitchScope ? (
        <div className="scope-toggle">
          <button
            type="button"
            className={scope === 'me' ? 'active' : ''}
            onClick={() => onScopeChange('me')}
          >
            我的
          </button>
          <button
            type="button"
            className={scope === 'project' ? 'active' : ''}
            onClick={() => onScopeChange('project')}
          >
            全项目
          </button>
        </div>
      ) : (
        <div className="scope-hint">仅本人用量 / 审计</div>
      )}
      {error ? <div className="observe-error">{error}</div> : null}

      <div className="observe-section">
        <div className="observe-label">配额</div>
        {!quota && !loading ? (
          <div className="observe-empty">未加载</div>
        ) : quota?.unlimited ? (
          <div className="quota-line">
            Token 不限额 · 项目已用 {formatTokens(quota.tokenUsed) || '0'}
            {quota.myTokenUsed != null
              ? ` · 我 ${formatTokens(quota.myTokenUsed) || '0'}`
              : ''}
          </div>
        ) : quota ? (
          <div className="quota-line">
            项目 {formatTokens(quota.tokenUsed) || '0'} /{' '}
            {formatTokens(quota.tokenQuota ?? undefined) || '-'}
            {quota.tokenRemaining != null ? ` · 剩余 ${formatTokens(quota.tokenRemaining)}` : ''}
            {quota.myTokenUsed != null
              ? ` · 我 ${formatTokens(quota.myTokenUsed) || '0'}`
              : ''}
          </div>
        ) : null}
      </div>

      <div className="observe-section">
        <div className="observe-label">用量</div>
        {metrics.length === 0 && !loading ? (
          <div className="observe-empty">暂无用量</div>
        ) : (
          <ul className="usage-grid">
            {metrics.map((m) => (
              <li key={m.metric}>
                <span className="usage-name">{metricLabel(m.metric)}</span>
                <span className="usage-val">{formatMetricValue(m.metric, m.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="observe-section">
        <div className="observe-label">审计</div>
        {audit.length === 0 && !loading ? (
          <div className="observe-empty">暂无事件</div>
        ) : (
          <ul className="audit-list">
            {audit.map((ev) => (
              <li key={ev.id}>
                <span className="audit-type">{eventLabel(eventTypeOf(ev))}</span>
                <span className="audit-time">{createdAtOf(ev)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
