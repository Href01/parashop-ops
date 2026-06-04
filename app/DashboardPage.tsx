'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'

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

const toneStyles: Record<Tone, CSSProperties> = {
  rose: { background: 'var(--rose-bg)', color: 'var(--rose-bright)' },
  green: { background: 'var(--green-bg)', color: 'var(--green)' },
  amber: { background: 'var(--amber-bg)', color: 'var(--amber)' },
  blue: { background: 'var(--blue-bg)', color: 'var(--blue)' },
  violet: { background: 'var(--violet-bg)', color: 'var(--violet)' },
  red: { background: 'var(--red-bg)', color: 'var(--red)' },
}

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
  if (value === null) {
    return 'New'
  }

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

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  if (loading) {
    return (
      <div className="mx-auto max-w-[1600px] p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-72 rounded bg-bg-2"></div>
          <div className="h-24 rounded-[var(--radius)] bg-bg-1"></div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="h-36 rounded-[var(--radius)] bg-bg-1"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
            <div className="h-[420px] rounded-[var(--radius)] bg-bg-1"></div>
            <div className="h-[420px] rounded-[var(--radius)] bg-bg-1"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!stats || error) {
    return (
      <div className="mx-auto max-w-[1600px] p-6">
        <div className="panel p-8 text-center">
          <div className="mb-3 text-3xl">📉</div>
          <h1 className="mb-2 text-xl font-semibold">Executive dashboard unavailable</h1>
          <p className="mb-5 text-sm text-tx-mid">{error || 'No dashboard data is available yet.'}</p>
          <button type="button" className="btn mx-auto" onClick={() => void fetchStats()}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  const maxSeriesValue = Math.max(
    1,
    ...stats.revenueSeries.flatMap((entry) => [entry.revenue, entry.profit])
  )
  const maxPipelineValue = Math.max(1, ...stats.pipeline.map((entry) => entry.value))
  const maxProductUnits = Math.max(1, ...stats.topProducts.map((entry) => entry.units))
  const chartLabels = getChartLabels(stats.revenueSeries)

  return (
    <div className="mx-auto max-w-[1600px] p-6">
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-tx-faint">
            Executive dashboard
          </div>
          <h1 className="mb-1 text-3xl font-semibold tracking-[-0.03em]">{getGreeting()}, Shine team 👋</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-tx-mid">
            <span>
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
            <span className="text-tx-faint">•</span>
            <span>{stats.ordersToday} orders today</span>
            <span className="badge green">Updated {formatRelativeTime(stats.generatedAt)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="range-group" aria-label="Selected period">
            <span className="range-pill">Today</span>
            <span className="range-pill active">7D</span>
            <span className="range-pill">30D</span>
            <span className="range-pill">QTD</span>
          </div>

          <button type="button" className="btn opacity-60" disabled>
            Export
          </button>
          <Link href="/orders/new" className="btn primary">
            + New order
          </Link>
        </div>
      </div>

      <div className="panel mb-4 overflow-hidden">
        <div className="flex flex-col gap-4 p-4 xl:flex-row xl:items-center">
          <div className="flex min-w-[220px] items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg text-lg" style={toneStyles.rose}>
              🎯
            </div>
            <div>
              <div className="mb-0.5 text-xs text-tx-lo">Daily revenue goal</div>
              <div className="font-mono text-lg font-semibold">
                {formatCurrency(stats.revenueToday)}
                <span className="ml-1 text-xs text-tx-lo">/ {formatCurrency(stats.dailyGoal)} MAD</span>
              </div>
            </div>
          </div>

          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-bg-3">
            <div
              className="h-full rounded-full"
              style={{
                width: `${stats.goalProgress}%`,
                background: 'linear-gradient(90deg, var(--rose), var(--rose-bright))',
              }}
            ></div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="badge rose">
              {stats.streakDays > 0 ? `🔥 ${stats.streakDays}-day streak` : '🎯 Goal in progress'}
            </span>
            <span className="badge green">{Math.round(stats.goalProgress)}% to goal</span>
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          title="Revenue · 7D"
          value={stats.revenueWeek}
          unit="MAD"
          trend={formatDelta(stats.revenueDelta)}
          trendTone={stats.revenueDelta !== null && stats.revenueDelta < 0 ? 'down' : 'up'}
          subtitle="vs previous 7 days"
          icon="💵"
          tone="green"
        />
        <KpiCard
          title="Est. profit · 7D"
          value={stats.estimatedProfit}
          unit="MAD"
          trend={formatDelta(stats.profitDelta)}
          trendTone={stats.profitDelta !== null && stats.profitDelta < 0 ? 'down' : 'up'}
          subtitle={`${stats.marginPercent.toFixed(1)}% margin`}
          icon="✨"
          tone="rose"
        />
        <KpiCard
          title="Orders · 7D"
          value={stats.ordersWeek}
          unit=""
          trend={formatDelta(stats.ordersDelta)}
          trendTone={stats.ordersDelta !== null && stats.ordersDelta < 0 ? 'down' : 'up'}
          subtitle={`${formatCurrency(stats.averageOrderValue)} MAD avg order`}
          icon="📦"
          tone="blue"
          decimals={0}
        />
        <KpiCard
          title="Delivery rate · 30D"
          value={stats.deliveryRate}
          unit="%"
          subtitle={`${stats.completedDeliveryCount} completed deliveries`}
          icon="🚚"
          tone="amber"
          decimals={1}
        />
        <KpiCard
          title="Blended ROAS · 30D"
          value={stats.roas}
          unit="×"
          subtitle={`${formatCompactCurrency(stats.adSpend)} MAD ad spend`}
          icon="📢"
          tone="violet"
          decimals={1}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="panel">
            <div className="panel-head">
              <h3>Revenue & profit</h3>
              <div className="ml-3 flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-xs text-tx-mid">
                  <span className="h-0.5 w-2 rounded" style={{ background: 'var(--rose-bright)' }}></span>
                  Revenue
                </span>
                <span className="flex items-center gap-1.5 text-xs text-tx-mid">
                  <span className="h-0.5 w-2 rounded" style={{ background: 'var(--green)' }}></span>
                  Profit
                </span>
              </div>
              <div className="spacer"></div>
              <span className="text-xs text-tx-faint">last 30 days · MAD</span>
            </div>

            <div className="panel-pad">
              <div className="flex h-56 items-end justify-between gap-1">
                {stats.revenueSeries.map((entry) => (
                  <div key={entry.date} className="flex flex-1 flex-col justify-end gap-0.5">
                    <div
                      className="w-full rounded-t"
                      style={{
                        height: `${(entry.revenue / maxSeriesValue) * 100}%`,
                        background: 'var(--rose-bright)',
                        opacity: 0.92,
                      }}
                      title={`${entry.label} revenue: ${formatCurrency(entry.revenue)} MAD`}
                    ></div>
                    <div
                      className="w-full rounded-t"
                      style={{
                        height: `${(entry.profit / maxSeriesValue) * 100}%`,
                        background: 'var(--green)',
                        opacity: 0.9,
                      }}
                      title={`${entry.label} profit: ${formatCurrency(entry.profit)} MAD`}
                    ></div>
                  </div>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-5 text-[10px] font-mono text-tx-faint">
                {chartLabels.map((entry) => (
                  <span key={entry.date}>{entry.label}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            <div className="panel">
              <div className="panel-head">
                <h3>Order pipeline</h3>
                <div className="spacer"></div>
                <span className="text-xs text-tx-faint">30D</span>
              </div>
              <div className="panel-pad space-y-2.5">
                {stats.pipeline.map((entry) => (
                  <div key={entry.label} className="flex items-center gap-3">
                    <span className="w-20 text-xs text-tx-mid">{entry.label}</span>
                    <div className="h-7 flex-1 rounded bg-bg-3 p-0.5">
                      <div
                        className="flex h-full items-center rounded px-2 text-xs font-semibold"
                        style={{
                          width: `${Math.max(16, (entry.value / maxPipelineValue) * 100)}%`,
                          background: `var(--${entry.tone === 'rose' ? 'rose-bright' : entry.tone})`,
                          color: 'var(--bg-0)',
                        }}
                      >
                        {entry.value}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h3>Top products</h3>
                <div className="spacer"></div>
                <span className="text-xs text-tx-faint">7D</span>
              </div>
              <div className="panel-pad space-y-3">
                {stats.topProducts.length > 0 ? (
                  stats.topProducts.map((product) => (
                    <div key={product.name} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-xs font-medium">{product.name}</span>
                        <span className="whitespace-nowrap text-[10px] font-mono text-tx-lo">
                          {formatCurrency(product.revenue)} MAD
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-tx-faint">
                        <span>{product.units} units</span>
                        <span>{Math.round((product.units / maxProductUnits) * 100)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-bg-3">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(product.units / maxProductUnits) * 100}%`,
                            background: 'var(--rose-bright)',
                          }}
                        ></div>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyPanelCopy message="No product sales were recorded in the selected window." />
                )}
              </div>
            </div>

            <div className="panel md:col-span-2 2xl:col-span-1">
              <div className="panel-head">
                <h3>Top cities</h3>
                <div className="spacer"></div>
                <span className="text-xs text-tx-faint">orders · 7D</span>
              </div>
              <div className="panel-pad space-y-2">
                {stats.topCities.length > 0 ? (
                  stats.topCities.map((city) => (
                    <div
                      key={city.name}
                      className="flex items-center justify-between border-b border-line-soft py-1.5 last:border-0"
                    >
                      <span className="flex items-center gap-2 text-xs font-medium">
                        <span className="text-tx-lo">📍</span>
                        {city.name}
                      </span>
                      <span className="text-[10px] font-mono text-tx-lo">{city.orders}</span>
                    </div>
                  ))
                ) : (
                  <EmptyPanelCopy message="No city breakout is available yet." />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel overflow-hidden">
            <div className="panel-head">
              <span className="text-rose-bright">📥</span>
              <h3>Needs attention</h3>
              <div className="spacer"></div>
              <span className="badge rose">{stats.alerts.total}</span>
            </div>

            <div className="divide-y divide-line-soft">
              {stats.alerts.items.map((alert) => (
                <div key={alert.title} className="flex items-start gap-3 p-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-sm" style={toneStyles[alert.tone]}>
                    {alert.tone === 'green' ? '✓' : alert.tone === 'amber' ? '!' : alert.tone === 'red' ? '⚠' : '•'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 text-xs font-medium">{alert.title}</div>
                    <div className="text-[10px] text-tx-lo">{alert.subtitle}</div>
                  </div>
                  <Link href={alert.href} className="rounded bg-bg-2 px-2 py-1 text-xs text-tx-mid transition hover:bg-bg-3 hover:text-tx-hi">
                    Review
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <div className="panel overflow-hidden">
            <div className="panel-head">
              <div className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold" style={toneStyles.green}>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--green)' }}></span>
                LIVE
              </div>
              <h3 className="ml-1">Activity</h3>
              <div className="spacer"></div>
              <span className="text-xs text-tx-faint">latest updates</span>
            </div>

            <div className="max-h-[420px] divide-y divide-line-soft overflow-y-auto">
              {stats.activity.length > 0 ? (
                stats.activity.map((item) => (
                  <div key={`${item.title}-${item.timestamp}`} className="flex gap-3 p-3">
                    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-xs" style={toneStyles[item.tone]}>
                      {item.tone === 'green' ? '✓' : item.tone === 'rose' ? '+' : item.tone === 'violet' ? '↗' : '•'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 text-xs">{item.title}</div>
                      <div className="mb-1 text-[10px] text-tx-lo">{item.subtitle}</div>
                      <div className="text-[10px] text-tx-faint">{formatRelativeTime(item.timestamp)}</div>
                    </div>
                  </div>
                ))
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
}: {
  title: string
  value: number
  unit: string
  subtitle: string
  icon: string
  tone: Tone
  trend?: string
  trendTone?: 'up' | 'down'
  decimals?: number
}) {
  return (
    <div className="kpi panel">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg text-base" style={toneStyles[tone]}>
          {icon}
        </div>
        <span className="text-xs font-medium text-tx-mid">{title}</span>
      </div>
      <div className="kpi-val">
        {value.toFixed(decimals)}
        <span className="cur">{unit}</span>
      </div>
      <div className="kpi-meta">
        {trend ? (
          <span className={`delta ${trendTone === 'down' ? 'down' : 'up'}`}>
            {trendTone === 'down' ? '↓' : '↑'}
            {trend}
          </span>
        ) : null}
        <span>{subtitle}</span>
      </div>
    </div>
  )
}
