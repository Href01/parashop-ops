'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ProductPicker from './ProductPicker'

interface SelectedProduct {
  id: number
  name: string
  price: number
  costPrice?: number
  quantity: number
}

export default function NewOrderPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const formData = new FormData(e.currentTarget)

    // Validate products
    if (selectedProducts.length === 0) {
      setError('Please add at least one product to the order')
      setLoading(false)
      return
    }

    const orderData = {
      sourceChannel: formData.get('sourceChannel'),
      deliveryName: formData.get('deliveryName'),
      deliveryPhone: formData.get('deliveryPhone'),
      deliveryCity: formData.get('deliveryCity'),
      deliveryAddress: formData.get('deliveryAddress'),
      deliveryNotes: formData.get('deliveryNotes'),
      paymentMethod: formData.get('paymentMethod'),
      deliveryFeeCharged: parseFloat(formData.get('deliveryFeeCharged') as string) || 0,
      estimatedDeliveryCost: parseFloat(formData.get('estimatedDeliveryCost') as string) || 30,
      notes: formData.get('notes'),
      items: selectedProducts.map(p => ({
        productId: p.id,
        quantity: p.quantity,
        unitPrice: p.price,
      })),
      confirmImmediately: formData.get('confirmImmediately') === 'on',
    }

    try {
      console.log('Sending order data:', orderData)

      const res = await fetch('/api/ops/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      })

      console.log('Response status:', res.status)

      if (!res.ok) {
        const data = await res.json()
        console.error('Server error:', data)
        throw new Error(data.error || 'Failed to create order')
      }

      const order = await res.json()
      console.log('Order created:', order)
      router.push(`/orders/${order.id}`)
    } catch (err: any) {
      console.error('Create order error:', err)
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="container max-w-3xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Create New Order</h2>
        <p className="text-gray-600 text-sm">WhatsApp • Instagram • TikTok • Manual</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border p-6 space-y-6">
        {/* Source Channel */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Source Channel *
          </label>
          <select
            name="sourceChannel"
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="">Select channel...</option>
            <option value="WhatsApp">WhatsApp</option>
            <option value="Instagram">Instagram</option>
            <option value="TikTok">TikTok</option>
            <option value="Manual">Manual / Phone</option>
          </select>
        </div>

        {/* Products */}
        <div className="border-t pt-6">
          <h3 className="font-semibold text-gray-900 mb-4">Products *</h3>
          <ProductPicker onProductsChange={setSelectedProducts} />
        </div>

        {/* Customer Info */}
        <div className="border-t pt-6">
          <h3 className="font-semibold text-gray-900 mb-4">Customer Information</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Customer Name *
              </label>
              <input
                type="text"
                name="deliveryName"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Ahmed Ben Ali"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone *
              </label>
              <input
                type="tel"
                name="deliveryPhone"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="0612345678"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              City *
            </label>
            <input
              type="text"
              name="deliveryCity"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Casablanca"
            />
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address
            </label>
            <textarea
              name="deliveryAddress"
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="123 Rue Mohammed V, Apt 5"
            />
          </div>
        </div>

        {/* Payment & Delivery */}
        <div className="border-t pt-6">
          <h3 className="font-semibold text-gray-900 mb-4">Payment & Delivery</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Method
              </label>
              <select
                name="paymentMethod"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="COD">Cash on Delivery (COD)</option>
                <option value="PREPAID">Prepaid</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Delivery Fee Charged
              </label>
              <input
                type="number"
                name="deliveryFeeCharged"
                defaultValue={0}
                min={0}
                step={0.01}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Estimated Delivery Cost
            </label>
            <input
              type="number"
              name="estimatedDeliveryCost"
              defaultValue={30}
              min={0}
              step={0.01}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Casablanca: 25 MAD • Major cities: 35 MAD • Remote: 45 MAD
            </p>
          </div>
        </div>

        {/* Notes */}
        <div className="border-t pt-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes (Optional)
          </label>
          <textarea
            name="notes"
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Special instructions, customer requests, etc."
          />
        </div>

        {/* Actions */}
        <div className="border-t pt-6 flex items-center justify-between">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="confirmImmediately"
              className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
            />
            <span className="text-sm text-gray-700">Confirm immediately</span>
          </label>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || selectedProducts.length === 0}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Order'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
