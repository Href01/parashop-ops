'use client'

import { Shield } from 'lucide-react'
import { signIn } from 'next-auth/react'
import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'

function SignInForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/'

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        callbackUrl,
        redirect: true,
      })

      if (result?.error) {
        setError('Invalid email or password')
        setLoading(false)
      }
    } catch {
      setError('Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-brand">
        <div className="auth-logo">
          <div className="sb-logo">S</div>
          <div>
            <div className="auth-logo-title">
              Shine <b>BOS</b>
            </div>
            <div className="sb-brand-sub">Business Operating System</div>
          </div>
        </div>

        <div className="auth-hero">
          <h1>
            Run all of <span className="g">Shine Cosmetics</span> from one screen.
          </h1>
          <p>Orders, inventory, profit, ads and content - the founders&apos; command center. No more WhatsApp chaos or scattered spreadsheets.</p>
          <div className="auth-stats">
            <div>
              <div className="as-v pos">142</div>
              <div className="as-l">orders this week</div>
            </div>
            <div>
              <div className="as-v">34.3%</div>
              <div className="as-l">avg margin</div>
            </div>
            <div>
              <div className="as-v">3.8x</div>
              <div className="as-l">blended ROAS</div>
            </div>
          </div>
        </div>

        <div className="auth-foot">ops.shinecosmetics.ma - (c) 2026 Shine Cosmetics</div>
      </div>

      <div className="auth-form">
        <div className="auth-card">
          <h2>Welcome back</h2>
          <div className="sub">Sign in to access the operations platform.</div>

          {error ? <div className="auth-error">{error}</div> : null}

          <form onSubmit={handleSubmit} className="auth-fields">
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                className="inp"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                placeholder="email@exemple.com"
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="inp"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                placeholder="********"
              />
            </div>
            <button type="submit" className="gbtn" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="founder-note">
            <Shield />
            <div>
              <div className="fn-t">Founders only</div>
              <div className="fn-s">Access is restricted to whitelisted Shine Cosmetics founder accounts. Other accounts will be denied.</div>
            </div>
          </div>

          <div className="auth-legal">Secured with credentials auth - HTTPS enforced<br />Need access? Contact the other founder.</div>
        </div>
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="auth-loading">Loading...</div>}>
      <SignInForm />
    </Suspense>
  )
}
