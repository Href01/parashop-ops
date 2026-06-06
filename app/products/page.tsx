'use client'

import type { ReactNode } from 'react'
import { Download, Edit3, MoreHorizontal, Package, Percent, Plus, Search, TriangleAlert, Wallet } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import BosShell from '@/components/BosShell'
import EditCostPriceModal from './EditCostPriceModal'
import BulkEditCostModal from './BulkEditCostModal'

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
      alert('No products available to edit')
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
      alert(`Successfully updated ${updates.length} product${updates.length !== 1 ? 's' : ''}!`)
    } catch (error) {
      console.error('Bulk update error:', error)
      alert('Failed to update some products. Please try again.')
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
      alert('Failed to update cost price')
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

  return (
    <BosShell active="products" title="Products" crumb="Operations">
      <div className="page-inner page-wide">
        <div className="page-head">
          <div>
            <h1>Products</h1>
            <div className="sub">Inventory, cost prices & margins - synced with shinecosmetics.ma</div>
          </div>
          <div className="spacer"></div>
          <button type="button" className="btn-modern btn-secondary" onClick={handleBulkEditCosts}>
            <Edit3 className="w-4 h-4" />
            Bulk edit costs
          </button>
          <button type="button" className="btn-modern btn-secondary" onClick={handleExport}>
            <Download className="w-4 h-4" />
            Export
          </button>
          <button type="button" className="btn-modern btn-primary" onClick={handleAddProduct}>
            <Plus className="w-4 h-4" />
            Add product
          </button>
        </div>

        <div className="pstat-row">
          <ProductStat icon={<Package />} title="Active SKUs" value={stats.activeSkus} subtitle="Catalog products" tone="blue" />
          <ProductStat icon={<Wallet />} title="Inventory value" value={stats.inventoryValue} unit="MAD" subtitle="at cost" tone="green" />
          <ProductStat icon={<Percent />} title="Avg margin" value={stats.avgMargin} unit="%" subtitle="tracked products" tone="rose" decimals={1} />
          <ProductStat icon={<TriangleAlert />} title="Need attention" value={stats.lowStock + stats.missingCost} subtitle={`${stats.lowStock} low - ${stats.missingCost} missing cost`} tone="amber" />
        </div>

        <div className="panel">
          <div className="toolbar">
            <div className="ord-search">
              <Search />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products, SKU..." />
            </div>
            <div className="vdiv"></div>
            <button type="button" className={`chip ${!filterMissingCost && !filterLowStock ? 'active' : ''}`} onClick={() => { setFilterMissingCost(false); setFilterLowStock(false); }}>
              All <span className="ct">{products.length}</span>
            </button>
            <button type="button" className={`chip ${filterLowStock ? 'active' : ''}`} onClick={() => { setFilterLowStock(true); setFilterMissingCost(false); }}>
              Low stock <span className="ct">{stats.lowStock}</span>
            </button>
            <button type="button" className={`chip ${filterMissingCost ? 'active' : ''}`} onClick={() => { setFilterMissingCost(true); setFilterLowStock(false); }}>
              Missing cost <span className="ct">{stats.missingCost}</span>
            </button>
          </div>

          <div className="table-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th className="r">Retail</th>
                  <th className="r">Cost</th>
                  <th className="r">Margin</th>
                  <th>Stock</th>
                  <th className="r">Sold 30D</th>
                  <th>Trend</th>
                  <th className="r"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1, 2, 3, 4, 5].map((item) => (
                    <tr key={item}>
                      <td colSpan={9}>
                        <div className="skeleton-line"></div>
                      </td>
                    </tr>
                  ))
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={9}>
                      <div className="empty-state">No products found. Products from the website will appear here.</div>
                    </td>
                  </tr>
                ) : (
                  products.map((product) => {
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
                              <span className="t-strong">{product.name}</span>
                              <span className="t-sub mono">{product.sku || product.brand || 'No SKU'}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="badge">{product.category || 'Uncategorized'}</span>
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
                              Set cost
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
                              <span className="num fs12" style={{ color: stockColor }}>{product.stock} units</span>
                              {lowStock ? <span className="badge amber mini-badge">LOW</span> : null}
                            </div>
                            <div className="bar">
                              <span style={{ width: `${stockPct}%`, background: stockColor }}></span>
                            </div>
                          </div>
                        </td>
                        <td className="r num t-strong">-</td>
                        <td>
                          <MiniBars color={stockColor} />
                        </td>
                        <td className="r">
                          <button type="button" className="btn sm icon">
                            <MoreHorizontal />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="between table-foot">
            <span className="fs12 tx-lo">{products.length} products - {stats.missingCost} missing cost price hurt profit tracking</span>
            <div className="row gap6">
              <button type="button" className="btn sm">Prev</button>
              <button type="button" className="btn sm active-page">1</button>
              <button type="button" className="btn sm">Next</button>
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
  return (
    <div className="panel kpi">
      <div className="kpi-top">
        <div className="kpi-ico" style={{ background: `var(--${tone}-bg)`, color: tone === 'rose' ? 'var(--rose-bright)' : `var(--${tone})` }}>
          {icon}
        </div>
        <span className="kpi-title">{title}</span>
      </div>
      <div className="kpi-val">
        <span>{value.toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}</span>
        {unit ? <span className="cur">{unit}</span> : null}
      </div>
      <div className="kpi-meta">
        <span className="tx-lo">{subtitle}</span>
      </div>
    </div>
  )
}

function MiniBars({ color }: { color: string }) {
  const values = [35, 58, 42, 70, 66, 82, 75]

  return (
    <svg width="70" height="24" viewBox="0 0 70 24" fill="none" aria-hidden="true">
      {values.map((value, index) => (
        <rect key={index} x={index * 10} y={24 - value / 4} width="6" height={value / 4} rx="2" fill={color} opacity={0.55 + index * 0.05} />
      ))}
    </svg>
  )
}
