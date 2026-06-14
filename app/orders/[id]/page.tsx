'use client'

import { ArrowLeft, Check, Clock, Edit3, MoreHorizontal, Truck, Wallet, X, ChevronDown, RefreshCw, Package, XCircle, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import BosShell from '@/components/BosShell'

interface Order {
  id: number
  orderNumber?: string
  status: string
  sourceChannel?: string
  userId?: number | null
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
  senditTrackingId?: string
  senditBarcode?: string
  senditStatus?: string
  actualDeliveryCost?: number | string
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
  return toNumber(value).toLocaleString('fr-FR', { maximumFractionDigits: 0 })
}

export default function OrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.id as string
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')

  // Edit form state
  const [editForm, setEditForm] = useState({
    deliveryName: '',
    deliveryPhone: '',
    deliveryCity: '',
    deliveryAddress: '',
    deliveryNotes: '',
  })

  useEffect(() => {
    void fetchOrder()
  }, [orderId])

  async function fetchOrder() {
    try {
      setLoading(true)
      const res = await fetch(`/api/ops/orders/${orderId}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch order')
      const data = (await res.json()) as Order
      setOrder(data)
      setEditForm({
        deliveryName: data.deliveryName || '',
        deliveryPhone: data.deliveryPhone || '',
        deliveryCity: data.deliveryCity || '',
        deliveryAddress: data.deliveryAddress || '',
        deliveryNotes: data.deliveryNotes || '',
      })
    } catch (fetchError: any) {
      setError(fetchError.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateShipment() {
    if (!order) return

    setActionLoading(true)
    setActionError('')
    setActionSuccess('')

    try {
      const res = await fetch(`/api/ops/orders/${orderId}/sendit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        const errorData = await res.json()
        console.error('Create shipment error:', errorData)
        throw new Error(errorData.details || errorData.error || 'Failed to create shipment')
      }

      const data = await res.json()
      setActionSuccess(`Shipment created! Tracking ID: ${data.trackingId}`)
      await fetchOrder() // Refresh order data
    } catch (err: any) {
      console.error('handleCreateShipment error:', err)
      setActionError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleSyncTracking() {
    if (!order) return

    setActionLoading(true)
    setActionError('')
    setActionSuccess('')

    try {
      const res = await fetch(`/api/ops/orders/${orderId}/sendit`)

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to sync tracking')
      }

      const data = await res.json()
      setActionSuccess(`Tracking synced! Status: ${data.status}`)
      await fetchOrder()
    } catch (err: any) {
      setActionError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!order) return

    setActionLoading(true)
    setActionError('')
    setActionSuccess('')

    try {
      const res = await fetch(`/api/ops/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        console.error('Status update error:', errorData)
        throw new Error(errorData.error || errorData.details || 'Failed to update status')
      }

      const data = await res.json()

      // Check if there's a Sendit warning
      if (data._senditWarning) {
        setActionError(data._senditWarning)
      } else {
        setActionSuccess(`Status updated to ${newStatus}`)
      }

      await fetchOrder()
    } catch (err: any) {
      console.error('handleStatusChange error:', err)
      setActionError(err.message)
    } finally {
      setActionLoading(false)
      setShowMore(false)
    }
  }

  async function handleDelete() {
    if (!order) return
    if (!confirm(`Are you sure you want to delete order #${order.id}? This action cannot be undone.`)) return

    setActionLoading(true)
    setActionError('')
    setActionSuccess('')

    try {
      const res = await fetch(`/api/ops/orders/${orderId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Failed to delete order')
      }

      router.push('/orders')
    } catch (err: any) {
      setActionError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  async function handleSaveEdit() {
    if (!order) return

    setActionLoading(true)
    setActionError('')
    setActionSuccess('')

    try {
      const res = await fetch(`/api/ops/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })

      if (!res.ok) throw new Error('Failed to update order')

      setActionSuccess('Order updated successfully')
      setIsEditing(false)
      await fetchOrder()
    } catch (err: any) {
      setActionError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const totals = useMemo(() => {
    const productRevenue = order?.items?.reduce((sum, item) => sum + toNumber(item.price) * toNumber(item.quantity), 0) ?? 0
    // COGS falls back to the product's costPrice when the line's unitCost is unset
    const productCost = order?.items?.reduce((sum, item) => sum + toNumber(item.unitCost || item.costPrice) * toNumber(item.quantity), 0) ?? 0
    const deliveryCharged = toNumber(order?.deliveryFeeCharged)
    const deliveryCost = toNumber(order?.actualDeliveryCost || order?.estimatedDeliveryCost || 0)
    const profit = toNumber(order?.estimatedProfit) || productRevenue - productCost - deliveryCost
    const margin = toNumber(order?.marginPercent) || (productRevenue > 0 ? (profit / productRevenue) * 100 : 0)

    return { productRevenue, productCost, deliveryCharged, deliveryCost, profit, margin }
  }, [order])

  // Real data completeness (was hardcoded to 100% with all-green checks)
  const completeness = useMemo(() => {
    const items = order?.items || []
    const checks = [
      { label: 'Nom client', ok: !!order?.deliveryName },
      { label: 'Téléphone', ok: !!order?.deliveryPhone },
      { label: 'Ville', ok: !!order?.deliveryCity },
      { label: 'Adresse de livraison', ok: !!order?.deliveryAddress },
      { label: 'Articles', ok: items.length > 0 },
      { label: 'Coûts produits', ok: items.length > 0 && items.every((i: any) => toNumber(i.unitCost) > 0 || toNumber(i.costPrice) > 0) },
      { label: 'Frais de livraison', ok: order?.deliveryFeeCharged != null },
      { label: 'Coût livraison estimé', ok: order?.estimatedDeliveryCost != null },
      { label: 'Méthode de paiement', ok: !!order?.paymentMethod },
      { label: 'Canal source', ok: !!order?.sourceChannel },
    ]
    const pct = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100)
    return { checks, pct }
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

        {/* Action feedback */}
        {actionSuccess && (
          <div className="panel mb16" style={{ background: 'var(--green-bg)', border: '1px solid var(--green)', padding: '12px 16px' }}>
            <div className="row gap10">
              <Check style={{ color: 'var(--green)' }} />
              <span style={{ color: 'var(--green)' }}>{actionSuccess}</span>
              <button type="button" onClick={() => setActionSuccess('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={16} style={{ color: 'var(--green)' }} />
              </button>
            </div>
          </div>
        )}

        {actionError && (
          <div className="panel mb16" style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', padding: '12px 16px' }}>
            <div className="row gap10">
              <AlertCircle style={{ color: 'var(--red)' }} />
              <span style={{ color: 'var(--red)' }}>{actionError}</span>
              <button type="button" onClick={() => setActionError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={16} style={{ color: 'var(--red)' }} />
              </button>
            </div>
          </div>
        )}

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

          {!isEditing ? (
            <>
              <button
                type="button"
                className="btn"
                onClick={() => setIsEditing(true)}
              >
                <Edit3 />Edit
              </button>

              {order.senditTrackingId ? (
                <button
                  type="button"
                  className="btn"
                  onClick={handleSyncTracking}
                  disabled={actionLoading}
                >
                  <RefreshCw className={actionLoading ? 'spin' : ''} />
                  {actionLoading ? 'Syncing...' : 'Sync tracking'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  onClick={handleCreateShipment}
                  disabled={actionLoading}
                >
                  <Package />
                  {actionLoading ? 'Creating...' : 'Create shipment'}
                </button>
              )}

              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="btn icon"
                  onClick={() => setShowMore(!showMore)}
                >
                  <MoreHorizontal />
                </button>

                {showMore && (
                  <div style={{
                    position: 'absolute',
                    right: 0,
                    top: 'calc(100% + 4px)',
                    background: 'var(--bg-1)',
                    border: '1px solid var(--bg-3)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '8px',
                    minWidth: '200px',
                    zIndex: 10,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() => handleStatusChange('CONFIRMED')}
                        disabled={order.status === 'CONFIRMED'}
                        style={{
                          padding: '8px 12px',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: order.status === 'CONFIRMED' ? 'not-allowed' : 'pointer',
                          opacity: order.status === 'CONFIRMED' ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-2)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                      >
                        Mark as Confirmed
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange('SHIPPED')}
                        disabled={order.status === 'SHIPPED'}
                        style={{
                          padding: '8px 12px',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: order.status === 'SHIPPED' ? 'not-allowed' : 'pointer',
                          opacity: order.status === 'SHIPPED' ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-2)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                      >
                        Mark as Shipped
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange('DELIVERED')}
                        disabled={order.status === 'DELIVERED'}
                        style={{
                          padding: '8px 12px',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: order.status === 'DELIVERED' ? 'not-allowed' : 'pointer',
                          opacity: order.status === 'DELIVERED' ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-2)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                      >
                        Mark as Delivered
                      </button>
                      <div style={{ height: '1px', background: 'var(--bg-3)', margin: '4px 0' }} />
                      <button
                        type="button"
                        onClick={() => handleStatusChange('CANCELLED')}
                        style={{
                          padding: '8px 12px',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          color: 'var(--red)',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--red-bg)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                      >
                        Cancel Order
                      </button>

                      <div style={{ borderTop: '1px solid var(--line-soft)', margin: '4px 0' }}></div>

                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={actionLoading}
                        style={{
                          padding: '8px 12px',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: actionLoading ? 'not-allowed' : 'pointer',
                          color: 'var(--red)',
                          fontWeight: 600,
                          opacity: actionLoading ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => !actionLoading && (e.currentTarget.style.background = 'var(--red-bg)')}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                      >
                        🗑️ Delete Order
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn"
                onClick={handleSaveEdit}
                disabled={actionLoading}
              >
                <Check />
                {actionLoading ? 'Saving...' : 'Save changes'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setIsEditing(false)
                  setEditForm({
                    deliveryName: order.deliveryName || '',
                    deliveryPhone: order.deliveryPhone || '',
                    deliveryCity: order.deliveryCity || '',
                    deliveryAddress: order.deliveryAddress || '',
                    deliveryNotes: order.deliveryNotes || '',
                  })
                }}
              >
                <X />Cancel
              </button>
            </>
          )}
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

        {/* Quick Actions Panel */}
        <div className="panel mb16" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Quick Actions:</h3>

            {order.status === 'PENDING' && (
              <button
                type="button"
                className="btn"
                onClick={() => handleStatusChange('CONFIRMED')}
                disabled={actionLoading}
                style={{ background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue)' }}
              >
                <Check />
                {actionLoading ? 'Confirming...' : 'Confirm Order'}
              </button>
            )}

            {order.status === 'CONFIRMED' && !order.senditTrackingId && (
              <button
                type="button"
                className="btn"
                onClick={handleCreateShipment}
                disabled={actionLoading}
                style={{ background: 'var(--violet-bg)', color: 'var(--violet)', border: '1px solid var(--violet)' }}
              >
                <Package />
                {actionLoading ? 'Creating...' : 'Create Sendit Shipment'}
              </button>
            )}

            {order.status === 'CONFIRMED' && order.senditTrackingId && (
              <button
                type="button"
                className="btn"
                onClick={() => handleStatusChange('SHIPPED')}
                disabled={actionLoading}
                style={{ background: 'var(--violet-bg)', color: 'var(--violet)', border: '1px solid var(--violet)' }}
              >
                <Truck />
                {actionLoading ? 'Updating...' : 'Mark as Shipped'}
              </button>
            )}

            {order.status === 'SHIPPED' && (
              <button
                type="button"
                className="btn"
                onClick={() => handleStatusChange('DELIVERED')}
                disabled={actionLoading}
                style={{ background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green)' }}
              >
                <Check />
                {actionLoading ? 'Updating...' : 'Mark as Delivered'}
              </button>
            )}

            {order.senditTrackingId && (
              <button
                type="button"
                className="btn"
                onClick={handleSyncTracking}
                disabled={actionLoading}
              >
                <RefreshCw className={actionLoading ? 'spin' : ''} />
                {actionLoading ? 'Syncing...' : 'Sync Tracking'}
              </button>
            )}

            {order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && (
              <button
                type="button"
                className="btn"
                onClick={() => handleStatusChange('CANCELLED')}
                disabled={actionLoading}
                style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red)' }}
              >
                <XCircle />
                Cancel Order
              </button>
            )}

            <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--tx-mid)' }}>
              Current status: <strong>{order.status}</strong>
              {order.senditTrackingId && <> • Tracking: <span className="mono">{order.senditTrackingId}</span></>}
            </div>
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
              <div className="panel-head">
                <h3>Cliente & livraison</h3>
                {order.userId && (
                  <Link href={`/customers/${order.userId}`} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--rose-bright)', textDecoration: 'none' }}>
                    Voir la fiche cliente →
                  </Link>
                )}
              </div>
              <div className="panel-pad info-grid">
                {!isEditing ? (
                  <>
                    <Info label="Nom" value={order.deliveryName || 'N/A'} />
                    <Info label="Téléphone" value={order.deliveryPhone || 'N/A'} mono />
                    <Info label="Ville" value={order.deliveryCity || 'N/A'} />
                    <Info label="Paiement" value={order.paymentMethod || 'COD'} />
                    <Info label="Adresse" value={order.deliveryAddress || 'N/A'} wide />
                    <Info label="Notes de livraison" value={order.deliveryNotes || 'Aucune note'} wide muted />
                  </>
                ) : (
                  <>
                    <div className="info-item">
                      <div className="il">Name</div>
                      <input
                        type="text"
                        value={editForm.deliveryName}
                        onChange={(e) => setEditForm({ ...editForm, deliveryName: e.target.value })}
                        className="iv"
                        style={{ border: '1px solid var(--bg-3)', borderRadius: '6px', padding: '4px 8px', background: 'var(--bg-0)' }}
                      />
                    </div>
                    <div className="info-item">
                      <div className="il">Phone</div>
                      <input
                        type="text"
                        value={editForm.deliveryPhone}
                        onChange={(e) => setEditForm({ ...editForm, deliveryPhone: e.target.value })}
                        className="iv mono"
                        style={{ border: '1px solid var(--bg-3)', borderRadius: '6px', padding: '4px 8px', background: 'var(--bg-0)' }}
                      />
                    </div>
                    <div className="info-item">
                      <div className="il">City</div>
                      <input
                        type="text"
                        value={editForm.deliveryCity}
                        onChange={(e) => setEditForm({ ...editForm, deliveryCity: e.target.value })}
                        className="iv"
                        style={{ border: '1px solid var(--bg-3)', borderRadius: '6px', padding: '4px 8px', background: 'var(--bg-0)' }}
                      />
                    </div>
                    <div className="info-item">
                      <div className="il">Payment</div>
                      <div className="iv">{order.paymentMethod || 'COD'}</div>
                    </div>
                    <div className="info-item wide">
                      <div className="il">Address</div>
                      <input
                        type="text"
                        value={editForm.deliveryAddress}
                        onChange={(e) => setEditForm({ ...editForm, deliveryAddress: e.target.value })}
                        className="iv"
                        style={{ border: '1px solid var(--bg-3)', borderRadius: '6px', padding: '4px 8px', background: 'var(--bg-0)' }}
                      />
                    </div>
                    <div className="info-item wide">
                      <div className="il">Delivery notes</div>
                      <input
                        type="text"
                        value={editForm.deliveryNotes}
                        onChange={(e) => setEditForm({ ...editForm, deliveryNotes: e.target.value })}
                        className="iv tx-mid"
                        style={{ border: '1px solid var(--bg-3)', borderRadius: '6px', padding: '4px 8px', background: 'var(--bg-0)' }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <Truck className="panel-head-icon" />
                <h3>Livraison Sendit</h3>
                <div className="spacer"></div>
                <span className={`badge ${order.senditTrackingId ? 'green' : 'amber'}`}>
                  {order.senditStatus || 'Non expédiée'}
                </span>
              </div>
              <div className="panel-pad info-grid">
                <Info label="N° de suivi" value={order.senditTrackingId || 'Pas encore expédiée'} mono />
                <Info label="Code-barres" value={order.senditBarcode || '—'} mono />
                <Info label="Coût livraison" value={`${formatMoney(totals.deliveryCost)} MAD`} mono />
                <Info label="Statut" value={order.senditStatus || 'Non expédiée'} />
              </div>
            </div>
          </div>

          <div className="grid">
            <div className="panel">
              <div className="panel-head"><Wallet className="panel-head-icon" /><h3>Détail P&L</h3></div>
              <div className="panel-pad">
                <div className="pl-row"><span className="tx-mid">CA produits</span><span className="num">{formatMoney(totals.productRevenue)} MAD</span></div>
                <div className="pl-row"><span className="tx-mid">Livraison facturée</span><span className="num">+{formatMoney(totals.deliveryCharged)} MAD</span></div>
                <div className="pl-row"><span className="tx-mid">Coût produits</span><span className="num neg">-{formatMoney(totals.productCost)} MAD</span></div>
                <div className="pl-row"><span className="tx-mid">Coût livraison</span><span className="num neg">-{formatMoney(totals.deliveryCost)} MAD</span></div>
                <div className="pl-row total"><span>Profit net</span><span className={`num ${totals.profit >= 0 ? 'pos' : 'neg'}`}>{totals.profit >= 0 ? '+' : ''}{formatMoney(totals.profit)} MAD</span></div>
                <div className="margin-box">
                  <MarginDonut value={totals.margin} />
                  <div><div className="label">Marge nette</div><div className={`num fs22 fw600 ${totals.margin >= 25 ? 'pos' : 'neg'}`}>{totals.margin.toFixed(1)}%</div><div className="fs11 tx-lo">objectif 30%+</div></div>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><h3>Complétude des données</h3><div className="spacer"></div><span className="num fw600" style={{ color: completeness.pct >= 100 ? 'var(--green)' : completeness.pct >= 70 ? 'var(--amber)' : 'var(--red)' }}>{completeness.pct}%</span></div>
              <div className="panel-pad">
                {completeness.checks.map((c) => (
                  <div key={c.label} className="check-row">
                    <span className={`ci ${c.ok ? 'ok' : ''}`} style={c.ok ? undefined : { color: 'var(--red)' }}>{c.ok ? <Check /> : <X />}</span>
                    <span className={c.ok ? 'tx-mid' : 'tx-lo'}>{c.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head"><h3>Journal d&apos;activité</h3></div>
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
