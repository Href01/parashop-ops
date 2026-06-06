'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

interface Product {
  id: number
  name: string
  price: number | string
  costPrice?: number | string | null
}

interface BulkEditCostModalProps {
  products: Product[]
  onSave: (updates: Array<{ id: number; costPrice: number }>) => Promise<void>
  onClose: () => void
}

export default function BulkEditCostModal({
  products,
  onSave,
  onClose,
}: BulkEditCostModalProps) {
  const [method, setMethod] = useState<'percentage' | 'fixed'>('percentage')
  const [percentage, setPercentage] = useState('30')
  const [fixedCost, setFixedCost] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set(products.map(p => p.id))
  )

  const toggleProduct = (id: number) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const calculateCost = (price: number) => {
    if (method === 'percentage') {
      const pct = parseFloat(percentage) || 0
      // Cost = Price × (1 - Margin%)
      return price * (1 - pct / 100)
    } else {
      return parseFloat(fixedCost) || 0
    }
  }

  const handleSave = async () => {
    if (selectedIds.size === 0) {
      alert('Please select at least one product')
      return
    }

    if (method === 'percentage' && (!percentage || parseFloat(percentage) <= 0)) {
      alert('Please enter a valid margin percentage')
      return
    }

    if (method === 'fixed' && (!fixedCost || parseFloat(fixedCost) <= 0)) {
      alert('Please enter a valid cost price')
      return
    }

    setSaving(true)
    try {
      const updates = products
        .filter(p => selectedIds.has(p.id))
        .map(p => ({
          id: p.id,
          costPrice: calculateCost(typeof p.price === 'string' ? parseFloat(p.price) : p.price)
        }))

      await onSave(updates)
    } finally {
      setSaving(false)
    }
  }

  const selectedCount = selectedIds.size

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Bulk Edit Cost Prices
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {selectedCount} product{selectedCount !== 1 ? 's' : ''} selected
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Method Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Calculation Method
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setMethod('percentage')}
                className={`flex-1 px-4 py-3 border-2 rounded-lg transition ${
                  method === 'percentage'
                    ? 'border-purple-600 bg-purple-50 text-purple-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium">Target Margin %</div>
                <div className="text-xs text-gray-500 mt-1">
                  Set desired profit margin
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMethod('fixed')}
                className={`flex-1 px-4 py-3 border-2 rounded-lg transition ${
                  method === 'fixed'
                    ? 'border-purple-600 bg-purple-50 text-purple-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium">Fixed Cost</div>
                <div className="text-xs text-gray-500 mt-1">
                  Same cost for all products
                </div>
              </button>
            </div>
          </div>

          {/* Input Field */}
          {method === 'percentage' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target Margin (%)
              </label>
              <input
                type="number"
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                placeholder="e.g., 30"
                min="0"
                max="100"
                step="0.1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Cost will be calculated as: Price × (1 - {percentage}%)
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fixed Cost Price (MAD)
              </label>
              <input
                type="number"
                value={fixedCost}
                onChange={(e) => setFixedCost(e.target.value)}
                placeholder="e.g., 150"
                min="0"
                step="0.01"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                All selected products will have the same cost price
              </p>
            </div>
          )}

          {/* Product Selection List */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Products to Update
            </label>
            <div className="border border-gray-200 rounded-lg divide-y max-h-64 overflow-y-auto">
              {products.map((product) => {
                const price = typeof product.price === 'string' ? parseFloat(product.price) : product.price
                const newCost = calculateCost(price)
                const newMargin = ((price - newCost) / price) * 100
                const isSelected = selectedIds.has(product.id)

                return (
                  <label
                    key={product.id}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition ${
                      isSelected ? 'bg-purple-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleProduct(product.id)}
                      className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {product.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        Retail: {price.toFixed(0)} MAD → Cost: {newCost.toFixed(0)} MAD → Margin: {newMargin.toFixed(1)}%
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedIds(new Set(products.map(p => p.id)))}
                className="text-xs text-purple-600 hover:text-purple-700"
              >
                Select All
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-purple-600 hover:text-purple-700"
              >
                Deselect All
              </button>
            </div>
          </div>

          {/* Warning */}
          {selectedCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-700 font-medium">
                ⚠️ This will update cost prices for {selectedCount} product{selectedCount !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-amber-600 mt-1">
                This action cannot be undone. Review the calculations above before saving.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || selectedCount === 0}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : `Update ${selectedCount} Product${selectedCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
