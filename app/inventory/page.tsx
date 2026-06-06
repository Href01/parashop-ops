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
        <div className="cstat-row">
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
          <div className="panel mb20" style={{ borderLeft: '4px solid var(--red)' }}>
            <div className="panel-head">
              <AlertTriangle style={{ color: 'var(--red)' }} />
              <h3>Active Stock Alerts</h3>
              <span className="badge red">{alerts.length}</span>
              <div className="spacer"></div>
              <button className="btn ghost sm" onClick={() => setShowAlerts(false)}>
                Dismiss all
              </button>
            </div>
            <div className="panel-pad">
              <div className="row gap12" style={{ flexDirection: 'column' }}>
                {alerts.slice(0, 5).map((alert) => (
                  <div
                    key={alert.id}
                    className={`row gap12 p12 rounded-lg border ${getSeverityColor(alert.severity)}`}
                    style={{ justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <div>
                      <div className="fw600 fs13">{alert.message}</div>
                      <div className="fs11 tx-lo mt4">
                        {alert.productBrand} • {new Date(alert.createdAt).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                    <div className="row gap8">
                      <button
                        className="btn ghost sm"
                        onClick={() => window.location.href = `/products/${alert.productId}`}
                      >
                        View product
                      </button>
                      <button
                        className="btn sm"
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
        <div className="row gap12 mb20">
          <div className="seg">
            <button
              className={statusFilter === '' ? 'active' : ''}
              onClick={() => setStatusFilter('')}
            >
              All products
            </button>
            <button
              className={statusFilter === 'Low stock' ? 'active' : ''}
              onClick={() => setStatusFilter('Low stock')}
            >
              Low stock
            </button>
            <button
              className={statusFilter === 'Out of stock' ? 'active' : ''}
              onClick={() => setStatusFilter('Out of stock')}
            >
              Out of stock
            </button>
            <button
              className={statusFilter === 'In stock' ? 'active' : ''}
              onClick={() => setStatusFilter('In stock')}
            >
              In stock
            </button>
          </div>
        </div>

        {/* Inventory Table */}
        <div className="panel">
          <div className="table-scroll">
            <table className="tbl">
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
  return (
    <div className="cstat">
      <div className={`cstat-icon ${tone}`}>{icon}</div>
      <div className="cstat-main">
        <div className="cstat-title">{title}</div>
        <div className="cstat-value">{value}</div>
        {trend && <div className="cstat-trend">{trend}</div>}
      </div>
    </div>
  )
}
