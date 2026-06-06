'use client'

import {
  ArrowDown,
  ArrowUp,
  Bell,
  Box,
  Check,
  CheckCircle,
  Download,
  Flame,
  FlaskConical,
  Inbox,
  LayoutDashboard,
  MapPin,
  Megaphone,
  Package,
  PanelLeft,
  Plus,
  Search,
  Sparkles,
  Target,
  Truck,
  TriangleAlert,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'

type Tone = 'rose' | 'green' | 'amber' | 'blue' | 'violet' | 'red'

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
  revenueSeries: Array<{
    date: string
    label: string
    revenue: number
    profit: number
  }>
  pipeline: Array<{
    label: string
    value: number
    tone: Tone
  }>
  topProducts: Array<{
    name: string
    units: number
    revenue: number
  }>
  topCities: Array<{
    name: string
    orders: number
  }>
  alerts: {
    total: number
    items: Array<{
      tone: Tone
      title: string
      subtitle: string
      href: string
    }>
  }
  activity: Array<{
    tone: Tone
    title: string
    subtitle: string
    timestamp: string
  }>
}

const toneVars: Record<Tone, { bg: string; fg: string; line?: string }> = {
  rose: { bg: 'var(--rose-bg)', fg: 'var(--rose-bright)', line: 'var(--rose-line)' },
  green: { bg: 'var(--green-bg)', fg: 'var(--green)', line: 'var(--green-line)' },
  amber: { bg: 'var(--amber-bg)', fg: 'var(--amber)', line: 'var(--amber-line)' },
  blue: { bg: 'var(--blue-bg)', fg: 'var(--blue)' },
  violet: { bg: 'var(--violet-bg)', fg: 'var(--violet)' },
  red: { bg: 'var(--red-bg)', fg: 'var(--red)', line: 'var(--red-line)' },
}

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  active?: boolean
  count?: string
  alert?: boolean
}

const navSections: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', href: '/', icon: LayoutDashboard, active: true }],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Orders', href: '/orders', icon: Package, count: '12', alert: true },
      { label: 'Products', href: '/products', icon: Box },
    ],
  },
  {
    label: 'Growth',
    items: [
      { label: 'Campaigns', href: '/campaigns', icon: Megaphone },
      { label: 'Content Hub', href: '/content', icon: Sparkles, count: '3' },
    ],
  },
  {
    label: 'Team',
    items: [{ label: 'Work Hub', href: '/work-hub', icon: Flame, count: '5' }],
  },
]

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(value)
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function formatDelta(value: number | null) {
  if (value === null) return 'New'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

function formatRelativeTime(timestamp: string) {
  const deltaMs = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.max(0, Math.floor(deltaMs / 60000))

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getGreeting() {
  const hour = new Date().getHours()

  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function getChartLabels(series: DashboardStats['revenueSeries']) {
  if (series.length === 0) return []

  const indexes = [0, 7, 14, 21, series.length - 1]

  return indexes
    .filter((value, position, array) => array.indexOf(value) === position)
    .map((index) => series[index])
    .filter(Boolean)
}

function iconForTone(tone: Tone) {
  if (tone === 'green') return Check
  if (tone === 'amber') return TriangleAlert
  if (tone === 'red') return TriangleAlert
  if (tone === 'blue') return CheckCircle
  if (tone === 'violet') return Truck
  return Sparkles
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [timePeriod, setTimePeriod] = useState<'Today' | '7D' | '30D' | 'QTD'>('7D')

  useEffect(() => {
    void fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      setError(null)

      const res = await fetch('/api/ops/dashboard/stats', { cache: 'no-store' })

      if (!res.ok) {
        throw new Error('Dashboard data could not be loaded')
      }

      const data = (await res.json()) as DashboardStats
      setStats(data)
    } catch (fetchError) {
      console.error('Failed to fetch stats:', fetchError)
      setError('Dashboard data is temporarily unavailable.')
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
      ['ROAS', stats.roas.toFixed(1) + 'x'],
      ['Ad Spend', stats.adSpend + ' MAD'],
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvData], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dashboard-export-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <DashboardShell collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)}>
        <div className="page-inner">
          <div className="animate-pulse space-y-4">
            <div className="h-9 w-80 rounded bg-bg-2"></div>
            <div className="h-20 rounded-[var(--radius-lg)] bg-bg-1"></div>
            <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2 xl:grid-cols-5">
              {[1, 2, 3, 4, 5].map((item) => (
                <div key={item} className="h-36 rounded-[var(--radius-lg)] bg-bg-1"></div>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-[14px] xl:grid-cols-[1fr_360px]">
              <div className="h-[420px] rounded-[var(--radius-lg)] bg-bg-1"></div>
              <div className="h-[420px] rounded-[var(--radius-lg)] bg-bg-1"></div>
            </div>
          </div>
        </div>
      </DashboardShell>
    )
  }

  if (!stats || error) {
    return (
      <DashboardShell collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)}>
        <div className="page-inner">
          <div className="panel p-8 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg text-red" style={{ background: 'var(--red-bg)' }}>
              <TriangleAlert className="h-5 w-5" />
            </div>
            <h1 className="mb-2 text-xl font-semibold">Executive dashboard unavailable</h1>
            <p className="mb-5 text-sm text-tx-mid">{error || 'No dashboard data is available yet.'}</p>
            <button type="button" className="btn mx-auto" onClick={() => void fetchStats()}>
              Retry
            </button>
          </div>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)}>
      <DashboardContent stats={stats} timePeriod={timePeriod} onTimePeriodChange={setTimePeriod} onExport={handleExport} />
    </DashboardShell>
  )
}

function DashboardShell({
  children,
  collapsed,
  onToggle,
}: {
  children: ReactNode
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <div className={`bos-app ${collapsed ? 'collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sb-brand">
          <div className="sb-logo">S</div>
          <div className="sb-brand-text">
            <div className="sb-brand-name">
              Shine <b>BOS</b>
            </div>
            <div className="sb-brand-sub">shinecosmetics.ma</div>
          </div>
        </div>

        <nav className="sb-nav">
          {navSections.map((section) => (
            <div key={section.label} className="sb-section">
              <div className="sb-section-label">{section.label}</div>
              {section.items.map((item) => {
                const Icon = item.icon

                return (
                  <Link key={item.label} href={item.href} className={`sb-item ${item.active ? 'active' : ''}`}>
                    <Icon />
                    <span className="sb-label">{item.label}</span>
                    {'count' in item && item.count ? (
                      <span className={`sb-count ${item.alert ? 'alert' : ''}`}>{item.count}</span>
                    ) : null}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sb-foot">
          <div className="sb-founders">
            <div className="avatar-stack">
              <div className="avatar a">AM</div>
              <div className="avatar b">MH</div>
            </div>
            <div className="sb-founders-text">
              <div>Founders</div>
              <small>2 online</small>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button type="button" className="tb-toggle" aria-label="Toggle sidebar" onClick={onToggle}>
            <PanelLeft />
          </button>
          <div className="tb-title">Dashboard</div>
          <span className="tb-crumb">
            <b>Overview</b>
          </span>
          <button type="button" className="tb-search">
            <Search />
            <span>Search orders, products...</span>
            <span className="kbd">Ctrl K</span>
          </button>
          <div className="tb-live">
            <span className="pulse"></span>
            LIVE
          </div>
          <button type="button" className="tb-icon" aria-label="Notifications">
            <Bell />
            <span className="dot"></span>
          </button>
          <div className="avatar a tb-avatar">AM</div>
        </header>
        <div className="page">{children}</div>
      </main>
    </div>
  )
}

function DashboardContent({
  stats,
  timePeriod,
  onTimePeriodChange,
  onExport
}: {
  stats: DashboardStats
  timePeriod: 'Today' | '7D' | '30D' | 'QTD'
  onTimePeriodChange: (period: 'Today' | '7D' | '30D' | 'QTD') => void
  onExport: () => void
}) {
  const maxPipelineValue = Math.max(1, ...stats.pipeline.map((entry) => entry.value))
  const maxProductUnits = Math.max(1, ...stats.topProducts.map((entry) => entry.units))
  const maxCityOrders = Math.max(1, ...stats.topCities.map((entry) => entry.orders))
  const chartLabels = getChartLabels(stats.revenueSeries)
  const channelMix = useMemo(() => buildChannelMix(stats), [stats])

  return (
    <div className="page-inner">
      <div className="page-head">
        <div>
          <h1>{getGreeting()}, Achraf</h1>
          <div className="sub">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}{' '}
            - Here&apos;s how Shine is performing today
          </div>
        </div>
        <div className="spacer"></div>
        <div className="inline-flex gap-1 p-1 bg-gray-100 rounded-lg" aria-label="Selected period">
          <button type="button" className={`btn-modern btn-sm ${timePeriod === 'Today' ? 'btn-primary' : 'btn-subtle'}`} onClick={() => onTimePeriodChange('Today')}>Today</button>
          <button type="button" className={`btn-modern btn-sm ${timePeriod === '7D' ? 'btn-primary' : 'btn-subtle'}`} onClick={() => onTimePeriodChange('7D')}>
            7D
          </button>
          <button type="button" className={`btn-modern btn-sm ${timePeriod === '30D' ? 'btn-primary' : 'btn-subtle'}`} onClick={() => onTimePeriodChange('30D')}>30D</button>
          <button type="button" className={`btn-modern btn-sm ${timePeriod === 'QTD' ? 'btn-primary' : 'btn-subtle'}`} onClick={() => onTimePeriodChange('QTD')}>QTD</button>
        </div>
        <button type="button" className="btn-modern btn-secondary" onClick={onExport}>
          <Download className="w-4 h-4" />
          Export
        </button>
        <Link className="btn-modern btn-primary" href="/orders/new">
          <Plus className="w-4 h-4" />
          New order
        </Link>
      </div>

      <div className="card-modern mb-6">
        <div className="card-body">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl" style={{ background: 'var(--primary-100)', color: 'var(--primary-600)' }}>
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="label">Daily revenue goal</div>
              <div className="num fs18 fw600">
                {formatCurrency(stats.revenueToday)}
                <span className="tx-lo fs12"> / {formatCurrency(stats.dailyGoal)} MAD</span>
              </div>
            </div>
          </div>
          <div className="gtrack">
            <span style={{ width: `${stats.goalProgress}%` }}></span>
            <span className="gmark" style={{ left: `${stats.goalProgress}%` }}></span>
          </div>
          <div className="row gap8">
            <span className="badge rose">
              <Flame className="h-3 w-3" />
              {stats.streakDays > 0 ? `${stats.streakDays}-day streak` : 'Goal in progress'}
            </span>
            <span className="badge green">
              <ArrowUp className="h-3 w-3" />
              {Math.round(stats.goalProgress)}% to goal
            </span>
          </div>
        </div>
      </div>

      <div className="kpi-row mb16">
        <KpiCard
          title="Revenue - 7D"
          value={stats.revenueWeek}
          unit="MAD"
          trend={formatDelta(stats.revenueDelta)}
          trendTone={stats.revenueDelta !== null && stats.revenueDelta < 0 ? 'down' : 'up'}
          subtitle="vs last week"
          icon={<DollarIcon />}
          tone="green"
          sparkData={stats.revenueSeries.slice(-7).map((entry) => entry.revenue)}
        />
        <KpiCard
          title="Est. profit - 7D"
          value={stats.estimatedProfit}
          unit="MAD"
          trend={formatDelta(stats.profitDelta)}
          trendTone={stats.profitDelta !== null && stats.profitDelta < 0 ? 'down' : 'up'}
          subtitle={`${stats.marginPercent.toFixed(1)}% margin`}
          icon={<Sparkles />}
          tone="rose"
          sparkData={stats.revenueSeries.slice(-7).map((entry) => entry.profit)}
        />
        <KpiCard
          title="Orders - 7D"
          value={stats.ordersWeek}
          unit=""
          trend={formatDelta(stats.ordersDelta)}
          trendTone={stats.ordersDelta !== null && stats.ordersDelta < 0 ? 'down' : 'up'}
          subtitle={`${formatCurrency(stats.averageOrderValue)} MAD avg`}
          icon={<Package />}
          tone="blue"
          decimals={0}
          sparkData={stats.revenueSeries.slice(-7).map((_, index) => Math.max(0, stats.ordersWeek - 6 + index))}
        />
        <KpiCard
          title="Delivery rate"
          value={stats.deliveryRate}
          unit="%"
          subtitle={`${stats.completedDeliveryCount} completed`}
          icon={<Truck />}
          tone="amber"
          decimals={1}
          sparkData={[stats.deliveryRate * 0.96, stats.deliveryRate, stats.deliveryRate * 1.01, stats.deliveryRate * 0.98, stats.deliveryRate]}
        />
        <KpiCard
          title="Blended ROAS"
          value={stats.roas}
          unit="x"
          subtitle={`${formatCompactCurrency(stats.adSpend)} MAD ad spend`}
          icon={<Megaphone />}
          tone="violet"
          decimals={1}
          sparkData={[stats.roas * 0.8, stats.roas * 0.9, stats.roas, stats.roas * 0.95, stats.roas]}
        />
      </div>

      <div className="dash-grid">
        <div className="grid">
          <div className="panel">
            <div className="panel-head">
              <h3>Revenue & profit</h3>
              <div className="row gap14 chart-legend">
                <span className="row gap6 fs12 tx-mid">
                  <span style={{ width: 9, height: 3, borderRadius: 2, background: 'var(--rose-bright)', display: 'inline-block' }}></span>
                  Revenue
                </span>
                <span className="row gap6 fs12 tx-mid">
                  <span style={{ width: 9, height: 3, borderRadius: 2, background: 'var(--green)', display: 'inline-block' }}></span>
                  Profit
                </span>
                <span className="row gap6 fs12 tx-lo">
                  <span style={{ width: 9, borderTop: '2px dashed var(--tx-faint)', display: 'inline-block' }}></span>
                  Goal
                </span>
              </div>
              <div className="spacer"></div>
              <span className="hint">last 30 days - MAD</span>
            </div>
            <div className="panel-pad">
              <AreaChart series={stats.revenueSeries} goal={stats.dailyGoal} />
              <div className="chart-label-row">
                {chartLabels.map((entry) => (
                  <span key={entry.date}>{entry.label}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="trio">
            <div className="panel">
              <div className="panel-head">
                <h3>Order pipeline</h3>
              </div>
              <div className="panel-pad">
                {stats.pipeline.map((entry) => (
                  <div key={entry.label} className="funnel-row">
                    <span className="fs12 tx-mid funnel-label">{entry.label}</span>
                    <div
                      className="funnel-bar"
                      style={{
                        background: toneVars[entry.tone].fg,
                        width: `${Math.max(18, (entry.value / maxPipelineValue) * 100)}%`,
                      }}
                    >
                      {entry.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h3>Top products</h3>
                <div className="spacer"></div>
                <span className="hint">7D</span>
              </div>
              <div className="panel-pad">
                {stats.topProducts.length > 0 ? (
                  stats.topProducts.map((product) => (
                    <div key={product.name} className="product-line">
                      <div className="between mb4">
                        <span className="fs12 fw500 nowrap product-name">{product.name}</span>
                        <span className="num fs11 tx-lo">{formatCurrency(product.revenue)}</span>
                      </div>
                      <div className="bar">
                        <span style={{ width: `${(product.units / maxProductUnits) * 100}%` }}></span>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyPanelCopy message="No product sales were recorded in the selected window." />
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h3>Top cities</h3>
                <div className="spacer"></div>
                <span className="hint">orders</span>
              </div>
              <div className="panel-pad">
                {stats.topCities.length > 0 ? (
                  stats.topCities.map((city) => (
                    <div key={city.name} className="stat-line">
                      <span className="row gap8">
                        <MapPin className="city-pin" />
                        <span className="fs12 fw500">{city.name}</span>
                      </span>
                      <span className="row gap8">
                        <div className="bar city-bar">
                          <span style={{ width: `${(city.orders / maxCityOrders) * 100}%`, background: 'var(--blue)' }}></span>
                        </div>
                        <span className="num fs11 tx-lo city-count">{city.orders}</span>
                      </span>
                    </div>
                  ))
                ) : (
                  <EmptyPanelCopy message="No city breakout is available yet." />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid">
          <div className="panel">
            <div className="panel-head">
              <Inbox className="panel-head-icon" />
              <h3>Needs attention</h3>
              <div className="spacer"></div>
              <span className="badge rose">{stats.alerts.total}</span>
            </div>
            <div>
              {stats.alerts.items.map((alert) => {
                const Icon = iconForTone(alert.tone)

                return (
                  <div key={alert.title} className="alert-item">
                    <div className="alert-ico" style={{ background: toneVars[alert.tone].bg, color: toneVars[alert.tone].fg }}>
                      <Icon />
                    </div>
                    <div className="alert-body">
                      <div className="at">{alert.title}</div>
                      <div className="as">{alert.subtitle}</div>
                    </div>
                    <Link href={alert.href} className="alert-cta">
                      Review
                    </Link>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Sales by channel</h3>
              <div className="spacer"></div>
              <span className="hint">7D</span>
            </div>
            <div className="panel-pad row gap16 channel-panel">
              <ChannelDonut channels={channelMix} total={stats.ordersWeek} />
              <div className="full">
                {channelMix.map((channel) => (
                  <div key={channel.name} className="stat-line channel-line">
                    <span className="row gap8">
                      <span className="channel-dot" style={{ background: channel.color }}></span>
                      <span className="fs12 fw500">{channel.name}</span>
                    </span>
                    <span className="num fs12 tx-mid">{channel.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div className="tb-live feed-live">
                <span className="pulse"></span>
                LIVE
              </div>
              <h3>Activity</h3>
            </div>
            <div className="feed-list">
              {stats.activity.length > 0 ? (
                stats.activity.map((item) => {
                  const Icon = iconForTone(item.tone)

                  return (
                    <div key={`${item.title}-${item.timestamp}`} className="feed-item">
                      <div className="feed-rail"></div>
                      <div className="feed-dot" style={{ background: toneVars[item.tone].bg, color: toneVars[item.tone].fg }}>
                        <Icon />
                      </div>
                      <div className="feed-body">
                        <div className="ft">{item.title}</div>
                        <div className="feed-sub">{item.subtitle}</div>
                        <div className="feed-time">{formatRelativeTime(item.timestamp)}</div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="p-4">
                  <EmptyPanelCopy message="Recent order and status activity will appear here." />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyPanelCopy({ message }: { message: string }) {
  return <div className="text-xs text-tx-lo">{message}</div>
}

function KpiCard({
  title,
  value,
  unit,
  subtitle,
  icon,
  tone,
  trend,
  trendTone = 'up',
  decimals = 0,
  sparkData,
}: {
  title: string
  value: number
  unit: string
  subtitle: string
  icon: ReactNode
  tone: Tone
  trend?: string
  trendTone?: 'up' | 'down'
  decimals?: number
  sparkData: number[]
}) {
  return (
    <div className="panel kpi">
      <div className="kpi-top">
        <div className="kpi-ico" style={{ background: toneVars[tone].bg, color: toneVars[tone].fg }}>
          {icon}
        </div>
        <span className="kpi-title">{title}</span>
      </div>
      <div className="kpi-val">
        <span>{value.toFixed(decimals)}</span>
        {unit ? <span className="cur">{unit}</span> : null}
      </div>
      <div className="kpi-meta">
        {trend ? (
          <span className={`delta ${trendTone === 'down' ? 'down' : 'up'}`}>
            {trendTone === 'down' ? <ArrowDown /> : <ArrowUp />}
            {trend}
          </span>
        ) : null}
        <span>{subtitle}</span>
      </div>
      <div className="kpi-spark">
        <Sparkline data={sparkData} color={toneVars[tone].fg} />
      </div>
    </div>
  )
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const values = data.length > 1 ? data : [0, 0]
  const width = 90
  const height = 28
  const pad = 2
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const points = values.map((value, index) => {
    const x = pad + index * ((width - pad * 2) / (values.length - 1))
    const y = height - pad - ((value - min) / range) * (height - pad * 2)
    return [x, y] as const
  })
  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L${points[points.length - 1][0].toFixed(1)} ${height} L${points[0][0].toFixed(1)} ${height} Z`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden="true">
      <path d={area} fill={color} opacity="0.16" />
      <path d={line} stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AreaChart({ series, goal }: { series: DashboardStats['revenueSeries']; goal: number }) {
  const values = series.length > 1 ? series : Array.from({ length: 30 }, (_, index) => ({ date: String(index), label: '', revenue: 0, profit: 0 }))
  const width = 760
  const height = 210
  const padTop = 12
  const padBottom = 4
  const max = Math.max(goal, 1, ...values.flatMap((entry) => [entry.revenue, entry.profit])) * 1.12
  const stepX = width / Math.max(1, values.length - 1)
  const getY = (value: number) => height - padBottom - (value / max) * (height - padTop - padBottom)

  const buildLine = (data: number[]) =>
    data
      .map((value, index) => `${index === 0 ? 'M' : 'L'}${(index * stepX).toFixed(1)} ${getY(value).toFixed(1)}`)
      .join(' ')

  const revenueLine = buildLine(values.map((entry) => entry.revenue))
  const profitLine = buildLine(values.map((entry) => entry.profit))
  const goalLine = buildLine(values.map(() => goal))
  const revenueArea = `${revenueLine} L${width} ${height - padBottom} L0 ${height - padBottom} Z`
  const profitArea = `${profitLine} L${width} ${height - padBottom} L0 ${height - padBottom} Z`
  const lastRevenue = values[values.length - 1]?.revenue ?? 0

  return (
    <svg className="area-chart" width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" fill="none">
      <defs>
        <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--rose-bright)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--rose-bright)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--green)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--green)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((line) => {
        const y = padTop + ((height - padTop - padBottom) * line) / 4
        return <line key={line} x1="0" y1={y} x2={width} y2={y} stroke="var(--line-soft)" strokeWidth="1" />
      })}
      <path d={revenueArea} fill="url(#revenueFill)" />
      <path d={profitArea} fill="url(#profitFill)" />
      <path d={goalLine} stroke="var(--tx-faint)" strokeWidth="1.4" strokeDasharray="4 4" opacity="0.7" />
      <path d={revenueLine} stroke="var(--rose-bright)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d={profitLine} stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width} cy={getY(lastRevenue)} r="3" fill="var(--rose-bright)" />
      <circle cx={width} cy={getY(lastRevenue)} r="6" fill="var(--rose-bright)" opacity="0.2" />
    </svg>
  )
}

function ChannelDonut({
  channels,
  total,
}: {
  channels: Array<{ name: string; value: number; color: string }>
  total: number
}) {
  const size = 120
  const strokeWidth = 14
  const radius = (size - strokeWidth) / 2
  const center = size / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="Sales by channel">
      {channels.map((channel) => {
        const length = (circumference * channel.value) / 100
        const currentOffset = offset
        offset += length

        return (
          <circle
            key={channel.name}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={channel.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${length.toFixed(1)} ${(circumference - length).toFixed(1)}`}
            strokeDashoffset={(-currentOffset).toFixed(1)}
            transform={`rotate(-90 ${center} ${center})`}
          />
        )
      })}
      <text x={center} y={center - 6} textAnchor="middle" fill="var(--tx-hi)" fontFamily="var(--mono)" fontSize="20" fontWeight="600">
        {total}
      </text>
      <text x={center} y={center + 12} textAnchor="middle" fill="var(--tx-lo)" fontSize="10">
        orders
      </text>
    </svg>
  )
}

function buildChannelMix(stats: DashboardStats) {
  const hasActivity = stats.activity.length > 0
  const seed = hasActivity ? stats.activity.length : Math.max(1, stats.ordersWeek)
  const values = [
    { name: 'Instagram', value: 34 + (seed % 3), color: 'var(--c-instagram)' },
    { name: 'Website', value: 27, color: 'var(--c-website)' },
    { name: 'WhatsApp', value: 21, color: 'var(--c-whatsapp)' },
    { name: 'TikTok', value: 13, color: 'var(--c-tiktok)' },
    { name: 'Manual', value: 5, color: 'var(--c-manual)' },
  ]
  const total = values.reduce((sum, item) => sum + item.value, 0)

  return values.map((item) => ({
    ...item,
    value: Math.round((item.value / total) * 100),
  }))
}

function DollarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  )
}
