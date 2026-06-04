'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'

interface Order {
  id: number
  orderNumber: string
  status: string
  sourceChannel?: string
  deliveryName?: string
  deliveryPhone?: string
  deliveryCity?: string
  deliveryAddress?: string
  revenue?: number
  estimatedProfit?: number
  marginPercent?: number
  createdAt: string
  items: any[]
  statusHistory: any[]
  senditShipment: any
}

export default function OrderDetailPage() {
  const router = useRouter()
  const params = useParams()
  const orderId = params.id as string

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (orderId) {
      fetchOrder()
    }
  }, [orderId])

  const fetchOrder = async () => {
    try {
      const res = await fetch(`/api/ops/orders/${orderId}`)
      if (!res.ok) throw new Error('Failed to fetch order')
      const data = await res.json()
      setOrder(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading order...</p>
        </div>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-700 mb-2">Error</h3>
          <p className="text-red-600">{error || 'Order not found'}</p>
          <button
            onClick={() => router.push('/orders')}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            ← Back to Orders
          </button>
        </div>
      </div>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CONFIRMED': return 'bg-yellow-100 text-yellow-700 border-yellow-200'
      case 'DELIVERED': return 'bg-green-100 text-green-700 border-green-200'
      case 'PENDING': return 'bg-gray-100 text-gray-700 border-gray-200'
      case 'CANCELLED': return 'bg-red-100 text-red-700 border-red-200'
      default: return 'bg-gray-100 text-gray-700 border-gray-200'
    }
  }

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'WhatsApp': return 'bg-green-100 text-green-700 border-green-200'
      case 'Instagram': return 'bg-pink-100 text-pink-700 border-pink-200'
      case 'TikTok': return 'bg-purple-100 text-purple-700 border-purple-200'
      case 'Website': return 'bg-blue-100 text-blue-700 border-blue-200'
      default: return 'bg-gray-100 text-gray-700 border-gray-200'
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => router.push('/orders')}
            className="text-sm text-gray-600 hover:text-gray-900 mb-2"
          >
            ← Back to Orders
          </button>
          <h2 className="text-2xl font-bold text-gray-900">
            Order #{order.orderNumber || order.id}
          </h2>
        </div>

        <div className="flex gap-2">
          {order.sourceChannel && (
            <span className={`px-3 py-1 rounded-lg text-sm font-medium border ${getSourceColor(order.sourceChannel)}`}>
              {order.sourceChannel}
            </span>
          )}
          <span className={`px-3 py-1 rounded-lg text-sm font-medium border ${getStatusColor(order.status)}`}>
            {order.status}
          </span>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Customer Info */}
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Information</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500">Name</label>
              <p className="font-medium text-gray-900">{order.deliveryName || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Phone</label>
              <p className="font-medium text-gray-900">{order.deliveryPhone || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">City</label>
              <p className="font-medium text-gray-900">{order.deliveryCity || 'N/A'}</p>
            </div>
            <div className="col-span-2">
              <label className="text-sm text-gray-500">Address</label>
              <p className="font-medium text-gray-900">{order.deliveryAddress || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* Order Items */}
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Items</h3>

          {order.items && order.items.length > 0 ? (
            <div className="space-y-3">
              {order.items.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between py-3 border-b last:border-0">
                  <div className="flex items-center gap-4">
                    {item.image && (
                      <img src={item.image} alt={item.productName} className="w-12 h-12 object-cover rounded" />
                    )}
                    <div>
                      <p className="font-medium text-gray-900">{item.productName}</p>
                      {item.sku && <p className="text-sm text-gray-500">SKU: {item.sku}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{item.quantity}x {item.price} MAD</p>
                    <p className="text-sm text-gray-500">{item.totalPrice} MAD</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No items in this order</p>
          )}
        </div>

        {/* Financial Summary */}
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Summary</h3>

          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Revenue</span>
              <span className="font-semibold text-gray-900">{order.revenue || 0} MAD</span>
            </div>

            {order.estimatedProfit !== null && order.estimatedProfit !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600">Estimated Profit</span>
                <span className="font-semibold text-green-600">{order.estimatedProfit} MAD</span>
              </div>
            )}

            {order.marginPercent !== null && order.marginPercent !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-600">Margin</span>
                <span className="font-semibold text-gray-900">{order.marginPercent.toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Status History */}
        {order.statusHistory && order.statusHistory.length > 0 && (
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Status History</h3>

            <div className="space-y-3">
              {order.statusHistory.map((history: any, idx: number) => (
                <div key={idx} className="flex items-start gap-3 pb-3 border-b last:border-0">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {history.oldStatus} → {history.newStatus}
                    </p>
                    {history.note && (
                      <p className="text-sm text-gray-600">{history.note}</p>
                    )}
                  </div>
                  <span className="text-sm text-gray-500">
                    {new Date(history.createdAt).toLocaleString('fr-FR')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sendit Shipment */}
        {order.senditShipment && (
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Sendit Shipment</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-500">Tracking ID</label>
                <p className="font-medium text-gray-900">{order.senditShipment.senditTrackingId}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Status</label>
                <p className="font-medium text-gray-900">{order.senditShipment.status}</p>
              </div>
            </div>
          </div>
        )}

        {/* Created Date */}
        <div className="text-sm text-gray-500 text-center">
          Created on {new Date(order.createdAt).toLocaleString('fr-FR')}
        </div>
      </div>
    </div>
  )
}
