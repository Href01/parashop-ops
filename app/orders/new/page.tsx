'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BosShell from '@/components/BosShell'
import { ArrowLeft, MapPin, User, Phone, Package, CreditCard, FileText, Zap } from 'lucide-react'
import Link from 'next/link'

interface District {
  id: number
  ville: string
  name: string
  arabic_name: string
  price: number
  delais: string
}

interface Product {
  id: number
  name: string
  price: number
  costPrice: number
  brand?: string
  sku?: string
}

interface OrderItem {
  productId: number
  productName: string
  quantity: number
  unitPrice: number
}

export default function NewOrderPage() {
  const router = useRouter()
  const [districts, setDistricts] = useState<District[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([])
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
    discount: 0,
  })

  useEffect(() => {
    fetchDistricts()
    fetchProducts()
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

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products?limit=1000')
      if (res.ok) {
        const data = await res.json()
        setProducts(data)
      }
    } catch (err) {
      console.error('Failed to fetch products:', err)
    }
  }

  const addProduct = (product: Product) => {
    const existing = selectedItems.find(item => item.productId === product.id)
    if (existing) {
      setSelectedItems(selectedItems.map(item =>
        item.productId === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ))
    } else {
      setSelectedItems([...selectedItems, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPrice: product.price,
      }])
    }
  }

  const updateItemQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      setSelectedItems(selectedItems.filter(item => item.productId !== productId))
    } else {
      setSelectedItems(selectedItems.map(item =>
        item.productId === productId ? { ...item, quantity } : item
      ))
    }
  }

  const updateItemPrice = (productId: number, unitPrice: number) => {
    setSelectedItems(selectedItems.map(item =>
      item.productId === productId ? { ...item, unitPrice } : item
    ))
  }

  const removeItem = (productId: number) => {
    setSelectedItems(selectedItems.filter(item => item.productId !== productId))
  }

  const productsTotal = selectedItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0)

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
        items: selectedItems,
        discountTotal: formData.discount,
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
            <ArrowLeft size={16} />
            Orders
          </Link>
          <span>/</span>
          <span>New Order</span>
        </div>

        <div className="page-head">
          <div>
            <h1>Create New Order</h1>
            <div className="sub">Enter customer and delivery details</div>
          </div>
        </div>

        {error && (
          <div className="panel mb16" style={{ background: 'var(--red-bg)', borderColor: 'var(--red-line)', padding: '14px 18px' }}>
            <div className="row gap8">
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--red)', marginTop: 6 }}></div>
              <p style={{ color: 'var(--red)', margin: 0, flex: 1 }}>{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Customer Information */}
          <div className="panel mb16">
            <div className="panel-head">
              <User size={16} style={{ color: 'var(--tx-mid)' }} />
              <h3>Customer Information</h3>
            </div>
            <div className="panel-pad" style={{ padding: '20px 18px' }}>
              <div className="form-grid-2 mb16">
                <div className="form-field">
                  <label className="form-label">
                    Full Name <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.deliveryName}
                    onChange={(e) => setFormData({ ...formData, deliveryName: e.target.value })}
                    placeholder="Enter customer name"
                    required
                  />
                </div>
                <div className="form-field">
                  <label className="form-label">
                    Phone Number <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <div className="input-icon">
                    <Phone size={14} style={{ color: 'var(--tx-lo)' }} />
                    <input
                      type="tel"
                      className="form-input"
                      style={{ paddingLeft: 34 }}
                      value={formData.deliveryPhone}
                      onChange={(e) => setFormData({ ...formData, deliveryPhone: e.target.value })}
                      placeholder="06XXXXXXXX"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="form-field mb16">
                <label className="form-label">
                  <MapPin size={14} style={{ marginRight: 6 }} />
                  Delivery City / District <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <select
                  className="form-input"
                  value={formData.districtId}
                  onChange={(e) => setFormData({ ...formData, districtId: e.target.value })}
                  required
                  disabled={loading}
                >
                  <option value="">{loading ? 'Loading cities...' : 'Select delivery destination'}</option>
                  {districts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} • {d.price} MAD • {d.delais}
                    </option>
                  ))}
                </select>
                {selectedDistrict && (
                  <div className="fee-preview">
                    <div className="fee-badge">
                      <span className="fee-label">Delivery Fee</span>
                      <span className="fee-value">{selectedDistrict.price} MAD</span>
                    </div>
                    <div className="fee-meta">
                      <span>⏱ {selectedDistrict.delais}</span>
                      <span>📍 {selectedDistrict.ville}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="form-field mb16">
                <label className="form-label">Delivery Address</label>
                <textarea
                  className="form-input"
                  value={formData.deliveryAddress}
                  onChange={(e) => setFormData({ ...formData, deliveryAddress: e.target.value })}
                  placeholder="Full address with landmarks"
                  rows={2}
                  style={{ resize: 'vertical', minHeight: 60 }}
                />
              </div>

              <div className="form-field">
                <label className="form-label">Delivery Notes</label>
                <textarea
                  className="form-input"
                  value={formData.deliveryNotes}
                  onChange={(e) => setFormData({ ...formData, deliveryNotes: e.target.value })}
                  placeholder="Special instructions (e.g., call before delivery, gate code)"
                  rows={2}
                  style={{ resize: 'vertical', minHeight: 60 }}
                />
              </div>
            </div>
          </div>

          {/* Products */}
          <div className="panel mb16">
            <div className="panel-head">
              <Package size={16} style={{ color: 'var(--tx-mid)' }} />
              <h3>Products</h3>
              {selectedItems.length > 0 && (
                <div className="spacer"></div>
              )}
              {selectedItems.length > 0 && (
                <div className="product-total">
                  Total: <span className="mono">{productsTotal.toFixed(2)} MAD</span>
                </div>
              )}
            </div>
            <div className="panel-pad" style={{ padding: '20px 18px' }}>
              {/* Product Search */}
              <div className="form-field mb16">
                <label className="form-label">Add Products</label>
                <select
                  className="form-input"
                  onChange={(e) => {
                    const product = products.find(p => p.id === parseInt(e.target.value))
                    if (product) {
                      addProduct(product)
                      e.target.value = ''
                    }
                  }}
                  value=""
                >
                  <option value="">Select a product to add...</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} {product.brand ? `- ${product.brand}` : ''} ({product.price} MAD)
                    </option>
                  ))}
                </select>
              </div>

              {/* Selected Products */}
              {selectedItems.length === 0 ? (
                <div className="empty-products">
                  <Package size={32} style={{ color: 'var(--tx-faint)', opacity: 0.5 }} />
                  <p>No products added yet</p>
                  <small>Select products from the dropdown above</small>
                </div>
              ) : (
                <div className="products-list">
                  {selectedItems.map((item) => (
                    <div key={item.productId} className="product-item">
                      <div className="product-info">
                        <div className="product-name">{item.productName}</div>
                        <button
                          type="button"
                          onClick={() => removeItem(item.productId)}
                          className="product-remove"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="product-controls">
                        <div className="product-qty">
                          <button
                            type="button"
                            onClick={() => updateItemQuantity(item.productId, item.quantity - 1)}
                            className="qty-btn"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItemQuantity(item.productId, parseInt(e.target.value) || 1)}
                            className="qty-input"
                            min="1"
                          />
                          <button
                            type="button"
                            onClick={() => updateItemQuantity(item.productId, item.quantity + 1)}
                            className="qty-btn"
                          >
                            +
                          </button>
                        </div>
                        <div className="product-price">
                          <span className="price-label">×</span>
                          <input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) => updateItemPrice(item.productId, parseFloat(e.target.value) || 0)}
                            className="price-input"
                            step="0.01"
                            min="0"
                          />
                          <span className="price-label">MAD</span>
                        </div>
                        <div className="product-subtotal">
                          = <span className="mono">{(item.quantity * item.unitPrice).toFixed(2)}</span> MAD
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Pricing Summary */}
                  {selectedItems.length > 0 && (
                    <div className="pricing-summary">
                      <div className="pricing-row">
                        <span>Products Subtotal</span>
                        <span className="mono">{productsTotal.toFixed(2)} MAD</span>
                      </div>
                      <div className="pricing-row">
                        <span>Discount</span>
                        <input
                          type="number"
                          value={formData.discount}
                          onChange={(e) => setFormData({ ...formData, discount: parseFloat(e.target.value) || 0 })}
                          className="discount-input"
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                        />
                      </div>
                      <div className="pricing-row">
                        <span>Delivery Fee</span>
                        <span className="mono">{selectedDistrict ? selectedDistrict.price.toFixed(2) : '0.00'} MAD</span>
                      </div>
                      <div className="pricing-row total">
                        <span>Order Total</span>
                        <span className="mono">
                          {(productsTotal - formData.discount + (selectedDistrict ? selectedDistrict.price : 0)).toFixed(2)} MAD
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Order Settings */}
          <div className="panel mb16">
            <div className="panel-head">
              <Package size={16} style={{ color: 'var(--tx-mid)' }} />
              <h3>Order Settings</h3>
            </div>
            <div className="panel-pad" style={{ padding: '20px 18px' }}>
              <div className="form-grid-2 mb16">
                <div className="form-field">
                  <label className="form-label">Source Channel</label>
                  <select
                    className="form-input"
                    value={formData.sourceChannel}
                    onChange={(e) => setFormData({ ...formData, sourceChannel: e.target.value })}
                  >
                    <option value="Manual">💼 Manual</option>
                    <option value="WhatsApp">💬 WhatsApp</option>
                    <option value="Instagram">📸 Instagram</option>
                    <option value="TikTok">🎵 TikTok</option>
                    <option value="Phone">📞 Phone</option>
                  </select>
                </div>
                <div className="form-field">
                  <label className="form-label">
                    <CreditCard size={14} style={{ marginRight: 6 }} />
                    Payment Method
                  </label>
                  <select
                    className="form-input"
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                  >
                    <option value="COD">💵 Cash on Delivery</option>
                    <option value="Card">💳 Card</option>
                    <option value="Transfer">🏦 Bank Transfer</option>
                  </select>
                </div>
              </div>

              <div className="form-field mb16">
                <label className="form-label">
                  <FileText size={14} style={{ marginRight: 6 }} />
                  Internal Notes
                </label>
                <textarea
                  className="form-input"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Private notes for your team (not visible to customer)"
                  rows={2}
                  style={{ resize: 'vertical', minHeight: 60 }}
                />
              </div>

              <div className="auto-confirm-card">
                <div className="auto-icon">
                  <Zap size={16} />
                </div>
                <div className="auto-content">
                  <label className="auto-label">
                    <input
                      type="checkbox"
                      checked={formData.confirmImmediately}
                      onChange={(e) => setFormData({ ...formData, confirmImmediately: e.target.checked })}
                      className="checkbox"
                    />
                    <span className="auto-title">Auto-confirm & Create Sendit Shipment</span>
                  </label>
                  <p className="auto-desc">
                    Order will be automatically confirmed and Sendit delivery will be created immediately after submission
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="panel">
            <div className="panel-pad" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <Link href="/orders" className="btn">
                Cancel
              </Link>
              <button type="submit" className="btn primary" disabled={saving || loading}>
                {saving ? 'Creating Order...' : 'Create Order'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <style jsx>{`
        .form-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .form-field {
          display: flex;
          flex-direction: column;
        }

        .form-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--tx-mid);
          margin-bottom: 8px;
          display: flex;
          align-items: center;
        }

        .form-input {
          background: var(--bg-inset);
          border: 1px solid var(--line-soft);
          border-radius: var(--radius-sm);
          padding: 10px 12px;
          font-size: 13px;
          color: var(--tx-hi);
          font-family: var(--font);
          transition: all 0.15s ease;
        }

        .form-input:hover {
          border-color: var(--line);
        }

        .form-input:focus {
          outline: none;
          border-color: var(--rose);
          background: var(--bg-1);
        }

        .form-input::placeholder {
          color: var(--tx-faint);
        }

        .input-icon {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon svg {
          position: absolute;
          left: 12px;
          pointer-events: none;
        }

        .fee-preview {
          margin-top: 12px;
          padding: 12px 14px;
          background: linear-gradient(135deg, var(--rose-bg) 0%, var(--violet-bg) 100%);
          border: 1px solid var(--rose-line);
          border-radius: var(--radius-sm);
        }

        .fee-badge {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 6px;
        }

        .fee-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--tx-mid);
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }

        .fee-value {
          font-size: 18px;
          font-weight: 600;
          font-family: var(--mono);
          color: var(--rose-bright);
        }

        .fee-meta {
          display: flex;
          gap: 16px;
          font-size: 11.5px;
          color: var(--tx-lo);
        }

        .auto-confirm-card {
          display: flex;
          gap: 12px;
          padding: 14px;
          background: var(--bg-inset);
          border: 1px solid var(--line-soft);
          border-radius: var(--radius);
        }

        .auto-icon {
          width: 36px;
          height: 36px;
          border-radius: var(--radius-sm);
          background: linear-gradient(135deg, var(--amber-bg) 0%, var(--green-bg) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--green);
          flex-shrink: 0;
        }

        .auto-content {
          flex: 1;
        }

        .auto-label {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          margin-bottom: 6px;
        }

        .checkbox {
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: var(--rose);
        }

        .auto-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--tx-hi);
        }

        .auto-desc {
          font-size: 12px;
          color: var(--tx-lo);
          line-height: 1.5;
          margin: 0;
          padding-left: 26px;
        }

        .btn {
          padding: 9px 16px;
          border-radius: var(--radius-sm);
          font-size: 12.5px;
          font-weight: 600;
          border: 1px solid var(--line);
          background: var(--bg-2);
          color: var(--tx-hi);
          cursor: pointer;
          transition: all 0.15s ease;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .btn:hover:not(:disabled) {
          background: var(--bg-3);
          border-color: var(--line-strong);
        }

        .btn.primary {
          background: var(--rose);
          border-color: var(--rose-bright);
          color: white;
        }

        .btn.primary:hover:not(:disabled) {
          background: var(--rose-bright);
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .product-total {
          font-size: 13px;
          font-weight: 600;
          color: var(--tx-mid);
        }

        .product-total .mono {
          color: var(--rose-bright);
          font-size: 15px;
          margin-left: 6px;
        }

        .empty-products {
          text-align: center;
          padding: 48px 24px;
          color: var(--tx-faint);
        }

        .empty-products p {
          margin: 12px 0 4px;
          font-size: 13px;
          font-weight: 500;
        }

        .empty-products small {
          font-size: 11.5px;
          color: var(--tx-lo);
        }

        .products-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .product-item {
          background: var(--bg-inset);
          border: 1px solid var(--line-soft);
          border-radius: var(--radius-sm);
          padding: 14px;
        }

        .product-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .product-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--tx-hi);
        }

        .product-remove {
          background: none;
          border: none;
          color: var(--tx-faint);
          cursor: pointer;
          padding: 4px 8px;
          border-radius: var(--radius-sm);
          transition: all 0.15s ease;
        }

        .product-remove:hover {
          background: var(--red-bg);
          color: var(--red);
        }

        .product-controls {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .product-qty {
          display: flex;
          align-items: center;
          gap: 4px;
          background: var(--bg-2);
          border: 1px solid var(--line-soft);
          border-radius: var(--radius-sm);
          padding: 2px;
        }

        .qty-btn {
          width: 28px;
          height: 28px;
          border: none;
          background: transparent;
          color: var(--tx-mid);
          cursor: pointer;
          border-radius: var(--radius-sm);
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }

        .qty-btn:hover {
          background: var(--bg-3);
          color: var(--tx-hi);
        }

        .qty-input {
          width: 50px;
          text-align: center;
          background: transparent;
          border: none;
          color: var(--tx-hi);
          font-size: 13px;
          font-weight: 600;
          font-family: var(--mono);
        }

        .qty-input:focus {
          outline: none;
        }

        .product-price {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .price-label {
          font-size: 12px;
          color: var(--tx-mid);
          font-weight: 500;
        }

        .price-input {
          width: 80px;
          background: var(--bg-2);
          border: 1px solid var(--line-soft);
          border-radius: var(--radius-sm);
          padding: 6px 8px;
          font-size: 13px;
          color: var(--tx-hi);
          font-family: var(--mono);
          text-align: right;
        }

        .price-input:focus {
          outline: none;
          border-color: var(--rose);
        }

        .product-subtotal {
          margin-left: auto;
          font-size: 13px;
          font-weight: 600;
          color: var(--tx-mid);
        }

        .product-subtotal .mono {
          color: var(--tx-hi);
          font-size: 14px;
        }

        .spacer {
          flex: 1;
        }

        .pricing-summary {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid var(--line-soft);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .pricing-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
          color: var(--tx-mid);
        }

        .pricing-row.total {
          padding-top: 10px;
          border-top: 1px solid var(--line-soft);
          font-size: 15px;
          font-weight: 600;
          color: var(--tx-hi);
        }

        .pricing-row.total .mono {
          color: var(--rose-bright);
          font-size: 18px;
        }

        .discount-input {
          width: 100px;
          background: var(--bg-2);
          border: 1px solid var(--line-soft);
          border-radius: var(--radius-sm);
          padding: 6px 8px;
          font-size: 13px;
          color: var(--tx-hi);
          font-family: var(--mono);
          text-align: right;
        }

        .discount-input:focus {
          outline: none;
          border-color: var(--rose);
        }

        @media (max-width: 768px) {
          .form-grid-2 {
            grid-template-columns: 1fr;
          }

          .product-controls {
            flex-direction: column;
            align-items: stretch;
          }

          .product-subtotal {
            margin-left: 0;
            text-align: right;
          }
        }
      `}</style>
    </BosShell>
  )
}
