'use client'

import { useState, useEffect } from 'react'
import { Download, Plus, TrendingUp, TrendingDown, DollarSign, Package, Truck, Target, Megaphone, Sparkles } from 'lucide-react'
import Link from 'next/link'

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
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="max-w-[1600px] mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, Achraf
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex gap-1 p-1 bg-gray-100 rounded-lg">
              {(['Today', '7D', '30D', 'QTD'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setTimePeriod(period)}
                  className={`btn-modern btn-sm ${timePeriod === period ? 'btn-primary' : 'btn-subtle'}`}
                >
                  {period}
                </button>
              ))}
            </div>
            <button className="btn-modern btn-secondary" onClick={handleExport}>
              <Download className="w-4 h-4" />
              Export
            </button>
            <Link href="/orders/new" className="btn-modern btn-primary">
              <Plus className="w-4 h-4" />
              New order
            </Link>
          </div>
        </div>

        {/* Goal Progress */}
        <div className="card-modern">
          <div className="card-body">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg">
                  <Target className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Daily Revenue Goal</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatCurrency(stats.revenueToday)}
                    <span className="text-sm font-normal text-gray-400 ml-2">/ {formatCurrency(stats.dailyGoal)} MAD</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="badge-modern badge-warning">
                  🔥 {stats.streakDays > 0 ? `${stats.streakDays}-day streak` : 'In progress'}
                </span>
                <span className="badge-modern badge-success">
                  <TrendingUp className="w-3 h-3" />
                  {Math.round(stats.goalProgress)}% complete
                </span>
              </div>
            </div>

            <div className="relative w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, stats.goalProgress)}%` }}
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
            iconBg="bg-purple-100"
            iconColor="text-purple-600"
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
            <div className="card-header">
              <h3 className="text-lg font-semibold">Revenue & Profit</h3>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary-500"></div>
                  <span className="text-gray-600">Revenue</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-gray-600">Profit</span>
                </div>
              </div>
            </div>
            <div className="card-body">
              <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                Chart: Last 30 days revenue & profit
              </div>
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
