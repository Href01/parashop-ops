'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Download, Edit3, MoreHorizontal, Package, Percent, Plus, Search, TriangleAlert, Upload, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import BosShell from '@/components/BosShell'
import EditCostPriceModal from './EditCostPriceModal'
import BulkEditCostModal from './BulkEditCostModal'
import ImportSuppliersCSV from './ImportSuppliersCSV'

interface Product {
  id: number
  name: string
  brand: string
  category: string
  price: number | string
  costPrice?: number | string | null
  sku?: string
  image?: string
  stock: number
  lowStockThreshold: number
}

const PAGE_SIZE = 25

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function margin(price: unknown, cost?: unknown) {
  const p = toNumber(price)
  const c = toNumber(cost)
  if (!p || !c) return null
  return ((p - c) / p) * 100
}

function formatMoney(value: unknown) {
  return toNumber(value).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterMissingCost, setFilterMissingCost] = useState(false)
  const [filterLowStock, setFilterLowStock] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [showImportCSV, setShowImportCSV] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    void fetchProducts()
  }, [search, filterMissingCost, filterLowStock])

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (filterMissingCost) params.append('missingCost', 'true')
      if (filterLowStock) params.append('lowStock', 'true')

      const res = await fetch(`/api/ops/products?${params}`, { cache: 'no-store' })
      const data = (await res.json()) as Product[]
      setProducts(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch products:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleBulkEditCosts = () => {
    if (products.length === 0) {
      alert('Aucun produit à éditer')
      return
    }
    setShowBulkEdit(true)
  }

  const handleBulkUpdate = async (updates: Array<{ id: number; costPrice: number }>) => {
    try {
      // Update all products in parallel
      await Promise.all(
        updates.map(({ id, costPrice }) =>
          fetch(`/api/ops/products/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ costPrice }),
          })
        )
      )

      await fetchProducts()
      setShowBulkEdit(false)
      alert(`${updates.length} produit(s) mis à jour ✓`)
    } catch (error) {
      console.error('Bulk update error:', error)
      alert('Échec de la mise à jour de certains produits. Réessayez.')
    }
  }

  const handleExport = () => {
    const csv = [
      ['Product', 'Brand', 'Category', 'Retail Price', 'Cost Price', 'Margin', 'Stock'],
      ...products.map(p => [
        p.name,
        p.brand,
        p.category,
        p.price,
        p.costPrice || '',
        margin(p.price, p.costPrice)?.toFixed(1) || '',
        p.stock
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `products-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleAddProduct = () => {
    window.location.href = 'https://www.shinecosmetics.ma/admin/products'
  }

  const handleUpdateCost = async (productId: number, costPrice: number) => {
    try {
      const res = await fetch(`/api/ops/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ costPrice }),
      })

      if (!res.ok) throw new Error('Failed to update')

      await fetchProducts()
      setSelectedProduct(null)
    } catch (error) {
      console.error('Update error:', error)
      alert("Échec de l'enregistrement du coût")
    }
  }

  const stats = useMemo(() => {
    const activeSkus = products.length
    const inventoryValue = products.reduce((sum, product) => sum + toNumber(product.costPrice) * toNumber(product.stock), 0)
    const marginValues = products.map((product) => margin(product.price, product.costPrice)).filter((value): value is number => value !== null)
    const avgMargin = marginValues.length ? marginValues.reduce((sum, value) => sum + value, 0) / marginValues.length : 0
    const missingCost = products.filter((product) => !toNumber(product.costPrice)).length
    const lowStock = products.filter((product) => product.stock > 0 && product.stock <= product.lowStockThreshold).length

    return { activeSkus, inventoryValue, avgMargin, missingCost, lowStock }
  }, [products])

  const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE))
  const currentPageInRange = Math.min(currentPage, totalPages)
  const pageStart = (currentPageInRange - 1) * PAGE_SIZE
  const paginatedProducts = products.slice(pageStart, pageStart + PAGE_SIZE)

  return (
    <BosShell active="products" title="Produits" crumb="Opérations">
      <div className="page-inner page-wide">
        <div className="page-head">
          <div>
            <h1 className="serif-display">Produits</h1>
            <div className="sub">Catalogue, coûts &amp; marges — synchronisé avec shinecosmetics.ma</div>
          </div>
          <div className="spacer"></div>
          <button type="button" className="btn-modern btn-secondary" onClick={handleBulkEditCosts}>
            <Edit3 className="w-4 h-4" />
            Coûts en masse
          </button>
          <button type="button" className="btn-modern btn-secondary" onClick={() => setShowImportCSV(true)}>
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
          <button type="button" className="btn-modern btn-secondary" onClick={handleExport}>
            <Download className="w-4 h-4" />
            Exporter
          </button>
          <button type="button" className="btn-modern btn-primary" onClick={handleAddProduct}>
            <Plus className="w-4 h-4" />
            Ajouter
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <ProductStat icon={<Package />} title="Produits actifs" value={stats.activeSkus} subtitle="au catalogue" tone="blue" />
          <ProductStat icon={<Wallet />} title="Valeur du stock" value={stats.inventoryValue} unit="MAD" subtitle="au coût d'achat" tone="green" />
          <ProductStat icon={<Percent />} title="Marge moyenne" value={stats.avgMargin} unit="%" subtitle="produits suivis" tone="rose" decimals={1} />
          <ProductStat icon={<TriangleAlert />} title="À surveiller" value={stats.lowStock + stats.missingCost} subtitle={`${stats.lowStock} stock bas · ${stats.missingCost} sans coût`} tone="amber" />
        </div>

        <div className="card-modern">
          <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-200">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setCurrentPage(1)
                }}
                placeholder="Rechercher produit, SKU…"
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div className="filter-strip inline-flex gap-1 p-1 bg-gray-100 rounded-lg">
              <button
                type="button"
                className={`btn-modern btn-sm ${!filterMissingCost && !filterLowStock ? 'btn-primary' : 'btn-subtle'}`}
                onClick={() => { setFilterMissingCost(false); setFilterLowStock(false); setCurrentPage(1); }}
              >
                Tous <span className="ml-1 badge-modern badge-neutral badge-sm">{products.length}</span>
              </button>
              <button
                type="button"
                className={`btn-modern btn-sm ${filterLowStock ? 'btn-primary' : 'btn-subtle'}`}
                onClick={() => { setFilterLowStock(true); setFilterMissingCost(false); setCurrentPage(1); }}
              >
                Stock bas <span className="ml-1 badge-modern badge-warning badge-sm">{stats.lowStock}</span>
              </button>
              <button
                type="button"
                className={`btn-modern btn-sm ${filterMissingCost ? 'btn-primary' : 'btn-subtle'}`}
                onClick={() => { setFilterMissingCost(true); setFilterLowStock(false); setCurrentPage(1); }}
              >
                Sans coût <span className="ml-1 badge-modern badge-danger badge-sm">{stats.missingCost}</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Catégorie</th>
                  <th className="r">Prix</th>
                  <th className="r">Coût</th>
                  <th className="r">Marge</th>
                  <th>Stock</th>
                  <th className="r"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1, 2, 3, 4, 5].map((item) => (
                    <tr key={item}>
                      <td colSpan={7}>
                        <div className="skeleton-line"></div>
                      </td>
                    </tr>
                  ))
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">Aucun produit. Les produits du site apparaîtront ici.</div>
                    </td>
                  </tr>
                ) : (
                  paginatedProducts.map((product) => {
                    const productMargin = margin(product.price, product.costPrice)
                    const hasCost = toNumber(product.costPrice) > 0
                    const lowStock = product.stock > 0 && product.stock <= product.lowStockThreshold
                    const stockColor = product.stock <= 0 ? 'var(--red)' : lowStock ? 'var(--amber)' : 'var(--green)'
                    const stockPct = Math.min(100, (product.stock / Math.max(40, product.lowStockThreshold * 4)) * 100)

                    return (
                      <tr key={product.id}>
                        <td>
                          <div className="row gap10">
                            {product.image ? <img src={product.image} alt={product.name} className="thumb" /> : <div className="thumb"></div>}
                            <div className="cellstack">
                              <Link href={`/products/${product.id}`} className="t-strong" style={{ color: 'var(--tx-hi)', textDecoration: 'none' }}>{product.name}</Link>
                              <span className="t-sub mono">{product.sku || product.brand || 'Sans SKU'}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="badge">{product.category || 'Sans catégorie'}</span>
                        </td>
                        <td className="r num">{formatMoney(product.price)} <span className="tx-lo fs11">MAD</span></td>
                        <td className="r">
                          {hasCost ? (
                            <button type="button" className="cost-edit num" onClick={() => setSelectedProduct(product)}>
                              {formatMoney(product.costPrice)}
                              <Edit3 />
                            </button>
                          ) : (
                            <button type="button" className="badge red" onClick={() => setSelectedProduct(product)}>
                              Définir
                            </button>
                          )}
                        </td>
                        <td className="r">
                          {productMargin === null ? (
                            <span className="tx-faint fs12">-</span>
                          ) : (
                            <span
                              className="margin-pill"
                              style={{
                                background: productMargin >= 40 ? 'var(--green-bg)' : productMargin >= 30 ? 'var(--amber-bg)' : 'var(--red-bg)',
                                color: productMargin >= 40 ? 'var(--green)' : productMargin >= 30 ? 'var(--amber)' : 'var(--red)',
                              }}
                            >
                              {productMargin.toFixed(0)}%
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="stock-cell">
                            <div className="between">
                              <span className="num fs12" style={{ color: stockColor }}>{product.stock} unités</span>
                              {lowStock ? <span className="badge amber mini-badge">BAS</span> : null}
                            </div>
                            <div className="bar">
                              <span style={{ width: `${stockPct}%`, background: stockColor }}></span>
                            </div>
                          </div>
                        </td>
                        <td className="r">
                          <button
                            type="button"
                            className="btn-modern btn-icon btn-subtle"
                            onClick={() => setSelectedProduct(product)}
                            title="Edit cost price"
                            aria-label={`Edit ${product.name}`}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
            <span className="text-xs text-gray-600">
              {products.length === 0 ? 0 : pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, products.length)} sur {products.length} produits{stats.missingCost > 0 ? ` · ${stats.missingCost} sans coût d'achat (marge incalculable)` : ''}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-modern btn-sm btn-secondary"
                onClick={() => setCurrentPage((page) => Math.max(1, Math.min(page, totalPages) - 1))}
                disabled={currentPageInRange <= 1}
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </button>
              <button type="button" className="btn-modern btn-sm btn-primary">{currentPageInRange}/{totalPages}</button>
              <button
                type="button"
                className="btn-modern btn-sm btn-secondary"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, Math.min(page, totalPages) + 1))}
                disabled={currentPageInRange >= totalPages}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {selectedProduct && (
          <EditCostPriceModal
            product={{
              ...selectedProduct,
              price: toNumber(selectedProduct.price),
              costPrice: selectedProduct.costPrice === null ? undefined : toNumber(selectedProduct.costPrice),
            }}
            onSave={handleUpdateCost}
            onClose={() => setSelectedProduct(null)}
          />
        )}

        {showBulkEdit && (
          <BulkEditCostModal
            products={products}
            onSave={handleBulkUpdate}
            onClose={() => setShowBulkEdit(false)}
          />
        )}

        {showImportCSV && (
          <ImportSuppliersCSV
            onClose={() => setShowImportCSV(false)}
            onComplete={() => {
              void fetchProducts()
            }}
          />
        )}
      </div>
    </BosShell>
  )
}

function ProductStat({
  icon,
  title,
  value,
  unit,
  subtitle,
  tone,
  decimals = 0,
}: {
  icon: ReactNode
  title: string
  value: number
  unit?: string
  subtitle: string
  tone: 'blue' | 'green' | 'rose' | 'amber'
  decimals?: number
}) {
  const bgColors = {
    blue: 'bg-blue-100',
    green: 'bg-green-100',
    rose: 'bg-pink-100',
    amber: 'bg-amber-100',
  }
  const textColors = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    rose: 'text-pink-600',
    amber: 'text-amber-600',
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
          <p className="text-2xl font-bold text-gray-900">
            {value.toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}
          </p>
          {unit && <span className="text-sm text-gray-500">{unit}</span>}
        </div>

        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
    </div>
  )
}
