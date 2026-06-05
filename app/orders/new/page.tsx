'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BosShell from '@/components/BosShell'
import { ArrowLeft, Package, Save } from 'lucide-react'
import Link from 'next/link'

interface District {
  id: number
  ville: string
  name: string
  arabic_name: string
  price: number
  delais: string
}

export default function NewOrderPage() {
  const router = useRouter()
  const [districts, setDistricts] = useState<District[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    sourceChannel: 'Manual',
    deliveryName: '',
    deliveryPhone: '',
    districtId: '',
    deliveryAddress: '',
    deliveryNotes: '',
    paymentMethod: 'COD',
    notes: '',
    confirmImmediately: true,
  })

  useEffect(() => {
    fetchDistricts()
  }, [])

  const fetchDistricts = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ops/districts')
      if (!res.ok) throw new Error('Failed to fetch districts')
      const data = await res.json()
      setDistricts(data)
    } catch (err: any) {
      console.error('Failed to fetch districts:', err)
      setError('Failed to load cities. Please refresh.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      if (!formData.deliveryName || !formData.deliveryPhone || !formData.districtId) {
        throw new Error('Please fill in all required fields')
      }

      const selectedDistrict = districts.find(d => d.id === parseInt(formData.districtId))
      if (!selectedDistrict) {
        throw new Error('Invalid district selected')
      }

      const payload = {
        sourceChannel: formData.sourceChannel,
        deliveryName: formData.deliveryName,
        deliveryPhone: formData.deliveryPhone,
        deliveryCity: selectedDistrict.name,
        deliveryAddress: formData.deliveryAddress,
        deliveryNotes: formData.deliveryNotes,
        paymentMethod: formData.paymentMethod,
        notes: formData.notes,
        confirmImmediately: formData.confirmImmediately,
        items: [],
        discountTotal: 0,
        deliveryFeeCharged: selectedDistrict.price,
        estimatedDeliveryCost: selectedDistrict.price,
      }

      const res = await fetch('/api/ops/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.details || errorData.error || 'Failed to create order')
      }

      const order = await res.json()
      router.push(`/orders/${order.id}`)
    } catch (err: any) {
      console.error('Create order error:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const selectedDistrict = districts.find(d => d.id === parseInt(formData.districtId))

  return (
    <BosShell title="New Order" active="orders" crumb="New Order">
      <div className="page-inner">
        <div className="row gap8 mb16 crumb-line">
          <Link href="/orders" className="row gap6">
            <ArrowLeft />
            Orders
          </Link>
          <span>/</span>
          <span>New Order</span>
        </div>

        {error && (
          <div className="panel mb16" style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', padding: '12px 16px' }}>
            <p style={{ color: 'var(--red)', margin: 0 }}>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="panel mb16">
            <h3 className="mb12">Customer Information</h3>
            <div className="form-grid mb12">
              <div>
                <label className="form-label">Full Name *</label>
                <input
                  type="text"
                  className="input"
                  value={formData.deliveryName}
                  onChange={(e) => setFormData({ ...formData, deliveryName: e.target.value })}
                  placeholder="Customer name"
                  required
                />
              </div>
              <div>
                <label className="form-label">Phone *</label>
                <input
                  type="tel"
                  className="input"
                  value={formData.deliveryPhone}
                  onChange={(e) => setFormData({ ...formData, deliveryPhone: e.target.value })}
                  placeholder="06XXXXXXXX"
                  required
                />
              </div>
            </div>
            <div className="mb12">
              <label className="form-label">City / District *</label>
              <select
                className="input"
                value={formData.districtId}
                onChange={(e) => setFormData({ ...formData, districtId: e.target.value })}
                required
                disabled={loading}
              >
                <option value="">{loading ? 'Loading cities...' : 'Select city / district'}</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} - {d.price} MAD ({d.delais})
                  </option>
                ))}
              </select>
              {selectedDistrict && (
                <small className="text-tx-mid mt4">
                  Delivery fee: {selectedDistrict.price} MAD • Délai: {selectedDistrict.delais}
                </small>
              )}
            </div>
            <div className="mb12">
              <label className="form-label">Address</label>
              <textarea
                className="input"
                value={formData.deliveryAddress}
                onChange={(e) => setFormData({ ...formData, deliveryAddress: e.target.value })}
                placeholder="Full delivery address"
                rows={2}
              />
            </div>
            <div>
              <label className="form-label">Delivery Notes</label>
              <textarea
                className="input"
                value={formData.deliveryNotes}
                onChange={(e) => setFormData({ ...formData, deliveryNotes: e.target.value })}
                placeholder="Special instructions for delivery"
                rows={2}
              />
            </div>
          </div>

          <div className="panel mb16">
            <h3 className="mb12">Order Settings</h3>
            <div className="form-grid mb12">
              <div>
                <label className="form-label">Source Channel</label>
                <select
                  className="input"
                  value={formData.sourceChannel}
                  onChange={(e) => setFormData({ ...formData, sourceChannel: e.target.value })}
                >
                  <option value="Manual">Manual</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Instagram">Instagram</option>
                  <option value="TikTok">TikTok</option>
                  <option value="Phone">Phone</option>
                </select>
              </div>
              <div>
                <label className="form-label">Payment Method</label>
                <select
                  className="input"
                  value={formData.paymentMethod}
                  onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                >
                  <option value="COD">Cash on Delivery</option>
                  <option value="Card">Card</option>
                  <option value="Transfer">Bank Transfer</option>
                </select>
              </div>
            </div>
            <div className="mb12">
              <label className="form-label">Internal Notes</label>
              <textarea
                className="input"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Internal notes (not visible to customer)"
                rows={2}
              />
            </div>
            <div>
              <label className="row gap8" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.confirmImmediately}
                  onChange={(e) => setFormData({ ...formData, confirmImmediately: e.target.checked })}
                />
                <span>Auto-confirm and create Sendit shipment immediately</span>
              </label>
            </div>
          </div>

          <div className="panel">
            <div className="row gap10" style={{ justifyContent: 'flex-end' }}>
              <Link href="/orders" className="btn">
                Cancel
              </Link>
              <button type="submit" className="btn primary" disabled={saving || loading}>
                <Save />
                {saving ? 'Creating...' : 'Create Order'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </BosShell>
  )
}
