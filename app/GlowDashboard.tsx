'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, Download, Plus, ArrowUp, ArrowDown, RefreshCw, Trash2 } from 'lucide-react'
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
  codReceivedDelivered?: number
  bankReceivedDelivered?: number
  revenueDeliveredDelta: number | null
  profitDelivered: number
  marginDelivered: number
  cashReceivedDelivered: number
  deliveryCostDelivered: number
  // Realized cash — delivered metrics attributed by DELIVERY date (reconciles with Sendit).
  realized: {
    revenue: number
    encaisse: number
    bank: number
    cash: number
    profit: number
    margin: number
    orders: number
    matchedOrders?: number
    revenueDelta: number | null
  }
  sendit?: {
    lastPulledAt: string | null
    created: { cod: number; fees: number; bank: number; cash: number; orders: number; unmatchedOrders: number; unmatchedCod: number }
    delivered: { cod: number; fees: number; bank: number; cash: number; orders: number; unmatchedOrders: number; unmatchedCod: number }
  }
  pnl?: {
    rentabilite: { caLivre: number; profitLivre: number; margeLivree: number; pub: number; emballage: number; retours: number; net: number; marginPct: number }
    tresorerie: { encaisse: number; achats: number; pub: number; emballage: number; emballageEstime: boolean; frais: number; retours: number; net: number }
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
  roas: number | null
  adDataThrough?: string | null
  revenueSeries: Array<{ date: string; label: string; revenue: number; profit: number; orders: number }>
  topProducts: Array<{ productId: number | null; name: string; units: number; revenue: number }>
  topCities: Array<{ name: string; orders: number }>
  channels: Array<{ name: string; revenue: number; color: string }>
  pipeline: Array<{ label: string; value: number; tone: string }>
  alerts: { total: number; items: Array<{ tone: string; title: string; subtitle: string; href: string }> }
  activity: Array<{ tone: string; title: string; subtitle: string; timestamp: string }>
}

const mad = (v: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(v)

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
  const now = new Date()
  const isCurrent = year === now.getUTCFullYear() && m0 === now.getUTCMonth()
  const monthLastDay = new Date(Date.UTC(year, m0 + 1, 0)).getUTCDate()
  // For the CURRENT month, stop at today and compare the SAME elapsed days of the
  // previous month — otherwise a partial month always looks down vs a full one.
  const elapsedDay = isCurrent ? now.getUTCDate() : monthLastDay
  const prevMonthLastDay = new Date(Date.UTC(year, m0, 0)).getUTCDate()
  return {
    from: isoDay(new Date(Date.UTC(year, m0, 1))),
    to: isoDay(new Date(Date.UTC(year, m0, elapsedDay))),
    compareFrom: isoDay(new Date(Date.UTC(year, m0 - 1, 1))),
    compareTo: isoDay(new Date(Date.UTC(year, m0 - 1, Math.min(elapsedDay, prevMonthLastDay)))),
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
  const [goals, setGoals] = useState<GoalsData | null>(null)
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

  function fetchGoals() {
    return fetch('/api/ops/goals', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setGoals(d) })
      .catch(() => {})
  }

  const saveGoalSmart = async (kind: 'week' | 'month', target: number) => {
    if (!Number.isFinite(target) || target < 0) return
    // Optimistic: update the current period locally, then persist + refetch history.
    setGoals((g) => {
      if (!g) return g
      const blk = g[kind]
      if (!blk.current) return g
      const pct = target > 0 ? Math.round((blk.current.actual / target) * 100) : 0
      const cur = { ...blk.current, target, pct, achieved: blk.current.actual >= target }
      return { ...g, [kind]: { ...blk, current: cur, periods: blk.periods.map((p) => (p.current ? cur : p)) } }
    })
    await fetch('/api/ops/goals', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, target }) }).catch(() => {})
    fetchGoals()
  }

  function load() {
    let qs = `days=${days}`
    if (mode === 'month') { const r = monthRange(month.year, month.m); qs = `from=${r.from}&to=${r.to}&compareFrom=${r.compareFrom}&compareTo=${r.compareTo}` }
    else if (mode === 'week') { const r = weekRange(week.year, week.w); qs = `from=${r.from}&to=${r.to}&compareFrom=${r.compareFrom}&compareTo=${r.compareTo}` }
    setLoading(true)
    setError(false)
    fetchGoals()
    return fetch(`/api/ops/dashboard/stats?${qs}`, { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('fetch'); return r.json() })
      .then((d) => { setStats(d); setLastUpdated(new Date()) })
      .catch((e) => { console.error('Failed to fetch stats:', e); setError(true) })
      .finally(() => setLoading(false))
  }

  async function refreshSendit() {
    setLoading(true)
    setError(false)
    try {
      for (const action of ['pull', 'sync-matched']) {
        const response = await fetch('/api/ops/sendit/staging', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
        if (!response.ok) throw new Error(`Sendit ${action} failed`)
      }
      await load()
    } catch (error) {
      console.error('Failed to refresh Sendit:', error)
      setError(true)
      setLoading(false)
    }
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

  // Plot the full selected period (was truncated to 14 points, which made the
  // curve lie in Mois/90j/1 an mode). Cap dot density for very long ranges.
  const series = stats.revenueSeries
  const maxRev = Math.max(1, ...series.map((p) => p.revenue))

  // Delivered/cash cards switch between the realized (by delivery date) and the
  // cohort (by creation date) basis. Realized is the default — it reconciles with
  // what Sendit actually collected in the period. A safe fallback to the cohort
  // numbers keeps old cached payloads (no `realized` field) from crashing.
  const R = stats.realized ?? {
    revenue: stats.revenueDelivered, encaisse: stats.codReceivedDelivered ?? stats.revenueDeliveredTotal, bank: stats.bankReceivedDelivered ?? 0,
    cash: stats.cashReceivedDelivered, profit: stats.profitDelivered,
    margin: stats.marginDelivered, orders: stats.ordersDelivered, revenueDelta: stats.revenueDeliveredDelta,
  }
  const byDeliv = basis === 'delivered'
  const senditBasis = byDeliv ? stats.sendit?.delivered : stats.sendit?.created
  const dRevenue = byDeliv ? R.revenue : stats.revenueDelivered
  const dRevenueDelta = byDeliv ? R.revenueDelta : stats.revenueDeliveredDelta
  const dEncaisse = senditBasis?.cod ?? (byDeliv ? R.encaisse : (stats.codReceivedDelivered ?? stats.revenueDeliveredTotal))
  const dBank = senditBasis?.bank ?? (byDeliv ? R.bank : (stats.bankReceivedDelivered ?? 0))
  const dFees = senditBasis?.fees ?? Math.max(0, dEncaisse + dBank - (byDeliv ? R.cash : stats.cashReceivedDelivered))
  const dCash = senditBasis?.cash ?? (byDeliv ? R.cash : stats.cashReceivedDelivered)
  const dProfit = byDeliv ? R.profit : stats.profitDelivered
  const dMargin = byDeliv ? R.margin : stats.marginDelivered
  const dOrders = senditBasis?.orders ?? (byDeliv ? R.orders : stats.ordersDelivered)
  const dUnmatchedOrders = senditBasis?.unmatchedOrders ?? 0
  const dUnmatchedCod = senditBasis?.unmatchedCod ?? 0
  const dFinancialOrders = byDeliv ? (R.matchedOrders ?? stats.ordersDelivered) : stats.ordersDelivered
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
      <div style={{ maxWidth: 1480, margin: '0 auto', padding: '16px 24px 60px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 14 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 3 }}>SHINE COSMETICS · OPÉRATIONS</div>
            <h1 className="serif-display" style={{ fontSize: 25, lineHeight: 1.05 }}>Vue d&apos;ensemble</h1>
            <div style={{ fontSize: 12, color: 'var(--tx-lo)', marginTop: 3 }}>
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

            <button className="btn-modern btn-secondary btn-icon" onClick={refreshSendit} title="Synchroniser Sendit" aria-label="Synchroniser Sendit" disabled={loading}>
              <RefreshCw className="w-4 h-4" style={loading ? { animation: 'dash-spin 0.8s linear infinite' } : undefined} />
            </button>
            <button className="btn-modern btn-secondary" onClick={exportCsv}><Download className="w-4 h-4" />Export</button>
            <Link href="/orders/new" className="btn-modern btn-primary" style={{ textDecoration: 'none' }}><Plus className="w-4 h-4" />Nouvelle commande</Link>
          </div>
        </div>

        {lastUpdated && (
          <div style={{ fontSize: 11, color: 'var(--tx-faint)', marginTop: -8, marginBottom: 10, textAlign: 'right' }}>
            Dashboard actualisé à {lastUpdated.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            {stats.sendit?.lastPulledAt && ` · Sendit synchronisé à ${new Date(stats.sendit.lastPulledAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
          </div>
        )}

        {/* Basis toggle: how the delivered/cash cards attribute a period. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
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
              ? 'Cash Sendit par livraison. Comparer avec Sendit → Type de date → Date de livraison.'
              : 'Cash Sendit par création. Correspond au filtre Date de Création de Sendit.'}
          </span>
        </div>

        {dUnmatchedOrders > 0 && (
          <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', marginBottom: 14, border: '1px solid var(--amber-line)', borderLeft: '3px solid var(--amber)', borderRadius: 7, background: 'var(--amber-bg)', color: 'var(--tx-mid)', fontSize: 12 }}>
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            <strong style={{ color: 'var(--tx-hi)' }}>{dUnmatchedOrders} colis livrés à traiter</strong>
            <span>{mad(dUnmatchedCod)} MAD inclus dans le cash Sendit, exclus du CA livré et du profit jusqu’au rapprochement ou à la synchronisation.</span>
            <Link href="/sendit" style={{ marginLeft: 'auto', color: 'var(--rose-bright)', fontWeight: 700, textDecoration: 'none' }}>Corriger</Link>
          </div>
        )}

        {/* Trio héros — les 3 chiffres qui comptent : CA · Profit · Cash */}
        <div className="dash-hero g-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 10 }}>
          <HeroTile tone="rose" label={`CA livré · ${periodLabel}`} value={mad(dRevenue)} delta={dRevenueDelta} deltaLabel={compareLabel} />
          <HeroTile tone="green" label="Profit net · rentabilité" value={mad(stats.pnl ? stats.pnl.rentabilite.net : dProfit)} sub={`${Math.round(stats.pnl ? stats.pnl.rentabilite.marginPct : dMargin)}% de marge · détail ci-dessous`} />
          <HeroTile tone="green" label="Cash net généré · trésorerie" value={mad(stats.pnl ? stats.pnl.tresorerie.net : dCash)} sub="liquide réel entré − sorti" />
        </div>

        {/* KPIs secondaires — le plomberie financière vit dans le panneau Résultat */}
        <div className="g-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: 12, marginBottom: 12 }}>
          <Kpi label="Commandes livrées" value={String(dOrders)} sub={`panier moyen ${mad(dFinancialOrders > 0 ? dRevenue / dFinancialOrders : stats.averageOrderValue)} MAD`} />
          <Kpi label="Taux de livraison" value={`${stats.deliveryRate.toFixed(0)}%`} sub="livrées / résolues" />
          <Kpi label="ROAS global" value={stats.roas != null ? `${stats.roas.toFixed(1)}x` : '—'} sub="CA livré ÷ pub" />
          <Kpi
            label={`CA attendu · ${periodLabel}`}
            value={`${mad(stats.revenueWeek)}`}
            unit="MAD"
            sub={
              stats.revenueWeek > stats.revenueDelivered
                ? `+ ${mad(stats.revenueWeek - stats.revenueDelivered)} en cours (${stats.ordersWeek - stats.ordersDelivered} cmd)`
                : 'toutes livrées'
            }
          />
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
                  {(() => {
                    const { from, to } = periodParams()
                    const through = stats.adDataThrough
                    if (!through || through < from) return null // period entirely before any ad data
                    // Warn only if the sync is behind Meta's normal ~2-day lag within this period.
                    const lagCutoff = isoDay(new Date(now.getTime() - 2 * 86400000))
                    const target = to < lagCutoff ? to : lagCutoff
                    if (through < target) {
                      return <p style={{ fontSize: 11, color: '#b45309', marginTop: 3 }}>⚠ Pub Meta synchronisée jusqu&apos;au {through} seulement — les jours suivants manquent. Lance une sync sur <b>Ads</b>, et saisis la pub hors-Meta (TikTok…) dans Dépenses.</p>
                    }
                    return null
                  })()}
                </div>
                <button className="btn-modern btn-secondary" onClick={openExpenses}>Dépenses & emballage</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="dash-hero g-stagger">
                <div className="card-modern" style={{ padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 10 }}>🔵 Rentabilité <span style={{ fontWeight: 500, color: 'var(--tx-faint)', fontSize: 11 }}>· ventes livrées</span></div>
                  <PnlRow label="CA livré" value={r.caLivre} />
                  <PnlRow label="Profit livré" sub={`net produits + livraison · ${r.margeLivree.toFixed(0)}%`} value={r.profitLivre} muted />
                  <PnlRow label="Pub" value={-r.pub} neg />
                  <PnlRow label={`Emballage`} sub={`${stats.pnl.deliveredParcels} colis × ${stats.pnl.packagingRate} DH`} value={-r.emballage} neg />
                  {r.retours > 0 && <PnlRow label="Retours / échanges" sub="frais livraison retour" value={-r.retours} neg />}
                  <PnlRow label="Profit net" value={r.net} total pct={r.marginPct} />
                </div>
                <div className="card-modern" style={{ padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 10 }}>🟢 Trésorerie <span style={{ fontWeight: 500, color: 'var(--tx-faint)', fontSize: 11 }}>· cash réel</span></div>
                  <PnlRow label="Cash encaissé" sub={`COD ${mad(dEncaisse)}${dBank > 0 ? ` + virements ${mad(dBank)}` : ''} − frais Sendit ${mad(dFees)}`} value={t.encaisse} />
                  <PnlRow label="Achats fournisseur" value={-t.achats} neg />
                  <PnlRow label="Pub" value={-t.pub} neg />
                  <PnlRow label="Emballage" sub={t.emballageEstime ? 'estimé · colis × taux' : 'réel loggé'} value={-t.emballage} neg />
                  {t.frais > 0 && <PnlRow label="Dépenses (frais divers)" value={-t.frais} neg />}
                  {t.retours > 0 && <PnlRow label="Retours / échanges" sub="frais livraison retour" value={-t.retours} neg />}
                  <PnlRow label="Cash net généré" value={t.net} total />
                </div>
              </div>
            </div>
          )
        })()}

        {/* Chart + goal */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16, marginBottom: 16 }} className="dash-hero g-stagger">
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div>
                <Label>Tendance du CA · {periodLabel}</Label>
                <div style={{ fontSize: 13, color: 'var(--tx-mid)', marginTop: 5, fontWeight: 500 }}>
                  CA attendu par jour <span style={{ color: 'var(--tx-faint)', fontWeight: 400 }}>· commandes créées — pics et creux de la demande</span>
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

          <GoalCard
            data={goals}
            onSave={saveGoalSmart}
            extra={[
              { label: `Commandes · ${periodLabel}`, value: String(stats.ordersWeek) },
              { label: 'Panier moyen', value: `${mad(stats.averageOrderValue)} MAD` },
              { label: 'Taux livraison', value: `${stats.deliveryRate.toFixed(0)}%` },
            ]}
          />
        </div>

        {/* Top products + channels (real data, previously unused) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }} className="g-stagger">
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 16 }} className="g-stagger">
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

        /* Cards: soft hover lift + smooth transitions */
        :global(.g-card) {
          background: var(--bg-1);
          border: 1px solid var(--line-soft);
          box-shadow: var(--shadow-1);
          transition: transform .16s cubic-bezier(.16,1,.3,1), box-shadow .16s ease, border-color .16s ease;
          will-change: transform;
        }
        :global(.g-card:hover) {
          transform: translateY(-2px);
          box-shadow: 0 10px 28px rgba(0,0,0,.09);
          border-color: color-mix(in srgb, var(--line-soft) 40%, var(--tx-faint));
        }
        /* Staggered fade-in-up entrance for grids */
        :global(.g-stagger) > :global(*) { animation: gIn .42s cubic-bezier(.16,1,.3,1) both; }
        :global(.g-stagger) > :global(*):nth-child(1) { animation-delay: .02s; }
        :global(.g-stagger) > :global(*):nth-child(2) { animation-delay: .06s; }
        :global(.g-stagger) > :global(*):nth-child(3) { animation-delay: .10s; }
        :global(.g-stagger) > :global(*):nth-child(4) { animation-delay: .14s; }
        :global(.g-stagger) > :global(*):nth-child(5) { animation-delay: .18s; }
        :global(.g-stagger) > :global(*):nth-child(6) { animation-delay: .22s; }
        :global(.g-stagger) > :global(*):nth-child(7) { animation-delay: .26s; }
        :global(.g-stagger) > :global(*):nth-child(8) { animation-delay: .30s; }
        :global(.g-stagger) > :global(*):nth-child(9) { animation-delay: .34s; }
        @keyframes gIn { from { opacity: 0; transform: translateY(9px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) {
          :global(.g-card), :global(.g-stagger) > :global(*) { transition: none !important; animation: none !important; }
        }
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
        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16, marginBottom: 16 }} className="dash-hero g-stagger">
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
  return <div className="g-card" style={{ borderRadius: 'var(--radius-lg)', padding: 18 }}>{children}</div>
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
    <div className="g-card" style={{ borderRadius: 'var(--radius)', padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--tx-lo)', marginBottom: 4, fontWeight: 500 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-0.02em', color: accent ? 'var(--rose-bright)' : 'var(--tx-hi)' }}>{value}</span>
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

type GoalPeriod = { key: string; label: string; start: string; target: number; actual: number; orders: number; pct: number; achieved: boolean; current: boolean }
type GoalBlock = {
  periods: GoalPeriod[]
  current: GoalPeriod | null
  summary: { streak: number; hitRate: { hit: number; total: number; pct: number }; avgActual: number; suggested: number }
  projection: { daysElapsed: number; daysTotal: number; projected: number; onPace: boolean; perDayNeeded: number } | null
}
type GoalsData = { week: GoalBlock; month: GoalBlock }

function GoalCard({ data, onSave, extra }: {
  data: GoalsData | null
  onSave: (kind: 'week' | 'month', target: number) => void
  extra: Array<{ label: string; value: string }>
}) {
  const [editing, setEditing] = useState<'week' | 'month' | null>(null)
  const [input, setInput] = useState('')
  const wk = data?.week
  const mo = data?.month
  const cur = wk?.current ?? null
  const curMo = mo?.current ?? null

  const startEdit = (kind: 'week' | 'month', target: number) => { setInput(String(target)); setEditing(kind) }
  const commit = (kind: 'week' | 'month') => {
    const v = Math.round(Number(input))
    if (Number.isFinite(v) && v >= 0) onSave(kind, v)
    setEditing(null)
  }

  return (
    <Card>
      {/* Header: title + streak + hit-rate */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Label>Objectif de la semaine</Label>
        {wk && (wk.summary.streak > 0 || wk.summary.hitRate.total > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
            {wk.summary.streak > 0 && <span style={{ color: 'var(--green)', fontWeight: 600 }}>🔥 {wk.summary.streak} sem.</span>}
            {wk.summary.hitRate.total > 0 && <span style={{ color: 'var(--tx-lo)' }}>{wk.summary.hitRate.hit}/{wk.summary.hitRate.total} · {wk.summary.hitRate.pct}%</span>}
          </div>
        )}
      </div>

      {/* Big % + editable target */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 40, fontWeight: 700, fontFamily: 'var(--mono)', color: (cur?.pct ?? 0) >= 100 ? 'var(--green)' : 'var(--rose-bright)' }}>{cur?.pct ?? 0}%</span>
        {editing === 'week' ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 13, color: 'var(--tx-lo)' }}>de</span>
            <input autoFocus type="number" value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commit('week'); if (e.key === 'Escape') setEditing(null) }}
              style={{ width: 90, fontSize: 13, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--rose-bright)', background: 'var(--bg-2)', color: 'var(--tx-hi)' }} />
            <button onClick={() => commit('week')} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, border: 'none', background: 'var(--rose-bright)', color: '#fff', cursor: 'pointer' }}>OK</button>
          </span>
        ) : (
          <button onClick={() => startEdit('week', cur?.target ?? 0)} title="Modifier l'objectif" style={{ fontSize: 13, color: 'var(--tx-lo)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>de {mad(cur?.target ?? 0)} MAD ✏️</button>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ height: 10, borderRadius: 6, background: 'var(--bg-3)', overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ width: `${Math.min(cur?.pct ?? 0, 100)}%`, height: '100%', borderRadius: 6, background: (cur?.pct ?? 0) >= 100 ? 'var(--green)' : 'linear-gradient(90deg, var(--rose), var(--rose-bright))', transition: 'width .5s cubic-bezier(.16,1,.3,1)' }} />
      </div>
      <p style={{ fontSize: 12, color: 'var(--tx-mid)' }}>
        <b style={{ color: 'var(--tx-hi)' }}>{mad(cur?.actual ?? 0)} MAD</b> de CA confirmé + livré
      </p>

      {/* Projection */}
      {cur && wk?.projection && (
        (cur.pct >= 100)
          ? <p style={{ fontSize: 11.5, color: 'var(--green)', marginTop: 5, fontWeight: 600 }}>🎯 Objectif atteint !</p>
          : wk.projection.onPace
            ? <p style={{ fontSize: 11.5, color: 'var(--green)', marginTop: 5 }}>✓ En bonne voie · projection <b>{mad(wk.projection.projected)} MAD</b> <span style={{ color: 'var(--tx-faint)' }}>({wk.projection.daysElapsed}/{wk.projection.daysTotal}j)</span></p>
            : <p style={{ fontSize: 11.5, color: '#b45309', marginTop: 5 }}>⚠ À ce rythme <b>{mad(wk.projection.projected)}</b> — <b>+{mad(wk.projection.perDayNeeded)}/j</b> pour l&apos;objectif <span style={{ color: 'var(--tx-faint)' }}>({wk.projection.daysTotal - wk.projection.daysElapsed}j restants)</span></p>
      )}

      {/* History bars — last weeks, target = dashed line */}
      {wk && wk.periods.length > 1 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--tx-faint)', marginBottom: 5, display: 'flex', justifyContent: 'space-between' }}>
            <span>Régularité · {wk.periods.length - 1} dern. semaines</span><span>— cible</span>
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 4, height: 46 }}>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: (100 / 130) * 46, borderTop: '1px dashed var(--tx-faint)', opacity: .55 }} />
            {wk.periods.map((p) => {
              const h = Math.max(3, (Math.min(p.pct, 130) / 130) * 46)
              const col = p.achieved ? 'var(--green)' : 'var(--rose-bright)'
              return (
                <div key={p.key} title={`${p.label} · ${mad(p.actual)} / ${mad(p.target)} MAD (${p.pct}%)`}
                  style={{ flex: 1, height: h, borderRadius: 3, background: col, opacity: p.current ? 1 : .5, minHeight: 3, cursor: 'default' }} />
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
            {wk.periods.map((p) => (
              <span key={p.key} style={{ flex: 1, textAlign: 'center', fontSize: 8.5, color: p.current ? 'var(--tx-mid)' : 'var(--tx-faint)', fontWeight: p.current ? 700 : 400 }}>{p.label}</span>
            ))}
          </div>
        </div>
      )}

      {/* Suggested target */}
      {wk && wk.summary.suggested > 0 && editing !== 'week' && cur && cur.target !== wk.summary.suggested && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '7px 10px', borderRadius: 8, background: 'var(--bg-3)' }}>
          <span style={{ fontSize: 11, color: 'var(--tx-mid)' }}>💡 Cible conseillée <b style={{ color: 'var(--tx-hi)' }}>{mad(wk.summary.suggested)} MAD</b> <span style={{ color: 'var(--tx-faint)' }}>· moy. 4 sem. +10%</span></span>
          <button onClick={() => onSave('week', wk.summary.suggested)} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6, border: '1px solid var(--rose-bright)', background: 'transparent', color: 'var(--rose-bright)', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600 }}>Appliquer</button>
        </div>
      )}

      {/* Monthly goal */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--tx-mid)' }}>
            Objectif du mois · <b style={{ color: (curMo?.pct ?? 0) >= 100 ? 'var(--green)' : 'var(--tx-hi)' }}>{curMo?.pct ?? 0}%</b>
            {mo && mo.summary.streak > 0 && <span style={{ color: 'var(--green)', marginLeft: 6 }}>🔥{mo.summary.streak}</span>}
          </span>
          {editing === 'month' ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input autoFocus type="number" value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commit('month'); if (e.key === 'Escape') setEditing(null) }}
                style={{ width: 90, fontSize: 12, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--rose-bright)', background: 'var(--bg-2)', color: 'var(--tx-hi)' }} />
              <button onClick={() => commit('month')} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, border: 'none', background: 'var(--rose-bright)', color: '#fff', cursor: 'pointer' }}>OK</button>
            </span>
          ) : (
            <button onClick={() => startEdit('month', curMo?.target ?? 0)} style={{ fontSize: 11, color: 'var(--tx-lo)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>de {mad(curMo?.target ?? 0)} MAD ✏️</button>
          )}
        </div>
        <div style={{ height: 7, borderRadius: 4, background: 'var(--bg-3)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(curMo?.pct ?? 0, 100)}%`, height: '100%', borderRadius: 4, background: (curMo?.pct ?? 0) >= 100 ? 'var(--green)' : 'var(--rose-bright)', transition: 'width .5s cubic-bezier(.16,1,.3,1)' }} />
        </div>
        <p style={{ fontSize: 11, color: 'var(--tx-lo)', marginTop: 4 }}>{mad(curMo?.actual ?? 0)} MAD{curMo ? ` · ${MONTHS_FR[Number(curMo.key.slice(5, 7)) - 1]}` : ''}</p>
      </div>

      {/* Extra metrics */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line-soft)', display: 'grid', gap: 10 }}>
        {extra.map((m) => (
          <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--tx-lo)' }}>{m.label}</span>
            <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--tx-hi)' }}>{m.value}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function HeroTile({ label, value, sub, delta, deltaLabel, tone }: { label: string; value: string; sub?: string; delta?: number | null; deltaLabel?: string; tone: 'rose' | 'green' }) {
  const color = tone === 'rose' ? 'var(--rose-bright)' : 'var(--green)'
  return (
    <div className="g-card" style={{ borderRadius: 'var(--radius-lg)', padding: '12px 16px 11px', position: 'relative', overflow: 'hidden' }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: color }} />
      <div style={{ fontSize: 11, color: 'var(--tx-lo)', fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-0.03em', color, lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: 12, color: 'var(--tx-faint)', fontWeight: 500 }}>MAD</span>
      </div>
      {(delta != null || sub) && (
        <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {delta != null && <DeltaPill value={delta} />}
          {delta != null && deltaLabel
            ? <span style={{ fontSize: 11.5, color: 'var(--tx-faint)' }}>vs {deltaLabel}</span>
            : sub && <span style={{ fontSize: 11.5, color: 'var(--tx-faint)' }}>{sub}</span>}
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
