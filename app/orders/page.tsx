'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

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
      setOrders(data)
    } catch (error) {
      console.error('Failed to fetch orders:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Orders</h2>
          <p className="text-muted-foreground">Manage all your orders from all channels</p>
        </div>
        <Link href="/orders/new">
          <Button>+ Create Order</Button>
        </Link>
      </div>

      {orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="text-7xl mb-4">📦</div>
            <h3 className="text-2xl font-semibold mb-2">No orders yet</h3>
            <p className="text-muted-foreground mb-6 text-center max-w-md">
              Create your first order from WhatsApp, Instagram, or TikTok
            </p>
            <Link href="/orders/new">
              <Button size="lg">+ Create First Order</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground mb-1">Total Orders</div>
                <div className="text-3xl font-bold">{orders.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground mb-1">Active</div>
                <div className="text-3xl font-bold text-green-600">
                  {orders.filter(o => o.status === 'CONFIRMED' || o.status === 'PENDING').length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground mb-1">Delivered</div>
                <div className="text-3xl font-bold text-emerald-600">
                  {orders.filter(o => o.status === 'DELIVERED').length}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function OrderCard({ order }: { order: any }) {
  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'DELIVERED': return 'default'
      case 'CONFIRMED': return 'secondary'
      case 'CANCELLED': return 'destructive'
      default: return 'outline'
    }
  }

  const getSourceVariant = (source: string): "default" | "secondary" | "destructive" | "outline" => {
    return 'outline'
  }

  return (
    <Link href={`/orders/${order.id}`}>
      <Card className="hover:shadow-lg transition-all cursor-pointer">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                {order.sourceChannel && (
                  <Badge variant={getSourceVariant(order.sourceChannel)}>
                    {order.sourceChannel}
                  </Badge>
                )}
                <Badge variant={getStatusVariant(order.status)}>
                  {order.status}
                </Badge>
                {order.orderNumber && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {order.orderNumber}
                  </span>
                )}
              </div>

              <div>
                <div className="font-semibold text-lg">{order.deliveryName || 'No name'}</div>
                <div className="text-sm text-muted-foreground">
                  {order.deliveryPhone || 'No phone'} • {order.deliveryCity || 'No city'}
                </div>
              </div>

              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Revenue:</span>
                  <span className="ml-2 font-semibold">{order.revenue || 0} MAD</span>
                </div>
                {order.estimatedProfit !== null && order.estimatedProfit !== undefined && (
                  <div>
                    <span className="text-muted-foreground">Profit:</span>
                    <span className="ml-2 font-semibold text-green-600">
                      +{order.estimatedProfit} MAD
                    </span>
                  </div>
                )}
                {order.marginPercent !== null && order.marginPercent !== undefined && (
                  <div>
                    <span className="text-muted-foreground">Margin:</span>
                    <span className="ml-2 font-semibold">
                      {order.marginPercent.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              {new Date(order.createdAt).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
