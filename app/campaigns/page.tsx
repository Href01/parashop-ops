'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Megaphone, Plus, Wallet, Target, TrendingUp, Star, Calendar } from 'lucide-react'
import BosShell from '@/components/BosShell'

type Campaign = {
  id: number
  name: string
  status: string
  startDate: string
  endDate: string
  totalRevenue: number
  totalCosts: number
  netProfit: number
  roi: number
  roas: number
  totalOrders: number
  totalAdSpend: number
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('Active')

  useEffect(() => {
    fetchCampaigns()
  }, [statusFilter])

  const fetchCampaigns = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter && statusFilter !== 'All') params.append('status', statusFilter)

      const res = await fetch(`/api/ops/campaigns?${params}`)
      const data = await res.json()
      setCampaigns(data.campaigns || [])
    } catch (error) {
      console.error('Failed to fetch campaigns:', error)
    } finally {
      setLoading(false)
    }
  }

  // Calculate aggregate metrics
  const totalAdSpend = campaigns.reduce((sum, c) => sum + (c.totalAdSpend || 0), 0)
  const totalRevenue = campaigns.reduce((sum, c) => sum + (c.totalRevenue || 0), 0)
  const totalProfit = campaigns.reduce((sum, c) => sum + (c.netProfit || 0), 0)
  const avgROAS = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0
  const totalOrders = campaigns.reduce((sum, c) => sum + (c.totalOrders || 0), 0)
  const costPerOrder = totalOrders > 0 ? totalAdSpend / totalOrders : 0

  // Active campaigns count
  const activeCampaigns = campaigns.filter(c => c.status === 'Active')

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 }).format(amount)
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'Active': 'green',
      'Draft': 'gray',
      'Completed': 'blue',
      'Paused': 'amber',
    }
    return colors[status] || 'gray'
  }

  return (
    <BosShell active="campaigns" title="Campaigns" crumb="Growth">
      <div className="page-inner page-wide">
        <div className="page-head">
          <div>
            <h1>Campaigns & Ads</h1>
            <div className="sub">Real P&L tracking with ad spend, ROAS & ROI</div>
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
          <button className="btn-modern btn-primary" onClick={() => window.location.href = '/campaigns/new'}>
            <Plus className="w-4 h-4" />New campaign
          </button>
        </div>

        <div className="cstat-row">
          <Metric
            icon={<Wallet />}
            tone="red"
            title="Total ad spend"
            value={formatCurrency(totalAdSpend)}
            unit="MAD"
            trend={campaigns.length > 0 ? `${campaigns.length} campaigns` : 'No data'}
          />
          <Metric
            icon={<TrendingUp />}
            tone="green"
            title="Total revenue"
            value={formatCurrency(totalRevenue)}
            unit="MAD"
            trend={`${totalOrders} orders`}
          />
          <Metric
            icon={<Megaphone />}
            tone="rose"
            title="Blended ROAS"
            value={avgROAS.toFixed(1)}
            unit="x"
            trend={avgROAS >= 3 ? 'Excellent' : avgROAS >= 2 ? 'Good' : 'Review'}
          />
          <Metric
            icon={<Target />}
            tone="blue"
            title="Net profit"
            value={formatCurrency(totalProfit)}
            unit="MAD"
            trend={totalProfit > 0 ? 'Profitable' : 'Loss'}
          />
        </div>

        <div className="camp-grid">
          <div className="card-modern" style={{ gridColumn: '1 / -1' }}>
            <div className="card-header">
              <h3 className="text-lg font-semibold">Active campaigns</h3>
              <div className="spacer"></div>
              {activeCampaigns.length > 0 && (
                <span className="badge-modern badge-success">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  {activeCampaigns.length} running
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th className="r">Ad Spend</th>
                    <th className="r">Revenue</th>
                    <th className="r">Profit</th>
                    <th>ROAS</th>
                    <th>ROI</th>
                    <th>Status</th>
                    <th className="r">Ends</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '40px' }}>
                        Loading campaigns...
                      </td>
                    </tr>
                  ) : campaigns.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '40px' }}>
                        <div className="empty-state">
                          <Megaphone size={48} style={{ color: 'var(--tx-faint)', marginBottom: 16 }} />
                          <p className="fw600">No campaigns yet</p>
                          <p className="tx-lo fs13">Create your first campaign to track ad spend and ROI</p>
                          <button className="btn primary mt16" onClick={() => window.location.href = '/campaigns/new'}>
                            <Plus />Create campaign
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    campaigns.map((campaign) => (
                      <tr
                        key={campaign.id}
                        onClick={() => window.location.href = `/campaigns/${campaign.id}`}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="t-strong">{campaign.name}</td>
                        <td className="r num neg">-{formatCurrency(campaign.totalAdSpend || 0)}</td>
                        <td className="r num pos">+{formatCurrency(campaign.totalRevenue || 0)}</td>
                        <td className="r num">{formatCurrency(campaign.netProfit || 0)}</td>
                        <td>
                          <span className="row gap8">
                            <span className="roas-bar">
                              <span
                                style={{
                                  width: `${Math.min(100, ((campaign.roas || 0) / 5) * 100)}%`,
                                  background:
                                    (campaign.roas || 0) >= 4
                                      ? 'var(--green)'
                                      : (campaign.roas || 0) >= 2.5
                                      ? 'var(--amber)'
                                      : 'var(--red)',
                                }}
                              ></span>
                            </span>
                            <span className="num fs12 fw600">{(campaign.roas || 0).toFixed(1)}x</span>
                          </span>
                        </td>
                        <td>
                          <span className={`num ${(campaign.roi || 0) >= 0 ? 'pos' : 'neg'}`}>
                            {(campaign.roi || 0).toFixed(1)}%
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${getStatusColor(campaign.status)}`}>
                            {campaign.status}
                          </span>
                        </td>
                        <td className="r">
                          <span className="fs12 tx-lo mono">{formatDate(campaign.endDate)}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {campaigns.length > 0 && (
            <div className="panel" style={{ gridColumn: '1 / -1' }}>
              <div className="panel-head">
                <Calendar />
                <h3>Quick stats</h3>
              </div>
              <div className="panel-pad">
                <div className="row gap20">
                  <div className="mini-stat">
                    <span className="ms-l">Total campaigns</span>
                    <span className="ms-v">{campaigns.length}</span>
                  </div>
                  <div className="mini-stat">
                    <span className="ms-l">Active</span>
                    <span className="ms-v">{activeCampaigns.length}</span>
                  </div>
                  <div className="mini-stat">
                    <span className="ms-l">Avg cost/order</span>
                    <span className="ms-v">{formatCurrency(costPerOrder)} MAD</span>
                  </div>
                  <div className="mini-stat">
                    <span className="ms-l">Best ROAS</span>
                    <span className="ms-v pos">
                      {Math.max(...campaigns.map(c => c.roas || 0)).toFixed(1)}x
                    </span>
                  </div>
                  <div className="mini-stat">
                    <span className="ms-l">Best ROI</span>
                    <span className="ms-v pos">
                      {Math.max(...campaigns.map(c => c.roi || 0)).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
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
            color: tone === 'rose' ? 'var(--rose-bright)' : `var(--${tone})`,
          }}
        >
          {icon}
        </div>
        <span className="kpi-title">{title}</span>
      </div>
      <div className="kpi-val">
        <span>{value}</span>
        <span className="cur">{unit}</span>
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
