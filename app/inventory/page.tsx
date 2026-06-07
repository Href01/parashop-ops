'use client'

import { useEffect, useState } from 'react'
import BosShell from '@/components/BosShell'
import { Search, AlertTriangle, Package, TrendingDown, CheckCircle, XCircle, Download } from 'lucide-react'

type Product = {
  id: number
  name: string
  brand: string
  image: string
  stock: number
  reorderPoint: number
  reorderQuantity: number
  stockStatus: string
  supplier: string
  costPrice: number
  weeklySales: number
  daysOfStockLeft: number
  activeAlerts: number
}

type Alert = {
  id: number
  productId: number
  productName: string
  productBrand: string
  type: string
  currentStock: number
  threshold: number
  message: string
  severity: string
  acknowledged: boolean
  createdAt: string
}

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [showAlerts, setShowAlerts] = useState(true)

  useEffect(() => {
    fetchInventory()
    fetchAlerts()
  }, [statusFilter])

  const fetchInventory = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      params.append('sort', 'stock')

      const res = await fetch(`/api/ops/inventory?${params}`)
      const data = await res.json()
      setProducts(data.products || [])
    } catch (error) {
      console.error('Failed to fetch inventory:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchAlerts = async () => {
    try {
      const res = await fetch('/api/ops/inventory/alerts?acknowledged=false')
      const data = await res.json()
      setAlerts(data.alerts || [])
    } catch (error) {
      console.error('Failed to fetch alerts:', error)
    }
  }

  const acknowledgeAlert = async (alertId: number) => {
    try {
      await fetch(`/api/ops/inventory/alerts/${alertId}`, { method: 'POST' })
      setAlerts(alerts.filter(a => a.id !== alertId))
    } catch (error) {
      console.error('Failed to acknowledge alert:', error)
    }
  }

  const handleExport = () => {
    const csv = [
      ['Product', 'Brand', 'Stock', 'Reorder Point', 'Weekly Sales', 'Days Left', 'Status'],
      ...products.map(p => [
        p.name,
        p.brand,
        p.stock,
        p.reorderPoint,
        p.weeklySales || 0,
        p.daysOfStockLeft || '∞',
        p.stockStatus
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventory-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleAddStock = () => {
    alert('Stock adjustment feature coming soon!\n\nFor now, update stock levels via Products page.')
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'In stock': 'badge green',
      'Low stock': 'badge amber',
      'Out of stock': 'badge red',
      'Discontinued': 'badge gray',
    }
    return colors[status] || 'badge'
  }

  const getSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      'critical': 'bg-red-50 border-red-200',
      'warning': 'bg-amber-50 border-amber-200',
      'info': 'bg-blue-50 border-blue-200',
    }
    return colors[severity] || 'bg-gray-50 border-gray-200'
  }

  const lowStockCount = products.filter(p => p.stockStatus === 'Low stock').length
  const outOfStockCount = products.filter(p => p.stockStatus === 'Out of stock').length
  const criticalAlerts = alerts.filter(a => a.severity === 'critical').length

  return (
    <BosShell active="inventory" title="Inventory" crumb="Operations">
      <div className="page-inner page-wide">
        {/* Header */}
        <div className="page-head">
          <div>
            <h1>Inventory</h1>
            <div className="sub">Stock levels, alerts & reorder management</div>
          </div>
          <div className="spacer"></div>
          <button className="btn-modern btn-secondary" onClick={handleExport}><Download className="w-4 h-4" />Export</button>
          <button className="btn-modern btn-primary" onClick={handleAddStock}><Package className="w-4 h-4" />Add stock</button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Metric
            icon={<Package />}
            tone="blue"
            title="Total products"
            value={products.length.toString()}
            trend="tracked"
          />
          <Metric
            icon={<AlertTriangle />}
            tone="amber"
            title="Low stock"
            value={lowStockCount.toString()}
            trend="need reorder"
          />
          <Metric
            icon={<XCircle />}
            tone="red"
            title="Out of stock"
            value={outOfStockCount.toString()}
            trend="critical"
          />
          <Metric
            icon={<CheckCircle />}
            tone="green"
            title="In stock"
            value={(products.length - lowStockCount - outOfStockCount).toString()}
            trend="healthy"
          />
        </div>

        {/* Alerts Panel */}
        {showAlerts && alerts.length > 0 && (
          <div className="card-modern mb-6" style={{ borderLeft: '4px solid var(--danger-500)' }}>
            <div className="card-header">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h3 className="text-lg font-semibold">Active Stock Alerts</h3>
              <span className="badge-modern badge-danger">{alerts.length}</span>
              <div className="flex-1"></div>
              <button className="btn-modern btn-sm btn-subtle" onClick={() => setShowAlerts(false)}>
                Dismiss all
              </button>
            </div>
            <div className="card-body">
              <div className="flex flex-col gap-3">
                {alerts.slice(0, 5).map((alert) => (
                  <div
                    key={alert.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${getSeverityColor(alert.severity)}`}
                  >
                    <div>
                      <div className="font-semibold text-sm">{alert.message}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {alert.productBrand} • {new Date(alert.createdAt).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="btn-modern btn-sm btn-subtle"
                        onClick={() => window.location.href = `/products/${alert.productId}`}
                      >
                        View product
                      </button>
                      <button
                        className="btn-modern btn-sm btn-secondary"
                        onClick={() => acknowledgeAlert(alert.id)}
                      >
                        Acknowledge
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6">
          <div className="inline-flex gap-1 p-1 bg-gray-100 rounded-lg">
            <button
              className={`btn-modern btn-sm ${statusFilter === '' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setStatusFilter('')}
            >
              All products
            </button>
            <button
              className={`btn-modern btn-sm ${statusFilter === 'Low stock' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setStatusFilter('Low stock')}
            >
              Low stock
            </button>
            <button
              className={`btn-modern btn-sm ${statusFilter === 'Out of stock' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setStatusFilter('Out of stock')}
            >
              Out of stock
            </button>
            <button
              className={`btn-modern btn-sm ${statusFilter === 'In stock' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setStatusFilter('In stock')}
            >
              In stock
            </button>
          </div>
        </div>

        {/* Inventory Table */}
        <div className="card-modern">
          <div className="overflow-x-auto">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Status</th>
                  <th className="r">Stock</th>
                  <th className="r">Reorder Point</th>
                  <th className="r">Weekly Sales</th>
                  <th className="r">Days Left</th>
                  <th>Supplier</th>
                  <th className="r">Cost</th>
                  <th className="r">Alerts</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '40px' }}>
                      Loading inventory...
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '40px' }}>
                      No products found
                    </td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr
                      key={product.id}
                      onClick={() => window.location.href = `/products/${product.id}`}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <div className="row gap8">
                          {product.image && (
                            <img
                              src={product.image}
                              alt={product.name}
                              className="product-thumb"
                              style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }}
                            />
                          )}
                          <div>
                            <div className="t-strong">{product.name}</div>
                            <div className="fs11 tx-lo">{product.brand}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={getStatusColor(product.stockStatus)}>
                          {product.stockStatus}
                        </span>
                      </td>
                      <td className="r">
                        <span className={`num fw600 ${product.stock === 0 ? 'neg' : product.stock <= product.reorderPoint ? 'tx-lo' : ''}`}>
                          {product.stock}
                        </span>
                      </td>
                      <td className="r tx-lo">{product.reorderPoint}</td>
                      <td className="r num">{product.weeklySales || 0}</td>
                      <td className="r">
                        {product.daysOfStockLeft ? (
                          <span className={`num ${product.daysOfStockLeft < 7 ? 'neg' : product.daysOfStockLeft < 14 ? 'tx-lo' : ''}`}>
                            {product.daysOfStockLeft}d
                          </span>
                        ) : (
                          <span className="tx-lo">-</span>
                        )}
                      </td>
                      <td>
                        <span className="fs12 tx-lo">{product.supplier || 'No supplier'}</span>
                      </td>
                      <td className="r num">{product.costPrice ? `${product.costPrice} MAD` : '-'}</td>
                      <td className="r">
                        {product.activeAlerts > 0 ? (
                          <span className="badge red mini-badge">{product.activeAlerts}</span>
                        ) : (
                          <span className="tx-lo">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </BosShell>
  )
}

function Metric({ icon, tone, title, value, trend }: { icon: React.ReactNode; tone: string; title: string; value: string; trend?: string }) {
  const bgColors: Record<string, string> = {
    blue: 'bg-blue-100',
    amber: 'bg-amber-100',
    red: 'bg-red-100',
    green: 'bg-green-100',
  }
  const textColors: Record<string, string> = {
    blue: 'text-blue-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
    green: 'text-green-600',
  }

  return (
    <div className="card-modern">
      <div className="card-body">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">{title}</p>
          <div className={`w-10 h-10 rounded-lg ${bgColors[tone]} ${textColors[tone]} flex items-center justify-center`}>
            {icon}
          </div>
        </div>

        <div className="flex items-baseline gap-2 mb-2">
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>

        {trend && <p className="text-xs text-gray-500">{trend}</p>}
      </div>
    </div>
  )
}
