'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function Gate() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/'
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || loading) return
    setLoading(true); setError(false)
    try {
      const res = await fetch('/api/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) throw new Error('bad')
      router.replace(next)
    } catch {
      setError(true); setShake(true); setPassword('')
      setTimeout(() => setShake(false), 500)
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      background: 'radial-gradient(1200px 600px at 50% -10%, #2a1b22 0%, #140f12 55%, #0c090b 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        width: 'min(380px, 100%)', background: 'rgba(28,20,24,0.7)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 22, padding: '40px 32px', boxShadow: '0 30px 80px rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)',
        transform: shake ? 'translateX(0)' : undefined, animation: shake ? 'gshake 0.45s' : undefined,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, margin: '0 auto 20px', display: 'grid', placeItems: 'center',
          background: 'linear-gradient(135deg, #e84a7f, #c0365f)', boxShadow: '0 10px 30px rgba(232,74,127,0.35)',
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <h1 style={{ textAlign: 'center', color: '#fff', fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
          Shine <span style={{ color: '#e84a7f' }}>BOS</span>
        </h1>
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: '6px 0 26px' }}>
          Accès réservé · entre le mot de passe
        </p>

        <form onSubmit={submit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            placeholder="Mot de passe d'accès"
            style={{
              width: '100%', padding: '13px 16px', fontSize: 15, borderRadius: 12, color: '#fff',
              background: 'rgba(255,255,255,0.06)', outline: 'none',
              border: `1px solid ${error ? '#e84a7f' : 'rgba(255,255,255,0.12)'}`,
              boxSizing: 'border-box', transition: 'border-color 0.2s',
            }}
          />
          {error && <p style={{ color: '#ff8aa8', fontSize: 12, margin: '10px 2px 0' }}>Mot de passe incorrect.</p>}
          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: '100%', marginTop: 16, padding: '13px', fontSize: 15, fontWeight: 600, color: '#fff',
              border: 'none', borderRadius: 12, cursor: loading || !password ? 'not-allowed' : 'pointer',
              background: loading || !password ? 'rgba(232,74,127,0.4)' : 'linear-gradient(135deg, #e84a7f, #c0365f)',
              transition: 'opacity 0.2s',
            }}
          >
            {loading ? '…' : 'Entrer'}
          </button>
        </form>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 11, marginTop: 22 }}>
          🔒 Shine Cosmetics · Espace opérations
        </p>
      </div>

      <style>{`@keyframes gshake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}`}</style>
    </div>
  )
}

export default function GatePage() {
  return <Suspense fallback={null}><Gate /></Suspense>
}
