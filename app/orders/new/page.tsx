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
    handToHand: false,
    handToHandCity: '',
    /* Le TAUX et le FIXE servent a la saisie, le MONTANT est ce qu'on
       enregistre : une commission se lit « 15 % + 6 MAD » sur le contrat, mais
       c'est le montant preleve qui grignote la marge, et c'est lui qui doit
       etre fige. Jumia facture les deux — un pourcentage seul aurait sous-estime
       chaque commande de 6 MAD. */
    commissionTaux: '',
    commissionFixe: '',
    deliveryAddress: '',
    deliveryNotes: '',
    paymentMethod: 'COD',
    paidAmount: '',
    paidAt: '',
    paymentReference: '',
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
      /* Jumia ne transmet pas le numero de la cliente : l'exiger rendait la
         saisie impossible. Il reste obligatoire partout ailleurs — c'est par lui
         qu'on rappelle, qu'on reconnait et qu'on demande un avis. */
      if (!formData.deliveryName || (!estMarketplace && !formData.deliveryPhone)) {
        throw new Error('Please fill in all required fields')
      }

      /* Deux chemins qui s'excluent : soit un transporteur et son district
         facture, soit une remise en main propre a 0 MAD. On ne lit JAMAIS
         `selectedDistrict` dans le second cas — c'est precisement ce couplage
         qui rendait la vente de la main a la main impossible a saisir. */
      let deliveryCity: string
      let senditDistrictId: number | undefined
      let deliveryFee: number

      if (sansLivraison) {
        /* La ville reste une vraie ville : elle alimente la geographie des
           ventes. Un « remise en main propre » colle ici polluerait ce champ. */
        if (!formData.handToHandCity.trim()) {
          throw new Error(estMarketplace
            ? 'Indique la ville de livraison indiquée par la place de marché'
            : 'Indique la ville où le produit a été remis')
        }
        deliveryCity = formData.handToHandCity.trim()
        senditDistrictId = undefined
        deliveryFee = 0
      } else {
        if (!formData.districtId) {
          throw new Error('Please fill in all required fields')
        }
        const selectedDistrict = districts.find(d => d.id === parseInt(formData.districtId))
        if (!selectedDistrict) {
          throw new Error('Invalid district selected')
        }
        deliveryCity = selectedDistrict.name
        senditDistrictId = selectedDistrict.id
        deliveryFee = Number(selectedDistrict.price)
      }

      const payload = {
        sourceChannel: formData.sourceChannel,
        handToHand: sansLivraison,
        channelCommission: commission,
        deliveryName: formData.deliveryName,
        deliveryPhone: formData.deliveryPhone || undefined,
        marketplace: estMarketplace,
        deliveryCity,
        senditDistrictId,
        deliveryAddress: formData.deliveryAddress,
        deliveryNotes: formData.deliveryNotes,
        paymentMethod: formData.paymentMethod,
        paidAmount: formData.paymentMethod === 'VIREMENT' ? formData.paidAmount : undefined,
        paidAt: formData.paymentMethod === 'VIREMENT' ? formData.paidAt : undefined,
        paymentReference: formData.paymentMethod === 'VIREMENT' ? formData.paymentReference : undefined,
        notes: formData.notes,
        confirmImmediately: formData.confirmImmediately,
        items: selectedItems,
        discountTotal: formData.discount,
        deliveryFeeCharged: deliveryFee,
        estimatedDeliveryCost: deliveryFee,
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

  /* Une place de marche livre elle-meme : pas de district, pas de frais de
     notre cote. Elle suit donc exactement le meme chemin que la remise en main
     propre — d'ou un seul drapeau plutot que deux chemins paralleles qui
     divergeraient. */
  /* Les taux connus, pre-remplis pour eviter la saisie de tete a chaque vente.
     Ils restent modifiables : un contrat change, et c'est le montant fige sur
     la commande qui fait foi, pas cette table. */
  const MARKETPLACES: Record<string, { taux: number; fixe: number }> = {
    'Jumia': { taux: 15, fixe: 6 },
    'Marjane Mall': { taux: 15, fixe: 0 },
  }
  const estMarketplace = formData.sourceChannel in MARKETPLACES
  const sansLivraison = formData.handToHand || estMarketplace

  /* Sans district, les lignes de total lisent deja `selectedDistrict ? prix : 0`.
     L'annuler ici suffit donc a mettre les frais a zero partout, sans repeter
     la condition dans chaque ligne. */
  const selectedDistrict = sansLivraison
    ? undefined
    : districts.find(d => d.id === parseInt(formData.districtId))

  /* La commission se RECALCULE a partir du total des produits : si on ajoute
     une ligne apres avoir saisi le taux, un montant fige serait faux. Elle est
     arrondie au centime, comme ce qui sera preleve. */
  const commission = estMarketplace
    ? Math.round(((productsTotal * (Number(formData.commissionTaux) || 0)) / 100
        + (Number(formData.commissionFixe) || 0)) * 100) / 100
    : 0

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
                    Phone Number {!estMarketplace && <span style={{ color: 'var(--red)' }}>*</span>}
                  </label>
                  <div className="input-icon">
                    <Phone size={14} style={{ color: 'var(--tx-lo)' }} />
                    <input
                      type="tel"
                      className="form-input"
                      style={{ paddingLeft: 34 }}
                      value={formData.deliveryPhone}
                      onChange={(e) => setFormData({ ...formData, deliveryPhone: e.target.value })}
                      placeholder={estMarketplace ? 'Non communiqué par la place de marché' : '06XXXXXXXX'}
                      required={!estMarketplace}
                    />
                  </div>
                  {estMarketplace && (
                    <p style={{ fontSize: 11, color: 'var(--tx-lo)', marginTop: 5 }}>
                      Facultatif : {formData.sourceChannel} ne le transmet pas. Ces ventes ne
                      compteront donc pas dans « clientes », qui dénombre les numéros distincts.
                    </p>
                  )}
                </div>
              </div>

              {/* Masquee sur une place de marche : elle livre elle-meme, donc le
                  chemin « sans expedition » est deja pris. Laisser une case a
                  cocher qui ne change rien invite a se demander ce qu'elle fait. */}
              <label
                className="form-field mb16"
                hidden={estMarketplace}
                /* `flexDirection` explicite : la classe `.form-field` empile en
                   colonne, ce qui rejetait la case a cocher AU-DESSUS de son
                   libelle — lisible dans le DOM, absurde a l'ecran. */
                style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={formData.handToHand}
                  onChange={(e) => setFormData({ ...formData, handToHand: e.target.checked })}
                  style={{ marginTop: 3, cursor: 'pointer' }}
                />
                <span>
                  <span className="form-label" style={{ margin: 0 }}>
                    🤝 Remise en main propre — 0 MAD de livraison
                  </span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--tx-mid)', marginTop: 3 }}>
                    Aucun transporteur : la commande est enregistrée comme livrée, le stock
                    se décrémente tout seul. Plus besoin d&apos;ajuster l&apos;inventaire à la main.
                  </span>
                </span>
              </label>

              {estMarketplace && (
                <div className="form-field mb16" style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
                  <label className="form-label" style={{ margin: 0 }}>
                    🛒 Commission {formData.sourceChannel}
                  </label>
                  <p style={{ fontSize: 12, color: 'var(--tx-lo)', margin: '4px 0 10px' }}>
                    Saisis le taux, le montant se calcule — c’est le <strong>montant</strong> qui est
                    enregistré et figé, parce que c’est lui qui réduit la marge.
                  </p>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: '0 0 100px' }}>
                      <label style={{ display: 'block', fontSize: 11, color: 'var(--tx-mid)', marginBottom: 4 }}>Taux (%)</label>
                      <input
                        type="number" min="0" max="100" step="0.1" className="form-input" placeholder="15"
                        value={formData.commissionTaux}
                        onChange={(e) => setFormData({ ...formData, commissionTaux: e.target.value })}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <span style={{ fontSize: 15, color: 'var(--tx-lo)', paddingBottom: 9 }}>+</span>
                    <div style={{ flex: '0 0 120px' }}>
                      <label style={{ display: 'block', fontSize: 11, color: 'var(--tx-mid)', marginBottom: 4 }}>Fixe (MAD)</label>
                      <input
                        type="number" min="0" step="0.01" className="form-input" placeholder="6"
                        value={formData.commissionFixe}
                        onChange={(e) => setFormData({ ...formData, commissionFixe: e.target.value })}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div style={{ paddingBottom: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--tx-mid)', display: 'block', marginBottom: 4 }}>Commission retenue</span>
                      <span className="mono" style={{ fontSize: 17, fontWeight: 700, color: 'var(--rose-bright)' }}>
                        {commission.toFixed(2)} MAD
                      </span>
                      {productsTotal > 0 && commission > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--tx-lo)', marginInlineStart: 8 }}>
                          soit {((commission / productsTotal) * 100).toFixed(1)} % du total
                        </span>
                      )}
                    </div>
                  </div>
                  {productsTotal === 0 && (
                    <p style={{ fontSize: 11, color: 'var(--amber)', marginTop: 8 }}>
                      Ajoute les produits : la part variable se calcule sur leur total.
                    </p>
                  )}
                </div>
              )}

              {sansLivraison ? (
                <div className="form-field mb16">
                  <label className="form-label">
                    <MapPin size={14} style={{ marginRight: 6 }} />
                    {estMarketplace ? 'Ville de livraison' : 'Ville de la remise'} <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.handToHandCity}
                    onChange={(e) => setFormData({ ...formData, handToHandCity: e.target.value })}
                    placeholder="Tanger, Casablanca…"
                    required
                  />
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--tx-mid)', marginTop: 6 }}>
                    Une vraie ville : c&apos;est ce champ qui alimente la géographie des ventes.
                  </span>
                </div>
              ) : (
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
              )}

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
                        <span className="mono">{selectedDistrict ? Number(selectedDistrict.price).toFixed(2) : '0.00'} MAD</span>
                      </div>
                      <div className="pricing-row total">
                        <span>Order Total</span>
                        <span className="mono">
                          {(productsTotal - formData.discount + (selectedDistrict ? Number(selectedDistrict.price) : 0)).toFixed(2)} MAD
                        </span>
                      </div>
                      {/* La commission n'entre PAS dans le total : la cliente paie
                          le prix affiche, c'est nous qui touchons moins. La
                          montrer ici, en retrait, evite de croire qu'on encaisse
                          la totalite — sans fausser ce que doit la cliente. */}
                      {commission > 0 && (
                        <div className="pricing-row" style={{ color: 'var(--tx-lo)' }}>
                          <span>dont commission {formData.sourceChannel} (retenue sur notre part)</span>
                          <span className="mono">− {commission.toFixed(2)} MAD</span>
                        </div>
                      )}
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
                    /* Choisir une place de marche pre-remplit son bareme : on ne
                       retape pas « 15 et 6 » a chaque vente, et on ne risque pas
                       de l'oublier — une commission oubliee gonfle la marge. */
                    onChange={(e) => {
                      const canal = e.target.value
                      const bareme = MARKETPLACES[canal]
                      setFormData({
                        ...formData,
                        sourceChannel: canal,
                        commissionTaux: bareme ? String(bareme.taux) : '',
                        commissionFixe: bareme ? String(bareme.fixe) : '',
                      })
                    }}
                  >
                    <option value="Manual">💼 Manual</option>
                    {/* Places de marche : notre stock, LEUR prix, LEUR commission.
                        Elles livrent elles-memes, d'ou l'absence de district. */}
                    <option value="Jumia">🛒 Jumia</option>
                    <option value="Marjane Mall">🛒 Marjane Mall</option>
                    {/* Canal distinct, et pas un simple « Manual » : ces ventes
                        portent un prix de faveur. Fondues dans les autres, elles
                        tireraient vers le bas le panier moyen et la marge par
                        canal — on croirait a une degradation commerciale. */}
                    <option value="Famille">🤝 Famille / Proches</option>
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
                    <option value="COD">💵 Paiement à la livraison (COD)</option>
                    <option value="VIREMENT">🏦 Virement bancaire</option>
                    <option value="CARD">💳 Carte</option>
                  </select>
                </div>
              </div>

              {formData.paymentMethod === 'VIREMENT' && (
                <div className="form-grid-2 mb16">
                  <div className="form-field">
                    <label className="form-label">Montant reçu (MAD)</label>
                    <input type="number" min="0.01" step="0.01" className="form-input"
                      value={formData.paidAmount}
                      onChange={(e) => setFormData({ ...formData, paidAmount: e.target.value })}
                      required />
                  </div>
                  <div className="form-field">
                    <label className="form-label">Date de réception</label>
                    <input type="date" className="form-input" value={formData.paidAt}
                      onChange={(e) => setFormData({ ...formData, paidAt: e.target.value })}
                      required />
                  </div>
                  <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Référence bancaire</label>
                    <input type="text" className="form-input" value={formData.paymentReference}
                      onChange={(e) => setFormData({ ...formData, paymentReference: e.target.value })}
                      placeholder="Référence ou note du virement" />
                  </div>
                </div>
              )}

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
