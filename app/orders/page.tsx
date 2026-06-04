'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOrders()
  }, [])

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/ops/orders')
      const data = await res.json()
      console.log('Orders from API:', data)
      if (data.length > 0) {
        console.log('First order:', data[0])
        console.log('First order keys:', Object.keys(data[0]))
        console.log('First order id:', data[0].id)
      }
      setOrders(data)
    } catch (error) {
      console.error('Failed to fetch orders:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading orders...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Orders</h2>
          <p className="text-gray-600 text-sm">Manage all your orders</p>
        </div>

        <Link
          href="/orders/new"
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
        >
          + Create Order
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-lg border p-12 text-center">
          <div className="text-6xl mb-4">📦</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No orders yet
          </h3>
          <p className="text-gray-600 mb-6">
            Create your first order from WhatsApp, Instagram, or TikTok
          </p>
          <Link
            href="/orders/new"
            className="inline-block px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
          >
            + Create First Order
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  )
}

function OrderCard({ order }: { order: any }) {
  const getSourceColor = (source: string) => {
    switch (source) {
      case 'WhatsApp': return 'bg-green-100 text-green-700'
      case 'Instagram': return 'bg-pink-100 text-pink-700'
      case 'TikTok': return 'bg-purple-100 text-purple-700'
      case 'Website': return 'bg-blue-100 text-blue-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CONFIRMED': return 'bg-yellow-100 text-yellow-700'
      case 'DELIVERED': return 'bg-green-100 text-green-700'
      case 'PENDING': return 'bg-gray-100 text-gray-700'
      case 'CANCELLED': return 'bg-red-100 text-red-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <Link href={`/orders/${order.id}`}>
      <div className="bg-white rounded-lg border p-4 hover:shadow-md transition cursor-pointer">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {order.sourceChannel && (
                <span className={`px-2 py-1 rounded text-xs font-medium ${getSourceColor(order.sourceChannel)}`}>
                  {order.sourceChannel}
                </span>
              )}
              <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(order.status)}`}>
                {order.status}
              </span>
              {order.orderNumber && (
                <span className="text-xs text-gray-500">
                  {order.orderNumber}
                </span>
              )}
            </div>

            <div className="mb-2">
              <div className="font-semibold text-gray-900">
                {order.deliveryName || 'No name'}
              </div>
              <div className="text-sm text-gray-600">
                {order.deliveryPhone || 'No phone'} • {order.deliveryCity || 'No city'}
              </div>
            </div>

            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-gray-500">Revenue:</span>
                <span className="ml-1 font-semibold">{order.revenue || order.total || 0} MAD</span>
              </div>
              {order.estimatedProfit !== null && order.estimatedProfit !== undefined && (
                <div>
                  <span className="text-gray-500">Profit:</span>
                  <span className="ml-1 font-semibold text-green-600">
                    {order.estimatedProfit} MAD
                  </span>
                </div>
              )}
              {order.marginPercent !== null && order.marginPercent !== undefined && (
                <div>
                  <span className="text-gray-500">Margin:</span>
                  <span className="ml-1 font-semibold">
                    {order.marginPercent.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="text-sm text-gray-500">
            {new Date(order.createdAt).toLocaleDateString('fr-FR')}
          </div>
        </div>
      </div>
    </Link>
  )
}
