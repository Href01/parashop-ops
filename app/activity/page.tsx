'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import BosShell from '@/components/BosShell'
import { Activity } from 'lucide-react'

type Ev = { id: string; type: string; icon: string; title: string; sub: string; actor: string | null; at: string }

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'Tout' }, { key: 'order', label: 'Commandes' }, { key: 'price', label: 'Prix' },
  { key: 'stock', label: 'Stock' }, { key: 'lead', label: 'Leads' }, { key: 'waitlist', label: 'Liste d\'attente' },
]
const TONE: Record<string, string> = { order: 'var(--green)', price: 'var(--rose-bright)', stock: 'var(--blue, #2563eb)', lead: 'var(--amber)', waitlist: 'var(--amber)' }

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 45) return "à l'instant"
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function ActivityPage() {
  const [events, setEvents] = useState<Ev[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [, force] = useState(0)
  const seen = useRef<Set<string>>(new Set())
  const [fresh, setFresh] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/ops/activity', { cache: 'no-store' })
      if (!r.ok) return
      const d = await r.json()
      const list: Ev[] = d.events || []
      // Mark newly-arrived events for a subtle highlight.
      const isFirst = seen.current.size === 0
      const newOnes = new Set<string>()
      for (const e of list) { if (!seen.current.has(e.id)) { seen.current.add(e.id); if (!isFirst) newOnes.add(e.id) } }
      if (newOnes.size) { setFresh(newOnes); setTimeout(() => setFresh(new Set()), 2500) }
      setEvents(list)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, 7000)
    const tick = setInterval(() => force((n) => n + 1), 30000) // refresh relative times
    return () => { clearInterval(t); clearInterval(tick) }
  }, [load])

  const shown = filter === 'all' ? events : events.filter((e) => e.type === filter)

  return (
    <BosShell active="activity" title="Activité" crumb="Aperçu">
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '22px 24px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div className="eyebrow">APERÇU</div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 800, color: 'var(--green)' }}>
            <span className="act-pulse" /> LIVE
          </span>
        </div>
        <h1 className="serif-display" style={{ fontSize: 28, lineHeight: 1.05 }}>Activité</h1>
        <p style={{ fontSize: 13, color: 'var(--tx-mid)', marginTop: 7, maxWidth: 620, lineHeight: 1.55 }}>
          Tout ce qui se passe dans le business, en direct : commandes, changements de prix, mouvements de stock, leads et inscriptions liste d&apos;attente.
        </p>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '16px 0 18px' }}>
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`btn-modern btn-sm ${filter === f.key ? 'btn-primary' : 'btn-subtle'}`}>{f.label}</button>
          ))}
        </div>

        {loading ? (
          <div className="card-modern" style={{ padding: 22 }}><div className="skeleton-line" style={{ width: '45%', height: 12 }} /></div>
        ) : shown.length === 0 ? (
          <div className="card-modern" style={{ padding: 40, textAlign: 'center' }}>
            <Activity style={{ width: 30, height: 30, color: 'var(--tx-faint)', margin: '0 auto 10px' }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-mid)', margin: 0 }}>Rien pour l&apos;instant</p>
          </div>
        ) : (
          <div className="act-feed">
            {shown.map((e) => (
              <div key={e.id} className={`act-row${fresh.has(e.id) ? ' fresh' : ''}`}>
                <span className="act-ico" style={{ background: (TONE[e.type] || 'var(--tx-faint)') + '1a' }}>{e.icon}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="act-title">{e.title}</div>
                  <div className="act-sub">{e.sub}{e.actor ? <> · <b style={{ color: 'var(--tx-mid)' }}>{e.actor}</b></> : null}</div>
                </div>
                <span className="act-time">{ago(e.at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .act-pulse { width: 7px; height: 7px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 0 rgba(22,163,74,.5); animation: actpulse 1.8s infinite; }
        @keyframes actpulse { 0% { box-shadow: 0 0 0 0 rgba(22,163,74,.5); } 70% { box-shadow: 0 0 0 6px rgba(22,163,74,0); } 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0); } }
        .act-feed { display: flex; flex-direction: column; }
        .act-row { display: flex; align-items: center; gap: 12px; padding: 11px 4px; border-bottom: 1px solid var(--line-soft); border-radius: 8px; transition: background .3s; }
        .act-row.fresh { background: var(--green-bg, #e7f7ef); animation: actin .4s cubic-bezier(.16,1,.3,1); }
        @keyframes actin { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
        .act-ico { flex-shrink: 0; width: 34px; height: 34px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; font-size: 16px; }
        .act-title { font-size: 13.5px; font-weight: 700; color: var(--tx-hi); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .act-sub { font-size: 11.5px; color: var(--tx-lo); margin-top: 1px; }
        .act-time { flex-shrink: 0; font-size: 11px; color: var(--tx-faint); white-space: nowrap; }
        @media (prefers-reduced-motion: reduce) { .act-pulse, .act-row.fresh { animation: none; } }
      `}</style>
    </BosShell>
  )
}
