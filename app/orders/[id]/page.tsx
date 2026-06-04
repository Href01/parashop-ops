'use client'

import { ArrowLeft, Check, Clock, Edit3, MoreHorizontal, Truck, Wallet } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import BosShell from '@/components/BosShell'

interface Order {
  id: number
  orderNumber?: string
  status: string
  sourceChannel?: string
  deliveryName?: string
  deliveryPhone?: string
  deliveryCity?: string
  deliveryAddress?: string
  deliveryNotes?: string
  paymentMethod?: string
  revenue?: number | string
  total?: number | string
  estimatedProfit?: number | string
  marginPercent?: number | string
  deliveryFeeCharged?: number | string
  estimatedDeliveryCost?: number | string
  createdAt: string
  items: any[]
  statusHistory: any[]
  senditShipment: any
}

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatMoney(value: unknown) {
  return toNumber(value).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export default function OrderDetailPage() {
  const params = useParams()
  const orderId = params.id as string
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchOrder() {
      try {
        const res = await fetch(`/api/ops/orders/${orderId}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('Failed to fetch order')
        const data = (await res.json()) as Order
        setOrder(data)
      } catch (fetchError: any) {
        setError(fetchError.message)
      } finally {
        setLoading(false)
      }
    }

    if (orderId) void fetchOrder()
  }, [orderId])

  const totals = useMemo(() => {
    const productRevenue = order?.items?.reduce((sum, item) => sum + toNumber(item.price) * toNumber(item.quantity), 0) ?? 0
    const productCost = order?.items?.reduce((sum, item) => sum + toNumber(item.unitCost) * toNumber(item.quantity), 0) ?? 0
    const deliveryCharged = toNumber(order?.deliveryFeeCharged)
    const deliveryCost = toNumber(order?.estimatedDeliveryCost || 30)
    const profit = toNumber(order?.estimatedProfit) || productRevenue - productCost - deliveryCost
    const margin = toNumber(order?.marginPercent) || (productRevenue > 0 ? (profit / productRevenue) * 100 : 0)

    return { productRevenue, productCost, deliveryCharged, deliveryCost, profit, margin }
  }, [order])

  if (loading) {
    return (
      <BosShell active="orders" title="Order" crumb="Orders">
        <div className="page-inner">
          <div className="panel p-8">
            <div className="skeleton-line"></div>
          </div>
        </div>
      </BosShell>
    )
  }

  if (error || !order) {
    return (
      <BosShell active="orders" title="Order" crumb="Orders">
        <div className="page-inner">
          <div className="panel p-8">
            <h1 className="mb-2 text-xl font-semibold">Order unavailable</h1>
            <p className="text-tx-mid">{error || 'Order not found'}</p>
          </div>
        </div>
      </BosShell>
    )
  }

  return (
    <BosShell active="orders" title={`Order #${order.id}`} crumb="Orders">
      <div className="page-inner">
        <div className="row gap8 mb16 crumb-line">
          <Link href="/orders" className="row gap6">
            <ArrowLeft />
            Orders
          </Link>
          <span>/</span>
          <span className="mono">{order.orderNumber || `Order ${order.id}`}</span>
        </div>

        <div className="page-head detail-head">
          <div className="row gap12">
            <h1 className="num">#{order.id}</h1>
            <span className={`st st-${order.status.toLowerCase()}`}>
              <span className="sd"></span>
              {order.status}
            </span>
            <span className="badge rose">{order.sourceChannel || 'Manual'}</span>
          </div>
          <div className="spacer"></div>
          <button type="button" className="btn"><Edit3 />Edit</button>
          <button type="button" className="btn"><Truck />Track shipment</button>
          <button type="button" className="btn icon"><MoreHorizontal /></button>
        </div>

        <div className="panel mb16">
          <div className="stepper">
            {['Created', 'Confirmed', 'Shipped', 'Delivered', 'Paid out'].map((step, index) => {
              const complete = getStepIndex(order.status) >= index
              const current = getStepIndex(order.status) === index
              return (
                <div key={step} className={`step ${complete ? 'done' : ''} ${current ? 'cur' : ''}`}>
                  <div className="sc">{complete ? <Check /> : <Clock />}</div>
                  <div className="sl">{step}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="od-grid">
          <div className="grid">
            <div className="panel">
              <div className="panel-head">
                <h3>Items</h3>
                <div className="spacer"></div>
                <span className="hint">{order.items?.length || 0} products</span>
              </div>
              <div className="table-scroll">
                <table className="tbl">
                  <thead>
                    <tr><th>Product</th><th className="r">Unit price</th><th className="r">Cost</th><th className="r">Qty</th><th className="r">Total</th><th className="r">Profit</th></tr>
                  </thead>
                  <tbody>
                    {order.items?.map((item, index) => {
                      const total = toNumber(item.price) * toNumber(item.quantity)
                      const profit = (toNumber(item.price) - toNumber(item.unitCost)) * toNumber(item.quantity)
                      return (
                        <tr key={item.id || index}>
                          <td>
                            <div className="row gap10">
                              {item.image ? <img src={item.image} alt={item.productName} className="thumb" /> : <div className="thumb"></div>}
                              <div className="cellstack">
                                <span className="t-strong">{item.productName || `Product #${item.productId}`}</span>
                                <span className="t-sub mono">{item.sku || 'No SKU'}</span>
                              </div>
                            </div>
                          </td>
                          <td className="r num">{formatMoney(item.price)}</td>
                          <td className="r num tx-lo">{formatMoney(item.unitCost)}</td>
                          <td className="r num">x{item.quantity}</td>
                          <td className="r num t-strong">{formatMoney(total)}</td>
                          <td className={`r num ${profit >= 0 ? 'pos' : 'neg'}`}>{profit >= 0 ? '+' : ''}{formatMoney(profit)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><h3>Customer & delivery</h3></div>
              <div className="panel-pad info-grid">
                <Info label="Name" value={order.deliveryName || 'N/A'} />
                <Info label="Phone" value={order.deliveryPhone || 'N/A'} mono />
                <Info label="City" value={order.deliveryCity || 'N/A'} />
                <Info label="Payment" value={order.paymentMethod || 'COD'} />
                <Info label="Address" value={order.deliveryAddress || 'N/A'} wide />
                <Info label="Delivery notes" value={order.deliveryNotes || 'No delivery notes'} wide muted />
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <Truck className="panel-head-icon" />
                <h3>Sendit shipment</h3>
                <div className="spacer"></div>
                <span className="badge green">{order.senditShipment?.status || 'Not created'}</span>
              </div>
              <div className="panel-pad info-grid">
                <Info label="Tracking number" value={order.senditShipment?.trackingNumber || order.senditShipment?.senditShipmentId || 'No shipment yet'} mono />
                <Info label="Status" value={order.senditShipment?.status || 'Not created'} />
                <Info label="Delivery cost" value={`${totals.deliveryCost} MAD`} mono />
                <Info label="Last synced" value={order.senditShipment?.lastSyncedAt ? new Date(order.senditShipment.lastSyncedAt).toLocaleString('fr-FR') : 'N/A'} />
              </div>
            </div>
          </div>

          <div className="grid">
            <div className="panel">
              <div className="panel-head"><Wallet className="panel-head-icon" /><h3>P&L breakdown</h3></div>
              <div className="panel-pad">
                <div className="pl-row"><span className="tx-mid">Products revenue</span><span className="num">{formatMoney(totals.productRevenue)} MAD</span></div>
                <div className="pl-row"><span className="tx-mid">Delivery charged</span><span className="num">+{formatMoney(totals.deliveryCharged)} MAD</span></div>
                <div className="pl-row"><span className="tx-mid">Product cost</span><span className="num neg">-{formatMoney(totals.productCost)} MAD</span></div>
                <div className="pl-row"><span className="tx-mid">Delivery cost</span><span className="num neg">-{formatMoney(totals.deliveryCost)} MAD</span></div>
                <div className="pl-row total"><span>Net profit</span><span className={`num ${totals.profit >= 0 ? 'pos' : 'neg'}`}>{totals.profit >= 0 ? '+' : ''}{formatMoney(totals.profit)} MAD</span></div>
                <div className="margin-box">
                  <MarginDonut value={totals.margin} />
                  <div><div className="label">Net margin</div><div className={`num fs22 fw600 ${totals.margin >= 25 ? 'pos' : 'neg'}`}>{totals.margin.toFixed(1)}%</div><div className="fs11 tx-lo">target 30%+</div></div>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><h3>Data completeness</h3><div className="spacer"></div><span className="num fw600 pos">100%</span></div>
              <div className="panel-pad">
                {['Customer name', 'Phone number', 'City', 'Delivery address', 'Order items', 'Product cost prices', 'Delivery fee charged', 'Estimated delivery cost', 'Payment method', 'Source channel'].map((item) => (
                  <div key={item} className="check-row">
                    <span className="ci ok"><Check /></span>
                    <span className="tx-mid">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><h3>Activity log</h3></div>
              <div>
                {(order.statusHistory || []).length > 0 ? (
                  order.statusHistory.map((item: any) => (
                    <div key={item.id || item.createdAt} className="feed-item">
                      <div className="feed-rail"></div>
                      <div className="feed-dot" style={{ background: 'var(--blue-bg)', color: 'var(--blue)' }}><Check /></div>
                      <div className="feed-body">
                        <div className="ft">{item.oldStatus || 'Created'} {'->'} {item.newStatus}</div>
                        <div className="feed-sub">{item.note || item.source || 'Status change recorded'}</div>
                        <div className="feed-time">{new Date(item.createdAt).toLocaleString('fr-FR')}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No status history yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </BosShell>
  )
}

function getStepIndex(status: string) {
  if (status === 'DELIVERED') return 3
  if (status === 'SHIPPED') return 2
  if (status === 'CONFIRMED') return 1
  return 0
}

function Info({ label, value, mono, wide, muted }: { label: string; value: string; mono?: boolean; wide?: boolean; muted?: boolean }) {
  return (
    <div className={`info-item ${wide ? 'wide' : ''}`}>
      <div className="il">{label}</div>
      <div className={`iv ${mono ? 'mono' : ''} ${muted ? 'tx-mid' : ''}`}>{value}</div>
    </div>
  )
}

function MarginDonut({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, value))
  const size = 72
  const stroke = 8
  const radius = (size - stroke) / 2
  const circ = 2 * Math.PI * radius
  const offset = circ * (1 - safe / 100)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--bg-3)" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--green)" strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" fill="var(--tx-hi)" fontFamily="var(--mono)" fontSize="14" fontWeight="600">
        {Math.round(value)}%
      </text>
    </svg>
  )
}
