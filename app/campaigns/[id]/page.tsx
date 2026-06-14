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
  ads: any[]
  costs: any[]
  costsByType: any[]
  posts: any[]
  orders: any[]
}

const AD_PLATFORMS = ['Meta', 'TikTok', 'Google', 'Snapchat', 'Influence', 'Autre']
const PLATFORM_COLOR: Record<string, string> = { Meta: '#0866FF', TikTok: '#000000', Google: '#EA4335', Snapchat: '#FFFC00', Influence: 'var(--rose-bright)', Autre: 'var(--tx-lo)' }

export default function CampaignDetailPage() {
  const params = useParams()
  const campaignId = params?.id as string

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddAd, setShowAddAd] = useState(false)
  const [newAd, setNewAd] = useState({
    platform: 'Meta',
    name: '',
    spend: 0,
    revenue: 0,
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

  const addAd = async () => {
    if (!newAd.spend && !newAd.revenue) return
    try {
      const res = await fetch(`/api/ops/campaigns/${campaignId}/ads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAd),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      setShowAddAd(false)
      setNewAd({ platform: 'Meta', name: '', spend: 0, revenue: 0 })
      fetchCampaign() // Refresh to show new ad line + recomputed P&L
    } catch (error) {
      console.error('Failed to add ad line:', error)
    }
  }

  const deleteAd = async (adId: number) => {
    try {
      await fetch(`/api/ops/campaigns/${campaignId}/ads/${adId}`, { method: 'DELETE' })
      fetchCampaign()
    } catch (error) {
      console.error('Failed to delete ad line:', error)
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
            Retour
          </button>
          <div>
            <h1>{campaign.name}</h1>
            <div className="sub">{campaign.description || 'Détail & P&L de la campagne'}</div>
          </div>
          <div className="spacer"></div>
          <span className={`badge ${campaign.status === 'Active' ? 'green' : 'gray'}`}>
            {campaign.status === 'Active' ? 'Active' : 'Brouillon'}
          </span>
        </div>

        {/* P&L Summary */}
        <div className="cstat-row">
          <PLMetric
            icon={<DollarSign />}
            title="CA"
            value={formatCurrency(campaign.totalRevenue)}
            unit="MAD"
            color="green"
          />
          <PLMetric
            icon={<Receipt />}
            title="Coûts totaux"
            value={formatCurrency(campaign.totalCosts)}
            unit="MAD"
            color="red"
            subtitle={`Produits: ${formatCurrency(campaign.totalCOGS)} | Pub: ${formatCurrency(campaign.totalAdSpend)}`}
          />
          <PLMetric
            icon={<TrendingUp />}
            title="Profit net"
            value={formatCurrency(campaign.netProfit)}
            unit="MAD"
            color={campaign.netProfit >= 0 ? 'green' : 'red'}
            subtitle={`Marge: ${(campaign.profitMargin || 0).toFixed(1)}%`}
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
                <h3>Détail P&L</h3>
              </div>
              <div className="panel-pad">
                <PLRow label="CA" value={campaign.totalRevenue} type="positive" />
                <div style={{ borderTop: '1px solid var(--line-soft)', margin: '12px 0' }}></div>
                <PLRow label="Coût des produits (COGS)" value={-campaign.totalCOGS} type="negative" />
                <PLRow label="Marge brute" value={campaign.grossProfit} type="info" bold />
                <div style={{ borderTop: '1px solid var(--line-soft)', margin: '12px 0' }}></div>
                <PLRow label="Dépense pub" value={-campaign.totalAdSpend} type="negative" />
                <PLRow label="Autres coûts" value={-campaign.totalOtherCosts} type="negative" />
                <div style={{ borderTop: '2px solid var(--line)', margin: '12px 0' }}></div>
                <PLRow
                  label="PROFIT NET"
                  value={campaign.netProfit}
                  type={campaign.netProfit >= 0 ? 'positive' : 'negative'}
                  bold
                  large
                />
              </div>
            </div>

            {/* Ad spend — Meta / TikTok / … (backed by AdCampaign) */}
            <div className="panel">
              <div className="panel-head">
                <Receipt />
                <h3>Dépense pub (Meta / TikTok)</h3>
                <div className="spacer"></div>
                <button className="btn sm primary" onClick={() => setShowAddAd(true)}>
                  <Plus />
                  Ajouter
                </button>
              </div>

              <div className="panel-pad" style={{ paddingBottom: 0 }}>
                <p className="fs12 tx-lo" style={{ marginTop: -4 }}>
                  Saisis ta dépense pub par plateforme. Le <b>CA rapporté</b> = ce que Meta/TikTok attribue (pixel). La sync API automatique remplira ceci plus tard.
                </p>
              </div>

              {showAddAd && (
                <div className="panel-pad" style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <div className="form-grid">
                    <div className="form-field">
                      <label>Plateforme</label>
                      <select value={newAd.platform} onChange={(e) => setNewAd({ ...newAd, platform: e.target.value })}>
                        {AD_PLATFORMS.map((p) => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="form-field">
                      <label>Nom (optionnel)</label>
                      <input type="text" value={newAd.name} onChange={(e) => setNewAd({ ...newAd, name: e.target.value })} placeholder="ex. Reel Ramadan boost" />
                    </div>
                    <div className="form-field">
                      <label>Dépense (MAD)</label>
                      <input type="number" value={newAd.spend || ''} onChange={(e) => setNewAd({ ...newAd, spend: parseFloat(e.target.value) || 0 })} placeholder="0" />
                    </div>
                    <div className="form-field">
                      <label>CA rapporté (MAD)</label>
                      <input type="number" value={newAd.revenue || ''} onChange={(e) => setNewAd({ ...newAd, revenue: parseFloat(e.target.value) || 0 })} placeholder="0" />
                    </div>
                  </div>
                  <div className="row gap8 mt12">
                    <button className="btn primary" onClick={addAd}>Ajouter</button>
                    <button className="btn ghost" onClick={() => setShowAddAd(false)}>Annuler</button>
                  </div>
                </div>
              )}

              <div className="table-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Plateforme</th>
                      <th>Nom</th>
                      <th className="r">Dépense</th>
                      <th className="r">CA rapporté</th>
                      <th>ROAS</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(campaign.ads || []).map((ad: any) => {
                      const roas = Number(ad.roas) || 0
                      return (
                      <tr key={ad.id}>
                        <td>
                          <span className="badge" style={{ background: `${PLATFORM_COLOR[ad.platform] || 'var(--tx-lo)'}1a`, color: PLATFORM_COLOR[ad.platform] || 'var(--tx-lo)' }}>{ad.platform}</span>
                        </td>
                        <td className="tx-mid fs12">{ad.name || '-'}</td>
                        <td className="r num neg">-{formatCurrency(ad.spend)}</td>
                        <td className="r num pos">+{formatCurrency(ad.revenue)}</td>
                        <td>
                          <span className={`num fs12 fw600 ${roas >= 2 ? 'pos' : roas > 0 ? '' : 'neg'}`}>{roas.toFixed(1)}x</span>
                        </td>
                        <td className="r">
                          <button className="btn ghost sm" onClick={() => deleteAd(ad.id)} aria-label="Supprimer" style={{ padding: '2px 6px' }}>✕</button>
                        </td>
                      </tr>
                      )
                    })}
                    {(campaign.ads || []).length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: 20 }} className="tx-lo fs13">
                          Aucune dépense pub. Ajoute ta dépense Meta/TikTok pour voir le ROAS réel.
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
                <h3>Commandes attribuées</h3>
                <span className="badge green">{campaign.totalOrders || 0}</span>
              </div>
              <div className="table-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Commande</th>
                      <th>Client</th>
                      <th className="r">Total</th>
                      <th>Statut</th>
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
                        <td colSpan={5} style={{ textAlign: 'center', padding: 20 }} className="tx-lo fs13">
                          Aucune commande attribuée à cette campagne pour l&apos;instant
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
                <h3>Infos campagne</h3>
              </div>
              <div className="panel-pad">
                <div className="info-row">
                  <span className="info-label">Période</span>
                  <span className="info-value">
                    {formatDate(campaign.startDate)} - {formatDate(campaign.endDate)}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Commandes</span>
                  <span className="info-value">{campaign.totalOrders || 0}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Unités vendues</span>
                  <span className="info-value">{campaign.totalUnits || 0}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Panier moyen</span>
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
                  <h3>Produits</h3>
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
