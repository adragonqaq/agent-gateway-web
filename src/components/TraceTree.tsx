import { formatDuration } from '../lib/format'
import type { TraceTreeNode as NodeType, TraceView } from '../lib/types'

type Props = {
  traceId: string
  trace?: TraceView | null
  loading?: boolean
  error?: string
  open: boolean
  onToggle: () => void
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'RUN':
      return '运行'
    case 'TOOL':
      return '工具'
    case 'CONFIRM':
      return '确认'
    case 'LLM':
      return '模型'
    default:
      return kind
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'OK':
      return '完成'
    case 'ERROR':
      return '失败'
    case 'CANCELLED':
      return '取消'
    case 'WAITING':
      return '等待'
    default:
      return status
  }
}

function Node({ node, depth }: { node: NodeType; depth: number }) {
  const { span, children } = node
  return (
    <li className={`trace-node kind-${span.kind.toLowerCase()}`}>
      <div className="trace-row" style={{ paddingLeft: depth * 14 }}>
        <span className="trace-kind">{kindLabel(span.kind)}</span>
        <span className="trace-name">{span.name}</span>
        <span className={`trace-status status-${span.status.toLowerCase()}`}>
          {statusLabel(span.status)}
        </span>
        {span.durationMs != null ? (
          <span className="trace-ms">{formatDuration(span.durationMs)}</span>
        ) : null}
      </div>
      {children.length > 0 ? (
        <ul className="trace-children">
          {children.map((child) => (
            <Node key={child.span.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function TraceTree({ traceId, trace, loading, error, open, onToggle }: Props) {
  return (
    <div className="trace-panel">
      <button type="button" className="trace-toggle" onClick={onToggle}>
        链路 {open ? '▴' : '▾'}
        <span className="trace-id">{traceId}</span>
      </button>
      {open ? (
        <div className="trace-body">
          {error ? <div className="trace-empty">暂无链路数据</div> : null}
          {!error && loading ? <div className="trace-empty">加载中…</div> : null}
          {!error && !loading && !trace ? (
            <div className="trace-empty">暂无链路数据</div>
          ) : null}
          {!error && !loading && trace && (!trace.tree || trace.tree.length === 0) ? (
            <div className="trace-empty">暂无链路数据</div>
          ) : null}
          {!error && !loading && trace && trace.tree?.length ? (
            <ul className="trace-tree">
              {trace.tree.map((node) => (
                <Node key={node.span.id} node={node} depth={0} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
