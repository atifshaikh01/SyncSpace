import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowRight,
  Check,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { ThreeWritingScene } from './ThreeWritingScene'
import type { User } from '../types'

interface LoginPageProps {
  onContinueAsGuest: (user: User) => void
  onAuthenticate: (
    mode: 'login' | 'register',
    values: { name: string; email: string; password: string },
  ) => Promise<void>
}

const GUEST_COLORS = ['#5b67d8', '#26a37b', '#ef6f5e', '#9b66c7']

export function LoginPage({ onContinueAsGuest, onAuthenticate }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [guestName, setGuestName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const authenticate = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onAuthenticate(mode, { name, email, password })
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to continue.')
    } finally {
      setLoading(false)
    }
  }

  const continueAsGuest = (event: FormEvent) => {
    event.preventDefault()
    const guestDisplayName = guestName.trim() || 'Guest'
    const id = typeof crypto.randomUUID === 'function'
      ? `guest-${crypto.randomUUID()}`
      : `guest-${Date.now()}`

    onContinueAsGuest({
      id,
      name: guestDisplayName,
      color: GUEST_COLORS[Math.floor(Math.random() * GUEST_COLORS.length)],
      accountType: 'guest',
    })
  }

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode)
    setError('')
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <div className="login-brand">
          <span className="login-brand-mark"><Sparkles size={19} /></span>
          <span>SyncSpace</span>
        </div>
        <ThreeWritingScene />
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="login-card-heading">
            <span className="login-mobile-mark"><Sparkles size={18} /></span>
            <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
            <p>
              {mode === 'login'
                ? 'Sign in to continue to your workspace.'
                : 'Start writing and collaborating in minutes.'}
            </p>
          </div>

          <div className="auth-mode-switch" role="tablist">
            <button
              className={mode === 'login' ? 'is-active' : ''}
              onClick={() => switchMode('login')}
              role="tab"
              aria-selected={mode === 'login'}
            >
              Sign in
            </button>
            <button
              className={mode === 'register' ? 'is-active' : ''}
              onClick={() => switchMode('register')}
              role="tab"
              aria-selected={mode === 'register'}
            >
              Create account
            </button>
          </div>

          <form className="login-fields" onSubmit={authenticate}>
            {mode === 'register' && (
              <label>
                Full name
                <span>
                  <UserRound size={16} />
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                    minLength={2}
                    maxLength={60}
                    required
                  />
                </span>
              </label>
            )}
            <label>
              Email address
              <span>
                <Mail size={16} />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                />
              </span>
            </label>
            <label>
              Password
              <span>
                <LockKeyhole size={16} />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  minLength={8}
                  required
                />
              </span>
            </label>
            {error && <div className="auth-error">{error}</div>}
            <button className="login-primary" disabled={loading}>
              {loading && <LoaderCircle size={15} className="auth-spinner" />}
              {loading ? 'Please wait' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="login-divider"><span>or continue without an account</span></div>

          <form className="guest-form" onSubmit={continueAsGuest}>
            <label htmlFor="guest-name">Your display name <em>optional</em></label>
            <input
              id="guest-name"
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              placeholder="Guest"
              maxLength={40}
              autoComplete="name"
            />
            <button className="guest-button" type="submit">
              Continue as guest <ArrowRight size={16} />
            </button>
          </form>

          <div className="guest-note">
            <Check size={14} />
            <span>Guest data remains on this device.</span>
          </div>
        </div>

        <p className="login-legal">
          By continuing, you agree to our <button>Terms</button> and <button>Privacy Policy</button>.
        </p>
      </section>
    </main>
  )
}
