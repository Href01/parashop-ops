'use client'

import { useState, useEffect } from 'react'
import { Download, Plus, ArrowUp, ArrowDown } from 'lucide-react'
import Link from 'next/link'

interface DashboardStats {
  revenueToday: number
  revenue7d: number
  revenue30d: number
  weeklyGoal: number
  monthlyGoal: number
  revenueWeek: number
  revenueDelta: number | null
  estimatedProfit: number
  marginPercent: number
  ordersWeek: number
  averageOrderValue: number
  deliveryRate: number
  roas: number
  revenueSeries: Array<{ date: string; label: string; revenue: number; profit: number }>
  topProducts: Array<{ productId: number | null; name: string; units: number; revenue: number }>
  channels: Array<{ name: string; revenue: number; color: string }>
  pipeline: Array<{ label: string; value: number; tone: string }>
  alerts: { total: number; items: Array<{ tone: string; title: string; subtitle: string; href: string }> }
  activity: Array<{ tone: string; title: string; subtitle: string; timestamp: string }>
}

const DAILY_GOAL = 6000
const mad = (v: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v)

const PERIODS: { label: string; days: number }[] = [
  { label: '7j', days: 7 },
  { label: '30j', days: 30 },
  { label: '90j', days: 90 },
  { label: '1 an', days: 365 },
  { label: 'Tout', days: 3650 },
]

export default function GlowDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const periodLabel = PERIODS.find((p) => p.days === days)?.label || `${days}j`
  const [editingGoal, setEditingGoal] = useState<'week' | 'month' | null>(null)
  const [goalInput, setGoalInput] = useState('')

  const saveGoal = async (which: 'week' | 'month') => {
    const v = Math.round(Number(goalInput))
    if (!Number.isFinite(v) || v < 0) { setEditingGoal(null); return }
    const key = which === 'week' ? 'weeklyGoal' : 'monthlyGoal'
    setStats((s) => s ? { ...s, [key]: v } : s)
    setEditingGoal(null)
    await fetch('/api/ops/settings/goal', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: v }) }).catch(() => {})
  }

  useEffect(() => {
    setLoading(true)
    fetch(`/api/ops/dashboard/stats?days=${days}`, { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('fetch'); return r.json() })
      .then((d) => setStats(d))
      .catch((e) => console.error('Failed to fetch stats:', e))
      .finally(() => setLoading(false))
  }, [days])

  if (loading || !stats) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="dash-spin" style={{ display: 'inline-block', width: 30, height: 30, border: '2px solid var(--rose-bright)', borderTopColor: 'transparent', borderRadius: '50%', marginBottom: 14 }} />
          <p style={{ fontSize: 13, color: 'var(--tx-lo)' }}>Chargement…</p>
        </div>
        <style jsx>{`.dash-spin{animation:spin 0.8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  const goalPct = Math.min(Math.round((stats.revenueToday / DAILY_GOAL) * 100), 100)
  const weeklyGoal = stats.weeklyGoal || 42000
  const monthlyGoal = stats.monthlyGoal || 180000
  const goalWeekPct = Math.min(Math.round((stats.revenue7d / weeklyGoal) * 100), 100)
  const goalMonthPct = Math.min(Math.round((stats.revenue30d / monthlyGoal) * 100), 100)
  const series = stats.revenueSeries.slice(-14)
  const revenue14 = series.reduce((s, p) => s + p.revenue, 0)
  const maxRev = Math.max(1, ...series.map((p) => p.revenue))

  const exportCsv = () => {
    const rows = [['date', 'revenue', 'profit'], ...stats.revenueSeries.map((p) => [p.date, String(p.revenue), String(p.profit)])]
    const csv = rows.map((r) => r.join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `shine-dashboard-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  const W = 800, H = 220
  const pts = series.map((p, i) => ({
    x: series.length > 1 ? (i / (series.length - 1)) * W : 0,
    y: H - (p.revenue / maxRev) * (H - 24) - 8,
  }))
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath = pts.length ? `${linePath} L${W},${H} L0,${H} Z` : ''

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ maxWidth: 1480, margin: '0 auto', padding: '24px 24px 60px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 22 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>SHINE COSMETICS · OPÉRATIONS</div>
            <h1 className="serif-display" style={{ fontSize: 34, lineHeight: 1.04 }}>Vue d&apos;ensemble</h1>
            <div style={{ fontSize: 13, color: 'var(--tx-lo)', marginTop: 6 }}>
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Casablanca
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--line-soft)' }}>
              {PERIODS.map((p) => (
                <button key={p.days} onClick={() => setDays(p.days)} style={{
                  fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: days === p.days ? 'var(--rose-bright)' : 'transparent',
                  color: days === p.days ? '#fff' : 'var(--tx-lo)',
                }}>{p.label}</button>
              ))}
            </div>
            <button className="btn-modern btn-secondary" onClick={exportCsv}><Download className="w-4 h-4" />Export</button>
            <Link href="/orders/new" className="btn-modern btn-primary" style={{ textDecoration: 'none' }}><Plus className="w-4 h-4" />Nouvelle commande</Link>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 16 }}>
          <Kpi label={`Chiffre d'affaires · ${periodLabel}`} value={`${mad(stats.revenueWeek)}`} unit="MAD" delta={stats.revenueDelta} accent />
          <Kpi label="Profit estimé" value={mad(stats.estimatedProfit)} unit="MAD" sub={`${stats.marginPercent.toFixed(1)}% marge`} />
          <Kpi label={`Commandes · ${periodLabel}`} value={String(stats.ordersWeek)} />
          <Kpi label="Panier moyen" value={mad(stats.averageOrderValue)} unit="MAD" />
          <Kpi label="Taux de livraison" value={`${stats.deliveryRate.toFixed(0)}%`} />
          <Kpi label="ROAS" value={`${stats.roas.toFixed(1)}x`} />
        </div>

        {/* Chart + goal */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16, marginBottom: 16 }} className="dash-hero">
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div>
                <Label>Chiffre d&apos;affaires · {periodLabel}</Label>
                <div style={{ fontSize: 38, fontWeight: 600, fontFamily: 'var(--mono)', letterSpacing: '-0.02em', color: 'var(--tx-hi)', lineHeight: 1.1 }}>
                  {mad(revenue14)} <span style={{ fontSize: 16, color: 'var(--tx-lo)', fontWeight: 500 }}>MAD</span>
                </div>
              </div>
            </div>
            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ marginTop: 8 }}>
              <defs>
                <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--rose-bright)" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="var(--rose-bright)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0, 1, 2, 3].map((i) => (
                <line key={i} x1="0" y1={(i * H) / 3} x2={W} y2={(i * H) / 3} stroke="var(--line-soft)" strokeWidth="1" strokeDasharray="4,4" />
              ))}
              {areaPath && <path d={areaPath} fill="url(#rev-fill)" />}
              {linePath && <path d={linePath} fill="none" stroke="var(--rose-bright)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
              {pts.length > 0 && <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="4" fill="var(--rose-bright)" />}
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--tx-faint)', fontFamily: 'var(--mono)', marginTop: 4 }}>
              {series.filter((_, i) => i % Math.ceil(series.length / 6 || 1) === 0).map((p, i) => <span key={i}>{p.label}</span>)}
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Label>Objectif de la semaine</Label>
              {editingGoal !== 'week' && (
                <button onClick={() => { setGoalInput(String(weeklyGoal)); setEditingGoal('week') }} title="Modifier l'objectif hebdo" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-lo)', fontSize: 11, padding: 0 }}>✏️ modifier</button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 40, fontWeight: 700, fontFamily: 'var(--mono)', color: goalWeekPct >= 100 ? 'var(--green)' : 'var(--rose-bright)' }}>{goalWeekPct}%</span>
              {editingGoal === 'week' ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 13, color: 'var(--tx-lo)' }}>de</span>
                  <input autoFocus type="number" value={goalInput} onChange={(e) => setGoalInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveGoal('week'); if (e.key === 'Escape') setEditingGoal(null) }}
                    style={{ width: 90, fontSize: 13, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--rose-bright)', background: 'var(--bg-2)', color: 'var(--tx-hi)' }} />
                  <button onClick={() => saveGoal('week')} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, border: 'none', background: 'var(--rose-bright)', color: '#fff', cursor: 'pointer' }}>OK</button>
                </span>
              ) : (
                <span style={{ fontSize: 13, color: 'var(--tx-lo)' }}>de {mad(weeklyGoal)} MAD</span>
              )}
            </div>
            <div style={{ height: 10, borderRadius: 6, background: 'var(--bg-3)', overflow: 'hidden', marginBottom: 6 }}>
              <div style={{ width: `${goalWeekPct}%`, height: '100%', borderRadius: 6, background: goalWeekPct >= 100 ? 'var(--green)' : 'linear-gradient(90deg, var(--rose), var(--rose-bright))' }} />
            </div>
            <p style={{ fontSize: 12, color: 'var(--tx-mid)' }}>
              <b style={{ color: 'var(--tx-hi)' }}>{mad(stats.revenue7d)} MAD</b> encaissés sur 7 jours
            </p>

            {/* Monthly goal */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--tx-mid)' }}>
                  Objectif du mois · <b style={{ color: goalMonthPct >= 100 ? 'var(--green)' : 'var(--tx-hi)' }}>{goalMonthPct}%</b>
                </span>
                {editingGoal === 'month' ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input autoFocus type="number" value={goalInput} onChange={(e) => setGoalInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveGoal('month'); if (e.key === 'Escape') setEditingGoal(null) }}
                      style={{ width: 90, fontSize: 12, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--rose-bright)', background: 'var(--bg-2)', color: 'var(--tx-hi)' }} />
                    <button onClick={() => saveGoal('month')} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, border: 'none', background: 'var(--rose-bright)', color: '#fff', cursor: 'pointer' }}>OK</button>
                  </span>
                ) : (
                  <button onClick={() => { setGoalInput(String(monthlyGoal)); setEditingGoal('month') }} style={{ fontSize: 11, color: 'var(--tx-lo)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>de {mad(monthlyGoal)} MAD ✏️</button>
                )}
              </div>
              <div style={{ height: 7, borderRadius: 4, background: 'var(--bg-3)', overflow: 'hidden' }}>
                <div style={{ width: `${goalMonthPct}%`, height: '100%', borderRadius: 4, background: goalMonthPct >= 100 ? 'var(--green)' : 'var(--rose-bright)' }} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--tx-lo)', marginTop: 4 }}>{mad(stats.revenue30d)} MAD sur 30 jours</p>
            </div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line-soft)', display: 'grid', gap: 10 }}>
              {[
                { label: 'Commandes (7j)', value: String(stats.ordersWeek) },
                { label: 'Panier moyen', value: `${mad(stats.averageOrderValue)} MAD` },
                { label: 'Taux livraison', value: `${stats.deliveryRate.toFixed(0)}%` },
              ].map((m) => (
                <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--tx-lo)' }}>{m.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--tx-hi)' }}>{m.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Top products + channels (real data, previously unused) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <Card>
            <Label>Top produits · 7 jours</Label>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.topProducts.length === 0 ? <Empty /> : stats.topProducts.slice(0, 6).map((p, i) => {
                const max = stats.topProducts[0]?.revenue || 1
                const inner = (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span style={{ color: 'var(--tx-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{p.name}</span>
                      <span style={{ color: 'var(--tx-mid)', whiteSpace: 'nowrap', marginLeft: 8 }}><b style={{ color: 'var(--tx-hi)' }}>{mad(p.revenue)}</b> · {p.units}u</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-3)', overflow: 'hidden' }}>
                      <div style={{ width: `${(p.revenue / max) * 100}%`, height: '100%', background: 'var(--rose-bright)', borderRadius: 3 }} />
                    </div>
                  </>
                )
                return p.productId ? (
                  <Link key={i} href={`/products/${p.productId}`} style={{ textDecoration: 'none' }}>{inner}</Link>
                ) : <div key={i}>{inner}</div>
              })}
            </div>
          </Card>

          <Card>
            <Label>Canaux de vente · 7 jours</Label>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.channels.length === 0 ? <Empty /> : stats.channels.slice(0, 6).map((c, i) => {
                const max = Math.max(...stats.channels.map((x) => x.revenue), 1)
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--tx-hi)' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color || 'var(--rose-bright)' }} />{c.name}
                      </span>
                      <b style={{ color: 'var(--tx-hi)' }}>{mad(c.revenue)} MAD</b>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-3)', overflow: 'hidden' }}>
                      <div style={{ width: `${(c.revenue / max) * 100}%`, height: '100%', background: c.color || 'var(--rose-bright)', borderRadius: 3 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        {/* Pipeline + Alerts + Activity */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 16 }}>
          {/* Pipeline */}
          <Card>
            <Label>Pipeline des commandes · 30 jours</Label>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {stats.pipeline.map((item, i) => {
                const colors: Record<string, string> = { amber: 'var(--amber)', blue: 'var(--blue)', violet: 'var(--violet)', green: 'var(--green)', red: 'var(--red)', rose: 'var(--rose-bright)' }
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--tx-mid)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors[item.tone] || 'var(--tx-lo)' }} />
                      {item.label}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color: colors[item.tone] || 'var(--tx-hi)' }}>{item.value}</span>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Alerts */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Label>Alertes</Label>
              {stats.alerts.total > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'var(--amber-bg)', color: 'var(--amber)' }}>{stats.alerts.total}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.alerts.items.length === 0 ? <Empty /> : stats.alerts.items.slice(0, 3).map((alert, i) => {
                const colors: Record<string, { bg: string; fg: string }> = {
                  amber: { bg: 'var(--amber-bg)', fg: 'var(--amber)' },
                  green: { bg: 'var(--green-bg)', fg: 'var(--green)' },
                  red: { bg: 'var(--red-bg)', fg: 'var(--red)' },
                  rose: { bg: 'var(--rose-bg)', fg: 'var(--rose-bright)' },
                  violet: { bg: '#f3e8ff', fg: '#7c3aed' },
                  blue: { bg: '#dbeafe', fg: '#2563eb' },
                }
                const c = colors[alert.tone] || { bg: 'var(--bg-3)', fg: 'var(--tx-hi)' }
                return (
                  <Link key={i} href={alert.href} style={{ textDecoration: 'none', padding: 10, borderRadius: 8, background: c.bg, border: `1px solid ${c.fg}15` }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: c.fg, marginBottom: 2 }}>{alert.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--tx-mid)' }}>{alert.subtitle}</div>
                  </Link>
                )
              })}
            </div>
          </Card>

          {/* Activity */}
          <Card>
            <Label>Activité récente</Label>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.activity.length === 0 ? <Empty /> : stats.activity.slice(0, 5).map((item, i) => {
                const colors: Record<string, string> = { green: 'var(--green)', blue: 'var(--blue)', amber: 'var(--amber)', red: 'var(--red)', violet: 'var(--violet)', rose: 'var(--rose-bright)' }
                const color = colors[item.tone] || 'var(--tx-lo)'
                return (
                  <div key={i} style={{ paddingBottom: 8, borderBottom: i < stats.activity.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx-hi)', marginBottom: 2 }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--tx-mid)' }}>{item.subtitle}</div>
                    <div style={{ fontSize: 10, color: color, marginTop: 3, fontFamily: 'var(--mono)' }}>
                      {new Date(item.timestamp).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 1100px) { .dash-hero { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)', padding: 18, boxShadow: 'var(--shadow-1)' }}>{children}</div>
}
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--tx-lo)', fontWeight: 600 }}>{children}</div>
}
function Empty() { return <p style={{ fontSize: 13, color: 'var(--tx-faint)', textAlign: 'center', padding: '16px 0' }}>Pas de données.</p> }

function Kpi({ label, value, unit, sub, delta, accent }: { label: string; value: string; unit?: string; sub?: string; delta?: number | null; accent?: boolean }) {
  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius)', padding: 14, boxShadow: 'var(--shadow-1)' }}>
      <div style={{ fontSize: 11, color: 'var(--tx-lo)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-0.01em', color: accent ? 'var(--rose-bright)' : 'var(--tx-hi)' }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: 'var(--tx-faint)' }}>{unit}</span>}
      </div>
      {(delta != null || sub) && (
        <div style={{ marginTop: 6 }}>
          {delta != null ? <DeltaPill value={delta} small /> : <span style={{ fontSize: 11, color: 'var(--tx-faint)' }}>{sub}</span>}
        </div>
      )}
    </div>
  )
}

function DeltaPill({ value, small }: { value: number; small?: boolean }) {
  const up = value >= 0
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, padding: small ? '1px 6px' : '3px 9px', borderRadius: 20,
      fontSize: small ? 10 : 12, fontWeight: 600,
      color: up ? 'var(--green)' : 'var(--red)', background: up ? 'var(--green-bg)' : 'var(--red-bg)',
    }}>
      {up ? <ArrowUp style={{ width: small ? 10 : 12, height: small ? 10 : 12 }} /> : <ArrowDown style={{ width: small ? 10 : 12, height: small ? 10 : 12 }} />}
      {up ? '+' : ''}{value.toFixed(1)}%
    </span>
  )
}
