'use client'

import type { FormEvent } from 'react'
import { ArrowLeft, Check, Package, Plus, Search, User, Wallet } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import BosShell from '@/components/BosShell'

interface Product {
  id: number
  name: string
  brand?: string
  price: number | string
  costPrice?: number | string | null
  sku?: string
  image?: string
  stock: number
}

interface SelectedProduct extends Product {
  quantity: number
}

const channels = [
  { label: 'Instagram', value: 'Instagram', color: 'var(--c-instagram)' },
  { label: 'WhatsApp', value: 'WhatsApp', color: 'var(--c-whatsapp)' },
  { label: 'TikTok', value: 'TikTok', color: 'var(--c-tiktok)' },
  { label: 'Website', value: 'Website', color: 'var(--c-website)' },
  { label: 'Phone / Manual', value: 'Manual', color: 'var(--c-manual)' },
]

function toNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function NewOrderPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [channel, setChannel] = useState('Instagram')
  const [search, setSearch] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([])
  const [deliveryFee, setDeliveryFee] = useState(30)
  const [discount, setDiscount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function fetchProducts() {
      try {
        const params = new URLSearchParams()
        if (search) params.append('search', search)
        const res = await fetch(`/api/ops/products?${params}`, { signal: controller.signal })
        const data = (await res.json()) as Product[]
        setProducts(Array.isArray(data) ? data.slice(0, 5) : [])
      } catch (fetchError: any) {
        if (fetchError.name !== 'AbortError') {
          console.error('Failed to fetch products:', fetchError)
        }
      }
    }

    void fetchProducts()

    return () => controller.abort()
  }, [search])

  const totals = useMemo(() => {
    const subtotal = selectedProducts.reduce((sum, product) => sum + toNumber(product.price) * product.quantity, 0)
    const cost = selectedProducts.reduce((sum, product) => sum + toNumber(product.costPrice) * product.quantity, 0)
    const revenue = Math.max(0, subtotal - discount)
    const total = revenue + deliveryFee
    const estimatedDeliveryCost = 30
    const profit = revenue - cost - estimatedDeliveryCost
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0

    return { subtotal, cost, revenue, total, estimatedDeliveryCost, profit, margin }
  }, [deliveryFee, discount, selectedProducts])

  const addProduct = (product: Product) => {
    setSelectedProducts((current) => {
      const existing = current.find((item) => item.id === product.id)
      if (existing) {
        return current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
      }
      return [...current, { ...product, quantity: 1 }]
    })
  }

  const changeQuantity = (productId: number, delta: number) => {
    setSelectedProducts((current) =>
      current
        .map((product) => product.id === productId ? { ...product, quantity: product.quantity + delta } : product)
        .filter((product) => product.quantity > 0)
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')

    if (selectedProducts.length === 0) {
      setError('Please add at least one product to the order')
      return
    }

    setLoading(true)
    const formData = new FormData(event.currentTarget)

    const orderData = {
      sourceChannel: channel,
      deliveryName: formData.get('deliveryName'),
      deliveryPhone: formData.get('deliveryPhone'),
      deliveryCity: formData.get('deliveryCity'),
      deliveryAddress: formData.get('deliveryAddress'),
      deliveryNotes: formData.get('deliveryNotes'),
      paymentMethod: formData.get('paymentMethod'),
      deliveryFeeCharged: deliveryFee,
      estimatedDeliveryCost: totals.estimatedDeliveryCost,
      discountTotal: discount,
      notes: formData.get('notes'),
      items: selectedProducts.map((product) => ({
        productId: product.id,
        quantity: product.quantity,
        unitPrice: toNumber(product.price),
      })),
      confirmImmediately: formData.get('confirmImmediately') === 'on',
    }

    try {
      const res = await fetch('/api/ops/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create order')
      }

      const order = await res.json()
      router.push(`/orders/${order.id}`)
    } catch (submitError: any) {
      setError(submitError.message)
      setLoading(false)
    }
  }

  return (
    <BosShell active="orders" title="New order" crumb="Orders">
      <div className="page-inner">
        <div className="row gap8 mb16 crumb-line">
          <Link href="/orders" className="row gap6">
            <ArrowLeft />
            Orders
          </Link>
          <span>/</span>
          <span>New order</span>
        </div>

        <div className="page-head">
          <div>
            <h1>Create order</h1>
            <div className="sub">Manual entry from WhatsApp, Instagram, TikTok or phone</div>
          </div>
        </div>

        {error ? <div className="auth-error mb16">{error}</div> : null}

        <form onSubmit={handleSubmit} className="no-grid">
          <div className="grid">
            <div className="panel panel-pad">
              <label className="label form-block-label">Source channel</label>
              <div className="chan-pick">
                {channels.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`chan-opt ${channel === item.value ? 'active' : ''}`}
                    onClick={() => setChannel(item.value)}
                  >
                    <span className="cd" style={{ background: item.color }}></span>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <User />
                <h3>Customer & delivery</h3>
              </div>
              <div className="panel-pad">
                <div className="frow">
                  <div className="field">
                    <label>Full name</label>
                    <input className="inp" name="deliveryName" required placeholder="e.g. Salma Bennani" />
                  </div>
                  <div className="field">
                    <label>Phone</label>
                    <input className="inp" name="deliveryPhone" required placeholder="0612345678" />
                  </div>
                </div>
                <div className="frow">
                  <div className="field">
                    <label>City</label>
                    <input className="inp" name="deliveryCity" required placeholder="Casablanca" />
                  </div>
                  <div className="field">
                    <label>Payment</label>
                    <select className="inp" name="paymentMethod" defaultValue="COD">
                      <option value="COD">COD - Cash on delivery</option>
                      <option value="PREPAID">Prepaid - Bank transfer</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Delivery address</label>
                  <input className="inp" name="deliveryAddress" placeholder="Street, building, apartment..." />
                </div>
                <div className="field">
                  <label>Delivery notes</label>
                  <textarea className="inp" name="deliveryNotes" placeholder="Call before delivery, landmarks, preferred time..." />
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <Package />
                <h3>Products</h3>
                <div className="spacer"></div>
                <span className="hint">{selectedProducts.reduce((sum, product) => sum + product.quantity, 0)} items</span>
              </div>
              <div className="panel-pad">
                <div className="ord-search product-search">
                  <Search />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search catalog by name or SKU..." />
                </div>
                <div className="pick-results">
                  {products.map((product) => (
                    <button key={product.id} type="button" className="pick-item" onClick={() => addProduct(product)}>
                      {product.image ? <img className="thumb" src={product.image} alt={product.name} /> : <span className="thumb"></span>}
                      <span className="cellstack pick-main">
                        <span className="t-strong fs12">{product.name}</span>
                        <span className="t-sub mono">{product.sku || product.brand || 'No SKU'} - {product.stock} in stock</span>
                      </span>
                      <span className="num fs12">{toNumber(product.price)} MAD</span>
                      <span className="btn sm">
                        <Plus />
                        Add
                      </span>
                    </button>
                  ))}
                </div>

                <div className="cart-list">
                  {selectedProducts.length === 0 ? (
                    <div className="cart-empty">No products added yet - search above</div>
                  ) : (
                    selectedProducts.map((product) => (
                      <div key={product.id} className="cart-item">
                        {product.image ? <img className="thumb" src={product.image} alt={product.name} /> : <span className="thumb"></span>}
                        <div className="cellstack cart-main">
                          <span className="t-strong fs12">{product.name}</span>
                          <span className="t-sub mono">{toNumber(product.price)} MAD - cost {toNumber(product.costPrice)}</span>
                        </div>
                        <div className="qty">
                          <button type="button" onClick={() => changeQuantity(product.id, -1)}>-</button>
                          <span>{product.quantity}</span>
                          <button type="button" onClick={() => changeQuantity(product.id, 1)}>+</button>
                        </div>
                        <span className="num fs12 t-strong cart-total">{toNumber(product.price) * product.quantity} MAD</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <aside className="panel live-panel">
            <div className="panel-head">
              <Wallet />
              <h3>Live P&L</h3>
            </div>
            <div className="panel-pad">
              <div className="pl-row"><span className="tx-mid">Products subtotal</span><span className="num">{totals.subtotal} MAD</span></div>
              <div className="pl-row">
                <span className="tx-mid">Delivery charged</span>
                <span className="row gap6">
                  <input className="inp num mini-input" value={deliveryFee} onChange={(event) => setDeliveryFee(toNumber(event.target.value))} />
                  <span className="tx-lo fs11">MAD</span>
                </span>
              </div>
              <div className="pl-row">
                <span className="tx-mid">Discount</span>
                <span className="row gap6">
                  <input className="inp num mini-input" value={discount} onChange={(event) => setDiscount(toNumber(event.target.value))} />
                  <span className="tx-lo fs11">MAD</span>
                </span>
              </div>
              <div className="pl-row total"><span>Order total</span><span className="num fs16">{totals.total} MAD</span></div>
              <div className="divider mt12 mb12"></div>
              <div className="pl-row"><span className="tx-lo">Product cost</span><span className="num neg">-{totals.cost}</span></div>
              <div className="pl-row"><span className="tx-lo">Est. delivery cost</span><span className="num neg">-{totals.estimatedDeliveryCost}</span></div>
              <div className="pl-row total"><span>Est. net profit</span><span className={`num fs16 ${totals.profit >= 0 ? 'pos' : 'neg'}`}>{totals.profit >= 0 ? '+' : ''}{totals.profit} MAD</span></div>
              <div className="margin-box">
                <MarginDonut value={totals.margin} />
                <div>
                  <div className="label">Est. margin</div>
                  <div className={`num fs22 fw600 ${totals.margin >= 25 ? 'pos' : totals.margin > 0 ? '' : 'neg'}`}>{totals.margin.toFixed(1)}%</div>
                  <div className="fs11 tx-lo">{totals.subtotal === 0 ? 'add products' : totals.margin >= 30 ? 'healthy margin' : 'review pricing'}</div>
                </div>
              </div>
              <label className="check-row confirm-row">
                <input type="checkbox" name="confirmImmediately" />
                <span>Confirm immediately</span>
              </label>
              <textarea className="inp mt12" name="notes" placeholder="Internal notes..." />
              <button type="submit" className="btn primary full mt16" disabled={loading}>
                <Check />
                {loading ? 'Creating...' : 'Create order'}
              </button>
            </div>
          </aside>
        </form>
      </div>
    </BosShell>
  )
}

function MarginDonut({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, value))
  const size = 66
  const stroke = 7
  const radius = (size - stroke) / 2
  const circ = 2 * Math.PI * radius
  const offset = circ * (1 - safe / 100)
  const color = value >= 25 ? 'var(--green)' : 'var(--amber)'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--bg-3)" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" fill="var(--tx-hi)" fontFamily="var(--mono)" fontSize="13" fontWeight="600">
        {Math.round(value)}%
      </text>
    </svg>
  )
}
