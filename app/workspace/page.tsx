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
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '22px 24px 60px' }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>ÉQUIPE</div>
        <h1 className="serif-display" style={{ fontSize: 28, lineHeight: 1.05 }}>Notes de l&apos;équipe</h1>
        <p style={{ fontSize: 13, color: 'var(--tx-mid)', marginTop: 7, maxWidth: 680, lineHeight: 1.55 }}>
          Un espace <b>partagé en temps réel</b> : écrivez à plusieurs, les modifications et les curseurs de chacun apparaissent en direct. Titres, listes, <b>tableaux</b>, images, liens — tapez « / » pour insérer un bloc.
        </p>

        <div style={{ marginTop: 20 }}>
          {loading ? (
            <div className="card-modern" style={{ padding: 24 }}><div className="skeleton-line" style={{ width: '35%', height: 14 }} /></div>
          ) : err === 'config' ? (
            <div className="card-modern" style={{ padding: 24, borderLeft: '3px solid var(--amber)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 6 }}>Serveur temps-réel non configuré</div>
              <p className="fs13 tx-mid" style={{ margin: 0, lineHeight: 1.6 }}>
                Ajoute les variables <b>NEXT_PUBLIC_REALTIME_URL</b> (ex. <code>wss://shine-realtime.onrender.com</code>) et <b>REALTIME_TOKEN</b> dans Vercel (projet ops), puis redéploie.
              </p>
            </div>
          ) : err ? (
            <div className="card-modern" style={{ padding: 24, borderLeft: '3px solid var(--red)' }}>
              <p className="fs13 tx-mid" style={{ margin: 0 }}>Accès non autorisé. Reconnecte-toi au BOS.</p>
            </div>
          ) : cfg ? (
            <Editor url={cfg.url} token={cfg.token} docName="page:1" user={cfg.user} />
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, fontSize: 11.5, color: 'var(--tx-faint)' }}>
          <Users style={{ width: 13, height: 13 }} /> Ouvre cette page sur un autre appareil / avec l&apos;autre fondateur pour voir la collaboration en direct.
        </div>
      </div>
    </BosShell>
  )
}
