import { useState } from 'react'
import { loginUser, registerUser } from '../lib/api'
import type { Me, Settings } from '../lib/types'

type Props = {
  settings: Settings
  onAuthed: (me: Me) => void
}

export function LoginPage({ settings, onAuthed }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const me =
        mode === 'login'
          ? await loginUser(settings, email.trim(), password)
          : await registerUser(settings, email.trim(), password)
      onAuthed(me)
    } catch (e) {
      setError((e as Error).message || '失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="hero-mark">
          <img src="/mark.svg" alt="" />
          <h1>Agent Gateway</h1>
        </div>
        <p className="auth-sub">
          {mode === 'login' ? '登录后进入对话与控制台' : '注册将创建个人默认项目'}
        </p>
        {error ? <div className="banner">{error}</div> : null}
        <div className="field">
          <label htmlFor="email">邮箱</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">密码{mode === 'register' ? '（至少 8 位）' : ''}</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
          />
        </div>
        <button
          type="button"
          className="auth-primary"
          disabled={busy || !email.trim() || password.length < (mode === 'register' ? 8 : 1)}
          onClick={() => void submit()}
        >
          {busy ? '…' : mode === 'login' ? '登录' : '注册'}
        </button>
        <button
          type="button"
          className="auth-switch"
          onClick={() => {
            setMode((m) => (m === 'login' ? 'register' : 'login'))
            setError(null)
          }}
        >
          {mode === 'login' ? '没有账号？注册' : '已有账号？登录'}
        </button>
      </div>
    </div>
  )
}
