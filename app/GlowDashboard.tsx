'use client'

import { useState, useEffect } from 'react'
import { Download, Plus, ArrowUp, ArrowDown, RefreshCw, Trash2 } from 'lucide-react'
import Link from 'next/link'

interface DashboardStats {
  revenueToday: number
  revenue7d: number
  revenue30d: number
  revenueWeekTotal: number
  weeklyGoal: number
  monthlyGoal: number
  revenueWeek: number
  revenueDelivered: number
  revenueDeliveredTotal: number
  revenueDeliveredDelta: number | null
  profitDelivered: number
  marginDelivered: number
  cashReceivedDelivered: number
  deliveryCostDelivered: number
  // Realized cash — delivered metrics attributed by DELIVERY date (reconciles with Sendit).
  realized: {
    revenue: number
    encaisse: number
    cash: number
    profit: number
    margin: number
    orders: number
    revenueDelta: number | null
  }
  pnl?: {
    rentabilite: { caLivre: number; profitLivre: number; margeLivree: number; pub: number; emballage: number; net: number; marginPct: number }
    tresorerie: { encaisse: number; achats: number; pub: number; frais: number; net: number }
    packagingRate: number
    deliveredParcels: number
  }
  revenueDelta: number | null
  estimatedProfit: number
  marginPercent: number
  ordersWeek: number
  ordersDelivered: number
  averageOrderValue: number
  deliveryRate: number
  roas: number
  revenueSeries: Array<{ date: string; label: string; revenue: number; profit: number; orders: number }>
  topProducts: Array<{ productId: number | null; name: string; units: number; revenue: number }>
  topCities: Array<{ name: string; orders: number }>
  channels: Array<{ name: string; revenue: number; color: string }>
  pipeline: Array<{ label: string; value: number; tone: string }>
  alerts: { total: number; items: Array<{ tone: string; title: string; subtitle: string; href: string }> }
  activity: Array<{ tone: string; title: string; subtitle: string; timestamp: string }>
}

const mad = (v: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v)

const PERIODS: { label: string; days: number }[] = [
  { label: '7j', days: 7 },
  { label: '30j', days: 30 },
  { label: '90j', days: 90 },
  { label: '1 an', days: 365 },
  { label: 'Tout', days: 3650 },
]
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const isoDay = (d: Date) => d.toISOString().slice(0, 10)
function monthRange(year: number, m0: number) {
  return {
    from: isoDay(new Date(Date.UTC(year, m0, 1))), to: isoDay(new Date(Date.UTC(year, m0 + 1, 0))),
    compareFrom: isoDay(new Date(Date.UTC(year, m0 - 1, 1))), compareTo: isoDay(new Date(Date.UTC(year, m0, 0))),
  }
}
function isoWeekMonday(year: number, week: number) {
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const wk1 = new Date(jan4); wk1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7))
  const mon = new Date(wk1); mon.setUTCDate(wk1.getUTCDate() + (week - 1) * 7)
  return mon
}
function weekRange(year: number, week: number) {
  const mon = isoWeekMonday(year, week)
  const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6)
  const pMon = new Date(mon); pMon.setUTCDate(mon.getUTCDate() - 7)
  const pSun = new Date(mon); pSun.setUTCDate(mon.getUTCDate() - 1)
  return { from: isoDay(mon), to: isoDay(sun), compareFrom: isoDay(pMon), compareTo: isoDay(pSun) }
}
function getISOWeek(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7) + 3)
  const firstThu = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((date.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7)
  return { year: date.getUTCFullYear(), week }
}

export default function GlowDashboard() {
  const now = new Date()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [mode, setMode] = useState<'rolling' | 'month' | 'week'>('month')
  const [days, setDays] = useState(30)
  const [month, setMonth] = useState({ year: now.getFullYear(), m: now.getMonth() })
  const iw = getISOWeek(now)
  const [week, setWeek] = useState({ year: iw.year, w: iw.week })
  const [editingGoal, setEditingGoal] = useState<'week' | 'month' | null>(null)
  const [goalInput, setGoalInput] = useState('')
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null)
  // Accounting basis for the delivered/cash cards: 'delivered' = by delivery date
  // (réalisé, reconciles with Sendit) · 'created' = by order-creation date (cohorte).
  const [basis, setBasis] = useState<'delivered' | 'created'>('delivered')
  // Operating expenses module (packaging, cartons, external ads, misc) + packaging rate.
  const [showExpenses, setShowExpenses] = useState(false)
  const [expenses, setExpenses] = useState<{ expenses: Array<{ id: number; date: string; category: string; label: string | null; amount: number }>; summary: { total: number; byCategory: Array<{ category: string; total: number; n: number }> }; packagingRate: number } | null>(null)
  const [expForm, setExpForm] = useState({ date: '', category: 'Emballage', label: '', amount: '' })
  const [rateInput, setRateInput] = useState('')
  const [savingExp, setSavingExp] = useState(false)

  // Labels for the current selection + comparison
  const periodLabel = mode === 'month' ? `${MONTHS_FR[month.m]} ${month.year}`
    : mode === 'week' ? `S${week.w} ${week.year}`
    : (PERIODS.find((p) => p.days === days)?.label || `${days}j`)
  const compareLabel = mode === 'month' ? 'mois préc.' : mode === 'week' ? 'sem. préc.' : 'période préc.'

  const saveGoal = async (which: 'week' | 'month') => {
    const v = Math.round(Number(goalInput))
    if (!Number.isFinite(v) || v < 0) { setEditingGoal(null); return }
    const key = which === 'week' ? 'weeklyGoal' : 'monthlyGoal'
    setStats((s) => s ? { ...s, [key]: v } : s)
    setEditingGoal(null)
    await fetch('/api/ops/settings/goal', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: v }) }).catch(() => {})
  }

  function load() {
    let qs = `days=${days}`
    if (mode === 'month') { const r = monthRange(month.year, month.m); qs = `from=${r.from}&to=${r.to}&compareFrom=${r.compareFrom}&compareTo=${r.compareTo}` }
    else if (mode === 'week') { const r = weekRange(week.year, week.w); qs = `from=${r.from}&to=${r.to}&compareFrom=${r.compareFrom}&compareTo=${r.compareTo}` }
    setLoading(true)
    setError(false)
    return fetch(`/api/ops/dashboard/stats?${qs}`, { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('fetch'); return r.json() })
      .then((d) => { setStats(d); setLastUpdated(new Date()) })
      .catch((e) => { console.error('Failed to fetch stats:', e); setError(true) })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, days, month, week])

  // Current selected period as {from,to} — reused for the expenses module.
  const periodParams = () => {
    if (mode === 'month') { const r = monthRange(month.year, month.m); return { from: r.from, to: r.to } }
    if (mode === 'week') { const r = weekRange(week.year, week.w); return { from: r.from, to: r.to } }
    const to = isoDay(now); const f = new Date(now); f.setDate(f.getDate() - (days - 1)); return { from: isoDay(f), to }
  }
  const loadExpenses = async () => {
    const { from, to } = periodParams()
    const res = await fetch(`/api/ops/expenses?from=${from}&to=${to}`, { cache: 'no-store' })
    if (res.ok) { const d = await res.json(); setExpenses(d); setRateInput(String(d.packagingRate || '')) }
  }
  const openExpenses = () => { setShowExpenses(true); loadExpenses() }
  const addExpense = async () => {
    if (!(Number(expForm.amount) > 0)) return
    setSavingExp(true)
    try {
      const res = await fetch('/api/ops/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(expForm) })
      if (!res.ok) throw new Error()
      setExpForm({ date: '', category: 'Emballage', label: '', amount: '' })
      await Promise.all([loadExpenses(), load()])
    } catch { alert("Échec de l'ajout") } finally { setSavingExp(false) }
  }
  const deleteExpense = async (id: number) => {
    await fetch(`/api/ops/expenses/${id}`, { method: 'DELETE' })
    await Promise.all([loadExpenses(), load()])
  }
  const saveRate = async () => {
    await fetch('/api/ops/expenses', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packagingRate: Number(rateInput) || 0 }) })
    await Promise.all([loadExpenses(), load()])
  }

  if (error && !stats) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 38, marginBottom: 10 }}>⚠️</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx-hi)', marginBottom: 4 }}>Impossible de charger le tableau de bord</p>
          <p style={{ fontSize: 13, color: 'var(--tx-lo)', marginBottom: 16 }}>Une erreur est survenue côté serveur.</p>
          <button onClick={() => load()} className="btn-modern btn-secondary" style={{ display: 'inline-flex' }}>Réessayer</button>
        </div>
      </div>
    )
  }

  if (loading || !stats) {
    return <DashboardSkeleton />
  }

  const weeklyGoal = stats.weeklyGoal || 42000
  const monthlyGoal = stats.monthlyGoal || 180000
  // Goals follow the selected period: in week/month mode the progress is that
  // exact week/month's CA; otherwise the rolling last-7d / last-30d.
  const weekRevenue = mode === 'week' ? stats.revenueWeek : stats.revenue7d
  const monthRevenue = mode === 'month' ? stats.revenueWeek : stats.revenue30d
  const weekGoalTitle = mode === 'week' ? `Objectif semaine S${week.w}` : 'Objectif de la semaine'
  const monthGoalTitle = mode === 'month' ? `Objectif ${MONTHS_FR[month.m]}` : 'Objectif du mois'
  const goalWeekPct = Math.min(Math.round((weekRevenue / weeklyGoal) * 100), 100)
  const goalMonthPct = Math.min(Math.round((monthRevenue / monthlyGoal) * 100), 100)
  // Plot the full selected period (was truncated to 14 points, which made the
  // curve lie in Mois/90j/1 an mode). Cap dot density for very long ranges.
  const series = stats.revenueSeries
  const maxRev = Math.max(1, ...series.map((p) => p.revenue))

  // Delivered/cash cards switch between the realized (by delivery date) and the
  // cohort (by creation date) basis. Realized is the default — it reconciles with
  // what Sendit actually collected in the period. A safe fallback to the cohort
  // numbers keeps old cached payloads (no `realized` field) from crashing.
  const R = stats.realized ?? {
    revenue: stats.revenueDelivered, encaisse: stats.revenueDeliveredTotal,
    cash: stats.cashReceivedDelivered, profit: stats.profitDelivered,
    margin: stats.marginDelivered, orders: stats.ordersDelivered, revenueDelta: stats.revenueDeliveredDelta,
  }
  const byDeliv = basis === 'delivered'
  const dRevenue = byDeliv ? R.revenue : stats.revenueDelivered
  const dRevenueDelta = byDeliv ? R.revenueDelta : stats.revenueDeliveredDelta
  const dEncaisse = byDeliv ? R.encaisse : stats.revenueDeliveredTotal
  const dCash = byDeliv ? R.cash : stats.cashReceivedDelivered
  const dProfit = byDeliv ? R.profit : stats.profitDelivered
  const dMargin = byDeliv ? R.margin : stats.marginDelivered
  const dOrders = byDeliv ? R.orders : stats.ordersDelivered
  const basisSub = byDeliv ? 'par date de livraison' : 'par date de création'

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
            {/* Mode tabs */}
            <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--line-soft)' }}>
              {([['rolling', 'Glissant'], ['month', 'Mois'], ['week', 'Semaine']] as const).map(([m, lbl]) => (
                <button key={m} onClick={() => setMode(m)} style={{
                  fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: mode === m ? 'var(--tx-hi)' : 'transparent', color: mode === m ? 'var(--bg-1)' : 'var(--tx-lo)',
                }}>{lbl}</button>
              ))}
            </div>

            {/* Period picker (depends on mode) */}
            {mode === 'rolling' && (
              <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--line-soft)' }}>
                {PERIODS.map((p) => (
                  <button key={p.days} onClick={() => setDays(p.days)} style={{
                    fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    background: days === p.days ? 'var(--rose-bright)' : 'transparent', color: days === p.days ? '#fff' : 'var(--tx-lo)',
                  }}>{p.label}</button>
                ))}
              </div>
            )}
            {mode === 'month' && (
              <Stepper
                label={`${MONTHS_FR[month.m]} ${month.year}`}
                onPrev={() => { const d = new Date(Date.UTC(month.year, month.m - 1, 1)); setMonth({ year: d.getUTCFullYear(), m: d.getUTCMonth() }) }}
                onNext={() => { const d = new Date(Date.UTC(month.year, month.m + 1, 1)); setMonth({ year: d.getUTCFullYear(), m: d.getUTCMonth() }) }}
              />
            )}
            {mode === 'week' && (
              <Stepper
                label={`Semaine ${week.w} · ${week.year}`}
                onPrev={() => { const mon = isoWeekMonday(week.year, week.w); mon.setUTCDate(mon.getUTCDate() - 7); const i = getISOWeek(mon); setWeek({ year: i.year, w: i.week }) }}
                onNext={() => { const mon = isoWeekMonday(week.year, week.w); mon.setUTCDate(mon.getUTCDate() + 7); const i = getISOWeek(mon); setWeek({ year: i.year, w: i.week }) }}
              />
            )}

            <button className="btn-modern btn-secondary btn-icon" onClick={() => load()} title="Rafraîchir" aria-label="Rafraîchir" disabled={loading}>
              <RefreshCw className="w-4 h-4" style={loading ? { animation: 'dash-spin 0.8s linear infinite' } : undefined} />
            </button>
            <button className="btn-modern btn-secondary" onClick={exportCsv}><Download className="w-4 h-4" />Export</button>
            <Link href="/orders/new" className="btn-modern btn-primary" style={{ textDecoration: 'none' }}><Plus className="w-4 h-4" />Nouvelle commande</Link>
          </div>
        </div>

        {lastUpdated && (
          <div style={{ fontSize: 11, color: 'var(--tx-faint)', marginTop: -10, marginBottom: 14, textAlign: 'right' }}>
            Mis à jour à {lastUpdated.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}

        {/* Basis toggle: how the delivered/cash cards attribute a period. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--line-soft)' }}>
            {([['delivered', 'Cash réalisé (livraison)'], ['created', 'Cohorte (création)']] as const).map(([b, lbl]) => (
              <button key={b} onClick={() => setBasis(b)} style={{
                fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: basis === b ? 'var(--tx-hi)' : 'transparent', color: basis === b ? 'var(--bg-1)' : 'var(--tx-lo)',
              }}>{lbl}</button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: 'var(--tx-faint)' }}>
            {byDeliv
              ? 'Compté au mois de livraison — se réconcilie avec le cash Sendit du mois.'
              : 'Compté au mois de création de la commande — utile pour suivre une cohorte.'}
          </span>
        </div>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 16 }}>
          <Kpi label={`CA livré · ${periodLabel}`} value={`${mad(dRevenue)}`} unit="MAD" delta={dRevenueDelta} deltaLabel={compareLabel} sub={`produits · ${basisSub}`} accent />
          <Kpi
            label={`CA attendu · ${periodLabel}`}
            value={`${mad(stats.revenueWeek)}`}
            unit="MAD"
            sub={
              stats.revenueWeek > stats.revenueDelivered
                ? `+ ${mad(stats.revenueWeek - stats.revenueDelivered)} en cours (${stats.ordersWeek - stats.ordersDelivered} cmd) · création`
                : 'toutes livrées · création'
            }
          />
          <Kpi label={`Encaissé COD · ${periodLabel}`} value={mad(dEncaisse)} unit="MAD" sub={`avec livraison · ${basisSub}`} />
          {Math.round(dCash) !== Math.round(dRevenue) && (
            <Kpi label={`Cash reçu · ${periodLabel}`} value={mad(dCash)} unit="MAD" sub={`net frais Sendit · ${basisSub}`} />
          )}
          <Kpi label="Profit livré" value={mad(dProfit)} unit="MAD" sub={`${dMargin.toFixed(1)}% marge · ${basisSub}`} />
          <Kpi label={byDeliv ? `Livrées · ${periodLabel}` : `Commandes · ${periodLabel}`} value={String(byDeliv ? dOrders : stats.ordersWeek)} sub={byDeliv ? basisSub : 'créées, hors annulées'} />
          <Kpi label="Panier moyen" value={mad(stats.averageOrderValue)} unit="MAD" />
          <Kpi label="Taux de livraison" value={`${stats.deliveryRate.toFixed(0)}%`} sub="livrées / résolues · création" />
          <Kpi label="ROAS" value={`${stats.roas.toFixed(1)}x`} />
        </div>

        {/* Résultat de la période: Rentabilité + Trésorerie */}
        {stats.pnl && (() => {
          const r = stats.pnl.rentabilite, t = stats.pnl.tresorerie
          return (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)' }}>Résultat · {periodLabel}</h3>
                  <p style={{ fontSize: 11, color: 'var(--tx-faint)', marginTop: 2 }}>Rentabilité = marge sur ventes livrées · Trésorerie = cash réel entré/sorti sur la période</p>
                </div>
                <button className="btn-modern btn-secondary" onClick={openExpenses}>Dépenses & emballage</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="dash-hero">
                <div className="card-modern" style={{ padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 10 }}>🔵 Rentabilité <span style={{ fontWeight: 500, color: 'var(--tx-faint)', fontSize: 11 }}>· ventes livrées</span></div>
                  <PnlRow label="CA livré" value={r.caLivre} />
                  <PnlRow label="Profit livré" sub={`net produits + livraison · ${r.margeLivree.toFixed(0)}%`} value={r.profitLivre} muted />
                  <PnlRow label="Pub" value={-r.pub} neg />
                  <PnlRow label={`Emballage`} sub={`${stats.pnl.deliveredParcels} colis × ${stats.pnl.packagingRate} DH`} value={-r.emballage} neg />
                  <PnlRow label="Profit net" value={r.net} total pct={r.marginPct} />
                </div>
                <div className="card-modern" style={{ padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 10 }}>🟢 Trésorerie <span style={{ fontWeight: 500, color: 'var(--tx-faint)', fontSize: 11 }}>· cash réel</span></div>
                  <PnlRow label="Cash encaissé" sub="COD livré, net frais Sendit" value={t.encaisse} />
                  <PnlRow label="Achats fournisseur" value={-t.achats} neg />
                  <PnlRow label="Pub" value={-t.pub} neg />
                  <PnlRow label="Dépenses (emballage & frais)" value={-t.frais} neg />
                  <PnlRow label="Cash net généré" value={t.net} total />
                </div>
              </div>
            </div>
          )
        })()}

        {/* Chart + goal */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16, marginBottom: 16 }} className="dash-hero">
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div>
                <Label>CA livré · {periodLabel} · hors livraison · {basisSub}</Label>
                <div style={{ fontSize: 38, fontWeight: 600, fontFamily: 'var(--mono)', letterSpacing: '-0.02em', color: 'var(--tx-hi)', lineHeight: 1.1 }}>
                  {mad(dRevenue)} <span style={{ fontSize: 16, color: 'var(--tx-lo)', fontWeight: 500 }}>MAD</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--tx-lo)', marginTop: 4 }}>
                  Encaissé (COD) <b style={{ color: 'var(--tx-mid)' }}>{mad(dEncaisse)}</b>
                  <span style={{ color: 'var(--tx-faint)' }}> − frais Sendit {mad(dEncaisse - dCash)} = </span>
                  <b style={{ color: 'var(--green)' }}>cash reçu {mad(dCash)} MAD</b>
                </div>
                {stats.revenueWeek > stats.revenueDelivered && (
                  <div style={{ fontSize: 12, color: 'var(--tx-lo)', marginTop: 2 }}>
                    CA attendu (confirmé + livré) : <b style={{ color: 'var(--tx-mid)' }}>{mad(stats.revenueWeek)} MAD</b>
                    <span style={{ color: 'var(--tx-faint)' }}> · dont {mad(stats.revenueWeek - stats.revenueDelivered)} pas encore livré</span>
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--tx-faint)', marginTop: 4 }}>
                  Courbe : commandes créées (CA attendu) par jour
                </div>
              </div>
            </div>
            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ marginTop: 8 }} onMouseLeave={() => setHoveredPoint(null)}>
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
              {pts.map((p, i) => (
                <g key={i}>
                  {hoveredPoint === i && <circle cx={p.x} cy={p.y} r="5" fill="var(--rose-bright)" />}
                  <circle cx={p.x} cy={p.y} r="12" fill="transparent" style={{ cursor: 'pointer' }} onMouseEnter={() => setHoveredPoint(i)} />
                </g>
              ))}
              {hoveredPoint !== null && (() => {
                const d = series[hoveredPoint]
                const p = pts[hoveredPoint]
                const tx = p.x > W / 2 ? p.x - 10 : p.x + 10
                const anchor = p.x > W / 2 ? 'end' : 'start'
                return (
                  <g>
                    <rect x={p.x > W / 2 ? tx - 140 : tx} y={p.y - 50} width="140" height="60" rx="6" fill="var(--bg-1)" stroke="var(--rose-bright)" strokeWidth="1.5" />
                    <text x={p.x > W / 2 ? tx - 70 : tx + 70} y={p.y - 34} textAnchor="middle" fontSize="11" fill="var(--tx-mid)" fontWeight="600">{d.label}</text>
                    <text x={p.x > W / 2 ? tx - 70 : tx + 70} y={p.y - 20} textAnchor="middle" fontSize="13" fill="var(--tx-hi)" fontWeight="700">{mad(d.revenue)} MAD</text>
                    <text x={p.x > W / 2 ? tx - 70 : tx + 70} y={p.y - 6} textAnchor="middle" fontSize="10" fill={d.profit >= 0 ? 'var(--green)' : 'var(--red)'}>Profit: {mad(d.profit)} MAD</text>
                    <text x={p.x > W / 2 ? tx - 70 : tx + 70} y={p.y + 6} textAnchor="middle" fontSize="10" fill="var(--tx-lo)">{d.orders} commande{d.orders > 1 ? 's' : ''}</text>
                  </g>
                )
              })()}
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--tx-faint)', fontFamily: 'var(--mono)', marginTop: 4 }}>
              {series.filter((_, i) => i % Math.ceil(series.length / 6 || 1) === 0).map((p, i) => <span key={i}>{p.label}</span>)}
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Label>{weekGoalTitle}</Label>
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
              <b style={{ color: 'var(--tx-hi)' }}>{mad(weekRevenue)} MAD</b> {mode === 'week' ? `· semaine S${week.w}` : 'encaissés sur 7 jours'}
            </p>

            {/* Monthly goal */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--tx-mid)' }}>
                  {monthGoalTitle} · <b style={{ color: goalMonthPct >= 100 ? 'var(--green)' : 'var(--tx-hi)' }}>{goalMonthPct}%</b>
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
              <p style={{ fontSize: 11, color: 'var(--tx-lo)', marginTop: 4 }}>{mad(monthRevenue)} MAD {mode === 'month' ? `· ${MONTHS_FR[month.m]}` : 'sur 30 jours'}</p>
            </div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line-soft)', display: 'grid', gap: 10 }}>
              {[
                { label: `Commandes · ${periodLabel}`, value: String(stats.ordersWeek) },
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
            <Label>Top produits · {periodLabel}</Label>
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
            <Label>Canaux de vente · {periodLabel}</Label>
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
            <Label>Pipeline des commandes · {periodLabel}</Label>
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

          {/* Top cities */}
          <Card>
            <Label>Top villes · {periodLabel}</Label>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(!stats.topCities || stats.topCities.length === 0) ? <Empty /> : stats.topCities.slice(0, 6).map((c, i) => {
                const max = stats.topCities[0]?.orders || 1
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span style={{ color: 'var(--tx-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{c.name}</span>
                      <span style={{ color: 'var(--tx-mid)', whiteSpace: 'nowrap', marginLeft: 8 }}><b style={{ color: 'var(--tx-hi)' }}>{c.orders}</b> cmd</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-3)', overflow: 'hidden' }}>
                      <div style={{ width: `${(c.orders / max) * 100}%`, height: '100%', background: 'var(--blue)', borderRadius: 3 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      </div>

      {showExpenses && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }} onClick={() => setShowExpenses(false)}>
          <div className="card-modern" style={{ maxWidth: 560, width: '100%', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="card-header"><h3 className="text-lg font-semibold">Dépenses &amp; emballage · {periodLabel}</h3><div className="flex-1" /><button onClick={() => setShowExpenses(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 20, color: 'var(--tx-lo)' }}>×</button></div>
            <div className="card-body">
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <label className="fs12 tx-mid fw600" style={{ display: 'block', marginBottom: 6 }}>Coût emballage / colis (MAD)</label>
                  <input type="number" min="0" step="0.5" value={rateInput} onChange={(e) => setRateInput(e.target.value)} placeholder="Ex: 6" className="input-modern" style={{ width: '100%' }} />
                </div>
                <button className="btn-modern btn-secondary" onClick={saveRate}>Enregistrer</button>
              </div>
              <p className="fs11 tx-faint" style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--line-soft)' }}>Emballage estimé dans la <b>Rentabilité</b> = colis livrés × ce taux. Les dépenses réelles ci-dessous (cash) comptent dans la <b>Trésorerie</b>.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label className="fs12 tx-mid fw600" style={{ display: 'block', marginBottom: 6 }}>Catégorie</label>
                  <select value={expForm.category} onChange={(e) => setExpForm({ ...expForm, category: e.target.value })} className="input-modern" style={{ width: '100%' }}>
                    {['Emballage', 'Pub', 'Livraison', 'Salaire', 'Loyer', 'Divers'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="fs12 tx-mid fw600" style={{ display: 'block', marginBottom: 6 }}>Montant (MAD)</label>
                  <input type="number" min="0" step="0.01" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} placeholder="Ex: 180" className="input-modern" style={{ width: '100%' }} />
                </div>
                <div>
                  <label className="fs12 tx-mid fw600" style={{ display: 'block', marginBottom: 6 }}>Date</label>
                  <input type="date" value={expForm.date} onChange={(e) => setExpForm({ ...expForm, date: e.target.value })} className="input-modern" style={{ width: '100%' }} />
                </div>
                <div>
                  <label className="fs12 tx-mid fw600" style={{ display: 'block', marginBottom: 6 }}>Libellé (optionnel)</label>
                  <input type="text" value={expForm.label} onChange={(e) => setExpForm({ ...expForm, label: e.target.value })} placeholder="Ex: cartons" className="input-modern" style={{ width: '100%' }} />
                </div>
              </div>
              <button className="btn-modern btn-primary" onClick={addExpense} disabled={savingExp || !(Number(expForm.amount) > 0)} style={{ width: '100%', marginBottom: 16 }}>{savingExp ? 'Ajout…' : 'Ajouter la dépense'}</button>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="fs12 tx-mid fw600">Dépenses de la période</span>
                <span className="fs12 num fw600">{expenses ? mad(expenses.summary.total) : 0} MAD</span>
              </div>
              {expenses && expenses.expenses.length > 0 ? expenses.expenses.map((e) => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 12 }}>
                  <span className="badge gray" style={{ fontSize: 10 }}>{e.category}</span>
                  <div style={{ flex: 1, minWidth: 0 }}><div className="tx-hi" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label || e.category}</div><div className="fs11 tx-faint">{e.date}</div></div>
                  <span className="num fw600 tx-hi">{mad(e.amount)}</span>
                  <button onClick={() => deleteExpense(e.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--tx-faint)', padding: 4 }}><Trash2 style={{ width: 14, height: 14 }} /></button>
                </div>
              )) : <p className="fs12 tx-faint" style={{ textAlign: 'center', padding: '12px 0' }}>Aucune dépense sur la période.</p>}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @media (max-width: 1100px) { .dash-hero { grid-template-columns: 1fr !important; } }
        @keyframes dash-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ maxWidth: 1480, margin: '0 auto', padding: '24px 24px 60px' }}>
        <div className="skeleton-line" style={{ width: 220, height: 30, marginBottom: 22 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 16 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius)', padding: 14, boxShadow: 'var(--shadow-1)' }}>
              <div className="skeleton-line" style={{ width: '70%', marginBottom: 10 }} />
              <div className="skeleton-line" style={{ width: '50%', height: 22 }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16, marginBottom: 16 }} className="dash-hero">
          <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)', padding: 18, height: 320 }}>
            <div className="skeleton-line" style={{ width: '30%', marginBottom: 16 }} />
            <div className="skeleton-line" style={{ width: '100%', height: 220 }} />
          </div>
          <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)', padding: 18, height: 320 }}>
            <div className="skeleton-line" style={{ width: '40%', marginBottom: 14 }} />
            <div className="skeleton-line" style={{ width: '60%', height: 40, marginBottom: 14 }} />
            <div className="skeleton-line" style={{ width: '100%', marginBottom: 8 }} />
            <div className="skeleton-line" style={{ width: '100%' }} />
          </div>
        </div>
        <style jsx>{`
          @media (max-width: 1100px) { .dash-hero { grid-template-columns: 1fr !important; } }
        `}</style>
      </div>
    </div>
  )
}

function Stepper({ label, onPrev, onNext }: { label: string; onPrev: () => void; onNext: () => void }) {
  const btn: React.CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--tx-lo)', fontSize: 16, padding: '0 6px', lineHeight: 1 }
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 3, borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--line-soft)' }}>
      <button onClick={onPrev} aria-label="Précédent" style={btn}>‹</button>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx-hi)', minWidth: 110, textAlign: 'center' }}>{label}</span>
      <button onClick={onNext} aria-label="Suivant" style={btn}>›</button>
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

function PnlRow({ label, value, sub, neg, muted, total, pct }: { label: string; value: number; sub?: string; neg?: boolean; muted?: boolean; total?: boolean; pct?: number }) {
  const fmt = (v: number) => `${v < 0 ? '−' : ''}${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.abs(v))}`
  const color = total ? (value >= 0 ? 'var(--green)' : 'var(--red, #dc2626)') : neg ? 'var(--tx-mid)' : muted ? 'var(--tx-mid)' : 'var(--tx-hi)'
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, padding: total ? '10px 0 0' : '4px 0', marginTop: total ? 4 : 0, borderTop: total ? '1px solid var(--line-soft)' : undefined }}>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: total ? 13 : 12.5, fontWeight: total ? 700 : 500, color: total ? 'var(--tx-hi)' : 'var(--tx-mid)' }}>{label}</span>
        {sub && <span style={{ fontSize: 10.5, color: 'var(--tx-faint)', marginLeft: 6 }}>{sub}</span>}
      </div>
      <span className="num" style={{ fontSize: total ? 16 : 13, fontWeight: total ? 700 : 600, color, whiteSpace: 'nowrap' }}>
        {fmt(value)}<span style={{ fontSize: 10, color: 'var(--tx-faint)', marginLeft: 3 }}>MAD</span>
        {total && pct !== undefined && <span style={{ fontSize: 11, color: 'var(--tx-faint)', marginLeft: 6 }}>{pct.toFixed(0)}%</span>}
      </span>
    </div>
  )
}

function Kpi({ label, value, unit, sub, delta, deltaLabel, accent }: { label: string; value: string; unit?: string; sub?: string; delta?: number | null; deltaLabel?: string; accent?: boolean }) {
  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius)', padding: 14, boxShadow: 'var(--shadow-1)' }}>
      <div style={{ fontSize: 11, color: 'var(--tx-lo)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-0.01em', color: accent ? 'var(--rose-bright)' : 'var(--tx-hi)' }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: 'var(--tx-faint)' }}>{unit}</span>}
      </div>
      {(delta != null || sub) && (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
          {delta != null ? <DeltaPill value={delta} small /> : <span style={{ fontSize: 11, color: 'var(--tx-faint)' }}>{sub}</span>}
          {delta != null && deltaLabel && <span style={{ fontSize: 10, color: 'var(--tx-faint)' }}>vs {deltaLabel}</span>}
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
