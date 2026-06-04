'use client'

import { useEffect, useState } from 'react'
import EditCostPriceModal from './EditCostPriceModal'

interface Product {
  id: number
  name: string
  brand: string
  category: string
  price: number
  costPrice?: number
  sku?: string
  image?: string
  stock: number
  lowStockThreshold: number
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterMissingCost, setFilterMissingCost] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedProducts, setSelectedProducts] = useState<number[]>([])

  useEffect(() => {
    fetchProducts()
  }, [search, filterMissingCost])

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (filterMissingCost) params.append('missingCost', 'true')

      const res = await fetch(`/api/ops/products?${params}`)
      const data = await res.json()
      setProducts(data)
    } catch (error) {
      console.error('Failed to fetch products:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateCost = async (productId: number, costPrice: number) => {
    try {
      const res = await fetch(`/api/ops/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ costPrice }),
      })

      if (!res.ok) throw new Error('Failed to update')

      // Refresh products list
      await fetchProducts()
      setSelectedProduct(null)
    } catch (error) {
      console.error('Update error:', error)
      alert('Failed to update cost price')
    }
  }

  const calculateMargin = (price: number, costPrice?: number) => {
    if (!costPrice || costPrice === 0) return null
    return ((price - costPrice) / price) * 100
  }

  const toggleSelectProduct = (productId: number) => {
    if (selectedProducts.includes(productId)) {
      setSelectedProducts(selectedProducts.filter(id => id !== productId))
    } else {
      setSelectedProducts([...selectedProducts, productId])
    }
  }

  const missingCostCount = products.filter(p => !p.costPrice || p.costPrice === 0).length

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading products...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Products</h2>
        <p className="text-gray-600 text-sm">Manage inventory and cost prices</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, brand, or SKU..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          {/* Missing Cost Filter */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filterMissingCost}
              onChange={(e) => setFilterMissingCost(e.target.checked)}
              className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
            />
            <span className="text-sm font-medium text-gray-700">
              Missing cost price only
              {missingCostCount > 0 && (
                <span className="ml-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">
                  {missingCostCount}
                </span>
              )}
            </span>
          </label>
        </div>
      </div>

      {/* Stats */}
      {missingCostCount > 0 && !filterMissingCost && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            ⚠️ <strong>{missingCostCount} products</strong> are missing cost prices.
            Profit calculation won't work for orders with these products.{' '}
            <button
              onClick={() => setFilterMissingCost(true)}
              className="underline font-semibold hover:text-yellow-900"
            >
              Show them
            </button>
          </p>
        </div>
      )}

      {/* Products List */}
      {products.length === 0 ? (
        <div className="bg-white rounded-lg border p-12 text-center">
          <div className="text-6xl mb-4">📦</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No products found
          </h3>
          <p className="text-gray-600">
            {search || filterMissingCost
              ? 'Try adjusting your filters'
              : 'Products from the website will appear here'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((product) => {
            const margin = calculateMargin(product.price, product.costPrice)
            const hasCost = product.costPrice && product.costPrice > 0

            return (
              <div
                key={product.id}
                className="bg-white rounded-lg border p-4 hover:shadow-md transition"
              >
                <div className="flex items-start gap-4">
                  {/* Product Image */}
                  {product.image && (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-20 h-20 object-cover rounded"
                    />
                  )}

                  {/* Product Info */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">{product.name}</h3>
                        <p className="text-sm text-gray-600">
                          {product.brand}
                          {product.sku && ` • SKU: ${product.sku}`}
                          {product.category && ` • ${product.category}`}
                        </p>
                      </div>

                      {!hasCost && (
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded">
                          ⚠️ Missing Cost
                        </span>
                      )}
                    </div>

                    {/* Pricing */}
                    <div className="flex items-center gap-6 mb-3">
                      <div>
                        <span className="text-xs text-gray-500">Retail Price</span>
                        <p className="font-semibold text-gray-900">{product.price} MAD</p>
                      </div>

                      <div>
                        <span className="text-xs text-gray-500">Cost Price</span>
                        <p className="font-semibold text-gray-900">
                          {hasCost ? `${product.costPrice} MAD` : '---'}
                        </p>
                      </div>

                      {margin !== null && (
                        <div>
                          <span className="text-xs text-gray-500">Margin</span>
                          <p className="font-semibold text-green-600">
                            {margin.toFixed(1)}%
                          </p>
                        </div>
                      )}

                      <div>
                        <span className="text-xs text-gray-500">Stock</span>
                        <p className={`font-semibold ${product.stock < product.lowStockThreshold ? 'text-red-600' : 'text-gray-900'}`}>
                          {product.stock}
                          {product.stock < product.lowStockThreshold && ' ⚠️'}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedProduct(product)}
                        className="px-4 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition"
                      >
                        {hasCost ? 'Edit Cost' : 'Add Cost Price'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Edit Cost Price Modal */}
      {selectedProduct && (
        <EditCostPriceModal
          product={selectedProduct}
          onSave={handleUpdateCost}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  )
}
