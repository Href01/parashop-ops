'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import BosShell from '@/components/BosShell'
import { Users } from 'lucide-react'

// BlockNote is client-only (no SSR).
const Editor = dynamic(() => import('./Editor'), {
  ssr: false,
  loading: () => <div className="card-modern" style={{ padding: 24, minHeight: 420 }}><div className="skeleton-line" style={{ width: '35%', height: 14 }} /></div>,
})

type Cfg = { url: string; token: string; user: { name: string; email: string } } | null

export default function WorkspacePage() {
  const [cfg, setCfg] = useState<Cfg>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch('/api/ops/realtime-token', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('auth'))))
      .then((d) => {
        if (!d.url || !d.token) { setErr('config'); return }
        setCfg(d)
      })
      .catch(() => setErr('auth'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <BosShell active="workspace" title="Espace collaboratif" crumb="Équipe">
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '14px 18px 24px' }}>
        {loading ? (
          <div className="card-modern" style={{ padding: 24, minHeight: 200 }}><div className="skeleton-line" style={{ width: '30%', height: 14 }} /></div>
        ) : err === 'config' ? (
          <div className="card-modern" style={{ padding: 26, borderLeft: '3px solid var(--amber)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Users style={{ width: 20, height: 20, color: 'var(--amber)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 6 }}>Serveur temps-réel non configuré</div>
              <p className="fs13 tx-mid" style={{ margin: 0, lineHeight: 1.6 }}>
                Ajoute <b>NEXT_PUBLIC_REALTIME_URL</b> (ex. <code>wss://shine-realtime.onrender.com</code>) et <b>REALTIME_TOKEN</b> dans Vercel (projet ops), puis redéploie.
              </p>
            </div>
          </div>
        ) : err ? (
          <div className="card-modern" style={{ padding: 24, borderLeft: '3px solid var(--red, #dc2626)' }}>
            <p className="fs13 tx-mid" style={{ margin: 0 }}>Accès non autorisé. Reconnecte-toi au BOS.</p>
          </div>
        ) : cfg ? (
          <Editor url={cfg.url} token={cfg.token} docName="page:1" user={cfg.user} />
        ) : null}
      </div>
    </BosShell>
  )
}
