import type { ReactNode } from 'react'

type Props = {
  email: string
  onLogout: () => void
  extra?: ReactNode
}

function initials(email: string): string {
  const local = email.split('@')[0] || 'U'
  return local.slice(0, 1).toUpperCase()
}

export function AppTopUser({ email, onLogout, extra }: Props) {
  return (
    <div className="admin-top-actions">
      {extra}
      <div className="admin-user">
        <span className="admin-avatar">{initials(email)}</span>
        <div className="admin-user-meta">
          <strong>{email}</strong>
          <button type="button" onClick={onLogout}>
            退出
          </button>
        </div>
      </div>
    </div>
  )
}
