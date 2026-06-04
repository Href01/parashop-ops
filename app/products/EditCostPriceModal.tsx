'use client'

import { useState, useEffect } from 'react'

interface Product {
  id: number
  name: string
  price: number
  costPrice?: number
}

interface EditCostPriceModalProps {
  product: Product
  onSave: (productId: number, costPrice: number) => Promise<void>
  onClose: () => void
}

export default function EditCostPriceModal({
  product,
  onSave,
  onClose,
}: EditCostPriceModalProps) {
  const [costPrice, setCostPrice] = useState<string>(
    product.costPrice?.toString() || ''
  )
  const [saving, setSaving] = useState(false)

  const calculateMargin = () => {
    const cost = parseFloat(costPrice)
    if (!cost || cost === 0) return null
    return ((product.price - cost) / product.price) * 100
  }

  const handleSave = async () => {
    const cost = parseFloat(costPrice)

    if (!cost || cost <= 0) {
      alert('Please enter a valid cost price')
      return
    }

    if (cost >= product.price) {
      const confirm = window.confirm(
        `Cost price (${cost} MAD) is higher than retail price (${product.price} MAD). This means negative margin. Continue anyway?`
      )
      if (!confirm) return
    }

    setSaving(true)
    try {
      await onSave(product.id, cost)
    } finally {
      setSaving(false)
    }
  }

  const margin = calculateMargin()

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            {product.costPrice ? 'Edit Cost Price' : 'Add Cost Price'}
          </h3>
          <p className="text-sm text-gray-600 mt-1">{product.name}</p>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Retail Price (read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Retail Price (fixed)
            </label>
            <div className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 font-medium">
              {product.price} MAD
            </div>
          </div>

          {/* Cost Price (editable) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cost Price *
            </label>
            <div className="relative">
              <input
                type="number"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="Enter cost price..."
                step="0.01"
                min="0"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                autoFocus
              />
              <span className="absolute right-4 top-2 text-gray-500">MAD</span>
            </div>
          </div>

          {/* Calculated Margin */}
          {margin !== null && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Calculated Margin</div>
              <div className={`text-2xl font-bold ${margin < 0 ? 'text-red-600' : margin < 20 ? 'text-yellow-600' : 'text-green-600'}`}>
                {margin.toFixed(1)}%
              </div>
              {margin < 0 && (
                <p className="text-xs text-red-600 mt-2">
                  ⚠️ Negative margin - cost is higher than retail price
                </p>
              )}
              {margin >= 0 && margin < 20 && (
                <p className="text-xs text-yellow-600 mt-2">
                  ⚠️ Low margin - below 20%
                </p>
              )}
            </div>
          )}

          {/* Formula Explanation */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-700 mb-1 font-medium">💡 Margin Formula:</p>
            <p className="text-xs text-blue-600 font-mono">
              Margin = (Retail - Cost) / Retail × 100
            </p>
            <p className="text-xs text-blue-600 mt-2">
              Example: If retail is 100 MAD and cost is 70 MAD,
              margin is 30%
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex gap-3 justify-end rounded-b-lg">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !costPrice}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Cost Price'}
          </button>
        </div>
      </div>
    </div>
  )
}
