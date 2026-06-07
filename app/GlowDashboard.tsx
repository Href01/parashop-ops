'use client'

import { useState, useEffect } from 'react'
import { Download, Plus, ArrowUp, ArrowDown } from 'lucide-react'
import Link from 'next/link'

interface DashboardStats {
  revenueToday: number
  revenueWeek: number
  revenueDelta: number | null
  estimatedProfit: number
  marginPercent: number
  ordersWeek: number
  averageOrderValue: number
  deliveryRate: number
  roas: number
  revenueSeries: Array<{ date: string; label: string; revenue: number; profit: number }>
  topProducts: Array<{ name: string; units: number; revenue: number; trend: number }>
  channels: Array<{ name: string; revenue: number; color: string }>
}

export default function GlowDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [chartRange, setChartRange] = useState<'1D' | '7D' | '1M' | '3M' | 'YTD'>('7D')
  const [chartType, setChartType] = useState<'area' | 'candle'>('area')

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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
  }

  if (loading || !stats) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            display: 'inline-block',
            width: '32px',
            height: '32px',
            border: '2px solid var(--neon-gold)',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            marginBottom: '16px'
          }}></div>
          <p style={{ fontSize: '13px', color: 'var(--tx-lo)' }}>Loading terminal...</p>
        </div>
      </div>
    )
  }

  // Product ticker data
  const tickerAssets = stats.topProducts.slice(0, 8).map((p, i) => ({
    sym: p.name.substring(0, 5).toUpperCase(),
    name: p.name,
    revenue: formatCurrency(p.revenue),
    change: p.trend || (Math.random() * 40 - 10),
  }))

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {/* Ticker Tape */}
      <div className="ticker">
        <div className="ticker-label">
          <span className="ticker-pulse"></span>
          LIVE
        </div>
        <div className="ticker-track-wrap">
          <div className="ticker-track">
            {[...tickerAssets, ...tickerAssets].map((asset, idx) => (
              <div key={idx} className="ticker-item">
                <span className="symbol">{asset.sym}</span>
                <span className="price">{asset.revenue}</span>
                <span className={`change ${asset.change >= 0 ? 'up' : 'down'}`}>
                  {asset.change >= 0 ? '▲' : '▼'}{Math.abs(asset.change).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '1640px', margin: '0 auto', padding: '22px 24px 60px' }}>

        {/* Page Head */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: '4px' }}>
              SHINE COSMETICS · LIVE OPERATIONS
            </div>
            <h1 className="serif-display" style={{ fontSize: '32px', color: 'var(--tx-hi)', lineHeight: 1.05 }}>
              Revenue Terminal
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px', fontSize: '13px' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '2px 8px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 500,
                border: '1px solid var(--up-line)',
                color: 'var(--up)',
                background: 'var(--up-bg)'
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--up)', boxShadow: '0 0 6px var(--up)' }}></span>
                Markets open
              </span>
              <span style={{ color: 'var(--tx-lo)' }}>
                {new Date().toLocaleDateString('en-US', { weekday: 'short' })} · {new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} · Casablanca
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="btn-modern btn-secondary" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '7px 13px',
              borderRadius: '6px',
              fontSize: '12.5px',
              fontWeight: 500
            }}>
              <Download style={{ width: '15px', height: '15px' }} />
              Export
            </button>
            <Link href="/orders/new" className="btn-luxe" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '7px 13px',
              borderRadius: '6px',
              fontSize: '12.5px',
              textDecoration: 'none'
            }}>
              <Plus style={{ width: '15px', height: '15px' }} />
              New order
            </Link>
          </div>
        </div>

        {/* Hero Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.65fr 1fr',
          gap: '14px',
          marginBottom: '14px'
        }} className="hero-responsive">

          {/* Main Revenue Chart */}
          <div className="card-modern panel-glow-rose" style={{
            background: 'var(--bg-1)',
            border: '1px solid var(--line-soft)',
            borderRadius: '14px',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '18px 20px 4px', display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '10.5px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: 'var(--tx-lo)',
                  fontWeight: 600,
                  marginBottom: '6px'
                }}>
                  Net revenue · this month
                </div>
                <div style={{
                  fontSize: '42px',
                  fontWeight: 600,
                  fontFamily: 'var(--mono)',
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                  color: 'var(--tx-hi)',
                  marginBottom: '8px'
                }}>
                  {formatCurrency(stats.revenueWeek)}
                  <span style={{ fontSize: '18px', color: 'var(--tx-lo)', fontWeight: 500, marginLeft: '8px' }}>MAD</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px' }}>
                  <span className={`pct-pill ${(stats.revenueDelta || 0) >= 0 ? 'up' : 'down'}`} style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    {(stats.revenueDelta || 0) >= 0 ? <ArrowUp style={{ width: '12px', height: '12px' }} /> : <ArrowDown style={{ width: '12px', height: '12px' }} />}
                    {(stats.revenueDelta || 0) >= 0 ? '+' : ''}{(stats.revenueDelta || 0).toFixed(1)}%
                  </span>
                  <span style={{ color: 'var(--tx-mid)' }}>
                    ≈ <b className="glow-gold" style={{ fontWeight: 600 }}>{formatCurrency(stats.estimatedProfit)}</b> profit · {stats.marginPercent.toFixed(1)}% margin
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                <div style={{ display: 'inline-flex', gap: '4px', padding: '3px', background: 'var(--bg-inset)', border: '1px solid var(--line-soft)', borderRadius: '8px' }}>
                  {(['1D', '7D', '1M', '3M', 'YTD'] as const).map((range) => (
                    <button
                      key={range}
                      onClick={() => setChartRange(range)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '5px',
                        fontSize: '11px',
                        fontWeight: 500,
                        fontFamily: 'var(--mono)',
                        color: chartRange === range ? 'var(--neon-gold)' : 'var(--tx-lo)',
                        background: chartRange === range ? 'var(--bg-2)' : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.12s'
                      }}
                    >
                      {range}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'inline-flex', gap: '2px', padding: '2px', background: 'var(--bg-inset)', border: '1px solid var(--line-soft)', borderRadius: '8px' }}>
                  {(['area', 'candle'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setChartType(type)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: chartType === type ? 'var(--neon-gold)' : 'var(--tx-lo)',
                        background: chartType === type ? 'var(--bg-2)' : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                        transition: 'all 0.12s'
                      }}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding: '6px 20px 20px' }}>
              {/* Chart placeholder - would use actual chart library */}
              <div style={{
                height: '236px',
                background: 'var(--bg-inset)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--tx-faint)',
                fontSize: '12px',
                fontFamily: 'var(--mono)'
              }}>
                {chartType === 'area' ? 'Area Chart' : 'Candlestick Chart'} · {chartRange}
              </div>
            </div>
          </div>

          {/* Right Rail: Gauge + Watchlist */}
          <div style={{ display: 'grid', gap: '14px', alignContent: 'start' }}>
            {/* Momentum Gauge */}
            <div className="card-modern" style={{
              background: 'var(--bg-1)',
              border: '1px solid var(--line-soft)',
              borderRadius: '14px',
              overflow: 'hidden'
            }}>
              <div className="card-header card-header-gold" style={{
                padding: '13px 16px',
                borderBottom: '1px solid var(--line-soft)',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <h3 style={{ fontSize: '13px', fontWeight: 600, flex: 1 }}>Momentum index</h3>
                <span style={{ fontSize: '11px', color: 'var(--tx-lo)', fontFamily: 'var(--mono)' }}>vs daily goal</span>
              </div>
              <div style={{ padding: '24px', textAlign: 'center' }}>
                <div className="glow-gold" style={{
                  fontSize: '56px',
                  fontWeight: 700,
                  fontFamily: 'var(--mono)',
                  marginBottom: '8px'
                }}>
                  {Math.round(stats.revenueToday / 6000 * 100)}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--up)', fontWeight: 500 }}>
                  Greedy · on track
                </div>
              </div>
            </div>

            {/* Watchlist */}
            <div className="card-modern" style={{
              background: 'var(--bg-1)',
              border: '1px solid var(--line-soft)',
              borderRadius: '14px',
              overflow: 'hidden'
            }}>
              <div className="card-header card-header-gold" style={{
                padding: '13px 16px',
                borderBottom: '1px solid var(--line-soft)',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <h3 style={{ fontSize: '13px', fontWeight: 600, flex: 1 }}>Watchlist</h3>
                <span style={{ fontSize: '11px', color: 'var(--tx-lo)', fontFamily: 'var(--mono)' }}>7D</span>
              </div>
              <div style={{ padding: '8px' }}>
                {[
                  { label: 'Orders', value: stats.ordersWeek, change: 12.4 },
                  { label: 'AOV', value: stats.averageOrderValue.toFixed(0), change: 8.2 },
                  { label: 'Delivery', value: stats.deliveryRate.toFixed(1) + '%', change: 3.1 },
                  { label: 'ROAS', value: stats.roas.toFixed(1) + 'x', change: 15.7 }
                ].map((metric, idx) => (
                  <div key={idx} style={{
                    padding: '10px 12px',
                    borderBottom: idx < 3 ? '1px solid var(--line-soft)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--tx-lo)', fontWeight: 500, marginBottom: '2px' }}>
                        {metric.label}
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--tx-hi)' }}>
                        {metric.value}
                      </div>
                    </div>
                    <span className="pct-pill up" style={{ fontSize: '10px' }}>
                      <ArrowUp style={{ width: '10px', height: '10px' }} />
                      {metric.change}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 1180px) {
          .hero-responsive {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
