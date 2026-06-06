'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import BosShell from '@/components/BosShell'
import {
  ArrowLeft,
  Plus,
  DollarSign,
  TrendingUp,
  Package,
  Target,
  Calendar,
  Receipt,
  ShoppingCart,
} from 'lucide-react'

type Campaign = {
  id: number
  name: string
  description: string
  status: string
  startDate: string
  endDate: string
  totalRevenue: number
  totalCOGS: number
  totalAdSpend: number
  totalOtherCosts: number
  totalCosts: number
  grossProfit: number
  netProfit: number
  roi: number
  roas: number
  profitMargin: number
  totalOrders: number
  totalUnits: number
  avgOrderValue: number
  products: any[]
  costs: any[]
  costsByType: any[]
  posts: any[]
  orders: any[]
}

export default function CampaignDetailPage() {
  const params = useParams()
  const campaignId = params?.id as string

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddCost, setShowAddCost] = useState(false)
  const [newCost, setNewCost] = useState({
    type: 'Meta Ads',
    platform: 'Instagram',
    amount: 0,
    description: '',
  })

  useEffect(() => {
    if (campaignId) {
      fetchCampaign()
    }
  }, [campaignId])

  const fetchCampaign = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ops/campaigns/${campaignId}`)
      const data = await res.json()
      setCampaign(data)
    } catch (error) {
      console.error('Failed to fetch campaign:', error)
    } finally {
      setLoading(false)
    }
  }

  const addCost = async () => {
    try {
      await fetch(`/api/ops/campaigns/${campaignId}/costs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCost),
      })
      setShowAddCost(false)
      setNewCost({ type: 'Meta Ads', platform: 'Instagram', amount: 0, description: '' })
      fetchCampaign() // Refresh to show new cost
    } catch (error) {
      console.error('Failed to add cost:', error)
    }
  }

  const recalculate = async () => {
    try {
      await fetch(`/api/ops/campaigns/${campaignId}/calculate`, { method: 'POST' })
      fetchCampaign() // Refresh to show updated metrics
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
      <BosShell active="campaigns" title="Campaign" crumb="Growth">
        <div className="page-inner">
          <p>Loading campaign...</p>
        </div>
      </BosShell>
    )
  }

  if (!campaign) {
    return (
      <BosShell active="campaigns" title="Campaign" crumb="Growth">
        <div className="page-inner">
          <p>Campaign not found</p>
        </div>
      </BosShell>
    )
  }

  return (
    <BosShell active="campaigns" title={campaign.name} crumb="Growth">
      <div className="page-inner page-wide">
        {/* Header */}
        <div className="page-head">
          <button className="btn ghost" onClick={() => window.history.back()}>
            <ArrowLeft />
            Back
          </button>
          <div>
            <h1>{campaign.name}</h1>
            <div className="sub">{campaign.description || 'Campaign details & P&L breakdown'}</div>
          </div>
          <div className="spacer"></div>
          <span className={`badge ${campaign.status === 'Active' ? 'green' : 'gray'}`}>
            {campaign.status}
          </span>
          <button className="btn" onClick={recalculate}>
            <TrendingUp />
            Recalculate metrics
          </button>
        </div>

        {/* P&L Summary */}
        <div className="cstat-row">
          <PLMetric
            icon={<DollarSign />}
            title="Revenue"
            value={formatCurrency(campaign.totalRevenue)}
            unit="MAD"
            color="green"
          />
          <PLMetric
            icon={<Receipt />}
            title="Total costs"
            value={formatCurrency(campaign.totalCosts)}
            unit="MAD"
            color="red"
            subtitle={`COGS: ${formatCurrency(campaign.totalCOGS)} | Ads: ${formatCurrency(campaign.totalAdSpend)}`}
          />
          <PLMetric
            icon={<TrendingUp />}
            title="Net profit"
            value={formatCurrency(campaign.netProfit)}
            unit="MAD"
            color={campaign.netProfit >= 0 ? 'green' : 'red'}
            subtitle={`Margin: ${(campaign.profitMargin || 0).toFixed(1)}%`}
          />
          <PLMetric
            icon={<Target />}
            title="ROI"
            value={(campaign.roi || 0).toFixed(1)}
            unit="%"
            color={campaign.roi >= 50 ? 'green' : campaign.roi >= 0 ? 'amber' : 'red'}
            subtitle={`ROAS: ${(campaign.roas || 0).toFixed(1)}x`}
          />
        </div>

        <div className="row gap20" style={{ alignItems: 'flex-start' }}>
          {/* Left Column */}
          <div style={{ flex: '2', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* P&L Breakdown */}
            <div className="panel">
              <div className="panel-head">
                <Receipt />
                <h3>P&L Breakdown</h3>
              </div>
              <div className="panel-pad">
                <PLRow label="Revenue" value={campaign.totalRevenue} type="positive" />
                <div style={{ borderTop: '1px solid var(--line-soft)', margin: '12px 0' }}></div>
                <PLRow label="Cost of goods sold (COGS)" value={-campaign.totalCOGS} type="negative" />
                <PLRow label="Gross profit" value={campaign.grossProfit} type="info" bold />
                <div style={{ borderTop: '1px solid var(--line-soft)', margin: '12px 0' }}></div>
                <PLRow label="Ad spend" value={-campaign.totalAdSpend} type="negative" />
                <PLRow label="Other costs" value={-campaign.totalOtherCosts} type="negative" />
                <div style={{ borderTop: '2px solid var(--line)', margin: '12px 0' }}></div>
                <PLRow
                  label="NET PROFIT"
                  value={campaign.netProfit}
                  type={campaign.netProfit >= 0 ? 'positive' : 'negative'}
                  bold
                  large
                />
              </div>
            </div>

            {/* Costs */}
            <div className="panel">
              <div className="panel-head">
                <Receipt />
                <h3>Costs</h3>
                <div className="spacer"></div>
                <button className="btn sm primary" onClick={() => setShowAddCost(true)}>
                  <Plus />
                  Add cost
                </button>
              </div>

              {showAddCost && (
                <div className="panel-pad" style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <div className="form-grid">
                    <div className="form-field">
                      <label>Type</label>
                      <select
                        value={newCost.type}
                        onChange={(e) => setNewCost({ ...newCost, type: e.target.value })}
                      >
                        <option>Meta Ads</option>
                        <option>Google Ads</option>
                        <option>TikTok Ads</option>
                        <option>Snapchat Ads</option>
                        <option>Influencer</option>
                        <option>Content Creation</option>
                        <option>Photography</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div className="form-field">
                      <label>Platform</label>
                      <input
                        type="text"
                        value={newCost.platform}
                        onChange={(e) => setNewCost({ ...newCost, platform: e.target.value })}
                        placeholder="Instagram, Facebook, etc."
                      />
                    </div>
                    <div className="form-field">
                      <label>Amount (MAD)</label>
                      <input
                        type="number"
                        value={newCost.amount}
                        onChange={(e) => setNewCost({ ...newCost, amount: parseFloat(e.target.value) })}
                      />
                    </div>
                    <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                      <label>Description</label>
                      <input
                        type="text"
                        value={newCost.description}
                        onChange={(e) => setNewCost({ ...newCost, description: e.target.value })}
                        placeholder="Instagram Stories campaign"
                      />
                    </div>
                  </div>
                  <div className="row gap8 mt12">
                    <button className="btn primary" onClick={addCost}>
                      Add cost
                    </button>
                    <button className="btn ghost" onClick={() => setShowAddCost(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="table-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Platform</th>
                      <th>Description</th>
                      <th className="r">Amount</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(campaign.costs || []).map((cost: any) => (
                      <tr key={cost.id}>
                        <td>
                          <span className="badge">{cost.type}</span>
                        </td>
                        <td>{cost.platform || '-'}</td>
                        <td className="tx-mid fs12">{cost.description || '-'}</td>
                        <td className="r num neg">-{formatCurrency(cost.amount)}</td>
                        <td className="fs12 tx-lo">{formatDate(cost.date)}</td>
                      </tr>
                    ))}
                    {(campaign.costs || []).length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: 20 }}>
                          No costs added yet
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
                <h3>Orders</h3>
                <span className="badge green">{campaign.totalOrders || 0}</span>
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
                    {(campaign.orders || []).slice(0, 10).map((order: any) => (
                      <tr
                        key={order.id}
                        onClick={() => (window.location.href = `/orders/${order.id}`)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="t-strong">{order.orderNumber}</td>
                        <td>{order.deliveryName}</td>
                        <td className="r num pos">{formatCurrency(order.total)}</td>
                        <td>
                          <span className={`badge ${order.status === 'DELIVERED' ? 'green' : 'blue'}`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="fs12 tx-lo">{formatDate(order.createdAt)}</td>
                      </tr>
                    ))}
                    {(campaign.orders || []).length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: 20 }}>
                          No orders attributed to this campaign yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Campaign Info */}
            <div className="panel">
              <div className="panel-head">
                <Calendar />
                <h3>Campaign info</h3>
              </div>
              <div className="panel-pad">
                <div className="info-row">
                  <span className="info-label">Period</span>
                  <span className="info-value">
                    {formatDate(campaign.startDate)} - {formatDate(campaign.endDate)}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Total orders</span>
                  <span className="info-value">{campaign.totalOrders || 0}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Total units</span>
                  <span className="info-value">{campaign.totalUnits || 0}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Avg order value</span>
                  <span className="info-value">{formatCurrency(campaign.avgOrderValue || 0)} MAD</span>
                </div>
              </div>
            </div>

            {/* Costs by Type */}
            {(campaign.costsByType || []).length > 0 && (
              <div className="panel">
                <div className="panel-head">
                  <Receipt />
                  <h3>Costs by type</h3>
                </div>
                <div className="panel-pad">
                  {campaign.costsByType.map((item: any) => (
                    <div key={item.type} className="mb12">
                      <div className="between mb4">
                        <span className="fs12 fw500">{item.type}</span>
                        <span className="num fs12 neg">-{formatCurrency(item.total)} MAD</span>
                      </div>
                      <div className="bar">
                        <span
                          style={{
                            width: `${(item.total / campaign.totalCosts) * 100}%`,
                            background: 'var(--red)',
                          }}
                        ></span>
                      </div>
                      <div className="fs11 tx-lo mt2">
                        {((item.total / campaign.totalCosts) * 100).toFixed(1)}% of total costs
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Products */}
            {(campaign.products || []).length > 0 && (
              <div className="panel">
                <div className="panel-head">
                  <Package />
                  <h3>Products</h3>
                  <span className="badge">{campaign.products.length}</span>
                </div>
                <div className="panel-pad">
                  {campaign.products.map((product: any) => (
                    <div key={product.productId} className="row gap8 mb8 p8">
                      {product.image && (
                        <img
                          src={product.image}
                          alt={product.productName}
                          style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }}
                        />
                      )}
                      <div style={{ flex: 1 }}>
                        <div className="fw500 fs12">{product.productName}</div>
                        <div className="fs11 tx-lo">{product.brand}</div>
                      </div>
                      {product.discountPercent && (
                        <span className="badge red">-{product.discountPercent}%</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </BosShell>
  )
}

function PLMetric({ icon, title, value, unit, color, subtitle }: any) {
  return (
    <div className="panel kpi">
      <div className="kpi-top">
        <div className="kpi-ico" style={{ background: `var(--${color}-bg)`, color: `var(--${color})` }}>
          {icon}
        </div>
        <span className="kpi-title">{title}</span>
      </div>
      <div className="kpi-val">
        <span>{value}</span>
        <span className="cur">{unit}</span>
      </div>
      {subtitle && <div className="fs11 tx-lo mt4">{subtitle}</div>}
    </div>
  )
}

function PLRow({ label, value, type, bold, large }: any) {
  const color = type === 'positive' ? 'pos' : type === 'negative' ? 'neg' : ''
  return (
    <div className="between mb8">
      <span className={`${bold ? 'fw600' : ''} ${large ? 'fs14' : 'fs13'}`}>{label}</span>
      <span className={`num ${color} ${bold ? 'fw600' : ''} ${large ? 'fs16' : 'fs13'}`}>
        {value >= 0 ? '' : ''}
        {new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 0 }).format(Math.abs(value))} MAD
      </span>
    </div>
  )
}
