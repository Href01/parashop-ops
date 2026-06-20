'use client'

import { ChevronDown, ChevronLeft, ChevronRight, Download, Filter, Plus, RefreshCw, Search, Star, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import BosShell from '@/components/BosShell'

type OrderStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'RETURNED' | 'CANCELLED' | 'FAILED'
type OrderFilter = 'all' | 'pending' | 'no-shipment' | 'incomplete' | 'delivered-no-review'
type DateFilter = 'today' | 'week' | 'month' | 'all'

const PAGE_SIZE = 25

interface OrderRow {
  id: number
  orderNumber?: string
  deliveryName?: string
  deliveryPhone?: string
  deliveryCity?: string
  sourceChannel?: string
  status: OrderStatus
  deliveryStatus?: string
  senditStatus?: string | null
  senditTrackingId?: string | null
  revenue?: number | string | null
  estimatedProfit?: number | string | null
  marginPercent?: number | string | null
  createdAt: string
  items_count?: number
  product_names?: string | null
  reviewRequestSentAt?: string | null
}

const statusLabels: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmée',
  SHIPPED: 'En livraison',
  DELIVERED: 'Livrée',
  RETURNED: 'Retournée',
  CANCELLED: 'Annulée',
  FAILED: 'Échouée',
}

const statusClass: Record<string, string> = {
  PENDING: 'st-pending',
  CONFIRMED: 'st-confirmed',
  SHIPPED: 'st-shipped',
  DELIVERED: 'st-delivered',
  RETURNED: 'st-returned',
  CANCELLED: 'st-cancelled',
  FAILED: 'st-failed',
}

const channelColors: Record<string, string> = {
  Website: 'var(--c-website)',
  WhatsApp: 'var(--c-whatsapp)',
  Instagram: 'var(--c-instagram)',
  TikTok: 'var(--c-tiktok)',
  Manual: 'var(--c-manual)',
}

const dateFilterLabels: Record<DateFilter, string> = {
  today: "Aujourd'hui",
  week: 'Cette semaine',
  month: '30 jours',
  all: 'Tout',
}

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMoney(value: unknown) {
  return toNumber(value).toLocaleString('fr-FR', { maximumFractionDigits: 0 })
}

/** Real completeness from actual fields (the completenessScore column doesn't exist). */
function orderCompleteness(o: OrderRow): number {
  const checks = [!!o.deliveryName, !!o.deliveryPhone, !!o.deliveryCity, !!o.product_names]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}
function completenessColor(value: number) {
  if (value >= 100) return 'var(--green)'
  if (value >= 75) return 'var(--amber)'
  return 'var(--red)'
}

// Real Sendit delivery states → French (so the column matches what's on Sendit).
const SENDIT_DELIVERY: Record<string, { text: string; cls: string }> = {
  WAREHOUSE: { text: 'Au dépôt', cls: 'st-shipped' },
  PICKED_UP: { text: 'Ramassée', cls: 'st-shipped' },
  IN_TRANSIT: { text: 'En transit', cls: 'st-shipped' },
  DISTRIBUTION: { text: 'En distribution', cls: 'st-shipped' },
  DELIVERED: { text: 'Livrée', cls: 'st-delivered' },
  RETURNED: { text: 'Retournée', cls: 'st-returned' },
  REJECTED: { text: 'Refusée', cls: 'st-returned' },
  REFUSED: { text: 'Refusée', cls: 'st-returned' },
  CANCELED: { text: 'Annulée', cls: 'st-cancelled' },
  CANCELLED: { text: 'Annulée', cls: 'st-cancelled' },
}

/** Delivery label — shows the real Sendit status when present, else derives it. */
function deliveryLabel(o: OrderRow): { text: string; cls: string } {
  const ss = o.senditStatus?.toUpperCase()
  if (ss) return SENDIT_DELIVERY[ss] || { text: o.senditStatus as string, cls: 'st-shipped' }
  if (o.status === 'DELIVERED') return { text: 'Livrée', cls: 'st-delivered' }
  if (o.status === 'CANCELLED') return { text: 'Annulée', cls: 'st-cancelled' }
  if (o.status === 'RETURNED' || o.status === 'FAILED') return { text: 'Retournée', cls: 'st-returned' }
  if (o.senditTrackingId) return { text: 'En transit', cls: 'st-shipped' }
  return { text: 'Non expédiée', cls: 'st-pending' }
}

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<OrderFilter>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [reviewSending, setReviewSending] = useState<Set<number>>(new Set())
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkSending, setBulkSending] = useState(false)

  const showToast = (text: string, ok: boolean, ms = 3500) => {
    setToast({ text, ok })
    setTimeout(() => setToast(null), ms)
  }
  const toggleSelect = (id: number) =>
    setSelectedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  useEffect(() => {
    void fetchOrders()
  }, [])

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/ops/orders', { cache: 'no-store' })
      const data = (await res.json()) as OrderRow[]
      setOrders(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteOrder = async (orderId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Supprimer la commande #${orderId} ?\n\nCette action est irréversible.`)) return

    try {
      const res = await fetch(`/api/ops/orders/${orderId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')

      // Remove from list
      setOrders((currentOrders) => currentOrders.filter(o => o.id !== orderId))
    } catch (error) {
      console.error('Delete error:', error)
      alert('Échec de la suppression de la commande')
    }
  }

  const requestReview = async (orderId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (reviewSending.has(orderId)) return
    setReviewSending((s) => new Set(s).add(orderId))
    try {
      const res = await fetch(`/api/ops/orders/${orderId}/review-request`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Échec de l’envoi')
      setOrders((cur) => cur.map((o) => (o.id === orderId ? { ...o, reviewRequestSentAt: new Date().toISOString() } : o)))
      setToast({ text: `Demande d’avis envoyée (#${orderId})`, ok: true })
    } catch (err: any) {
      setToast({ text: err.message || 'Échec de l’envoi', ok: false })
    } finally {
      setReviewSending((s) => { const n = new Set(s); n.delete(orderId); return n })
      setTimeout(() => setToast(null), 3500)
    }
  }

  const bulkRequestReview = async () => {
    // One message per customer (dedupe by phone): the endpoint marks all of a
    // customer's delivered orders as asked, so don't message the same number twice.
    const seen = new Set<string>()
    const targets = orders.filter((o) => {
      if (!selectedIds.has(o.id) || o.status !== 'DELIVERED') return false
      const key = o.deliveryPhone || `id:${o.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    if (targets.length === 0) { showToast('Aucune commande livrée sélectionnée', false); return }
    if (!confirm(`Envoyer la demande d’avis à ${targets.length} client(s) ?`)) return

    setBulkSending(true)
    let ok = 0, fail = 0
    for (const o of targets) {
      try {
        const res = await fetch(`/api/ops/orders/${o.id}/review-request`, { method: 'POST' })
        res.ok ? ok++ : fail++
      } catch { fail++ }
    }
    setBulkSending(false)
    setSelectedIds(new Set())
    await fetchOrders()
    showToast(`${ok} demande(s) envoyée(s)${fail ? `, ${fail} échec(s)` : ''}`, fail === 0, 4500)
  }

  const updateChannel = async (orderId: number, sourceChannel: string) => {
    setOrders((cur) => cur.map((o) => (o.id === orderId ? { ...o, sourceChannel } : o)))
    await fetch(`/api/ops/orders/${orderId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceChannel }),
    }).catch(() => {})
  }

  const handleSyncSendit = async () => {
    if (!confirm('Synchroniser les statuts de livraison depuis Sendit ?\n\nToutes les commandes en transit seront mises à jour.')) return

    try {
      const res = await fetch('/api/ops/orders/sync-sendit', { method: 'POST' })
      if (!res.ok) throw new Error('Sync failed')

      await fetchOrders()
      alert('Synchronisation Sendit réussie ✓')
    } catch (error) {
      console.error('Sync error:', error)
      alert('Échec de la synchronisation Sendit')
    }
  }

  const handleExport = () => {
    const csv = [
      ['Order #', 'Customer', 'Phone', 'City', 'Status', 'Revenue', 'Profit', 'Margin %', 'Date'],
      ...filteredOrders.map(o => [
        o.orderNumber || o.id,
        o.deliveryName || '',
        o.deliveryPhone || '',
        o.deliveryCity || '',
        o.status,
        o.revenue || 0,
        o.estimatedProfit || 0,
        o.marginPercent || 0,
        new Date(o.createdAt).toLocaleDateString()
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `orders-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const cycleDateFilter = () => {
    const nextByFilter: Record<DateFilter, DateFilter> = {
      today: 'week',
      week: 'month',
      month: 'all',
      all: 'today',
    }
    setDateFilter(nextByFilter[dateFilter])
    setCurrentPage(1)
  }

  const selectFilter = (filter: OrderFilter) => {
    setActiveFilter(filter)
    setCurrentPage(1)
  }

  const stats = useMemo(() => {
    const count = (status: string) => orders.filter((order) => order.status === status).length

    return [
      { label: 'En attente', value: count('PENDING'), color: 'var(--amber)', className: 'st-pending' },
      { label: 'Confirmées', value: count('CONFIRMED'), color: 'var(--blue)', className: 'st-confirmed' },
      { label: 'En transit', value: orders.filter((o) => !!o.senditTrackingId && o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length, color: 'var(--violet)', className: 'st-shipped' },
      { label: 'Livrées', value: count('DELIVERED'), color: 'var(--green)', className: 'st-delivered' },
      { label: 'Retournées', value: count('RETURNED') + count('FAILED'), color: 'var(--red)', className: 'st-returned' },
      { label: 'Annulées', value: count('CANCELLED'), color: 'var(--tx-mid)', className: 'st-cancelled' },
    ]
  }, [orders])

  const filteredOrders = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const now = new Date()

    return orders.filter((order) => {
      if (normalizedSearch) {
        const searchable = [
          order.id,
          order.orderNumber,
          order.deliveryName,
          order.deliveryPhone,
          order.deliveryCity,
          order.sourceChannel,
          order.product_names,
        ].join(' ').toLowerCase()

        if (!searchable.includes(normalizedSearch)) return false
      }

      if (activeFilter === 'pending' && order.status !== 'PENDING') return false
      if (
        activeFilter === 'no-shipment' &&
        (order.status !== 'CONFIRMED' || (order.deliveryStatus && order.deliveryStatus !== 'NOT_CREATED'))
      ) {
        return false
      }
      if (activeFilter === 'incomplete' && orderCompleteness(order) >= 100) return false
      if (activeFilter === 'delivered-no-review' && (order.status !== 'DELIVERED' || !!order.reviewRequestSentAt)) return false

      if (dateFilter !== 'all') {
        const createdAt = new Date(order.createdAt)
        if (Number.isNaN(createdAt.getTime())) return false

        if (dateFilter === 'today') {
          return createdAt.toDateString() === now.toDateString()
        }

        const days = dateFilter === 'week' ? 7 : 30
        const cutoff = new Date(now)
        cutoff.setDate(cutoff.getDate() - days)
        return createdAt >= cutoff
      }

      return true
    })
  }, [orders, search, activeFilter, dateFilter])

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE))
  const currentPageInRange = Math.min(currentPage, totalPages)
  const pageStart = (currentPageInRange - 1) * PAGE_SIZE
  const paginatedOrders = filteredOrders.slice(pageStart, pageStart + PAGE_SIZE)
  const hasActiveFilters = search.trim() || activeFilter !== 'all' || dateFilter !== 'week'

  const resetFilters = () => {
    setSearch('')
    setActiveFilter('all')
    setDateFilter('week')
    setCurrentPage(1)
  }

  return (
    <BosShell active="orders" title="Commandes" crumb="Opérations">
      <div style={{ maxWidth: '1640px', margin: '0 auto', padding: '22px 24px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: '6px' }}>
              OPÉRATIONS · COMMANDES
            </div>
            <h1 className="serif-display" style={{ fontSize: '30px', lineHeight: 1.05, marginBottom: '6px' }}>Commandes</h1>
            <div style={{ fontSize: '13px', color: 'var(--tx-lo)' }}>
              {orders.length} commande{orders.length !== 1 ? 's' : ''} au total
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" className="btn-modern btn-secondary" onClick={handleSyncSendit}>
              <RefreshCw className="w-4 h-4" />
              Sync Sendit
            </button>
            <button type="button" className="btn-modern btn-secondary" onClick={handleExport}>
              <Download className="w-4 h-4" />
              Exporter
            </button>
            <Link className="btn-modern btn-primary" href="/orders/new">
              <Plus className="w-4 h-4" />
              Nouvelle commande
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          {stats.map((item) => (
            <div key={item.label} className="card-modern">
              <div className="card-body">
                <p className="text-xs font-medium text-tx-lo uppercase tracking-wide mb-2">{item.label}</p>
                <p className="text-3xl font-bold mb-1" style={{ color: item.color }}>
                  {item.value}
                </p>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: item.color }}></span>
                  <span className="text-xs text-tx-faint">{item.label}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="card-modern">
          <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line-soft">
            <div className="search-box">
              <Search />
              <input
                type="text"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setCurrentPage(1)
                }}
                placeholder="Rechercher par nom, téléphone, n°…"
              />
            </div>

            <div className="filter-strip inline-flex gap-1 p-1 bg-bg-2 rounded-lg">
              <button
                type="button"
                className={`btn-modern btn-sm ${activeFilter === 'all' ? 'btn-primary' : 'btn-subtle'}`}
                onClick={() => selectFilter('all')}
              >
                Toutes <span className="ml-1 badge-modern badge-neutral badge-sm">{orders.length}</span>
              </button>
              <button
                type="button"
                className={`btn-modern btn-sm ${activeFilter === 'pending' ? 'btn-primary' : 'btn-subtle'}`}
                onClick={() => selectFilter('pending')}
              >
                En attente <span className="ml-1 badge-modern badge-warning badge-sm">{stats[0].value}</span>
              </button>
              <button
                type="button"
                className={`btn-modern btn-sm ${activeFilter === 'no-shipment' ? 'btn-primary' : 'btn-subtle'}`}
                onClick={() => selectFilter('no-shipment')}
              >
                Sans envoi <span className="ml-1 badge-modern badge-info badge-sm">{orders.filter((order) => order.status === 'CONFIRMED' && (!order.deliveryStatus || order.deliveryStatus === 'NOT_CREATED')).length}</span>
              </button>
              <button
                type="button"
                className={`btn-modern btn-sm ${activeFilter === 'incomplete' ? 'btn-primary' : 'btn-subtle'}`}
                onClick={() => selectFilter('incomplete')}
              >
                Incomplètes <span className="ml-1 badge-modern badge-danger badge-sm">{orders.filter((order) => orderCompleteness(order) < 100).length}</span>
              </button>
              <button
                type="button"
                className={`btn-modern btn-sm ${activeFilter === 'delivered-no-review' ? 'btn-primary' : 'btn-subtle'}`}
                onClick={() => selectFilter('delivered-no-review')}
              >
                Avis à demander <span className="ml-1 badge-modern badge-info badge-sm">{orders.filter((o) => o.status === 'DELIVERED' && !o.reviewRequestSentAt).length}</span>
              </button>
            </div>

            <button type="button" className="btn-modern btn-sm btn-secondary" onClick={resetFilters} disabled={!hasActiveFilters}>
              <Filter className="w-4 h-4" />
              Réinitialiser
            </button>
            <button type="button" className="btn-modern btn-sm btn-secondary" onClick={cycleDateFilter} title="Cycle date range">
              {dateFilterLabels[dateFilter]}
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="table-modern">
              <thead>
                <tr>
                  <th className="select-col">
                    <input
                      type="checkbox"
                      checked={paginatedOrders.length > 0 && paginatedOrders.every((o) => selectedIds.has(o.id))}
                      onChange={(e) => {
                        const check = e.target.checked
                        setSelectedIds((s) => { const n = new Set(s); paginatedOrders.forEach((o) => check ? n.add(o.id) : n.delete(o.id)); return n })
                      }}
                    />
                  </th>
                  <th>Commande</th>
                  <th>Client</th>
                  <th>Canal</th>
                  <th>Statut</th>
                  <th>Livraison</th>
                  <th className="r">CA</th>
                  <th className="r">Profit</th>
                  <th className="r">Marge</th>
                  <th>Données</th>
                  <th className="r">Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1, 2, 3, 4, 5].map((item) => (
                    <tr key={item}>
                      <td colSpan={12}>
                        <div className="skeleton-line"></div>
                      </td>
                    </tr>
                  ))
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={12}>
                      <div style={{ textAlign: 'center', padding: '46px 20px' }}>
                        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                          {orders.length === 0
                            ? <Plus style={{ width: 26, height: 26, color: 'var(--tx-faint)' }} />
                            : <Filter style={{ width: 26, height: 26, color: 'var(--tx-faint)' }} />}
                        </div>
                        <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--tx-mid)', margin: '0 0 4px' }}>
                          {orders.length === 0 ? 'Aucune commande pour le moment' : 'Aucun résultat'}
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--tx-faint)', margin: '0 0 16px', maxWidth: 360, marginInline: 'auto' }}>
                          {orders.length === 0
                            ? 'Créez votre première commande depuis WhatsApp, Instagram, TikTok ou par téléphone.'
                            : 'Aucune commande ne correspond aux filtres actuels.'}
                        </p>
                        {orders.length === 0 && (
                          <Link className="btn-modern btn-primary btn-sm" href="/orders/new" style={{ display: 'inline-flex' }}>
                            <Plus className="w-4 h-4" /> Nouvelle commande
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedOrders.map((order) => {
                    const completeness = orderCompleteness(order)
                    const profit = toNumber(order.estimatedProfit)
                    const margin = order.marginPercent === null || order.marginPercent === undefined ? null : toNumber(order.marginPercent)
                    const deliv = deliveryLabel(order)

                    return (
                      <tr
                        key={order.id}
                        className="tbl-row-link"
                        onClick={() => router.push(`/orders/${order.id}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(order.id)}
                            onChange={() => toggleSelect(order.id)}
                          />
                        </td>
                        <td>
                          <div className="cellstack">
                            <span className="num fs12 t-strong">#{order.id}</span>
                            <span className="t-sub mono">{order.orderNumber || 'Commande manuelle'}</span>
                            {order.product_names && (
                              <span className="t-sub" style={{ fontSize: '11px', color: 'var(--tx-mid)' }}>
                                {order.product_names.length > 50
                                  ? order.product_names.substring(0, 50) + '...'
                                  : order.product_names}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="cellstack">
                            <span className="t-strong">{order.deliveryName || 'Sans nom'}</span>
                            <span className="t-sub">
                              {order.deliveryCity || 'Ville ?'} · {order.deliveryPhone || 'Tél ?'}
                            </span>
                          </div>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <span className="row gap6">
                            <span className="chan-dot" style={{ background: channelColors[order.sourceChannel || 'Manual'] || 'var(--c-manual)' }}></span>
                            <select
                              value={order.sourceChannel || 'Manual'}
                              onChange={(e) => updateChannel(order.id, e.target.value)}
                              title="Tagger le canal"
                              style={{ background: 'transparent', border: '1px solid transparent', borderRadius: 6, padding: '2px 4px', fontSize: 12, color: 'var(--tx-mid)', cursor: 'pointer' }}
                              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
                              onBlur={(e) => (e.currentTarget.style.borderColor = 'transparent')}
                            >
                              {['Manual', 'WhatsApp', 'Instagram', 'TikTok', 'Phone', 'Website', 'Facebook'].map((ch) => (
                                <option key={ch} value={ch}>{ch}</option>
                              ))}
                            </select>
                          </span>
                        </td>
                        <td>
                          <span className={`st ${statusClass[order.status] || 'st-pending'}`}>
                            <span className="sd"></span>
                            {statusLabels[order.status] || order.status}
                          </span>
                        </td>
                        <td>
                          <span className={`st ${deliv.cls}`}><span className="sd"></span>{deliv.text}</span>
                        </td>
                        <td className="r">
                          <span className="num t-strong">{formatMoney(order.revenue)}</span> <span className="tx-lo fs11">MAD</span>
                        </td>
                        <td className="r">
                          {order.estimatedProfit === null || order.estimatedProfit === undefined ? (
                            <span className="tx-faint fs12">-</span>
                          ) : (
                            <span className={`num fw600 ${profit < 0 ? 'neg' : 'pos'}`}>{profit > 0 ? '+' : ''}{formatMoney(profit)}</span>
                          )}
                        </td>
                        <td className="r">
                          {margin === null ? <span className="tx-faint fs12">-</span> : <span className={`num ${margin < 0 ? 'neg' : 'tx-mid'}`}>{margin.toFixed(1)}%</span>}
                        </td>
                        <td>
                          <span className="comp-mini">
                            <span className="cm-track">
                              <span style={{ width: `${completeness}%`, background: completenessColor(completeness) }}></span>
                            </span>
                            <span className="num fs11" style={{ color: completenessColor(completeness) }}>
                              {completeness}%
                            </span>
                          </span>
                        </td>
                        <td className="r">
                          <span className="fs12 tx-lo mono">{new Date(order.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {order.status === 'DELIVERED' && (
                              <button
                                onClick={(e) => requestReview(order.id, e)}
                                disabled={reviewSending.has(order.id)}
                                className="btn-icon-sm"
                                title={order.reviewRequestSentAt ? 'Avis déjà demandé — cliquer pour renvoyer' : 'Demander un avis (WhatsApp)'}
                                style={{ color: order.reviewRequestSentAt ? 'var(--green)' : '#9CA3AF', opacity: reviewSending.has(order.id) ? 0.5 : 1 }}
                              >
                                {reviewSending.has(order.id)
                                  ? <RefreshCw className="w-4 h-4 spin" />
                                  : <Star className="w-4 h-4" fill={order.reviewRequestSentAt ? 'currentColor' : 'none'} />}
                              </button>
                            )}
                            <button
                              onClick={(e) => deleteOrder(order.id, e)}
                              className="btn-ghost-red btn-icon-sm"
                              title="Delete order"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between p-4 border-t border-line-soft bg-bg-2">
            <span className="text-xs text-tx-lo">
              Affichage <span className="font-semibold text-tx-hi">{filteredOrders.length === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filteredOrders.length)}</span> sur {filteredOrders.length} commandes
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-modern btn-sm btn-secondary"
                onClick={() => setCurrentPage((page) => Math.max(1, Math.min(page, totalPages) - 1))}
                disabled={currentPageInRange <= 1}
              >
                <ChevronLeft className="w-4 h-4" />
                Préc.
              </button>
              <button type="button" className="btn-modern btn-sm btn-primary">{currentPageInRange}/{totalPages}</button>
              <button
                type="button"
                className="btn-modern btn-sm btn-secondary"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, Math.min(page, totalPages) + 1))}
                disabled={currentPageInRange >= totalPages}
              >
                Suiv.
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-lg bg-bg-1 border border-line-soft">
          <span className="text-sm font-medium text-tx-mid">{selectedIds.size} sélectionnée(s)</span>
          <button onClick={bulkRequestReview} disabled={bulkSending} className="btn-modern btn-sm btn-primary inline-flex items-center gap-1.5">
            {bulkSending ? <RefreshCw className="w-4 h-4 spin" /> : <Star className="w-4 h-4" />}
            {bulkSending ? 'Envoi…' : 'Demander un avis'}
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="btn-modern btn-sm btn-secondary">Annuler</button>
        </div>
      )}

      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white flex items-center gap-2"
          style={{ background: toast.ok ? 'var(--green, #0C6B52)' : '#DC2626' }}
        >
          {toast.ok ? <Star className="w-4 h-4" fill="currentColor" /> : null}
          {toast.text}
        </div>
      )}
    </BosShell>
  )
}
