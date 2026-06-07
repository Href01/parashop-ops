'use client'

import { useState, useEffect } from 'react'
import { Download, Plus, TrendingUp, TrendingDown, DollarSign, Package, Truck, Target, Megaphone, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'

interface DashboardStats {
  generatedAt: string
  dailyGoal: number
  revenueToday: number
  revenueWeek: number
  revenueDelta: number | null
  estimatedProfit: number
  profitDelta: number | null
  marginPercent: number
  ordersToday: number
  ordersWeek: number
  ordersDelta: number | null
  averageOrderValue: number
  deliveryRate: number
  completedDeliveryCount: number
  roas: number
  adSpend: number
  streakDays: number
  goalProgress: number
  revenueSeries: Array<{ date: string; label: string; revenue: number; profit: number }>
  pipeline: Array<{ label: string; value: number; tone: string }>
  topProducts: Array<{ name: string; units: number; revenue: number }>
  topCities: Array<{ name: string; orders: number }>
  alerts: { total: number; items: Array<{ tone: string; title: string; subtitle: string; href: string }> }
  activity: Array<{ tone: string; title: string; subtitle: string; timestamp: string }>
}

export default function ModernDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [timePeriod, setTimePeriod] = useState<'Today' | '7D' | '30D' | 'QTD'>('7D')

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/ops/dashboard/stats', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleExport = () => {
    if (!stats) return
    const csvData = [
      ['Metric', 'Value'],
      ['Revenue (7D)', stats.revenueWeek + ' MAD'],
      ['Profit (7D)', stats.estimatedProfit + ' MAD'],
      ['Orders (7D)', stats.ordersWeek],
      ['Margin %', stats.marginPercent.toFixed(1) + '%'],
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvData], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dashboard-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
  }

  const formatDelta = (value: number | null) => {
    if (value === null) return 'New'
    const sign = value > 0 ? '+' : ''
    return `${sign}${value.toFixed(1)}%`
  }

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-4"></div>
          <p className="text-sm text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '22px 24px 60px' }}>
        {/* Header with editorial serif */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: '8px' }}>
              SHINE COSMETICS · LIVE OPERATIONS
            </div>
            <h1 className="serif-display" style={{ fontSize: '30px', color: 'var(--tx-hi)', marginBottom: '4px' }}>
              Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, Achraf
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--tx-lo)' }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'inline-flex', gap: '4px', padding: '2px', background: 'var(--bg-inset)', border: '1px solid var(--line-soft)', borderRadius: '8px' }}>
              {(['Today', '7D', '30D', 'QTD'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setTimePeriod(period)}
                  style={{
                    padding: '5px 11px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: timePeriod === period ? 'var(--tx-hi)' : 'var(--tx-lo)',
                    background: timePeriod === period ? 'var(--bg-2)' : 'transparent',
                    boxShadow: timePeriod === period ? 'var(--shadow-1)' : 'none',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.12s'
                  }}
                >
                  {period}
                </button>
              ))}
            </div>
            <button className="btn-modern btn-secondary" onClick={handleExport}>
              <Download className="w-4 h-4" />
              Export
            </button>
            <Link href="/orders/new" className="btn-luxe" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '7px 13px',
              borderRadius: '6px',
              fontSize: '12.5px',
              textDecoration: 'none',
              whiteSpace: 'nowrap'
            }}>
              <Plus className="w-4 h-4" />
              New order
            </Link>
          </div>
        </div>

        {/* Goal Progress with glow */}
        <div className="card-modern panel-glow-rose" style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--line-soft)',
          borderRadius: '14px',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, var(--neon-gold), var(--neon-rose) 80%)',
                  display: 'grid',
                  placeItems: 'center',
                  boxShadow: '0 4px 16px oklch(0.78 0.14 30 / 0.32)'
                }}>
                  <Target style={{ width: '24px', height: '24px', color: 'oklch(0.2 0.04 30)', strokeWidth: 2 }} />
                </div>
                <div>
                  <p style={{ fontSize: '11.5px', color: 'var(--tx-lo)', fontWeight: 500, marginBottom: '4px' }}>Daily Revenue Goal</p>
                  <p style={{ fontSize: '27px', fontWeight: 600, letterSpacing: '-0.03em', fontFamily: 'var(--mono)', lineHeight: 1, color: 'var(--tx-hi)' }}>
                    {formatCurrency(stats.revenueToday)}
                    <span style={{ fontSize: '14px', color: 'var(--tx-lo)', fontWeight: 500, marginLeft: '8px' }}>
                      / {formatCurrency(stats.dailyGoal)} MAD
                    </span>
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '2px 8px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: 500,
                  border: '1px solid var(--amber-line)',
                  color: 'var(--amber)',
                  background: 'var(--amber-bg)'
                }}>
                  🔥 {stats.streakDays > 0 ? `${stats.streakDays}-day streak` : 'In progress'}
                </span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '2px 8px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: 500,
                  border: '1px solid var(--green-line)',
                  color: 'var(--green)',
                  background: 'var(--green-bg)'
                }}>
                  <TrendingUp style={{ width: '12px', height: '12px' }} />
                  {Math.round(stats.goalProgress)}% complete
                </span>
              </div>
            </div>

            <div style={{ position: 'relative', width: '100%', height: '12px', background: 'var(--bg-3)', borderRadius: '12px', overflow: 'hidden' }}>
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  height: '100%',
                  background: 'linear-gradient(90deg, var(--neon-gold), var(--neon-rose) 80%)',
                  borderRadius: '12px',
                  transition: 'all 0.5s ease',
                  width: `${Math.min(100, stats.goalProgress)}%`
                }}
              />
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <KPICard
            title="Revenue - 7D"
            value={formatCurrency(stats.revenueWeek)}
            unit="MAD"
            delta={stats.revenueDelta}
            icon={<DollarSign className="w-5 h-5" />}
            iconBg="bg-green-100"
            iconColor="text-green-600"
          />
          <KPICard
            title="Est. Profit - 7D"
            value={formatCurrency(stats.estimatedProfit)}
            unit="MAD"
            delta={stats.profitDelta}
            subtitle={`${stats.marginPercent.toFixed(1)}% margin`}
            icon={<Sparkles className="w-5 h-5" />}
            iconBg="bg-pink-100"
            iconColor="text-pink-600"
          />
          <KPICard
            title="Orders - 7D"
            value={stats.ordersWeek.toString()}
            unit=""
            delta={stats.ordersDelta}
            subtitle={`${formatCurrency(stats.averageOrderValue)} MAD avg`}
            icon={<Package className="w-5 h-5" />}
            iconBg="bg-blue-100"
            iconColor="text-blue-600"
          />
          <KPICard
            title="Delivery Rate"
            value={stats.deliveryRate.toFixed(1)}
            unit="%"
            subtitle={`${stats.completedDeliveryCount} delivered`}
            icon={<Truck className="w-5 h-5" />}
            iconBg="bg-amber-100"
            iconColor="text-amber-600"
          />
          <KPICard
            title="Blended ROAS"
            value={stats.roas.toFixed(1)}
            unit="x"
            subtitle={`${formatCurrency(stats.adSpend)} MAD spent`}
            icon={<Megaphone className="w-5 h-5" />}
            iconBg="bg-indigo-100"
            iconColor="text-indigo-600"
          />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Chart */}
          <div className="lg:col-span-2 card-modern">
            <div className="card-header card-header-gold" style={{
              padding: '13px 16px',
              borderBottom: '1px solid var(--line-soft)',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '-0.01em', flex: 1 }}>Revenue & Profit</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '11px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#E8B4A3' }}></div>
                  <span style={{ color: 'var(--tx-mid)' }}>Revenue</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#22C55E' }}></div>
                  <span style={{ color: 'var(--tx-mid)' }}>Profit</span>
                </div>
              </div>
            </div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={stats.revenueSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E8B4A3" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#E8B4A3" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#22C55E" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line-soft)" />
                  <XAxis
                    dataKey="label"
                    stroke="var(--tx-lo)"
                    style={{ fontSize: '12px', fontFamily: 'var(--mono)' }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="var(--tx-lo)"
                    style={{ fontSize: '12px', fontFamily: 'var(--mono)' }}
                    tickLine={false}
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-2)',
                      border: '1px solid var(--line)',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                      fontFamily: 'var(--mono)',
                      fontSize: '12px',
                      color: 'var(--tx-hi)'
                    }}
                    formatter={(value: any) => [`${formatCurrency(Number(value))} MAD`, '']}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#E8B4A3"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    stroke="#22C55E"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorProfit)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Side Panel */}
          <div className="space-y-6">
            {/* Top Products */}
            <div className="card-modern">
              <div className="card-header">
                <h3 className="text-lg font-semibold">Top Products</h3>
                <span className="text-xs text-gray-500">7D</span>
              </div>
              <div className="card-body">
                <div className="space-y-3">
                  {stats.topProducts.slice(0, 5).map((product, index) => (
                    <div key={product.name}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium text-gray-900 truncate">{product.name}</span>
                        <span className="text-gray-600">{formatCurrency(product.revenue)}</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full"
                          style={{ width: `${(product.units / Math.max(...stats.topProducts.map(p => p.units))) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Alerts */}
            {stats.alerts.total > 0 && (
              <div className="card-modern">
                <div className="card-header">
                  <h3 className="text-lg font-semibold">Needs Attention</h3>
                  <span className="badge-modern badge-danger">{stats.alerts.total}</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {stats.alerts.items.slice(0, 3).map((alert, index) => (
                    <Link
                      key={index}
                      href={alert.href}
                      className="block p-4 hover:bg-gray-50 transition"
                    >
                      <p className="text-sm font-medium text-gray-900">{alert.title}</p>
                      <p className="text-xs text-gray-500 mt-1">{alert.subtitle}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function KPICard({
  title,
  value,
  unit,
  delta,
  subtitle,
  icon,
  iconBg,
  iconColor,
}: {
  title: string
  value: string
  unit: string
  delta?: number | null
  subtitle?: string
  icon: React.ReactNode
  iconBg: string
  iconColor: string
}) {
  return (
    <div className="card-modern card-hover">
      <div className="card-body">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">{title}</p>
          <div className={`w-10 h-10 rounded-lg ${iconBg} ${iconColor} flex items-center justify-center`}>
            {icon}
          </div>
        </div>

        <div className="flex items-baseline gap-2 mb-2">
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {unit && <span className="text-sm text-gray-500">{unit}</span>}
        </div>

        <div className="flex items-center gap-2 text-xs">
          {delta !== null && delta !== undefined && (
            <span className={`flex items-center gap-1 ${delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
            </span>
          )}
          {subtitle && <span className="text-gray-500">{subtitle}</span>}
        </div>
      </div>
    </div>
  )
}
