'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import BosShell from '@/components/BosShell'
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Calendar,
  Package,
  ShoppingCart,
  DollarSign,
  BarChart3,
} from 'lucide-react'

const ORDER_BADGE: Record<string, string> = { PENDING: 'amber', CONFIRMED: 'blue', DELIVERED: 'green', CANCELLED: 'red' }
const ORDER_LABEL: Record<string, string> = { PENDING: 'En attente', CONFIRMED: 'Confirmée', DELIVERED: 'Livrée', CANCELLED: 'Annulée' }

type Event = {
  id: number
  name: string
  type: string
  description: string
  status: string
  startDate: string
  endDate: string
  totalRevenue: number
  totalOrders: number
  totalUnits: number
  avgOrderValue: number
  normalPeriodRevenue: number
  normalPeriodOrders: number
  revenueIncrease: number
  ordersIncrease: number
  topCategory: string
  topCategoryRevenue: number
  topProduct: string
  topProductRevenue: number
  categories: any[]
  products: any[]
  orders: any[]
}

export default function EventDetailPage() {
  const params = useParams()
  const eventId = params?.id as string

  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (eventId) {
      fetchEvent()
    }
  }, [eventId])

  const fetchEvent = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ops/events/${eventId}`)
      const data = await res.json()
      setEvent(data)
    } catch (error) {
      console.error('Failed to fetch event:', error)
    } finally {
      setLoading(false)
    }
  }

  const recalculate = async () => {
    try {
      await fetch(`/api/ops/events/${eventId}/calculate`, { method: 'POST' })
      fetchEvent() // Refresh
    } catch (error) {
      console.error('Failed to recalculate:', error)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 }).format(amount || 0)
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (loading) {
    return (
      <BosShell active="events" title="Event" crumb="Growth">
        <div className="page-inner">
          <p>Loading event...</p>
        </div>
      </BosShell>
    )
  }

  if (!event) {
    return (
      <BosShell active="events" title="Event" crumb="Growth">
        <div className="page-inner">
          <p>Event not found</p>
        </div>
      </BosShell>
    )
  }

  return (
    <BosShell active="events" title={event.name} crumb="Growth">
      <div className="page-inner page-wide">
        {/* Header */}
        <div className="page-head">
          <button className="btn ghost" onClick={() => window.history.back()}>
            <ArrowLeft />
            Back
          </button>
          <div>
            <h1>{event.name}</h1>
            <div className="sub">
              {formatDate(event.startDate)} - {formatDate(event.endDate)} • {event.type}
            </div>
          </div>
          <div className="spacer"></div>
          <span className={`badge ${event.status === 'Active' ? 'green' : event.status === 'Upcoming' ? 'blue' : 'gray'}`}>
            {event.status}
          </span>
          <button className="btn" onClick={recalculate}>
            <TrendingUp />
            Recalculate impact
          </button>
        </div>

        {/* Impact Metrics */}
        <div className="cstat-row">
          <ImpactMetric
            icon={<DollarSign />}
            title="Event revenue"
            value={formatCurrency(event.totalRevenue)}
            unit="MAD"
            change={event.revenueIncrease}
            baseline={formatCurrency(event.normalPeriodRevenue)}
          />
          <ImpactMetric
            icon={<ShoppingCart />}
            title="Total orders"
            value={event.totalOrders?.toString() || '0'}
            unit=""
            change={event.ordersIncrease}
            baseline={`${event.normalPeriodOrders || 0} normal`}
          />
          <ImpactMetric
            icon={<Package />}
            title="Units sold"
            value={event.totalUnits?.toString() || '0'}
            unit=""
            change={null}
            baseline={`${formatCurrency(event.avgOrderValue || 0)} MAD avg`}
          />
          <ImpactMetric
            icon={<BarChart3 />}
            title="Top category"
            value={event.topCategory || '-'}
            unit=""
            change={null}
            baseline={event.topCategoryRevenue ? `${formatCurrency(event.topCategoryRevenue)} MAD` : ''}
          />
        </div>

        <div className="row gap20" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Left Column */}
          <div style={{ flex: '2 1 600px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Category Performance */}
            <div className="panel">
              <div className="panel-head">
                <BarChart3 />
                <h3>Performance by category</h3>
                <span className="hint">Revenue breakdown</span>
              </div>
              <div className="table-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th className="r">Revenue</th>
                      <th className="r">Orders</th>
                      <th className="r">Units</th>
                      <th className="r">Avg order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(event.categories || []).map((cat: any) => (
                      <tr key={cat.category}>
                        <td className="t-strong">{cat.category}</td>
                        <td className="r num pos">{formatCurrency(cat.revenue)}</td>
                        <td className="r num">{cat.orders}</td>
                        <td className="r num">{cat.units}</td>
                        <td className="r num">
                          {cat.orders > 0 ? formatCurrency(cat.revenue / cat.orders) : 0} MAD
                        </td>
                      </tr>
                    ))}
                    {(event.categories || []).length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: 20 }}>
                          No category data yet - click "Recalculate impact" above
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top Products */}
            <div className="panel">
              <div className="panel-head">
                <Package />
                <h3>Top products</h3>
                <span className="hint">Best sellers during event</span>
              </div>
              <div className="table-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th className="r">Revenue</th>
                      <th className="r">Orders</th>
                      <th className="r">Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(event.products || []).slice(0, 20).map((product: any) => (
                      <tr key={product.productId}>
                        <td>
                          <div className="row gap8">
                            {product.image && (
                              <img
                                src={product.image}
                                alt={product.productName}
                                style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }}
                              />
                            )}
                            <div>
                              <div className="t-strong fs12">{product.productName}</div>
                              <div className="fs11 tx-lo">{product.brand}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="badge">{product.category}</span>
                        </td>
                        <td className="r num pos">{formatCurrency(product.revenue)}</td>
                        <td className="r num">{product.orders}</td>
                        <td className="r num">{product.units}</td>
                      </tr>
                    ))}
                    {(event.products || []).length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: 20 }}>
                          No product data yet - click "Recalculate impact" above
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Orders */}
            <div className="panel">
              <div className="panel-head">
                <ShoppingCart />
                <h3>Orders during event</h3>
                <span className="badge green">{(event.orders || []).length}</span>
              </div>
              <div className="table-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Order #</th>
                      <th>Customer</th>
                      <th className="r">Total</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(event.orders || []).slice(0, 10).map((order: any) => (
                      <tr
                        key={order.id}
                        onClick={() => (window.location.href = `/orders/${order.id}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="t-strong">{order.orderNumber}</td>
                        <td>{order.deliveryName}</td>
                        <td className="r num pos">{formatCurrency(order.total)}</td>
                        <td>
                          <span className={`badge ${ORDER_BADGE[order.status] || 'gray'}`}>
                            {ORDER_LABEL[order.status] || order.status}
                          </span>
                        </td>
                        <td className="fs12 tx-lo">{formatDate(order.createdAt)}</td>
                      </tr>
                    ))}
                    {(event.orders || []).length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: 20 }}>
                          No orders during this event period yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div style={{ flex: '1 1 320px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Event Info */}
            <div className="panel">
              <div className="panel-head">
                <Calendar />
                <h3>Event details</h3>
              </div>
              <div className="panel-pad">
                <div className="info-row">
                  <span className="info-label">Type</span>
                  <span className="badge">{event.type}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Period</span>
                  <span className="info-value">
                    {formatDate(event.startDate)} - {formatDate(event.endDate)}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Duration</span>
                  <span className="info-value">
                    {Math.ceil(
                      (new Date(event.endDate).getTime() - new Date(event.startDate).getTime()) /
                        (1000 * 60 * 60 * 24)
                    )}{' '}
                    days
                  </span>
                </div>
              </div>
            </div>

            {/* Impact vs Normal */}
            <div className="panel">
              <div className="panel-head">
                <TrendingUp />
                <h3>Impact vs normal</h3>
              </div>
              <div className="panel-pad">
                <ComparisonRow
                  label="Revenue"
                  eventValue={event.totalRevenue}
                  normalValue={event.normalPeriodRevenue}
                  increase={event.revenueIncrease}
                />
                <ComparisonRow
                  label="Orders"
                  eventValue={event.totalOrders}
                  normalValue={event.normalPeriodOrders}
                  increase={event.ordersIncrease}
                />
                <div className="mt12 p12" style={{ background: 'var(--bg-soft)', borderRadius: 8 }}>
                  <div className="fs11 tx-lo mb4">Normal period</div>
                  <div className="fs12">
                    Same duration ({Math.ceil((new Date(event.endDate).getTime() - new Date(event.startDate).getTime()) / (1000 * 60 * 60 * 24))} days) BEFORE event start
                  </div>
                </div>
              </div>
            </div>

            {/* Category Distribution */}
            {(event.categories || []).length > 0 && (
              <div className="panel">
                <div className="panel-head">
                  <BarChart3 />
                  <h3>Category share</h3>
                </div>
                <div className="panel-pad">
                  {event.categories.slice(0, 5).map((cat: any) => {
                    const share = event.totalRevenue > 0 ? (Number(cat.revenue) / Number(event.totalRevenue)) * 100 : 0
                    return (
                      <div key={cat.category} className="mb12">
                        <div className="between mb4">
                          <span className="fs12 fw500">{cat.category}</span>
                          <span className="num fs12 pos">{formatCurrency(cat.revenue)} MAD</span>
                        </div>
                        <div className="bar">
                          <span
                            style={{
                              width: `${share}%`,
                              background: 'var(--green)',
                            }}
                          ></span>
                        </div>
                        <div className="fs11 tx-lo mt2">{share.toFixed(1)}% of total revenue</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </BosShell>
  )
}

function ImpactMetric({ icon, title, value, unit, change, baseline }: any) {
  return (
    <div className="panel kpi">
      <div className="kpi-top">
        <div className="kpi-ico" style={{ background: 'var(--teal-bg)', color: 'var(--teal)' }}>
          {icon}
        </div>
        <span className="kpi-title">{title}</span>
      </div>
      <div className="kpi-val">
        <span>{value}</span>
        {unit && <span className="cur">{unit}</span>}
      </div>
      <div className="kpi-meta">
        {change !== null && change !== undefined ? (
          <span className={`delta ${Number(change) >= 0 ? 'up' : 'down'}`}>
            {Number(change) >= 0 ? <TrendingUp /> : <TrendingDown />}
            {Number(change) >= 0 ? '+' : ''}
            {Number(change).toFixed(1)}% vs normal
          </span>
        ) : (
          <span className="delta up">
            <TrendingUp />
            {baseline}
          </span>
        )}
      </div>
    </div>
  )
}

function ComparisonRow({ label, eventValue, normalValue, increase }: any) {
  const inc = Number(increase) || 0
  return (
    <div className="mb12">
      <div className="between mb4">
        <span className="fs12 fw500">{label}</span>
        <span className={`num fs12 ${inc >= 0 ? 'pos' : 'neg'}`}>
          {inc >= 0 ? '+' : ''}
          {inc.toFixed(1)}%
        </span>
      </div>
      <div className="row gap8">
        <div style={{ flex: 1 }}>
          <div className="fs11 tx-lo mb2">Event</div>
          <div className="fw600 fs13">{typeof eventValue === 'number' ? new Intl.NumberFormat('fr-MA').format(eventValue) : eventValue}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="fs11 tx-lo mb2">Normal</div>
          <div className="fw600 fs13 tx-mid">{typeof normalValue === 'number' ? new Intl.NumberFormat('fr-MA').format(normalValue) : normalValue}</div>
        </div>
      </div>
    </div>
  )
}
