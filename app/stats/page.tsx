'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, Send, MousePointerClick, Star } from 'lucide-react'
import BosShell from '@/components/BosShell'

interface Stats {
  // Totals
  totalSent: number
  totalClicked: number
  totalReviews: number
  totalCustomers: number

  // Rates
  clickRate: number
  reviewRate: number
  conversionRate: number

  // Recent (7 days)
  recentSent: number
  recentClicked: number
  recentReviews: number

  // Top products
  topProducts: Array<{
    productId: number
    productName: string
    reviewCount: number
    avgRating: number
  }>

  // Timeline (30 days)
  timeline: Array<{
    date: string
    sent: number
    clicked: number
    reviews: number
  }>
}

const KPIS = [
  { key: 'sent', label: 'Envoyées', Icon: Send, color: 'var(--blue)', bg: 'var(--blue-bg)' },
  { key: 'clicked', label: 'Clics', Icon: MousePointerClick, color: 'var(--green)', bg: 'var(--green-bg)' },
  { key: 'reviews', label: 'Avis laissés', Icon: Star, color: 'var(--amber)', bg: 'var(--amber-bg)' },
  { key: 'conversion', label: 'Conversion', Icon: TrendingUp, color: 'var(--violet)', bg: 'var(--violet-bg)' },
] as const

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'7d' | '30d'>('7d')

  useEffect(() => {
    fetchStats()
  }, [period])

  async function fetchStats() {
    try {
      const res = await fetch(`/api/ops/stats?period=${period}`)
      const data = await res.json()
      setStats(data)
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatPercent = (n: number) => `${Math.round(n * 100)}%`

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
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {(['7d', '30d'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)} className="btn-modern btn-sm"
                style={{
                  background: period === p ? 'var(--green)' : 'var(--bg-2)',
                  color: period === p ? '#fff' : 'var(--tx-mid)',
                  border: 'none', padding: '6px 14px', fontSize: 13,
                }}>
                {p === '7d' ? '7 jours' : '30 jours'}
              </button>
            ))}
          </div>
        </div>

        {loading || !stats ? (
          /* Skeleton */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="card" style={{ padding: 16, height: 96 }}>
                <div className="skeleton-line" style={{ width: '60%', marginBottom: 10 }} />
                <div className="skeleton-line" style={{ width: '40%', height: 22 }} />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
              {KPIS.map(kpi => {
                const value =
                  kpi.key === 'sent' ? stats.totalSent :
                  kpi.key === 'clicked' ? stats.totalClicked :
                  kpi.key === 'reviews' ? stats.totalReviews :
                  formatPercent(stats.conversionRate)
                const sub =
                  kpi.key === 'sent' ? `${stats.recentSent} sur ${period === '7d' ? '7j' : '30j'}` :
                  kpi.key === 'clicked' ? `${formatPercent(stats.clickRate)} taux de clic` :
                  kpi.key === 'reviews' ? `${formatPercent(stats.reviewRate)} taux d'avis` :
                  'Envoi → Avis'
                return (
                  <div key={kpi.key} className="card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <kpi.Icon style={{ width: 19, height: 19, color: kpi.color }} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, color: 'var(--tx-lo)' }}>{kpi.label}</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--tx-hi)', lineHeight: 1.1 }}>{value}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: kpi.color }}>{sub}</div>
                  </div>
                )
              })}
            </div>

            {/* Funnel */}
            <div className="card" style={{ padding: 22, marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 16 }}>
                Entonnoir de conversion
              </h2>
              <div style={{ display: 'grid', gap: 14 }}>
                {[
                  { label: 'Demandes envoyées', count: stats.totalSent, pct: 1, color: 'var(--blue)' },
                  { label: 'Clics sur le lien', count: stats.totalClicked, pct: stats.clickRate, color: 'var(--green)' },
                  { label: 'Avis complétés', count: stats.totalReviews, pct: stats.reviewRate, color: 'var(--amber)' },
                ].map(step => (
                  <div key={step.label}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx-mid)' }}>{step.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx-hi)' }}>
                        {step.count} <span style={{ color: 'var(--tx-lo)', fontWeight: 600 }}>({formatPercent(step.pct)})</span>
                      </span>
                    </div>
                    <div style={{ height: 10, background: 'var(--bg-2)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(step.pct * 100, 2)}%`, background: step.color, borderRadius: 999, transition: 'width .5s ease' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Products */}
            <div className="card" style={{ padding: 22 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 16 }}>
                Top produits avisés
              </h2>
              {stats.topProducts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '28px 0' }}>
                  <Star style={{ width: 36, height: 36, margin: '0 auto 10px', color: 'var(--tx-faint)', opacity: 0.5 }} />
                  <p style={{ fontSize: 13.5, color: 'var(--tx-faint)' }}>Aucun avis pour le moment</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {stats.topProducts.map((p, idx) => {
                    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null
                    return (
                      <div key={p.productId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: medal ? 16 : 13, fontWeight: 700, color: 'var(--tx-mid)' }}>
                          {medal || `#${idx + 1}`}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--tx-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{p.productName}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2 }}>
                            <span style={{ fontSize: 11.5, color: 'var(--tx-lo)' }}>{p.reviewCount} avis</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 600, color: 'var(--amber)' }}>
                              <Star style={{ width: 12, height: 12, fill: 'var(--amber)', stroke: 'var(--amber)' }} />
                              {p.avgRating.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </BosShell>
  )
}
