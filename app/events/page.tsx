'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Calendar, Plus, TrendingUp, Package, DollarSign, ShoppingCart } from 'lucide-react'
import BosShell from '@/components/BosShell'

type Event = {
  id: number
  name: string
  type: string
  status: string
  startDate: string
  endDate: string
  totalRevenue: number
  totalOrders: number
  totalUnits: number
  revenueIncrease: number
  ordersIncrease: number
  topCategory: string
  topProduct: string
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('')

  useEffect(() => {
    fetchEvents()
  }, [statusFilter, typeFilter])

  const fetchEvents = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter && statusFilter !== 'All') params.append('status', statusFilter)
      if (typeFilter) params.append('type', typeFilter)

      const res = await fetch(`/api/ops/events?${params}`)
      const data = await res.json()
      setEvents(data.events || [])
    } catch (error) {
      console.error('Failed to fetch events:', error)
    } finally {
      setLoading(false)
    }
  }

  // Calculate aggregate metrics
  const totalRevenue = events.reduce((sum, e) => sum + (e.totalRevenue || 0), 0)
  const totalOrders = events.reduce((sum, e) => sum + (e.totalOrders || 0), 0)
  const avgIncrease = events.length > 0
    ? events.reduce((sum, e) => sum + (e.revenueIncrease || 0), 0) / events.length
    : 0

  const activeEvents = events.filter(e => e.status === 'Active')
  const upcomingEvents = events.filter(e => e.status === 'Upcoming')

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 }).format(amount)
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'Active': 'green',
      'Upcoming': 'blue',
      'Completed': 'gray',
    }
    return colors[status] || 'gray'
  }

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'Ramadan': 'violet',
      'Black Friday': 'gray',
      "Mother's Day": 'rose',
      'Summer Sale': 'amber',
      'Flash Sale': 'red',
    }
    return colors[type] || 'blue'
  }

  return (
    <BosShell active="events" title="Events" crumb="Growth">
      <div className="page-inner page-wide">
        <div className="page-head">
          <div>
            <h1>Events</h1>
            <div className="sub">Track Ramadan, Black Friday, seasonal events & impact analysis</div>
          </div>
          <div className="spacer"></div>
          <div className="inline-flex gap-1 p-1 bg-gray-100 rounded-lg">
            <button
              className={`btn-modern btn-sm ${statusFilter === 'All' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setStatusFilter('All')}
            >
              All
            </button>
            <button
              className={`btn-modern btn-sm ${statusFilter === 'Upcoming' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setStatusFilter('Upcoming')}
            >
              Upcoming
            </button>
            <button
              className={`btn-modern btn-sm ${statusFilter === 'Active' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setStatusFilter('Active')}
            >
              Active
            </button>
            <button
              className={`btn-modern btn-sm ${statusFilter === 'Completed' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setStatusFilter('Completed')}
            >
              Completed
            </button>
          </div>
          <button className="btn-modern btn-primary" onClick={() => window.location.href = '/events/new'}>
            <Plus className="w-4 h-4" />New event
          </button>
        </div>

        <div className="cstat-row">
          <Metric
            icon={<Calendar />}
            tone="blue"
            title="Total events"
            value={events.length.toString()}
            unit=""
            trend={`${activeEvents.length} active, ${upcomingEvents.length} upcoming`}
          />
          <Metric
            icon={<DollarSign />}
            tone="green"
            title="Events revenue"
            value={formatCurrency(totalRevenue)}
            unit="MAD"
            trend={`${totalOrders} orders`}
          />
          <Metric
            icon={<TrendingUp />}
            tone="teal"
            title="Avg impact"
            value={avgIncrease.toFixed(1)}
            unit="%"
            trend={avgIncrease > 0 ? 'vs normal period' : 'No data'}
          />
          <Metric
            icon={<ShoppingCart />}
            tone="violet"
            title="Total orders"
            value={totalOrders.toString()}
            unit=""
            trend={`across ${events.length} events`}
          />
        </div>

        <div className="card-modern">
          <div className="card-header">
            <h3 className="text-lg font-semibold">All events</h3>
            <div className="spacer"></div>
            {activeEvents.length > 0 && (
              <span className="badge-modern badge-success">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                {activeEvents.length} active
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Type</th>
                  <th>Period</th>
                  <th className="r">Revenue</th>
                  <th className="r">Orders</th>
                  <th className="r">Impact</th>
                  <th>Top category</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '40px' }}>
                      Loading events...
                    </td>
                  </tr>
                ) : events.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '40px' }}>
                      <div className="flex flex-col items-center justify-center py-12">
                        <Calendar className="w-12 h-12 text-gray-300 mb-4" />
                        <p className="font-semibold text-gray-900 mb-2">No events yet</p>
                        <p className="text-sm text-gray-500 mb-6">Create your first event to track seasonal performance</p>
                        <button className="btn-modern btn-primary" onClick={() => window.location.href = '/events/new'}>
                          <Plus className="w-4 h-4" />Create event
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  events.map((event) => (
                    <tr
                      key={event.id}
                      onClick={() => window.location.href = `/events/${event.id}`}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="t-strong">{event.name}</td>
                      <td>
                        <span className={`badge ${getTypeColor(event.type)}`}>
                          {event.type}
                        </span>
                      </td>
                      <td>
                        <span className="fs12 tx-lo">
                          {formatDate(event.startDate)} - {formatDate(event.endDate)}
                        </span>
                      </td>
                      <td className="r num pos">{formatCurrency(event.totalRevenue || 0)}</td>
                      <td className="r num">{event.totalOrders || 0}</td>
                      <td className="r">
                        <span className={`num ${(event.revenueIncrease || 0) >= 0 ? 'pos' : 'neg'}`}>
                          {(event.revenueIncrease || 0) > 0 ? '+' : ''}
                          {(event.revenueIncrease || 0).toFixed(1)}%
                        </span>
                      </td>
                      <td>
                        <span className="fs12 tx-mid">
                          {event.topCategory || '-'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${getStatusColor(event.status)}`}>
                          {event.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {upcomingEvents.length > 0 && (
          <div className="panel mt20">
            <div className="panel-head">
              <Calendar />
              <h3>Upcoming events</h3>
              <span className="badge blue">{upcomingEvents.length}</span>
            </div>
            <div className="panel-pad">
              <div className="row gap12" style={{ flexWrap: 'wrap' }}>
                {upcomingEvents.slice(0, 5).map((event) => (
                  <div
                    key={event.id}
                    className="event-card"
                    onClick={() => window.location.href = `/events/${event.id}`}
                    style={{
                      cursor: 'pointer',
                      flex: '1 1 200px',
                      padding: '16px',
                      border: '1px solid var(--line-soft)',
                      borderRadius: '8px',
                    }}
                  >
                    <div className="between mb8">
                      <span className={`badge ${getTypeColor(event.type)}`}>{event.type}</span>
                      <Calendar size={14} style={{ color: 'var(--tx-faint)' }} />
                    </div>
                    <div className="fw600 fs13 mb4">{event.name}</div>
                    <div className="fs11 tx-lo">
                      Starts {formatDate(event.startDate)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </BosShell>
  )
}

function Metric({
  icon,
  tone,
  title,
  value,
  unit,
  trend,
  down,
}: {
  icon: ReactNode
  tone: string
  title: string
  value: string
  unit: string
  trend: string
  down?: boolean
}) {
  return (
    <div className="panel kpi">
      <div className="kpi-top">
        <div
          className="kpi-ico"
          style={{
            background: `var(--${tone}-bg)`,
            color: `var(--${tone})`,
          }}
        >
          {icon}
        </div>
        <span className="kpi-title">{title}</span>
      </div>
      <div className="kpi-val">
        <span>{value}</span>
        {unit && <span className="cur">{unit}</span>}
      </div>
      <div className="kpi-meta">
        <span className={`delta ${down ? 'down' : 'up'}`}>
          {down ? <ArrowDown /> : <ArrowUp />}
          {trend}
        </span>
      </div>
    </div>
  )
}
