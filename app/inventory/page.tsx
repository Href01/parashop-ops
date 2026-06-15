'use client'

import { useEffect, useState } from 'react'
import BosShell from '@/components/BosShell'
import { Search, AlertTriangle, Package, TrendingDown, CheckCircle, XCircle, Download, Plus, Minus, DollarSign, History, ArrowUpCircle, ArrowDownCircle } from 'lucide-react'

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

type Movement = {
  id: number
  productId: number
  productName: string
  productBrand: string
  type: string
  quantity: number
  stockBefore: number
  stockAfter: number
  reason: string | null
  performedBy: string
  createdAt: string
}

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<'stock' | 'history'>('stock')
  const [products, setProducts] = useState<Product[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMovements, setLoadingMovements] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [showAlerts, setShowAlerts] = useState(true)
  const [adjustModal, setAdjustModal] = useState<{ productId: number; productName: string; currentStock: number } | null>(null)
  const [adjustType, setAdjustType] = useState<'in' | 'out'>('in')
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [supplierModal, setSupplierModal] = useState<{ productId: number; productName: string; currentSupplier: string | null } | null>(null)
  const [supplierInput, setSupplierInput] = useState('')
  const [savingSupplier, setSavingSupplier] = useState(false)

  useEffect(() => {
    if (activeTab === 'stock') {
      fetchInventory()
      fetchAlerts()
    } else {
      fetchMovements()
    }
  }, [statusFilter, activeTab])

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

  const fetchMovements = async () => {
    setLoadingMovements(true)
    try {
      const res = await fetch('/api/ops/inventory/movement?limit=100')
      const data = await res.json()
      setMovements(data.movements || [])
    } catch (error) {
      console.error('Failed to fetch movements:', error)
    } finally {
      setLoadingMovements(false)
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
    if (activeTab === 'stock') {
      const csv = [
        ['Product', 'Brand', 'Stock', 'Reorder Point', 'Weekly Sales', 'Days Left', 'Status', 'Cost Price', 'Stock Value'],
        ...products.map(p => [
          p.name,
          p.brand,
          p.stock,
          p.reorderPoint,
          p.weeklySales || 0,
          p.daysOfStockLeft || '∞',
          p.stockStatus,
          p.costPrice || 0,
          p.costPrice ? p.stock * p.costPrice : 0
        ])
      ].map(row => row.join(',')).join('\n')

      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `inventory-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } else {
      const csv = [
        ['Date', 'Product', 'Brand', 'Type', 'Quantity', 'Stock Before', 'Stock After', 'Reason', 'Performed By'],
        ...movements.map(m => [
          new Date(m.createdAt).toLocaleString('fr-FR'),
          m.productName,
          m.productBrand,
          m.type,
          m.quantity,
          m.stockBefore,
          m.stockAfter,
          m.reason || '',
          m.performedBy?.split('@')[0] || ''
        ])
      ].map(row => row.join(',')).join('\n')

      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `movements-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const handleAddStock = () => {
    // Generic add stock - could show a product picker, for now just show message
    alert('Sélectionne un produit dans la liste ci-dessous pour ajuster son stock.')
  }

  const openAdjustModal = (product: Product) => {
    setAdjustModal({ productId: product.id, productName: product.name, currentStock: product.stock })
    setAdjustType('in')
    setAdjustQty('')
    setAdjustReason('')
  }

  const submitAdjustment = async () => {
    if (!adjustModal || !adjustQty || Number(adjustQty) <= 0) return

    setAdjusting(true)
    try {
      const res = await fetch('/api/ops/inventory/movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: adjustModal.productId,
          type: adjustType === 'in' ? 'Purchase' : 'Adjustment',
          quantity: adjustType === 'in' ? Number(adjustQty) : -Number(adjustQty),
          reason: adjustReason || (adjustType === 'in' ? 'Réapprovisionnement manuel' : 'Ajustement manuel'),
        }),
      })
      if (!res.ok) throw new Error('Failed')
      setAdjustModal(null)
      fetchInventory() // Refresh stock
      if (activeTab === 'history') fetchMovements() // Refresh history if active
    } catch (error) {
      console.error('Failed to adjust stock:', error)
      alert('Erreur lors de l\'ajustement')
    } finally {
      setAdjusting(false)
    }
  }

  const openSupplierModal = (product: Product) => {
    setSupplierModal({ productId: product.id, productName: product.name, currentSupplier: product.supplier })
    setSupplierInput(product.supplier || '')
  }

  const submitSupplier = async () => {
    if (!supplierModal || savingSupplier) return

    setSavingSupplier(true)
    try {
      const res = await fetch(`/api/ops/products/${supplierModal.productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier: supplierInput.trim() || null }),
      })
      if (!res.ok) throw new Error('Failed')
      setSupplierModal(null)
      fetchInventory() // Refresh
    } catch (error) {
      console.error('Failed to update supplier:', error)
      alert('Erreur lors de la mise à jour')
    } finally {
      setSavingSupplier(false)
    }
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
  const totalStockValue = products.reduce((sum, p) => sum + (p.stock * (p.costPrice || 0)), 0)
  const formatMoney = (v: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v)

  // Products running out soon (sorted by daysOfStockLeft, showing <= 14 days)
  const runningOutSoon = products
    .filter(p => p.daysOfStockLeft && p.daysOfStockLeft > 0 && p.daysOfStockLeft <= 14)
    .sort((a, b) => (a.daysOfStockLeft || 999) - (b.daysOfStockLeft || 999))
    .slice(0, 5)

  return (
    <BosShell active="inventory" title="Stock" crumb="Opérations">
      <div className="page-inner page-wide">
        {/* Header */}
        <div className="page-head">
          <div>
            <h1 className="serif-display">Stock</h1>
            <div className="sub">Niveaux de stock, alertes & réapprovisionnement</div>
          </div>
          <div className="spacer"></div>
          <button className="btn-modern btn-secondary" onClick={handleExport}><Download className="w-4 h-4" />Exporter</button>
          <button className="btn-modern btn-primary" onClick={handleAddStock}><Package className="w-4 h-4" />Ajouter</button>
        </div>

        {/* Tabs */}
        <div style={{ marginBottom: 24, borderBottom: '1px solid var(--line-soft)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`tab-btn ${activeTab === 'stock' ? 'active' : ''}`}
              onClick={() => setActiveTab('stock')}
              style={{
                padding: '10px 16px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'stock' ? '2px solid var(--rose-bright)' : '2px solid transparent',
                color: activeTab === 'stock' ? 'var(--tx-hi)' : 'var(--tx-mid)',
                fontWeight: activeTab === 'stock' ? 600 : 500,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Package style={{ width: 16, height: 16 }} />
              Stock
            </button>
            <button
              className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
              style={{
                padding: '10px 16px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'history' ? '2px solid var(--rose-bright)' : '2px solid transparent',
                color: activeTab === 'history' ? 'var(--tx-hi)' : 'var(--tx-mid)',
                fontWeight: activeTab === 'history' ? 600 : 500,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <History style={{ width: 16, height: 16 }} />
              Historique
            </button>
          </div>
        </div>

        {activeTab === 'stock' && (
          <>
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <Metric
            icon={<Package />}
            tone="blue"
            title="Total produits"
            value={products.length.toString()}
            trend="suivis"
          />
          <Metric
            icon={<DollarSign />}
            tone="violet"
            title="Valeur stock"
            value={`${formatMoney(totalStockValue)}`}
            trend="MAD (coût)"
          />
          <Metric
            icon={<AlertTriangle />}
            tone="amber"
            title="Stock bas"
            value={lowStockCount.toString()}
            trend="à réappro."
          />
          <Metric
            icon={<XCircle />}
            tone="red"
            title="Rupture"
            value={outOfStockCount.toString()}
            trend="critique"
          />
          <Metric
            icon={<CheckCircle />}
            tone="green"
            title="En stock"
            value={(products.length - lowStockCount - outOfStockCount).toString()}
            trend="OK"
          />
        </div>

        {/* Alerts Panel */}
        {showAlerts && alerts.length > 0 && (
          <div className="card-modern mb-6" style={{ borderLeft: '4px solid var(--danger-500)' }}>
            <div className="card-header">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h3 className="text-lg font-semibold">Alertes de stock</h3>
              <span className="badge-modern badge-danger">{alerts.length}</span>
              <div className="flex-1"></div>
              <button className="btn-modern btn-sm btn-subtle" onClick={() => setShowAlerts(false)}>
                Tout masquer
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
                        Voir produit
                      </button>
                      <button
                        className="btn-modern btn-sm btn-secondary"
                        onClick={() => acknowledgeAlert(alert.id)}
                      >
                        Acquitter
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Running Out Soon Widget */}
        {runningOutSoon.length > 0 && (
          <div className="card-modern mb-6" style={{ borderLeft: '4px solid var(--amber-500)' }}>
            <div className="card-header">
              <TrendingDown className="w-5 h-5 text-amber-600" />
              <h3 className="text-lg font-semibold">Rupture imminente</h3>
              <span className="badge-modern badge-warning">{runningOutSoon.length}</span>
              <div className="flex-1"></div>
              <span className="fs12 tx-lo">≤ 14 jours de stock</span>
            </div>
            <div className="card-body">
              <div className="flex flex-col gap-3">
                {runningOutSoon.map((product) => {
                  const urgency = product.daysOfStockLeft! <= 3 ? 'critical' : product.daysOfStockLeft! <= 7 ? 'warning' : 'info'
                  const urgencyColors: Record<string, string> = {
                    critical: 'bg-red-50 border-red-200',
                    warning: 'bg-amber-50 border-amber-200',
                    info: 'bg-blue-50 border-blue-200',
                  }
                  return (
                    <div
                      key={product.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${urgencyColors[urgency]}`}
                    >
                      <div className="flex items-center gap-3">
                        {product.image && (
                          <img
                            src={product.image}
                            alt={product.name}
                            className="w-10 h-10 rounded object-cover"
                          />
                        )}
                        <div>
                          <div className="font-semibold text-sm">{product.name}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {product.brand} • Stock: <b>{product.stock}</b> • Ventes: <b>{product.weeklySales || 0}/sem</b>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className={`text-lg font-bold ${urgency === 'critical' ? 'text-red-600' : urgency === 'warning' ? 'text-amber-600' : 'text-blue-600'}`}>
                            {product.daysOfStockLeft}j
                          </div>
                          <div className="text-xs text-gray-500">restants</div>
                        </div>
                        <button
                          className="btn-modern btn-sm btn-primary"
                          onClick={() => openAdjustModal(product)}
                        >
                          Réappro
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6">
          <div className="filter-strip inline-flex gap-1 p-1 bg-gray-100 rounded-lg">
            <button
              className={`btn-modern btn-sm ${statusFilter === '' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setStatusFilter('')}
            >
              Tous
            </button>
            <button
              className={`btn-modern btn-sm ${statusFilter === 'Low stock' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setStatusFilter('Low stock')}
            >
              Stock bas
            </button>
            <button
              className={`btn-modern btn-sm ${statusFilter === 'Out of stock' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setStatusFilter('Out of stock')}
            >
              Rupture
            </button>
            <button
              className={`btn-modern btn-sm ${statusFilter === 'In stock' ? 'btn-primary' : 'btn-subtle'}`}
              onClick={() => setStatusFilter('In stock')}
            >
              En stock
            </button>
          </div>
        </div>

        {/* Inventory Table */}
        <div className="card-modern">
          <div className="overflow-x-auto">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Statut</th>
                  <th className="r">Stock</th>
                  <th className="r">Seuil</th>
                  <th className="r">Ventes/sem.</th>
                  <th className="r">Jours restants</th>
                  <th>Fournisseur</th>
                  <th className="r">Coût unit.</th>
                  <th className="r">Valeur</th>
                  <th className="r">Alertes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '40px' }}>
                      Chargement…
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '40px' }}>
                      Aucun produit
                    </td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr key={product.id}>
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
                          {({'In stock':'En stock','Low stock':'Stock bas','Out of stock':'Rupture',Discontinued:'Arrêté'} as Record<string,string>)[product.stockStatus]||product.stockStatus}
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
                        <button
                          onClick={(e) => { e.stopPropagation(); openSupplierModal(product) }}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            color: product.supplier ? 'var(--tx-lo)' : 'var(--rose-bright)',
                            fontSize: 12,
                            textDecoration: product.supplier ? 'none' : 'underline',
                          }}
                          title="Cliquer pour modifier le fournisseur"
                        >
                          {product.supplier || '+ Ajouter'}
                        </button>
                      </td>
                      <td className="r num">{product.costPrice ? `${product.costPrice}` : '-'}</td>
                      <td className="r num fw600">{product.costPrice ? formatMoney(product.stock * product.costPrice) : '-'}</td>
                      <td className="r">
                        {product.activeAlerts > 0 ? (
                          <span className="badge red mini-badge">{product.activeAlerts}</span>
                        ) : (
                          <span className="tx-lo">-</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn-modern btn-sm btn-subtle"
                          onClick={(e) => { e.stopPropagation(); openAdjustModal(product) }}
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          Ajuster
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
          </>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="card-modern">
            <div className="card-header">
              <History className="w-5 h-5" />
              <h3 className="text-lg font-semibold">Historique des mouvements</h3>
              <div className="flex-1"></div>
              <span className="fs12 tx-lo">{movements.length} mouvements (100 derniers)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Produit</th>
                    <th>Type</th>
                    <th className="r">Quantité</th>
                    <th className="r">Avant</th>
                    <th className="r">Après</th>
                    <th>Raison</th>
                    <th>Par</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingMovements ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '40px' }}>
                        Chargement…
                      </td>
                    </tr>
                  ) : movements.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '40px' }}>
                        Aucun mouvement enregistré
                      </td>
                    </tr>
                  ) : (
                    movements.map((movement) => {
                      const isIncrease = movement.quantity > 0
                      const typeColors: Record<string, string> = {
                        Purchase: 'badge blue',
                        Sale: 'badge green',
                        Adjustment: 'badge amber',
                        Return: 'badge violet',
                        Damage: 'badge red',
                        Transfer: 'badge gray',
                      }
                      return (
                        <tr key={movement.id}>
                          <td className="fs12">
                            {new Date(movement.createdAt).toLocaleDateString('fr-FR', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td>
                            <div>
                              <div className="t-strong fs13">{movement.productName}</div>
                              <div className="fs11 tx-lo">{movement.productBrand}</div>
                            </div>
                          </td>
                          <td>
                            <span className={typeColors[movement.type] || 'badge'}>
                              {movement.type}
                            </span>
                          </td>
                          <td className="r">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                              {isIncrease ? (
                                <ArrowUpCircle className="w-4 h-4 text-green-600" />
                              ) : (
                                <ArrowDownCircle className="w-4 h-4 text-red-600" />
                              )}
                              <span className={`num fw600 ${isIncrease ? 'text-green-600' : 'text-red-600'}`}>
                                {isIncrease ? '+' : ''}{movement.quantity}
                              </span>
                            </div>
                          </td>
                          <td className="r num tx-lo">{movement.stockBefore}</td>
                          <td className="r num fw600">{movement.stockAfter}</td>
                          <td className="fs12 tx-lo">{movement.reason || '-'}</td>
                          <td className="fs11 tx-lo">{movement.performedBy?.split('@')[0] || '-'}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Stock Adjustment Modal */}
        {adjustModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }} onClick={() => setAdjustModal(null)}>
            <div className="card-modern" style={{ maxWidth: 500, width: '90%' }} onClick={(e) => e.stopPropagation()}>
              <div className="card-header">
                <h3 className="text-lg font-semibold">Ajuster le stock</h3>
              </div>
              <div className="card-body">
                <div style={{ marginBottom: 16 }}>
                  <div className="t-strong">{adjustModal.productName}</div>
                  <div className="fs12 tx-lo">Stock actuel : <b className="num">{adjustModal.currentStock}</b></div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label className="fs12 tx-mid fw600" style={{ display: 'block', marginBottom: 6 }}>Type d'ajustement</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className={`btn-modern btn-sm ${adjustType === 'in' ? 'btn-primary' : 'btn-subtle'}`}
                      onClick={() => setAdjustType('in')}
                    >
                      <Plus className="w-4 h-4" /> Entrée
                    </button>
                    <button
                      className={`btn-modern btn-sm ${adjustType === 'out' ? 'btn-primary' : 'btn-subtle'}`}
                      onClick={() => setAdjustType('out')}
                    >
                      <Minus className="w-4 h-4" /> Sortie
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label className="fs12 tx-mid fw600" style={{ display: 'block', marginBottom: 6 }}>Quantité</label>
                  <input
                    type="number"
                    min="1"
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(e.target.value)}
                    placeholder="Ex: 10"
                    className="input-modern"
                    style={{ width: '100%' }}
                  />
                  {adjustQty && (
                    <div className="fs11 tx-lo" style={{ marginTop: 4 }}>
                      Nouveau stock : <b className="num">{adjustType === 'in' ? adjustModal.currentStock + Number(adjustQty) : Math.max(0, adjustModal.currentStock - Number(adjustQty))}</b>
                    </div>
                  )}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label className="fs12 tx-mid fw600" style={{ display: 'block', marginBottom: 6 }}>Raison (optionnel)</label>
                  <input
                    type="text"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder={adjustType === 'in' ? 'Réapprovisionnement fournisseur' : 'Produit endommagé'}
                    className="input-modern"
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn-modern btn-secondary" onClick={() => setAdjustModal(null)}>
                    Annuler
                  </button>
                  <button
                    className="btn-modern btn-primary"
                    onClick={submitAdjustment}
                    disabled={adjusting || !adjustQty || Number(adjustQty) <= 0}
                  >
                    {adjusting ? 'En cours…' : 'Confirmer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Supplier Edit Modal */}
        {supplierModal && (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }} onClick={() => setSupplierModal(null)}>
            <div className="card-modern" style={{ maxWidth: 450, width: '90%' }} onClick={(e) => e.stopPropagation()}>
              <div className="card-header">
                <h3 className="text-lg font-semibold">Modifier le fournisseur</h3>
              </div>
              <div className="card-body">
                <div style={{ marginBottom: 16 }}>
                  <div className="t-strong">{supplierModal.productName}</div>
                  <div className="fs12 tx-lo">
                    Fournisseur actuel : <b>{supplierModal.currentSupplier || 'Aucun'}</b>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label className="fs12 tx-mid fw600" style={{ display: 'block', marginBottom: 6 }}>
                    Nom du fournisseur
                  </label>
                  <input
                    type="text"
                    value={supplierInput}
                    onChange={(e) => setSupplierInput(e.target.value)}
                    placeholder="Ex: Beauty Supply Morocco"
                    className="input-modern"
                    style={{ width: '100%' }}
                    autoFocus
                  />
                  <div className="fs11 tx-lo" style={{ marginTop: 4 }}>
                    Laissez vide pour supprimer le fournisseur
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn-modern btn-secondary" onClick={() => setSupplierModal(null)}>
                    Annuler
                  </button>
                  <button
                    className="btn-modern btn-primary"
                    onClick={submitSupplier}
                    disabled={savingSupplier}
                  >
                    {savingSupplier ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
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
    violet: 'bg-purple-100',
  }
  const textColors: Record<string, string> = {
    blue: 'text-blue-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
    green: 'text-green-600',
    violet: 'text-purple-600',
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
