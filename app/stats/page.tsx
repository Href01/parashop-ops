'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, Send, MousePointerClick, Star, Gift, Clock, AlertCircle } from 'lucide-react'
import BosShell from '@/components/BosShell'

interface Stats {
  period: '7d' | '30d'
  sent: number
  clicked: number
  completed: number
  clickRate: number
  completionRate: number
  totalReviews: number
  avgRating: number
  distribution: number[] // [1★,2★,3★,4★,5★]
  publishedReviews: number
  pendingReviews: number
  rewardsGranted: number
  timeline: Array<{ date: string; sent: number; clicked: number; reviews: number }>
  topProducts: Array<{ productId: number; productName: string; reviewCount: number; avgRating: number }>
}

const pct = (n: number) => `${Math.round((n || 0) * 100)}%`

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [period, setPeriod] = useState<'7d' | '30d'>('7d')

  function load() {
    setLoading(true)
    setError(false)
    return fetch(`/api/ops/stats?period=${period}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (d?.error) setError(true); else setStats(d) })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(false)
    fetch(`/api/ops/stats?period=${period}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (alive) { if (d?.error) setError(true); else setStats(d) } })
      .catch(() => { if (alive) setError(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [period])

  return (
    <BosShell active="customers" title="Statistiques" crumb="Analytics / Avis">
      <div style={{ padding: '22px 24px 60px', maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
          <div>
            <h1 className="serif-display" style={{ fontSize: 26, lineHeight: 1.1, color: 'var(--tx-hi)', marginBottom: 6 }}>
              Analytics Avis
            </h1>
            <p style={{ fontSize: 13.5, color: 'var(--tx-lo)' }}>
              Performance des demandes d'avis WhatsApp — du premier envoi à l'avis publié
            </p>
          </div>
          <div className="filter-strip">
            {(['7d', '30d'] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`btn-modern btn-sm ${period === p ? 'btn-primary' : ''}`}>
                {p === '7d' ? '7 jours' : '30 jours'}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <AlertCircle style={{ width: 38, height: 38, margin: '0 auto 12px', color: 'var(--red)' }} />
            <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--tx-hi)', marginBottom: 4 }}>Impossible de charger les statistiques</p>
            <p style={{ fontSize: 13, color: 'var(--tx-lo)', marginBottom: 16 }}>Une erreur est survenue côté serveur.</p>
            <button onClick={() => load()} className="btn-modern btn-secondary btn-sm" style={{ display: 'inline-flex' }}>
              Réessayer
            </button>
          </div>
        ) : loading || !stats ? (
          <Skeleton />
        ) : (
          <>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
              <Kpi Icon={Send} color="var(--blue)" bg="var(--blue-bg)" label="Envoyées"
                value={String(stats.sent)} sub={`sur ${period === '7d' ? '7 jours' : '30 jours'}`} />
              <Kpi Icon={MousePointerClick} color="var(--green)" bg="var(--green-bg)" label="Clics"
                value={String(stats.clicked)} sub={`${pct(stats.clickRate)} taux de clic`} />
              <Kpi Icon={Gift} color="var(--rose-bright)" bg="var(--rose-bg)" label="Avis · 50 DH"
                value={String(stats.completed)} sub={`${pct(stats.completionRate)} conversion`} />
              <Kpi Icon={Star} color="var(--amber)" bg="var(--amber-bg)" label="Note moyenne"
                value={stats.totalReviews > 0 ? `${stats.avgRating.toFixed(1)}★` : '—'} sub={`${stats.totalReviews} avis sur la période`} />
            </div>

            {/* Trend chart */}
            <div className="card" style={{ padding: 22, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)' }}>Tendance</h2>
                <div style={{ display: 'flex', gap: 16 }}>
                  {[['Envoyées', 'var(--blue)'], ['Clics', 'var(--green)'], ['Avis', 'var(--amber)']].map(([l, c]) => (
                    <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--tx-lo)' }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: c }} /> {l}
                    </span>
                  ))}
                </div>
              </div>
              <TrendChart timeline={stats.timeline} />
            </div>

            {/* Funnel */}
            <div className="card" style={{ padding: 22, marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 16 }}>Entonnoir de conversion</h2>
              <div style={{ display: 'grid', gap: 14 }}>
                {(() => {
                  // Guard: a funnel can only narrow. Clamp each step to the previous.
                  const sent = stats.sent
                  const clicked = Math.min(stats.clicked, sent)
                  const completed = Math.min(stats.completed, clicked)
                  const steps = [
                    { label: 'Demandes envoyées', count: stats.sent, frac: 1, color: 'var(--blue)' },
                    { label: 'Clics sur le lien', count: stats.clicked, frac: sent > 0 ? clicked / sent : 0, color: 'var(--green)' },
                    { label: 'Avis complétés (50 DH)', count: stats.completed, frac: sent > 0 ? completed / sent : 0, color: 'var(--amber)' },
                  ]
                  return steps.map((s) => (
                    <div key={s.label}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx-mid)' }}>{s.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx-hi)' }}>
                          {s.count} <span style={{ color: 'var(--tx-lo)', fontWeight: 600 }}>({pct(s.frac)})</span>
                        </span>
                      </div>
                      <div style={{ height: 10, background: 'var(--bg-2)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.max(s.frac * 100, s.count > 0 ? 2 : 0)}%`, background: s.color, borderRadius: 999, transition: 'width .5s ease' }} />
                      </div>
                    </div>
                  ))
                })()}
              </div>
            </div>

            {/* Distribution + Top products */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {/* Rating distribution */}
              <div className="card" style={{ padding: 22 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 16 }}>Répartition des notes</h2>
                {stats.totalReviews === 0 ? (
                  <EmptyMini icon={<Star />} text="Aucun avis sur la période" />
                ) : (
                  <div style={{ display: 'grid', gap: 9 }}>
                    {[5, 4, 3, 2, 1].map((star) => {
                      const n = stats.distribution[star - 1] || 0
                      const frac = stats.totalReviews > 0 ? n / stats.totalReviews : 0
                      return (
                        <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 600, color: 'var(--tx-mid)', width: 28 }}>
                            {star}<Star style={{ width: 11, height: 11, fill: 'var(--amber)', stroke: 'var(--amber)' }} />
                          </span>
                          <div style={{ flex: 1, height: 8, background: 'var(--bg-2)', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${frac * 100}%`, background: 'var(--amber)', borderRadius: 999 }} />
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--tx-lo)', width: 22, textAlign: 'right' }}>{n}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Top products */}
              <div className="card" style={{ padding: 22 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 16 }}>Top produits avisés</h2>
                {stats.topProducts.length === 0 ? (
                  <EmptyMini icon={<Star />} text="Aucun avis publié" />
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {stats.topProducts.map((p, idx) => {
                      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null
                      return (
                        <div key={p.productId ?? idx} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: medal ? 15 : 12, fontWeight: 700, color: 'var(--tx-mid)' }}>
                            {medal || `#${idx + 1}`}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{p.productName}</p>
                            <span style={{ fontSize: 11.5, color: 'var(--tx-lo)' }}>{p.reviewCount} avis</span>
                          </div>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600, color: 'var(--amber)', flexShrink: 0 }}>
                            <Star style={{ width: 12, height: 12, fill: 'var(--amber)', stroke: 'var(--amber)' }} />
                            {p.avgRating.toFixed(1)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Secondary stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <MiniStat Icon={Gift} color="var(--rose-bright)" label="Récompenses 50 DH accordées" value={String(stats.rewardsGranted)} />
              <MiniStat Icon={Clock} color="var(--amber)" label="Avis en attente de modération" value={String(stats.pendingReviews)} />
              <MiniStat Icon={Star} color="var(--green)" label="Avis publiés (boutique)" value={String(stats.publishedReviews)} />
            </div>
          </>
        )}
      </div>
    </BosShell>
  )
}

/* ---------- Sub-components ---------- */

function Kpi({ Icon, color, bg, label, value, sub }: { Icon: typeof Send; color: string; bg: string; label: string; value: string; sub: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon style={{ width: 19, height: 19, color }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11.5, color: 'var(--tx-lo)' }}>{label}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--tx-hi)', lineHeight: 1.1 }}>{value}</div>
        </div>
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color }}>{sub}</div>
    </div>
  )
}

function MiniStat({ Icon, color, label, value }: { Icon: typeof Send; color: string; label: string; value: string }) {
  return (
    <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon style={{ width: 18, height: 18, color }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--tx-hi)', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11.5, color: 'var(--tx-lo)', marginTop: 3 }}>{label}</div>
      </div>
    </div>
  )
}

function EmptyMini({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <div style={{ width: 34, height: 34, margin: '0 auto 8px', color: 'var(--tx-faint)', opacity: 0.55 }}>{icon}</div>
      <p style={{ fontSize: 13, color: 'var(--tx-faint)' }}>{text}</p>
    </div>
  )
}

function Skeleton() {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card" style={{ padding: 16, height: 96 }}>
            <div className="skeleton-line" style={{ width: '60%', marginBottom: 10 }} />
            <div className="skeleton-line" style={{ width: '40%', height: 22 }} />
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 22, marginBottom: 16, height: 220 }}>
        <div className="skeleton-line" style={{ width: '20%', marginBottom: 18 }} />
        <div className="skeleton-line" style={{ width: '100%', height: 140 }} />
      </div>
    </>
  )
}

/* Multi-series line chart (sent / clicked / reviews) over the period. */
function TrendChart({ timeline }: { timeline: Stats['timeline'] }) {
  const W = 820, H = 180, padB = 22, padT = 8
  const data = timeline.length ? timeline : [{ date: '', sent: 0, clicked: 0, reviews: 0 }]
  const max = Math.max(1, ...data.map((d) => Math.max(d.sent, d.clicked, d.reviews)))
  const xy = (i: number, v: number) => ({
    x: data.length > 1 ? (i / (data.length - 1)) * W : W / 2,
    y: padT + (1 - v / max) * (H - padB - padT),
  })
  const line = (key: 'sent' | 'clicked' | 'reviews') =>
    data.map((d, i) => { const p = xy(i, d[key]); return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}` }).join(' ')

  const series: Array<{ key: 'sent' | 'clicked' | 'reviews'; color: string }> = [
    { key: 'sent', color: 'var(--blue)' },
    { key: 'clicked', color: 'var(--green)' },
    { key: 'reviews', color: 'var(--amber)' },
  ]
  const labelEvery = Math.ceil(data.length / 7) || 1

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      {[0, 1, 2, 3].map((i) => (
        <line key={i} x1="0" y1={padT + (i / 3) * (H - padB - padT)} x2={W} y2={padT + (i / 3) * (H - padB - padT)}
          stroke="var(--line-soft)" strokeWidth="1" strokeDasharray="4,4" />
      ))}
      {series.map((s) => (
        <path key={s.key} d={line(s.key)} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {series.map((s) => data.map((d, i) => {
        const p = xy(i, d[s.key])
        return d[s.key] > 0 ? <circle key={`${s.key}-${i}`} cx={p.x} cy={p.y} r="3.5" fill={s.color} /> : null
      }))}
      {data.map((d, i) => i % labelEvery === 0 && d.date ? (
        <text key={`t-${i}`} x={xy(i, 0).x} y={H - 4} textAnchor="middle" fontSize="9.5" fill="var(--tx-faint)" fontFamily="var(--mono)">
          {d.date.slice(5)}
        </text>
      ) : null)}
    </svg>
  )
}
