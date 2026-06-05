'use client'

import { ChevronDown, Download, Filter, Plus, RefreshCw, Search } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import BosShell from '@/components/BosShell'

type OrderStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'RETURNED' | 'CANCELLED' | 'FAILED'

interface OrderRow {
  id: number
  orderNumber?: string
  deliveryName?: string
  deliveryPhone?: string
  deliveryCity?: string
  sourceChannel?: string
  status: OrderStatus
  deliveryStatus?: string
  revenue?: number | string | null
  estimatedProfit?: number | string | null
  marginPercent?: number | string | null
  completenessScore?: number | string | null
  createdAt: string
  items_count?: number
  product_names?: string | null
}

const statusLabels: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  SHIPPED: 'In delivery',
  DELIVERED: 'Delivered',
  RETURNED: 'Returned',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
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

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMoney(value: unknown) {
  return toNumber(value).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function completenessColor(value: number) {
  if (value >= 90) return 'var(--green)'
  if (value >= 70) return 'var(--amber)'
  return 'var(--red)'
}

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)

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
    if (!confirm(`Delete order #${orderId}?\n\nThis action cannot be undone.`)) return

    try {
      const res = await fetch(`/api/ops/orders/${orderId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')

      // Remove from list
      setOrders(orders.filter(o => o.id !== orderId))
    } catch (error) {
      console.error('Delete error:', error)
      alert('Failed to delete order')
    }
  }

  const stats = useMemo(() => {
    const count = (status: string) => orders.filter((order) => order.status === status).length

    return [
      { label: 'Pending', value: count('PENDING'), color: 'var(--amber)', className: 'st-pending' },
      { label: 'Confirmed', value: count('CONFIRMED'), color: 'var(--blue)', className: 'st-confirmed' },
      { label: 'Shipped', value: orders.filter((order) => order.deliveryStatus && order.deliveryStatus !== 'NOT_CREATED').length, color: 'var(--violet)', className: 'st-shipped' },
      { label: 'Delivered', value: count('DELIVERED'), color: 'var(--green)', className: 'st-delivered' },
      { label: 'Returned', value: count('RETURNED') + count('FAILED'), color: 'var(--red)', className: 'st-returned' },
      { label: 'Cancelled', value: count('CANCELLED'), color: 'var(--tx-mid)', className: 'st-cancelled' },
    ]
  }, [orders])

  return (
    <BosShell active="orders" title="Orders" crumb="Operations">
      <div className="page-inner page-wide">
        <div className="page-head">
          <div>
            <h1>Orders</h1>
            <div className="sub">{orders.length} orders across active channels</div>
          </div>
          <div className="spacer"></div>
          <button type="button" className="btn">
            <RefreshCw />
            Sync Sendit
          </button>
          <button type="button" className="btn">
            <Download />
            Export
          </button>
          <Link className="btn primary" href="/orders/new">
            <Plus />
            New order
          </Link>
        </div>

        <div className="ostat-row">
          {stats.map((item) => (
            <div key={item.label} className="panel ostat">
              <div className="ov" style={{ color: item.color }}>
                {item.value}
              </div>
              <div className={`ol st ${item.className}`}>
                <span className="sd"></span>
                {item.label}
              </div>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="toolbar">
            <div className="ord-search">
              <Search />
              <input placeholder="Search by name, phone, order #..." />
            </div>
            <div className="vdiv"></div>
            <button type="button" className="chip active">
              All <span className="ct">{orders.length}</span>
            </button>
            <button type="button" className="chip">
              Needs confirmation <span className="ct">{stats[0].value}</span>
            </button>
            <button type="button" className="chip">
              No shipment <span className="ct">{orders.filter((order) => order.status === 'CONFIRMED' && !order.deliveryStatus).length}</span>
            </button>
            <button type="button" className="chip">
              Incomplete <span className="ct">{orders.filter((order) => toNumber(order.completenessScore) < 90).length}</span>
            </button>
            <div className="spacer"></div>
            <button type="button" className="btn sm">
              <Filter />
              Filters
            </button>
            <button type="button" className="btn sm">
              This week
              <ChevronDown />
            </button>
          </div>

          <div className="table-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="select-col">
                    <span className="selbox"></span>
                  </th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Delivery</th>
                  <th className="r">Revenue</th>
                  <th className="r">Profit</th>
                  <th className="r">Margin</th>
                  <th>Data</th>
                  <th className="r">Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1, 2, 3, 4, 5].map((item) => (
                    <tr key={item}>
                      <td colSpan={11}>
                        <div className="skeleton-line"></div>
                      </td>
                    </tr>
                  ))
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={11}>
                      <div className="empty-state">No orders yet. Create the first one from WhatsApp, Instagram, TikTok, or phone.</div>
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => {
                    const completeness = toNumber(order.completenessScore || 100)
                    const profit = toNumber(order.estimatedProfit)
                    const margin = order.marginPercent === null || order.marginPercent === undefined ? null : toNumber(order.marginPercent)

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
                            <span className="t-sub mono">{order.orderNumber || 'Manual order'}</span>
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
                            <span className="t-strong">{order.deliveryName || 'No name'}</span>
                            <span className="t-sub">
                              {order.deliveryCity || 'No city'} - {order.deliveryPhone || 'No phone'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="row gap6">
                            <span className="chan-dot" style={{ background: channelColors[order.sourceChannel || 'Manual'] || 'var(--c-manual)' }}></span>
                            <span className="fs12">{order.sourceChannel || 'Manual'}</span>
                          </span>
                        </td>
                        <td>
                          <span className={`st ${statusClass[order.status] || 'st-pending'}`}>
                            <span className="sd"></span>
                            {statusLabels[order.status] || order.status}
                          </span>
                        </td>
                        <td>
                          <span className="fs12 tx-mid">{order.deliveryStatus || 'Not created'}</span>
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
                            🗑️
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="between table-foot">
            <span className="fs12 tx-lo">
              Showing <b className="tx-mid">{Math.min(orders.length, 100)}</b> of {orders.length} orders
            </span>
            <div className="row gap6">
              <button type="button" className="btn sm">Prev</button>
              <button type="button" className="btn sm active-page">1</button>
              <button type="button" className="btn sm">Next</button>
            </div>
          </div>
        </div>
      </div>
    </BosShell>
  )
}
