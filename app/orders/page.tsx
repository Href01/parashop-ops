'use client'

import { ChevronDown, ChevronLeft, ChevronRight, Download, Filter, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import BosShell from '@/components/BosShell'

type OrderStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'RETURNED' | 'CANCELLED' | 'FAILED'
type OrderFilter = 'all' | 'pending' | 'no-shipment' | 'incomplete'
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
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">{item.label}</p>
                <p className="text-3xl font-bold mb-1" style={{ color: item.color }}>
                  {item.value}
                </p>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: item.color }}></span>
                  <span className="text-xs text-gray-500">{item.label}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="card-modern">
          <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-200">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setCurrentPage(1)
                }}
                placeholder="Rechercher par nom, téléphone, n°…"
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div className="filter-strip inline-flex gap-1 p-1 bg-gray-100 rounded-lg">
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
                    <span className="selbox"></span>
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
                      <div className="empty-state">
                        {orders.length === 0 ? 'Aucune commande pour le moment. Crée la première depuis WhatsApp, Instagram, TikTok ou par téléphone.' : 'Aucune commande ne correspond aux filtres.'}
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
                          <span className="selbox"></span>
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
                          <span className="fs12 tx-lo mono">{new Date(order.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => deleteOrder(order.id, e)}
                            className="btn-ghost-red btn-icon-sm"
                            title="Delete order"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
            <span className="text-xs text-gray-600">
              Affichage <span className="font-semibold text-gray-900">{filteredOrders.length === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filteredOrders.length)}</span> sur {filteredOrders.length} commandes
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
    </BosShell>
  )
}
