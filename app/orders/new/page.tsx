'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BosShell from '@/components/BosShell'
import PageHead from '@/components/PageHead'
import { AlertTriangle, CheckCircle2, CreditCard, FileText, Hand, MapPin, Minus, Package, Phone, Plus, Store, Truck, User, X, Zap } from 'lucide-react'
import Link from 'next/link'
import {
  DistrictSearchPicker,
  ProductSearchPicker,
  type DistrictOption,
  type OrderProductOption,
} from './OrderSearchPickers'

interface OrderItem {
  productId: number
  productName: string
  quantity: number
  unitPrice: number
  costPrice: number
  available: number
  trackInventory: boolean
}

export default function NewOrderPage() {
  const router = useRouter()
  const [districts, setDistricts] = useState<DistrictOption[]>([])
  const [products, setProducts] = useState<OrderProductOption[]>([])
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([])
  const [loadingDistricts, setLoadingDistricts] = useState(true)
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [createdWarning, setCreatedWarning] = useState<{ id: number; number: string; warning: string } | null>(null)

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
    deliveryFeeCharged: '',
  })

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    const loadDistricts = async () => {
      try {
        const res = await fetch('/api/ops/districts', { signal: controller.signal })
        if (!res.ok) throw new Error('Impossible de charger les destinations Sendit')
        const data = await res.json()
        if (active) setDistricts(Array.isArray(data) ? data : [])
      } catch (err: unknown) {
        if (active && !(err instanceof DOMException && err.name === 'AbortError')) {
          console.error('Failed to fetch districts:', err)
          setError('Impossible de charger les destinations. Réessaie sans perdre la saisie.')
        }
      } finally {
        if (active) setLoadingDistricts(false)
      }
    }

    const loadProducts = async () => {
      try {
        const res = await fetch('/api/products?limit=1000', { signal: controller.signal })
        if (!res.ok) throw new Error('Impossible de charger le catalogue')
        const data = await res.json()
        if (active) setProducts(Array.isArray(data) ? data : [])
      } catch (err: unknown) {
        if (active && !(err instanceof DOMException && err.name === 'AbortError')) {
          console.error('Failed to fetch products:', err)
          setError('Impossible de charger les produits. Réessaie sans perdre la saisie.')
        }
      } finally {
        if (active) setLoadingProducts(false)
      }
    }

    void Promise.all([loadDistricts(), loadProducts()])
    return () => {
      active = false
      controller.abort()
    }
  }, [])

  const clearFieldError = (field: string) => {
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const addProduct = (product: OrderProductOption) => {
    const existing = selectedItems.find(item => item.productId === product.id)
    if (existing) {
      if (existing.trackInventory && existing.quantity >= existing.available) {
        setFieldErrors((current) => ({ ...current, items: `Stock disponible atteint pour ${product.name}` }))
        return
      }
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
        costPrice: Number(product.costPrice) || 0,
        available: Number(product.available) || 0,
        trackInventory: Boolean(product.trackInventory),
      }])
    }
    clearFieldError('items')
  }

  const updateItemQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      setSelectedItems(selectedItems.filter(item => item.productId !== productId))
    } else {
      const current = selectedItems.find((item) => item.productId === productId)
      if (current?.trackInventory && quantity > current.available) {
        setFieldErrors((errors) => ({ ...errors, items: `${current.productName}: ${current.available} disponible${current.available > 1 ? 's' : ''}` }))
        return
      }
      setSelectedItems(selectedItems.map(item =>
        item.productId === productId ? { ...item, quantity } : item
      ))
      clearFieldError('items')
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
  const MARKETPLACES: Record<string, { taux: number; fixe: number }> = {
    'Jumia': { taux: 15, fixe: 6 },
    'Marjane Mall': { taux: 15, fixe: 0 },
  }
  const estMarketplace = formData.sourceChannel in MARKETPLACES
  const sansLivraison = formData.handToHand || estMarketplace
  const selectedDistrict = sansLivraison
    ? undefined
    : districts.find((district) => district.id === Number(formData.districtId))
  const deliveryCost = selectedDistrict ? Number(selectedDistrict.price) : 0
  const deliveryCharged = sansLivraison ? 0 : Math.max(0, Number(formData.deliveryFeeCharged) || 0)
  const orderTotal = productsTotal - Number(formData.discount) + deliveryCharged
  const productsCost = selectedItems.reduce((sum, item) => sum + item.costPrice * item.quantity, 0)
  const missingCostCount = selectedItems.filter((item) => item.costPrice <= 0).length
  const commission = estMarketplace
    ? Math.round(((productsTotal * (Number(formData.commissionTaux) || 0)) / 100
        + (Number(formData.commissionFixe) || 0)) * 100) / 100
    : 0
  const estimatedProfit = orderTotal - productsCost - deliveryCost - commission
  const estimatedMargin = productsTotal - Number(formData.discount) > 0
    ? (estimatedProfit / (productsTotal - Number(formData.discount))) * 100
    : 0
  const prepaid = formData.paymentMethod === 'VIREMENT' || formData.paymentMethod === 'CARD'
  const effectivePaidAmount = formData.paymentMethod === 'CARD' ? orderTotal : Number(formData.paidAmount || 0)
  const paidDifference = prepaid ? effectivePaidAmount - orderTotal : 0

  const validateBeforeSubmit = () => {
    const next: Record<string, string> = {}
    if (formData.deliveryName.trim().length < 2) next.deliveryName = 'Indique le nom de la cliente.'
    if (!estMarketplace && !/^(06|07)\d{8}$/.test(formData.deliveryPhone.replace(/\s+/g, ''))) {
      next.deliveryPhone = 'Utilise 10 chiffres commençant par 06 ou 07.'
    }
    if (selectedItems.length === 0) next.items = 'Ajoute au moins un produit.'
    if (selectedItems.some((item) => item.unitPrice <= 0)) next.items = 'Chaque produit doit avoir un prix supérieur à 0.'
    if (Number(formData.discount) < 0) next.discountTotal = 'La remise ne peut pas être négative.'
    if (Number(formData.discount) > productsTotal) next.discountTotal = 'La remise dépasse le total des produits.'
    if (commission > productsTotal) next.channelCommission = 'La commission dépasse le total des produits.'
    if (sansLivraison && !formData.handToHandCity.trim()) next.deliveryCity = 'Indique une ville réelle.'
    if (!sansLivraison && !selectedDistrict) next.senditDistrictId = 'Choisis la zone Sendit exacte.'
    if (!sansLivraison && formData.deliveryAddress.trim().length < 5) next.deliveryAddress = 'L’adresse Sendit doit contenir au moins 5 caractères.'
    if (prepaid && !(effectivePaidAmount > 0)) next.paidAmount = 'Indique le montant réellement encaissé.'
    if (prepaid && !formData.paidAt) next.paidAt = 'Indique la date d’encaissement.'
    if (effectivePaidAmount > orderTotal + 0.01) next.paidAmount = 'Le montant encaissé dépasse le total client.'
    if (formData.paymentMethod === 'CARD' && Math.abs(paidDifference) > 0.01) next.paidAmount = 'Le paiement carte doit couvrir exactement le total client.'
    setFieldErrors(next)
    if (Object.keys(next).length > 0) {
      setError('Vérifie les champs signalés avant de créer la commande.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return false
    }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateBeforeSubmit()) return
    setSaving(true)
    setError(null)
    setCreatedWarning(null)

    try {
      /* Deux chemins qui s'excluent : soit un transporteur et son district
         facture, soit une remise en main propre a 0 MAD. On ne lit JAMAIS
         `selectedDistrict` dans le second cas — c'est precisement ce couplage
         qui rendait la vente de la main a la main impossible a saisir. */
      let deliveryCity: string
      let senditDistrictId: number | undefined

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
      } else {
        if (!selectedDistrict) {
          throw new Error('Destination Sendit invalide')
        }
        deliveryCity = selectedDistrict.name
        senditDistrictId = selectedDistrict.id
      }

      const payload = {
        sourceChannel: formData.sourceChannel,
        handToHand: formData.handToHand,
        channelCommission: commission,
        deliveryName: formData.deliveryName,
        deliveryPhone: formData.deliveryPhone || undefined,
        marketplace: estMarketplace,
        deliveryCity,
        senditDistrictId,
        deliveryAddress: formData.deliveryAddress,
        deliveryNotes: formData.deliveryNotes,
        paymentMethod: formData.paymentMethod,
        paidAmount: prepaid ? effectivePaidAmount : undefined,
        paidAt: prepaid ? formData.paidAt : undefined,
        paymentReference: prepaid ? formData.paymentReference : undefined,
        notes: formData.notes,
        confirmImmediately: formData.confirmImmediately,
        items: selectedItems,
        discountTotal: formData.discount,
        deliveryFeeCharged: deliveryCharged,
        estimatedDeliveryCost: deliveryCost,
      }

      const res = await fetch('/api/ops/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json()
        if (errorData.details && typeof errorData.details === 'object') {
          const serverErrors = Object.fromEntries(
            Object.entries(errorData.details).map(([field, messages]) => [
              field,
              Array.isArray(messages) ? String(messages[0] || '') : String(messages),
            ])
          )
          setFieldErrors(serverErrors)
          throw new Error('Le serveur a refusé certains champs. Vérifie les indications du formulaire.')
        }
        throw new Error(String(errorData.details || errorData.error || 'Impossible de créer la commande'))
      }

      const order = await res.json()
      if (order._warning) {
        setCreatedWarning({ id: order.id, number: order.orderNumber || `#${order.id}`, warning: order._warning })
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      router.push(`/orders/${order.id}`)
    } catch (err: unknown) {
      console.error('Create order error:', err)
      setError(err instanceof Error ? err.message : String(err))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSaving(false)
    }
  }

  const changeSource = (sourceChannel: string) => {
    const rate = MARKETPLACES[sourceChannel]
    setFormData((current) => ({
      ...current,
      sourceChannel,
      handToHand: rate ? false : current.handToHand,
      commissionTaux: rate ? String(rate.taux) : '',
      commissionFixe: rate ? String(rate.fixe) : '',
      deliveryFeeCharged: rate
        ? '0'
        : current.handToHand
          ? '0'
          : String(districts.find((district) => district.id === Number(current.districtId))?.price ?? current.deliveryFeeCharged),
    }))
    clearFieldError('marketplace')
  }

  const changeDeliveryMode = (handToHand: boolean) => {
    setFormData((current) => ({
      ...current,
      handToHand,
      deliveryFeeCharged: handToHand
        ? '0'
        : String(districts.find((district) => district.id === Number(current.districtId))?.price ?? current.deliveryFeeCharged),
    }))
    clearFieldError('senditDistrictId')
    clearFieldError('deliveryCity')
  }

  const changePaymentMethod = (paymentMethod: string) => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(new Date())
    setFormData((current) => ({
      ...current,
      paymentMethod,
      paidAmount: paymentMethod === 'VIREMENT' ? current.paidAmount : '',
      paidAt: paymentMethod === 'VIREMENT' || paymentMethod === 'CARD' ? (current.paidAt || today) : '',
      paymentReference: paymentMethod === 'COD' ? '' : current.paymentReference,
    }))
    clearFieldError('paidAmount')
    clearFieldError('paidAt')
  }

  return (
    <BosShell title="Nouvelle commande" active="orders" crumb="Opérations">
      <div className="page-inner order-create-page">
        <PageHead
          title="Nouvelle commande"
          note="Saisie guidée avec contrôle du stock, du paiement, de la destination Sendit et de la marge avant validation."
          actions={<Link href="/orders" className="btn-modern btn-secondary">Retour aux commandes</Link>}
        />

        {error && (
          <div className="form-banner error-banner" role="alert">
            <AlertTriangle size={17} />
            <div><strong>Commande à vérifier</strong><p>{error}</p></div>
          </div>
        )}

        {createdWarning && (
          <div className="form-banner warning-banner" role="status">
            <CheckCircle2 size={18} />
            <div>
              <strong>Commande {createdWarning.number} créée</strong>
              <p>{createdWarning.warning}</p>
              <Link href={`/orders/${createdWarning.id}`}>Ouvrir la commande</Link>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="order-create-layout" noValidate>
          <div className="order-form-column">
          <div className="panel mb16 context-panel">
            <div className="panel-head">
              <Store size={16} style={{ color: 'var(--tx-mid)' }} />
              <h3>Contexte de la vente</h3>
              <span className="section-status">1</span>
            </div>
            <div className="panel-pad" style={{ padding: '18px' }}>
              <div className="form-grid-2">
                <div className="form-field">
                  <label className="form-label" htmlFor="source-channel">Canal de vente</label>
                  <select id="source-channel" className="form-input" value={formData.sourceChannel} onChange={(event) => changeSource(event.target.value)}>
                    <option value="Manual">Manuel</option>
                    <option value="Jumia">Jumia</option>
                    <option value="Marjane Mall">Marjane Mall</option>
                    <option value="Famille">Famille / proches</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Instagram">Instagram</option>
                    <option value="TikTok">TikTok</option>
                    <option value="Phone">Téléphone</option>
                  </select>
                </div>
                <fieldset className="form-field mode-field">
                  <legend className="form-label">Prise en charge</legend>
                  {estMarketplace ? (
                    <div className="mode-confirmed"><Store size={15} />Livrée par {formData.sourceChannel}</div>
                  ) : (
                    <div className="mode-switch" role="group" aria-label="Mode de livraison">
                      <button type="button" className={!formData.handToHand ? 'active' : ''} onClick={() => changeDeliveryMode(false)}><Truck size={15} />Sendit</button>
                      <button type="button" className={formData.handToHand ? 'active' : ''} onClick={() => changeDeliveryMode(true)}><Hand size={15} />Main propre</button>
                    </div>
                  )}
                </fieldset>
              </div>
              <p className="context-note">
                {estMarketplace
                  ? 'La marketplace gère la livraison. La vente est enregistrée comme réalisée et sa commission est déduite du profit.'
                  : formData.handToHand
                    ? 'Aucun transporteur ni frais de livraison. La commande est enregistrée comme livrée.'
                    : 'Le district exact détermine le coût Sendit et évite l’affectation à une mauvaise zone.'}
              </p>
            </div>
          </div>

          {/* Customer Information */}
          <div className="panel mb16">
            <div className="panel-head">
              <User size={16} style={{ color: 'var(--tx-mid)' }} />
              <h3>Cliente et destination</h3>
              <span className="section-status">2</span>
            </div>
            <div className="panel-pad" style={{ padding: '20px 18px' }}>
              <div className="form-grid-2 mb16">
                <div className="form-field">
                  <label className="form-label" htmlFor="delivery-name">
                    Nom complet <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <input
                    id="delivery-name"
                    type="text"
                    className={`form-input ${fieldErrors.deliveryName ? 'has-error' : ''}`}
                    value={formData.deliveryName}
                    onChange={(e) => { setFormData({ ...formData, deliveryName: e.target.value }); clearFieldError('deliveryName') }}
                    placeholder="Nom de la cliente"
                    aria-invalid={Boolean(fieldErrors.deliveryName)}
                  />
                  {fieldErrors.deliveryName && <span className="field-error">{fieldErrors.deliveryName}</span>}
                </div>
                <div className="form-field">
                  <label className="form-label" htmlFor="delivery-phone">
                    Téléphone {!estMarketplace && <span style={{ color: 'var(--red)' }}>*</span>}
                  </label>
                  <div className="input-icon">
                    <Phone size={14} style={{ color: 'var(--tx-lo)' }} />
                    <input
                      id="delivery-phone"
                      type="tel"
                      className={`form-input ${fieldErrors.deliveryPhone ? 'has-error' : ''}`}
                      style={{ paddingLeft: 34 }}
                      value={formData.deliveryPhone}
                      onChange={(e) => { setFormData({ ...formData, deliveryPhone: e.target.value }); clearFieldError('deliveryPhone') }}
                      onBlur={() => setFormData((current) => ({ ...current, deliveryPhone: current.deliveryPhone.replace(/\s+/g, '') }))}
                      placeholder={estMarketplace ? 'Non communiqué par la place de marché' : '06XXXXXXXX'}
                      inputMode="tel"
                      aria-invalid={Boolean(fieldErrors.deliveryPhone)}
                    />
                  </div>
                  {fieldErrors.deliveryPhone && <span className="field-error">{fieldErrors.deliveryPhone}</span>}
                  {estMarketplace && (
                    <p style={{ fontSize: 11, color: 'var(--tx-lo)', marginTop: 5 }}>
                      Facultatif : {formData.sourceChannel} ne le transmet pas. Ces ventes ne
                      compteront donc pas dans « clientes », qui dénombre les numéros distincts.
                    </p>
                  )}
                </div>
              </div>

              {sansLivraison ? (
                <div className="form-field mb16">
                  <label className="form-label" htmlFor="direct-city">
                    <MapPin size={14} style={{ marginRight: 6 }} />
                    {estMarketplace ? 'Ville de livraison' : 'Ville de la remise'} <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <input
                    id="direct-city"
                    type="text"
                    className={`form-input ${fieldErrors.deliveryCity ? 'has-error' : ''}`}
                    value={formData.handToHandCity}
                    onChange={(e) => { setFormData({ ...formData, handToHandCity: e.target.value }); clearFieldError('deliveryCity') }}
                    placeholder="Tanger, Casablanca…"
                    aria-invalid={Boolean(fieldErrors.deliveryCity)}
                  />
                  {fieldErrors.deliveryCity && <span className="field-error">{fieldErrors.deliveryCity}</span>}
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--tx-mid)', marginTop: 6 }}>
                    Une vraie ville : c&apos;est ce champ qui alimente la géographie des ventes.
                  </span>
                </div>
              ) : (
                <div className="form-field mb16">
                  <label className="form-label" htmlFor="district-search">
                    <MapPin size={14} style={{ marginRight: 6 }} />
                    Ville et quartier Sendit <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <DistrictSearchPicker
                    districts={districts}
                    selectedId={formData.districtId ? Number(formData.districtId) : null}
                    loading={loadingDistricts}
                    error={fieldErrors.senditDistrictId}
                    onSelect={(district) => {
                      setFormData((current) => ({
                        ...current,
                        districtId: district ? String(district.id) : '',
                        deliveryFeeCharged: district ? String(district.price) : '',
                      }))
                      clearFieldError('senditDistrictId')
                    }}
                  />
                  {selectedDistrict && (
                    <div className="fee-preview">
                      <div>
                        <span className="fee-label">Coût Sendit</span>
                        <span className="fee-value">{Number(selectedDistrict.price).toFixed(2)} MAD</span>
                        <span className="fee-detail">{selectedDistrict.delais} · {selectedDistrict.ville}</span>
                      </div>
                      <div className="charged-fee-field">
                        <label htmlFor="delivery-charged">Facturé à la cliente</label>
                        <div><input id="delivery-charged" type="number" min="0" step="0.01" value={formData.deliveryFeeCharged} onChange={(event) => setFormData((current) => ({ ...current, deliveryFeeCharged: event.target.value }))} /><span>MAD</span></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="form-field mb16">
                <label className="form-label" htmlFor="delivery-address">Adresse de livraison {!sansLivraison && <span style={{ color: 'var(--red)' }}>*</span>}</label>
                <textarea
                  id="delivery-address"
                  className={`form-input ${fieldErrors.deliveryAddress ? 'has-error' : ''}`}
                  value={formData.deliveryAddress}
                  onChange={(e) => { setFormData({ ...formData, deliveryAddress: e.target.value }); clearFieldError('deliveryAddress') }}
                  placeholder={sansLivraison ? 'Facultatif' : 'Rue, numéro, résidence et repère utile'}
                  rows={2}
                  style={{ resize: 'vertical', minHeight: 60 }}
                  aria-invalid={Boolean(fieldErrors.deliveryAddress)}
                />
                {fieldErrors.deliveryAddress && <span className="field-error">{fieldErrors.deliveryAddress}</span>}
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="delivery-notes">Instructions de livraison</label>
                <textarea
                  id="delivery-notes"
                  className="form-input"
                  value={formData.deliveryNotes}
                  onChange={(e) => setFormData({ ...formData, deliveryNotes: e.target.value })}
                  placeholder="Appeler avant livraison, code d’accès…"
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
              <h3>Produits</h3>
              <span className="section-status">3</span>
              {selectedItems.length > 0 && (
                <div className="spacer"></div>
              )}
              {selectedItems.length > 0 && (
                <div className="product-total">
                  {selectedItems.length} ligne{selectedItems.length > 1 ? 's' : ''} · <span className="mono">{productsTotal.toFixed(2)} MAD</span>
                </div>
              )}
            </div>
            <div className="panel-pad" style={{ padding: '20px 18px' }}>
              {/* Product Search */}
              <div className="form-field mb16">
                <label className="form-label" htmlFor="product-search">Ajouter un produit</label>
                <ProductSearchPicker
                  products={products}
                  selectedIds={selectedItems.map((item) => item.productId)}
                  loading={loadingProducts}
                  onSelect={addProduct}
                  error={fieldErrors.items}
                />
              </div>

              {/* Selected Products */}
              {selectedItems.length === 0 ? (
                <div className="empty-products">
                  <Package size={32} style={{ color: 'var(--tx-faint)', opacity: 0.5 }} />
                  <p>Aucun produit ajouté</p>
                  <small>Recherche par nom, marque ou SKU pour composer la commande.</small>
                </div>
              ) : (
                <div className="products-list">
                  {selectedItems.map((item) => (
                    <div key={item.productId} className="product-item">
                      <div className="product-info">
                        <div>
                          <div className="product-name">{item.productName}</div>
                          <div className="product-meta">
                            <span>{item.costPrice > 0 ? `Coût ${item.costPrice.toFixed(2)} MAD` : 'Coût manquant'}</span>
                            <span>{item.trackInventory ? `${item.available} disponible${item.available > 1 ? 's' : ''}` : 'Stock non suivi'}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(item.productId)}
                          className="product-remove"
                          aria-label={`Retirer ${item.productName}`}
                          title="Retirer le produit"
                        >
                          <X size={15} />
                        </button>
                      </div>
                      <div className="product-controls">
                        <div className="product-qty">
                          <button
                            type="button"
                            onClick={() => updateItemQuantity(item.productId, item.quantity - 1)}
                            className="qty-btn"
                            aria-label={`Réduire la quantité de ${item.productName}`}
                          >
                            <Minus size={14} />
                          </button>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItemQuantity(item.productId, parseInt(e.target.value) || 1)}
                            className="qty-input"
                            min="1"
                            max={item.trackInventory ? Math.max(1, item.available) : 100}
                            aria-label={`Quantité de ${item.productName}`}
                          />
                          <button
                            type="button"
                            onClick={() => updateItemQuantity(item.productId, item.quantity + 1)}
                            className="qty-btn"
                            aria-label={`Augmenter la quantité de ${item.productName}`}
                            disabled={item.trackInventory && item.quantity >= item.available}
                          >
                            <Plus size={14} />
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
                            min="0.01"
                            aria-label={`Prix unitaire de ${item.productName}`}
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
                        <span>Sous-total produits</span>
                        <span className="mono">{productsTotal.toFixed(2)} MAD</span>
                      </div>
                      <div className="pricing-row">
                        <label htmlFor="order-discount">Remise</label>
                        <input
                          id="order-discount"
                          type="number"
                          value={formData.discount}
                          onChange={(e) => { setFormData({ ...formData, discount: parseFloat(e.target.value) || 0 }); clearFieldError('discountTotal') }}
                          className={`discount-input ${fieldErrors.discountTotal ? 'has-error' : ''}`}
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          max={productsTotal}
                          aria-invalid={Boolean(fieldErrors.discountTotal)}
                        />
                      </div>
                      {fieldErrors.discountTotal && <span className="field-error pricing-error">{fieldErrors.discountTotal}</span>}
                      <div className="pricing-row">
                        <span>Livraison facturée</span>
                        <span className="mono">{deliveryCharged.toFixed(2)} MAD</span>
                      </div>
                      <div className="pricing-row total">
                        <span>Total client</span>
                        <span className="mono">{orderTotal.toFixed(2)} MAD</span>
                      </div>
                      {commission > 0 && (
                        <div className="pricing-row muted-row">
                          <span>Commission {formData.sourceChannel}</span>
                          <span className="mono">− {commission.toFixed(2)} MAD</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Payment and validation */}
          <div className="panel mb16">
            <div className="panel-head">
              <CreditCard size={16} style={{ color: 'var(--tx-mid)' }} />
              <h3>Paiement et validation</h3>
              <span className="section-status">4</span>
            </div>
            <div className="panel-pad" style={{ padding: '20px 18px' }}>
              <div className="form-field mb16">
                <label className="form-label" htmlFor="payment-method">Mode de paiement</label>
                <select id="payment-method" className="form-input" value={formData.paymentMethod} onChange={(e) => changePaymentMethod(e.target.value)}>
                  <option value="COD">{estMarketplace ? `Paiement via ${formData.sourceChannel}` : formData.handToHand ? 'Espèces à la remise' : 'Paiement à la livraison (COD Sendit)'}</option>
                  <option value="VIREMENT">Virement bancaire</option>
                  <option value="CARD">Carte</option>
                </select>
              </div>

              {estMarketplace && (
                <div className="commission-card mb16">
                  <label className="form-label" style={{ margin: 0 }}>
                    <Store size={14} style={{ marginRight: 6 }} /> Commission {formData.sourceChannel}
                  </label>
                  <p className="commission-note">
                    Barème prérempli. Le montant calculé sera enregistré avec la commande et déduit du profit.
                  </p>
                  <div className="commission-grid">
                    <div>
                      <label htmlFor="commission-rate">Taux (%)</label>
                      <input
                        id="commission-rate" type="number" min="0" max="100" step="0.1" className="form-input" placeholder="15"
                        value={formData.commissionTaux}
                        onChange={(e) => { setFormData({ ...formData, commissionTaux: e.target.value }); clearFieldError('channelCommission') }}
                      />
                    </div>
                    <div>
                      <label htmlFor="commission-fixed">Fixe (MAD)</label>
                      <input
                        id="commission-fixed" type="number" min="0" step="0.01" className="form-input" placeholder="6"
                        value={formData.commissionFixe}
                        onChange={(e) => { setFormData({ ...formData, commissionFixe: e.target.value }); clearFieldError('channelCommission') }}
                      />
                    </div>
                    <div className="commission-total">
                      <span>Commission retenue</span>
                      <strong className="mono">{commission.toFixed(2)} MAD</strong>
                    </div>
                  </div>
                  {productsTotal === 0 && (
                    <p className="commission-empty">Ajoute les produits pour calculer la part variable.</p>
                  )}
                  {fieldErrors.channelCommission && <span className="field-error">{fieldErrors.channelCommission}</span>}
                </div>
              )}

              {prepaid && (
                <div className="form-grid-2 mb16">
                  <div className="form-field">
                    <label className="form-label" htmlFor="paid-amount">Montant encaissé (MAD)</label>
                    <input id="paid-amount" type="number" min="0.01" step="0.01" className={`form-input ${fieldErrors.paidAmount ? 'has-error' : ''}`}
                      value={formData.paymentMethod === 'CARD' ? orderTotal.toFixed(2) : formData.paidAmount}
                      onChange={(e) => { setFormData({ ...formData, paidAmount: e.target.value }); clearFieldError('paidAmount') }}
                      readOnly={formData.paymentMethod === 'CARD'} aria-invalid={Boolean(fieldErrors.paidAmount)} />
                    {fieldErrors.paidAmount && <span className="field-error">{fieldErrors.paidAmount}</span>}
                    {!fieldErrors.paidAmount && formData.paymentMethod === 'VIREMENT' && effectivePaidAmount > 0 && (
                      <span className={`payment-balance ${Math.abs(paidDifference) <= 0.01 ? 'exact' : ''}`}>
                        {Math.abs(paidDifference) <= 0.01 ? 'Montant exact' : paidDifference < 0 ? `Reste à encaisser ${Math.abs(paidDifference).toFixed(2)} MAD` : `Excédent ${paidDifference.toFixed(2)} MAD`}
                      </span>
                    )}
                  </div>
                  <div className="form-field">
                    <label className="form-label" htmlFor="paid-at">Date d’encaissement</label>
                    <input id="paid-at" type="date" className={`form-input ${fieldErrors.paidAt ? 'has-error' : ''}`} value={formData.paidAt}
                      onChange={(e) => { setFormData({ ...formData, paidAt: e.target.value }); clearFieldError('paidAt') }} aria-invalid={Boolean(fieldErrors.paidAt)} />
                    {fieldErrors.paidAt && <span className="field-error">{fieldErrors.paidAt}</span>}
                  </div>
                  <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label" htmlFor="payment-reference">Référence du paiement</label>
                    <input id="payment-reference" type="text" className="form-input" value={formData.paymentReference}
                      onChange={(e) => setFormData({ ...formData, paymentReference: e.target.value })}
                      placeholder={formData.paymentMethod === 'CARD' ? 'Référence de transaction' : 'Référence ou note du virement'} />
                  </div>
                </div>
              )}

              <div className="form-field mb16">
                <label className="form-label" htmlFor="internal-notes">
                  <FileText size={14} style={{ marginRight: 6 }} />
                  Notes internes
                </label>
                <textarea
                  id="internal-notes"
                  className="form-input"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Informations privées pour l’équipe"
                  rows={2}
                  style={{ resize: 'vertical', minHeight: 60 }}
                />
              </div>

              {!sansLivraison && <div className="auto-confirm-card">
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
                    <span className="auto-title">Confirmer et créer l’envoi Sendit</span>
                  </label>
                  <p className="auto-desc">
                    Désactive cette option pour enregistrer un brouillon sans envoyer le colis à Sendit.
                  </p>
                </div>
              </div>}
            </div>
          </div>
          </div>

          <aside className="order-summary-column" aria-label="Récapitulatif de la commande">
            <div className="panel summary-panel">
              <div className="panel-head"><h3>Récapitulatif</h3></div>
              <div className="summary-body">
                <div className="summary-row"><span>Produits</span><strong className="mono">{productsTotal.toFixed(2)} MAD</strong></div>
                <div className="summary-row"><span>Remise</span><strong className="mono negative">− {Number(formData.discount).toFixed(2)} MAD</strong></div>
                <div className="summary-row"><span>Livraison facturée</span><strong className="mono">{deliveryCharged.toFixed(2)} MAD</strong></div>
                <div className="summary-row summary-total"><span>Total client</span><strong className="mono">{orderTotal.toFixed(2)} MAD</strong></div>

                <div className="summary-section-title">Coûts et profit estimés</div>
                <div className="summary-row"><span>Coût produits</span><strong className="mono">{productsCost.toFixed(2)} MAD</strong></div>
                {!sansLivraison && <div className="summary-row"><span>Coût Sendit</span><strong className="mono">{deliveryCost.toFixed(2)} MAD</strong></div>}
                {commission > 0 && <div className="summary-row"><span>Commission</span><strong className="mono">{commission.toFixed(2)} MAD</strong></div>}
                <div className={`profit-box ${estimatedProfit < 0 ? 'loss' : ''}`}>
                  <span>Profit estimé</span>
                  <strong className="mono">{estimatedProfit.toFixed(2)} MAD</strong>
                  <small>{estimatedMargin.toFixed(1)} % de marge</small>
                </div>
                {missingCostCount > 0 && (
                  <div className="summary-warning"><AlertTriangle size={14} /><span>{missingCostCount} coût produit manquant : le profit est surestimé.</span></div>
                )}

                <div className="payment-summary">
                  <CreditCard size={15} />
                  <div>
                    <strong>{formData.paymentMethod !== 'COD' ? 'Déjà encaissé' : estMarketplace ? `À rapprocher avec ${formData.sourceChannel}` : formData.handToHand ? 'Encaissé à la remise' : 'À encaisser par Sendit'}</strong>
                    <span>{formData.paymentMethod === 'COD' ? `${orderTotal.toFixed(2)} MAD` : `${effectivePaidAmount.toFixed(2)} MAD · ${formData.paymentMethod === 'CARD' ? 'Carte' : 'Virement'}`}</span>
                  </div>
                </div>

                <button type="submit" className="btn primary summary-submit" disabled={saving || Boolean(createdWarning)}>
                  {createdWarning ? 'Commande créée' : saving ? 'Création en cours…' : !sansLivraison && formData.confirmImmediately ? 'Créer et envoyer à Sendit' : 'Créer la commande'}
                </button>
                <Link href="/orders" className="btn summary-cancel">Annuler</Link>
                {!sansLivraison && formData.confirmImmediately && <p className="submit-note">La commande sera transmise à Sendit immédiatement.</p>}
              </div>
            </div>
          </aside>

          <div className="mobile-actions">
            <div><span>Total client</span><strong className="mono">{orderTotal.toFixed(2)} MAD</strong></div>
            <button type="submit" className="btn primary" disabled={saving || Boolean(createdWarning)}>
              {saving ? 'Création…' : 'Créer'}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .order-create-page {
          max-width: 1440px;
          padding-bottom: 40px;
        }

        .order-create-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 340px;
          gap: 18px;
          align-items: start;
        }

        .order-form-column {
          min-width: 0;
        }

        .order-summary-column {
          min-width: 0;
          position: sticky;
          top: 76px;
        }

        .form-banner {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          margin-bottom: 16px;
          padding: 13px 14px;
          border: 1px solid var(--line);
          border-radius: var(--radius-sm);
          font-size: 13px;
        }

        .form-banner svg {
          flex: 0 0 auto;
          margin-top: 1px;
        }

        .form-banner strong,
        .form-banner p {
          display: block;
          margin: 0;
        }

        .form-banner p {
          margin-top: 3px;
          color: var(--tx-mid);
          line-height: 1.45;
        }

        .form-banner a {
          display: inline-block;
          margin-top: 7px;
          color: var(--tx-hi);
          font-weight: 700;
          text-decoration: underline;
        }

        .error-banner {
          background: var(--red-bg);
          border-color: var(--red);
          color: var(--red);
        }

        .warning-banner {
          background: var(--amber-bg);
          border-color: var(--amber);
          color: var(--tx-hi);
        }

        .context-panel {
          border-color: var(--line);
        }

        .section-status {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          margin-left: auto;
          border: 1px solid var(--line);
          border-radius: 50%;
          color: var(--tx-mid);
          font-family: var(--mono);
          font-size: 11px;
          font-weight: 700;
        }

        .mode-field {
          min-width: 0;
          margin: 0;
          padding: 0;
          border: 0;
        }

        .mode-switch {
          display: grid;
          grid-template-columns: 1fr 1fr;
          padding: 3px;
          min-height: 44px;
          border: 1px solid var(--line-soft);
          border-radius: var(--radius-sm);
          background: var(--bg-inset);
        }

        .mode-switch button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 0;
          border-radius: 5px;
          background: transparent;
          color: var(--tx-mid);
          font: inherit;
          font-size: 12.5px;
          font-weight: 650;
          cursor: pointer;
        }

        .mode-switch button.active {
          background: var(--bg-1);
          color: var(--tx-hi);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
        }

        .mode-switch button:focus-visible {
          outline: 2px solid var(--rose);
          outline-offset: 1px;
        }

        .mode-confirmed {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 44px;
          padding: 0 12px;
          border: 1px solid var(--line);
          border-radius: var(--radius-sm);
          background: var(--bg-inset);
          color: var(--tx-hi);
          font-size: 12.5px;
          font-weight: 650;
        }

        .context-note {
          margin: 12px 0 0;
          color: var(--tx-lo);
          font-size: 12px;
          line-height: 1.5;
        }

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
          min-height: 44px;
          width: 100%;
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
          box-shadow: 0 0 0 3px var(--rose-bg);
        }

        .form-input::placeholder {
          color: var(--tx-faint);
        }

        .form-input.has-error,
        .discount-input.has-error {
          border-color: var(--red);
        }

        .field-error {
          display: block;
          margin-top: 6px;
          color: var(--red);
          font-size: 11.5px;
          line-height: 1.4;
        }

        .pricing-error {
          margin-top: -4px;
          text-align: right;
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
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(190px, 0.7fr);
          gap: 16px;
          align-items: end;
          margin-top: 12px;
          padding: 12px 14px;
          background: var(--bg-inset);
          border: 1px solid var(--line);
          border-radius: var(--radius-sm);
        }

        .fee-label {
          display: block;
          margin-bottom: 3px;
          font-size: 10.5px;
          font-weight: 600;
          color: var(--tx-mid);
          text-transform: uppercase;
          letter-spacing: 0;
        }

        .fee-value {
          display: block;
          font-size: 16px;
          font-weight: 700;
          font-family: var(--mono);
          color: var(--tx-hi);
        }

        .fee-detail {
          display: block;
          margin-top: 3px;
          font-size: 11px;
          color: var(--tx-lo);
        }

        .charged-fee-field label,
        .commission-grid label {
          display: block;
          margin-bottom: 5px;
          color: var(--tx-mid);
          font-size: 11px;
          font-weight: 600;
        }

        .charged-fee-field > div {
          display: flex;
          align-items: center;
          min-height: 38px;
          padding: 0 10px;
          border: 1px solid var(--line-soft);
          border-radius: var(--radius-sm);
          background: var(--bg-1);
        }

        .charged-fee-field input {
          min-width: 0;
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          color: var(--tx-hi);
          font-family: var(--mono);
          font-weight: 700;
        }

        .charged-fee-field span {
          color: var(--tx-lo);
          font-size: 11px;
        }

        .auto-confirm-card {
          display: flex;
          gap: 12px;
          padding: 14px;
          background: var(--bg-inset);
          border: 1px solid var(--line-soft);
          border-radius: var(--radius-sm);
        }

        .auto-icon {
          width: 36px;
          height: 36px;
          border-radius: var(--radius-sm);
          background: var(--green-bg);
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

        .commission-card {
          padding: 14px;
          border: 1px solid var(--line);
          border-radius: var(--radius-sm);
          background: var(--bg-inset);
        }

        .commission-note {
          margin: 5px 0 12px;
          color: var(--tx-lo);
          font-size: 11.5px;
          line-height: 1.45;
        }

        .commission-grid {
          display: grid;
          grid-template-columns: 110px 120px minmax(150px, 1fr);
          gap: 10px;
          align-items: end;
        }

        .commission-total {
          min-height: 44px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: flex-end;
        }

        .commission-total span {
          color: var(--tx-lo);
          font-size: 10.5px;
        }

        .commission-total strong {
          margin-top: 3px;
          color: var(--rose-bright);
          font-size: 15px;
        }

        .commission-empty {
          margin: 8px 0 0;
          color: var(--amber);
          font-size: 11px;
        }

        .payment-balance {
          margin-top: 6px;
          color: var(--amber);
          font-size: 11.5px;
          font-weight: 650;
        }

        .payment-balance.exact {
          color: var(--green);
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
          line-height: 1.4;
        }

        .product-meta {
          display: flex;
          gap: 10px;
          margin-top: 4px;
          color: var(--tx-lo);
          font-size: 10.5px;
        }

        .product-remove {
          background: none;
          border: none;
          color: var(--tx-faint);
          cursor: pointer;
          padding: 4px 8px;
          border-radius: var(--radius-sm);
          transition: all 0.15s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
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

        .qty-btn:disabled {
          cursor: not-allowed;
          opacity: 0.35;
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

        .muted-row {
          color: var(--tx-lo);
          font-size: 11.5px;
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

        .summary-panel {
          overflow: hidden;
        }

        .summary-body {
          padding: 16px;
        }

        .summary-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          padding: 6px 0;
          color: var(--tx-mid);
          font-size: 12px;
        }

        .summary-row strong {
          flex: 0 0 auto;
          color: var(--tx-hi);
          font-size: 12px;
        }

        .summary-row .negative {
          color: var(--tx-mid);
        }

        .summary-total {
          margin-top: 7px;
          padding: 13px 0;
          border-top: 1px solid var(--line);
          border-bottom: 1px solid var(--line);
          color: var(--tx-hi);
          font-size: 14px;
          font-weight: 700;
        }

        .summary-total strong {
          color: var(--rose-bright);
          font-size: 18px;
        }

        .summary-section-title {
          margin: 17px 0 5px;
          color: var(--tx-lo);
          font-size: 10.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0;
        }

        .profit-box {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 3px 10px;
          margin-top: 10px;
          padding: 12px;
          border: 1px solid var(--green);
          border-radius: var(--radius-sm);
          background: var(--green-bg);
          color: var(--green);
        }

        .profit-box > span {
          align-self: center;
          font-size: 12px;
          font-weight: 700;
        }

        .profit-box strong {
          font-size: 16px;
        }

        .profit-box small {
          grid-column: 1 / -1;
          color: var(--tx-mid);
          font-size: 10.5px;
        }

        .profit-box.loss {
          border-color: var(--red);
          background: var(--red-bg);
          color: var(--red);
        }

        .summary-warning {
          display: flex;
          gap: 7px;
          align-items: flex-start;
          margin-top: 9px;
          color: var(--amber);
          font-size: 10.5px;
          line-height: 1.4;
        }

        .summary-warning svg {
          flex: 0 0 auto;
        }

        .payment-summary {
          display: flex;
          gap: 9px;
          align-items: flex-start;
          margin: 16px 0;
          padding: 11px 0;
          border-top: 1px solid var(--line-soft);
          border-bottom: 1px solid var(--line-soft);
          color: var(--tx-mid);
        }

        .payment-summary > div {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .payment-summary strong {
          color: var(--tx-hi);
          font-size: 11.5px;
        }

        .payment-summary span {
          font-size: 11px;
        }

        .summary-submit,
        .summary-cancel {
          width: 100%;
          min-height: 42px;
          justify-content: center;
          text-align: center;
        }

        .summary-cancel {
          margin-top: 8px;
        }

        .submit-note {
          margin: 9px 0 0;
          color: var(--tx-lo);
          font-size: 10.5px;
          line-height: 1.4;
          text-align: center;
        }

        .mobile-actions {
          display: none;
        }

        @media (max-width: 1160px) {
          .order-create-layout {
            grid-template-columns: minmax(0, 1fr) 300px;
          }

          .commission-grid {
            grid-template-columns: 1fr 1fr;
          }

          .commission-total {
            grid-column: 1 / -1;
            align-items: flex-start;
          }
        }

        @media (max-width: 920px) {
          .order-create-layout {
            grid-template-columns: minmax(0, 1fr);
          }

          .order-summary-column {
            position: static;
          }
        }

        @media (max-width: 768px) {
          .order-create-page {
            padding-bottom: 88px;
          }

          .form-grid-2 {
            grid-template-columns: 1fr;
          }

          .fee-preview {
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

          .commission-grid {
            grid-template-columns: 1fr 1fr;
          }

          .summary-submit,
          .summary-cancel,
          .submit-note {
            display: none;
          }

          .mobile-actions {
            position: fixed;
            z-index: 30;
            right: 0;
            bottom: 0;
            left: 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
            padding: 10px max(14px, env(safe-area-inset-right)) calc(10px + env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
            border-top: 1px solid var(--line);
            background: var(--bg-1);
            box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08);
          }

          .mobile-actions > div {
            display: flex;
            min-width: 0;
            flex-direction: column;
            gap: 1px;
          }

          .mobile-actions span {
            color: var(--tx-lo);
            font-size: 10.5px;
          }

          .mobile-actions strong {
            color: var(--tx-hi);
            font-size: 14px;
          }

          .mobile-actions .btn {
            min-height: 44px;
            min-width: 112px;
            justify-content: center;
          }
        }

        @media (max-width: 430px) {
          .product-item {
            padding: 12px;
          }

          .product-meta {
            flex-direction: column;
            gap: 2px;
          }

          .pricing-row {
            gap: 8px;
          }

          .pricing-row > span:first-child,
          .pricing-row > label:first-child {
            min-width: 0;
          }
        }
      `}</style>
    </BosShell>
  )
}
