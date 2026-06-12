'use client'

import { useState, useEffect } from 'react'

interface Product {
  id: number
  name: string
  brand: string
  price: number
  costPrice?: number
  sku?: string
  image?: string
  stock: number
}

interface SelectedProduct extends Product {
  quantity: number
}

interface ProductPickerProps {
  onProductsChange: (products: SelectedProduct[]) => void
}

export default function ProductPicker({ onProductsChange }: ProductPickerProps) {
  const [search, setSearch] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)

  // Fetch products when search changes — debounced (300ms) and race-safe
  // (aborts the in-flight request so a slow earlier response can't overwrite
  // a newer one).
  useEffect(() => {
    if (search.length < 2) {
      setProducts([])
      setShowResults(false)
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/ops/products?search=${encodeURIComponent(search)}`, {
          signal: controller.signal,
        })
        const data = await res.json()
        // API returns an array on success but { error } on failure — guard it.
        setProducts(Array.isArray(data) ? data : [])
        setShowResults(true)
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') {
          console.error('Failed to fetch products:', error)
        }
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [search])

  // Notify parent when selected products change
  useEffect(() => {
    onProductsChange(selectedProducts)
  }, [selectedProducts])

  const addProduct = (product: Product) => {
    // Check if already added
    const existing = selectedProducts.find(p => p.id === product.id)
    if (existing) {
      // Increase quantity
      setSelectedProducts(
        selectedProducts.map(p =>
          p.id === product.id ? { ...p, quantity: p.quantity + 1 } : p
        )
      )
    } else {
      // Add new
      setSelectedProducts([...selectedProducts, { ...product, quantity: 1 }])
    }
    setSearch('')
    setShowResults(false)
  }

  const removeProduct = (productId: number) => {
    setSelectedProducts(selectedProducts.filter(p => p.id !== productId))
  }

  const updateQuantity = (productId: number, quantity: number) => {
    if (quantity < 1) {
      removeProduct(productId)
      return
    }
    setSelectedProducts(
      selectedProducts.map(p =>
        p.id === productId ? { ...p, quantity } : p
      )
    )
  }

  const calculateTotals = () => {
    const subtotal = selectedProducts.reduce(
      (sum, p) => sum + p.price * p.quantity,
      0
    )
    return { subtotal }
  }

  const totals = calculateTotals()

  return (
    <div className="space-y-4">
      {/* Search Box */}
      <div className="relative">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Search Products
        </label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, brand, or SKU..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />

        {/* Search Results Dropdown */}
        {showResults && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-500">Searching...</div>
            ) : products.length === 0 ? (
              <div className="p-4 text-center text-gray-500">No products found</div>
            ) : (
              products.map((product) => (
                <div
                  key={product.id}
                  className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-0"
                  onClick={() => addProduct(product)}
                >
                  <div className="flex items-center gap-3">
                    {product.image && (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-12 h-12 object-cover rounded"
                      />
                    )}
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-500">
                        {product.brand} • {product.price} MAD
                        {product.sku && ` • SKU: ${product.sku}`}
                      </p>
                      <p className="text-xs text-gray-400">
                        Stock: {product.stock} {product.stock < 5 && '⚠️ Low'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
                      onClick={(e) => {
                        e.stopPropagation()
                        addProduct(product)
                      }}
                    >
                      + Add
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Selected Products */}
      {selectedProducts.length > 0 && (
        <div className="bg-gray-50 rounded-lg border p-4">
          <h4 className="font-semibold text-gray-900 mb-3">
            Selected Products ({selectedProducts.length})
          </h4>

          <div className="space-y-3">
            {selectedProducts.map((product) => (
              <div
                key={product.id}
                className="flex items-center gap-3 bg-white p-3 rounded border"
              >
                {product.image && (
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-12 h-12 object-cover rounded"
                  />
                )}
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{product.name}</p>
                  <p className="text-sm text-gray-500">
                    {product.price} MAD × {product.quantity} ={' '}
                    {product.price * product.quantity} MAD
                  </p>
                  {!product.costPrice && (
                    <p className="text-xs text-yellow-600">
                      ⚠️ Cost price missing - profit can't be calculated
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Quantity Selector */}
                  <button
                    type="button"
                    onClick={() => updateQuantity(product.id, product.quantity - 1)}
                    className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-100"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={product.quantity}
                    onChange={(e) =>
                      updateQuantity(product.id, parseInt(e.target.value) || 1)
                    }
                    className="w-16 px-2 py-1 text-center border border-gray-300 rounded"
                    min="1"
                  />
                  <button
                    type="button"
                    onClick={() => updateQuantity(product.id, product.quantity + 1)}
                    className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-100"
                  >
                    +
                  </button>

                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={() => removeProduct(product.id)}
                    className="ml-2 px-3 py-1 text-red-600 hover:bg-red-50 rounded text-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mt-4 pt-4 border-t">
            <div className="flex justify-between text-lg font-semibold">
              <span>Subtotal:</span>
              <span>{totals.subtotal.toFixed(2)} MAD</span>
            </div>
          </div>
        </div>
      )}

      {selectedProducts.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
          💡 Search for products above and click "+ Add" to add them to this order
        </div>
      )}
    </div>
  )
}
