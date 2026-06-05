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
      <div className="page-header">
        <Link href="/orders" className="btn"><ArrowLeft /> Back</Link>
        <h1><Package /> Create New Order</h1>
      </div>

      <form onSubmit={handleSubmit}>
        {error && (
          <div className="panel err-panel">
            <p>{error}</p>
          </div>
        )}

        <div className="panel">
          <h3>Customer Information</h3>
          <div className="form-row">
            <div>
              <label>Full Name *</label>
              <input type="text" value={formData.deliveryName} onChange={(e) => setFormData({ ...formData, deliveryName: e.target.value })} placeholder="Customer name" required />
            </div>
            <div>
              <label>Phone *</label>
              <input type="tel" value={formData.deliveryPhone} onChange={(e) => setFormData({ ...formData, deliveryPhone: e.target.value })} placeholder="06XXXXXXXX" required />
            </div>
          </div>
          <div>
            <label>City / District *</label>
            <select value={formData.districtId} onChange={(e) => setFormData({ ...formData, districtId: e.target.value })} required disabled={loading}>
              <option value="">{loading ? 'Loading cities...' : 'Select city / district'}</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>{d.name} - {d.price} MAD ({d.delais})</option>
              ))}
            </select>
            {selectedDistrict && <small>Fee: {selectedDistrict.price} MAD • {selectedDistrict.delais}</small>}
          </div>
          <div>
            <label>Address</label>
            <textarea value={formData.deliveryAddress} onChange={(e) => setFormData({ ...formData, deliveryAddress: e.target.value })} placeholder="Full delivery address" rows={2} />
          </div>
          <div>
            <label>Delivery Notes</label>
            <textarea value={formData.deliveryNotes} onChange={(e) => setFormData({ ...formData, deliveryNotes: e.target.value })} placeholder="Special instructions" rows={2} />
          </div>
        </div>

        <div className="panel">
          <h3>Order Settings</h3>
          <div className="form-row">
            <div>
              <label>Source Channel</label>
              <select value={formData.sourceChannel} onChange={(e) => setFormData({ ...formData, sourceChannel: e.target.value })}>
                <option value="Manual">Manual</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Instagram">Instagram</option>
                <option value="TikTok">TikTok</option>
                <option value="Phone">Phone</option>
              </select>
            </div>
            <div>
              <label>Payment Method</label>
              <select value={formData.paymentMethod} onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}>
                <option value="COD">Cash on Delivery</option>
                <option value="Card">Card</option>
                <option value="Transfer">Bank Transfer</option>
              </select>
            </div>
          </div>
          <div>
            <label>Internal Notes</label>
            <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Internal notes" rows={2} />
          </div>
          <div>
            <label className="chk-label">
              <input type="checkbox" checked={formData.confirmImmediately} onChange={(e) => setFormData({ ...formData, confirmImmediately: e.target.checked })} />
              Auto-confirm and create Sendit shipment
            </label>
          </div>
        </div>

        <div className="panel actions">
          <Link href="/orders" className="btn">Cancel</Link>
          <button type="submit" className="btn primary" disabled={saving || loading}>
            <Save /> {saving ? 'Creating...' : 'Create Order'}
          </button>
        </div>
      </form>

      <style jsx>{`
        form { display: flex; flex-direction: column; gap: 1.5rem; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.5rem; }
        input, select, textarea { width: 100%; padding: 0.625rem; border: 1px solid var(--bd); border-radius: 0.375rem; font-size: 0.875rem; }
        small { display: block; color: var(--tx-mid); margin-top: 0.5rem; font-size: 0.8rem; }
        h3 { font-size: 1rem; margin-bottom: 1rem; }
        .actions { display: flex; gap: 1rem; justify-content: flex-end; }
        .err-panel { background: var(--red-bg); border-color: var(--red); }
        .err-panel p { color: var(--red); margin: 0; }
        .chk-label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
        .chk-label input { width: auto; }
      `}</style>
    </BosShell>
  )
}
