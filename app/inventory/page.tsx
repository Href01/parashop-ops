'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import BosShell from '@/components/BosShell'
import {
  Search, AlertTriangle, Package, PackageCheck, TrendingDown, CheckCircle, XCircle,
  Download, Plus, Minus, DollarSign, History, ArrowUpCircle, ArrowDownCircle,
  Truck, ShoppingCart, ChevronRight, ChevronDown, Trash2, Pencil,
} from 'lucide-react'

type OpenOrder = { orderId: number; qty: number; customer: string; city: string | null; shipped: boolean; status: string; created: string }
type ChannelSale = { channel: string; units: number }
type Product = {
  id: number; name: string; brand: string; image: string; stock: number
  reorderPoint: number; reorderQuantity: number; stockStatus: string
  supplier: string; costPrice: number; weeklySales: number
  activeAlerts: number
  committed: number; toShip: number; inTransit: number; available: number
  toShipOrders: number; openOrdersCount: number; openOrders: OpenOrder[]
  sold30d: number; daysLeft: number | null; salesByChannel: ChannelSale[]
  suggestedReorder: number
}
type ToShipItem = { productId: number; name: string; brand: string; qty: number; stock: number }
type ToShipOrder = { id: number; customer: string; city: string; phone: string | null; status: string; created: string; units: number; canFulfill: boolean; items: ToShipItem[] }
type Summary = {
  totalProducts: number; stockValue: number; shortages: number; lowStock: number; outOfStock: number
  toShipOrders: number; toShipUnits: number; reorderProducts: number; reorderValue: number
}
type Movement = {
  id: number; productId: number; productName: string; productBrand: string; type: string
  quantity: number; stockBefore: number; stockAfter: number; reason: string | null; performedBy: string; createdAt: string
}
type PurchaseProduct = { id: number; name: string; brand: string; supplier: string | null; stock: number; units: number; spent: number; avgCost: number | null; purchases: number; lastPurchase: string | null }
type PurchaseRecent = { id: number; productId: number; name: string; brand: string; quantity: number; costPerUnit: number | null; totalCost: number | null; reason: string | null; notes: string | null; performedBy: string; createdAt: string }
type PurchasesData = {
  days: number
  summary: { totalSpent: number; unitsPurchased: number; purchaseCount: number; lineCount: number; productsRestocked: number }
  byProduct: PurchaseProduct[]
  bySupplier: { supplier: string; spent: number; units: number }[]
  recent: PurchaseRecent[]
}

type Filter = 'all' | 'shortage' | 'low' | 'reorder' | 'demand'
type SortKey = 'available' | 'days' | 'value' | 'sales' | 'name'

const money = (v: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v)
const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
const statusFR: Record<string, string> = { 'In stock': 'En stock', 'Low stock': 'Stock bas', 'Out of stock': 'Rupture', Discontinued: 'Arrêté' }
const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 10 }
const emptyBox: React.CSSProperties = { padding: 22, textAlign: 'center', fontSize: 13, color: 'var(--tx-mid)', border: '1px dashed var(--line-soft)', borderRadius: 10, lineHeight: 1.6 }

/** Demand-aware health: a shortage (committed > stock) outranks the forecast status. */
function health(p: Product): { label: string; cls: string; tone: 'red' | 'amber' | 'green' } {
  if (p.available < 0 || p.stock === 0) return { label: 'Rupture', cls: 'badge red', tone: 'red' }
  if (p.stock <= p.reorderPoint || p.available <= p.reorderPoint || p.stockStatus === 'Low stock') return { label: 'Stock bas', cls: 'badge amber', tone: 'amber' }
  return { label: 'OK', cls: 'badge green', tone: 'green' }
}

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<'stock' | 'ship' | 'purchases' | 'history'>('stock')
  const [products, setProducts] = useState<Product[]>([])
  const [toShip, setToShip] = useState<ToShipOrder[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [purchases, setPurchases] = useState<PurchasesData | null>(null)
  const [purchasesDays, setPurchasesDays] = useState(30)
  const [loadingPurchases, setLoadingPurchases] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMovements, setLoadingMovements] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('available')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  const [adjustModal, setAdjustModal] = useState<{ productId: number; productName: string; currentStock: number; prefill?: number; oldCost?: number } | null>(null)
  const [adjustType, setAdjustType] = useState<'in' | 'out'>('in')
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustCost, setAdjustCost] = useState('')
  const [adjustFree, setAdjustFree] = useState('')
  const [adjustSupplier, setAdjustSupplier] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [supplierModal, setSupplierModal] = useState<{ productId: number; productName: string; currentSupplier: string | null } | null>(null)
  const [supplierInput, setSupplierInput] = useState('')
  const [savingSupplier, setSavingSupplier] = useState(false)

  useEffect(() => {
    if (activeTab === 'history') fetchMovements()
    else if (activeTab === 'purchases') fetchPurchases()
    else fetchInventory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'purchases') fetchPurchases()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchasesDays])

  const fetchPurchases = async () => {
    setLoadingPurchases(true)
    try {
      const res = await fetch(`/api/ops/inventory/purchases?days=${purchasesDays}`, { cache: 'no-store' })
      const data = await res.json()
      setPurchases(res.ok ? data : null)
    } catch (error) {
      console.error('Failed to fetch purchases:', error)
    } finally {
      setLoadingPurchases(false)
    }
  }

  const [deletingId, setDeletingId] = useState<number | null>(null)
  // Undo a manual movement (test/mistaken purchase or adjustment): reverses the
  // stock it applied, then refreshes the affected views.
  const deleteMovement = async (id: number, label: string) => {
    if (!confirm(`Supprimer ce mouvement (${label}) ?\nLe stock ajouté par ce mouvement sera annulé.`)) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/ops/inventory/movement/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Échec de la suppression')
      // Refresh whichever lists are loaded so the row disappears and stock updates.
      await Promise.all([fetchPurchases(), fetchMovements(), fetchInventory()])
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Échec de la suppression')
    } finally {
      setDeletingId(null)
    }
  }

  // Edit a purchase (fix a wrong quantity / cost without deleting + re-adding).
  const [editPurchase, setEditPurchase] = useState<{ id: number; name: string; quantity: string; totalCost: string } | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const saveEditPurchase = async () => {
    if (!editPurchase) return
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/ops/inventory/movement/${editPurchase.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: editPurchase.quantity, totalCost: editPurchase.totalCost }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Échec de la modification')
      setEditPurchase(null)
      await Promise.all([fetchPurchases(), fetchMovements(), fetchInventory()])
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Échec de la modification')
    } finally {
      setSavingEdit(false)
    }
  }

  const fetchInventory = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ops/inventory', { cache: 'no-store' })
      const data = await res.json()
      setProducts(data.products || [])
      setToShip(data.toShip || [])
      setSummary(data.summary || null)
    } catch (error) {
      console.error('Failed to fetch inventory:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchMovements = async () => {
    setLoadingMovements(true)
    try {
      const res = await fetch('/api/ops/inventory/movement?limit=100')
      const data = await res.json()
      setMovements(data.movements || [])
    } catch (error) {
      console.error('Failed to fetch movements:', error)
    } finally {
      setLoadingMovements(false)
    }
  }

  const openAdjustModal = (p: { id: number; name: string; stock: number; costPrice?: number; supplier?: string }, prefill?: number) => {
    setAdjustModal({ productId: p.id, productName: p.name, currentStock: p.stock, prefill, oldCost: p.costPrice })
    setAdjustType('in')
    setAdjustQty(prefill ? String(prefill) : '')
    setAdjustReason('')
    setAdjustCost(p.costPrice ? String(p.costPrice) : '')
    setAdjustSupplier(p.supplier || '')
    setAdjustFree('')
  }

  const submitAdjustment = async () => {
    if (!adjustModal || !adjustQty || Number(adjustQty) <= 0) return
    setAdjusting(true)
    try {
      const isPurchase = adjustType === 'in'
      const res = await fetch('/api/ops/inventory/movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: adjustModal.productId,
          type: isPurchase ? 'Purchase' : 'Adjustment',
          quantity: isPurchase ? Number(adjustQty) : -Number(adjustQty),
          reason: adjustReason || (isPurchase ? 'Réapprovisionnement fournisseur' : 'Ajustement manuel'),
          ...(isPurchase && adjustCost ? { costPerUnit: Number(adjustCost) } : {}),
          ...(isPurchase && Number(adjustFree) > 0 ? { freeUnits: Number(adjustFree) } : {}),
          ...(isPurchase && adjustSupplier.trim() ? { supplier: adjustSupplier.trim(), notes: `Fournisseur: ${adjustSupplier.trim()}` } : {}),
        }),
      })
      if (!res.ok) throw new Error('Failed')
      setAdjustModal(null)
      fetchInventory()
    } catch (error) {
      console.error('Failed to adjust stock:', error)
      alert("Erreur lors de l'ajustement")
    } finally {
      setAdjusting(false)
    }
  }

  const openSupplierModal = (p: Product) => {
    setSupplierModal({ productId: p.id, productName: p.name, currentSupplier: p.supplier })
    setSupplierInput(p.supplier || '')
  }

  const submitSupplier = async () => {
    if (!supplierModal || savingSupplier) return
    setSavingSupplier(true)
    try {
      const res = await fetch(`/api/ops/products/${supplierModal.productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier: supplierInput.trim() || null }),
      })
      if (!res.ok) throw new Error('Failed')
      setSupplierModal(null)
      fetchInventory()
    } catch (error) {
      console.error('Failed to update supplier:', error)
      alert('Erreur lors de la mise à jour')
    } finally {
      setSavingSupplier(false)
    }
  }

  const handleExport = () => {
    const rows = activeTab === 'history'
      ? [
          ['Date', 'Produit', 'Marque', 'Type', 'Quantité', 'Avant', 'Après', 'Raison', 'Par'],
          ...movements.map((m) => [new Date(m.createdAt).toLocaleString('fr-FR'), m.productName, m.productBrand, m.type, m.quantity, m.stockBefore, m.stockAfter, m.reason || '', m.performedBy?.split('@')[0] || '']),
        ]
      : [
          ['Produit', 'Marque', 'Stock', 'À expédier', 'Dispo', 'Seuil', 'Vendu 30j', 'Jours', 'Statut', 'Fournisseur', 'Coût', 'Valeur', 'À recommander'],
          ...products.map((p) => [p.name, p.brand, p.stock, p.toShip, p.available, p.reorderPoint, p.sold30d, p.daysLeft ?? '∞', health(p).label, p.supplier || '', p.costPrice || 0, p.costPrice ? p.stock * p.costPrice : 0, p.suggestedReorder || 0]),
        ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeTab === 'history' ? 'mouvements' : 'stock'}-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Prioritised action feed — the "smart" layer telling admins what to do now.
  const urgentActions = useMemo(() => {
    return products
      .filter((p) => p.available < 0 || p.stock === 0 || p.stock <= p.reorderPoint || (p.daysLeft != null && p.daysLeft <= 7))
      .map((p) => {
        const critical = p.available < 0 || (p.stock === 0 && p.sold30d > 0)
        return { p, critical }
      })
      .sort((a, b) => (Number(b.critical) - Number(a.critical)) || (a.p.available - b.p.available))
      .slice(0, 6)
  }, [products])

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    let list = products.filter((p) => {
      if (filter === 'shortage' && p.available >= 0 && p.stock !== 0) return false
      if (filter === 'low' && !(p.stock <= p.reorderPoint || p.stockStatus === 'Low stock')) return false
      if (filter === 'reorder' && p.suggestedReorder <= 0) return false
      if (filter === 'demand' && p.committed <= 0) return false
      if (needle && !`${p.name} ${p.brand} ${p.supplier || ''}`.toLowerCase().includes(needle)) return false
      return true
    })
    const cmp: Record<SortKey, (a: Product, b: Product) => number> = {
      available: (a, b) => a.available - b.available,
      days: (a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999),
      value: (a, b) => b.stock * (b.costPrice || 0) - a.stock * (a.costPrice || 0),
      sales: (a, b) => (b.sold30d || 0) - (a.sold30d || 0),
      name: (a, b) => a.name.localeCompare(b.name),
    }
    return [...list].sort(cmp[sortKey])
  }, [products, filter, sortKey, search])

  return (
    <BosShell active="inventory" title="Stock & Réappro" crumb="Opérations">
      <div className="page-inner page-wide">
        {/* Header */}
        <div className="page-head">
          <div>
            <h1 className="serif-display">Stock &amp; Réappro</h1>
            <div className="sub">Niveaux, demande réelle des commandes & réapprovisionnement — au même endroit</div>
          </div>
          <div className="spacer" />
          <button className="btn-modern btn-secondary" onClick={handleExport}><Download className="w-4 h-4" />Exporter</button>
        </div>

        {/* Tabs */}
        <div style={{ marginBottom: 22, borderBottom: '1px solid var(--line-soft)' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <TabBtn active={activeTab === 'stock'} onClick={() => setActiveTab('stock')} icon={<Package style={{ width: 16, height: 16 }} />} label="Stock & demande" />
            <TabBtn active={activeTab === 'ship'} onClick={() => setActiveTab('ship')} icon={<Truck style={{ width: 16, height: 16 }} />} label="À expédier" count={summary?.toShipOrders} />
            <TabBtn active={activeTab === 'purchases'} onClick={() => setActiveTab('purchases')} icon={<ShoppingCart style={{ width: 16, height: 16 }} />} label="Achats" />
            <TabBtn active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History style={{ width: 16, height: 16 }} />} label="Historique" />
          </div>
        </div>

        {/* ─────────── STOCK & DEMANDE ─────────── */}
        {activeTab === 'stock' && (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
              <Kpi tone="violet" icon={<DollarSign />} label="Valeur stock" value={`${money(summary?.stockValue || 0)}`} sub="MAD (coût)" />
              <Kpi tone="red" icon={<XCircle />} label="Ruptures" value={String(summary?.shortages || 0)} sub="commandé > stock" alert={(summary?.shortages || 0) > 0} />
              <Kpi tone="amber" icon={<AlertTriangle />} label="Stock bas" value={String(summary?.lowStock || 0)} sub="sous le seuil" />
              <Kpi tone="blue" icon={<Truck />} label="À expédier" value={`${summary?.toShipOrders || 0}`} sub={`${summary?.toShipUnits || 0} articles`} />
              <Kpi tone="green" icon={<ShoppingCart />} label="À recommander" value={String(summary?.reorderProducts || 0)} sub={`≈ ${money(summary?.reorderValue || 0)} MAD`} />
            </div>

            {/* Actions urgentes — the smart feed */}
            {!loading && urgentActions.length > 0 && (
              <div className="card-modern mb-5" style={{ borderLeft: '4px solid var(--rose-bright)' }}>
                <div className="card-header">
                  <AlertTriangle className="w-5 h-5" style={{ color: 'var(--rose-bright)' }} />
                  <h3 className="text-lg font-semibold">Actions urgentes</h3>
                  <span className="badge-modern badge-danger">{urgentActions.length}</span>
                  <div className="flex-1" />
                  <span className="fs12 tx-lo">ce qu'il faut traiter aujourd'hui</span>
                </div>
                <div className="card-body">
                  <div className="flex flex-col gap-2">
                    {urgentActions.map(({ p, critical }) => (
                      <div key={p.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
                        padding: '10px 12px', borderRadius: 10,
                        background: critical ? 'var(--rose-bg)' : 'var(--amber-bg)',
                        border: `1px solid ${critical ? 'var(--rose-soft, rgba(225,29,72,.2))' : 'var(--amber-soft, rgba(217,119,6,.2))'}`,
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: 'var(--tx-hi)', fontSize: 13.5 }}>{p.name} <span className="tx-lo fw400">· {p.brand}</span></div>
                          <div style={{ fontSize: 12, color: critical ? 'var(--rose-bright)' : 'var(--amber)', marginTop: 2 }}>
                            {p.available < 0
                              ? <>🔴 {p.toShip} à expédier / {p.stock} en stock — <b>manque {Math.abs(p.available)}</b>{p.toShipOrders > 0 && <> · {p.toShipOrders} cmd bloquée{p.toShipOrders > 1 ? 's' : ''}</>}</>
                              : p.stock === 0
                                ? <>Rupture · {p.sold30d} vendus/30j{p.toShip > 0 ? <> · {p.toShip} à expédier</> : ''}</>
                                : <>Stock {p.stock} ≤ seuil {p.reorderPoint}{p.daysLeft != null ? <> · ~{p.daysLeft}j restants ({p.sold30d} vendus/30j)</> : p.sold30d > 0 ? <> · {p.sold30d} vendus/30j</> : ''}</>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {p.suggestedReorder > 0 && (
                            <span style={{ fontSize: 12, color: 'var(--tx-mid)' }}>recommander <b>{p.suggestedReorder}</b>{p.supplier ? ` · ${p.supplier}` : ''}</span>
                          )}
                          <button className="btn-modern btn-sm btn-primary" onClick={() => openAdjustModal(p, p.suggestedReorder || undefined)} style={{ whiteSpace: 'nowrap' }}>
                            Réappro
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <div className="filter-strip inline-flex gap-1 p-1 bg-bg-2 rounded-lg">
                {([['all', 'Tous'], ['shortage', 'Ruptures'], ['low', 'Stock bas'], ['reorder', 'À recommander'], ['demand', 'Avec commandes']] as [Filter, string][]).map(([f, label]) => (
                  <button key={f} className={`btn-modern btn-sm ${filter === f ? 'btn-primary' : 'btn-subtle'}`} onClick={() => setFilter(f)}>{label}</button>
                ))}
              </div>
              <div className="spacer" />
              <div style={{ position: 'relative' }}>
                <Search style={{ width: 15, height: 15, position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx-faint)' }} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="input-modern" style={{ paddingLeft: 30, width: 180, height: 34 }} />
              </div>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="input-modern" style={{ height: 34, width: 160 }}>
                <option value="available">Trier : Dispo ↑</option>
                <option value="days">Jours restants ↑</option>
                <option value="value">Valeur ↓</option>
                <option value="sales">Vendu 30j ↓</option>
                <option value="name">Nom A→Z</option>
              </select>
            </div>

            {/* Unified table */}
            <div className="card-modern">
              <div className="overflow-x-auto">
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>État</th>
                      <th className="r">Stock</th>
                      <th className="r">À exp.</th>
                      <th className="r">Dispo</th>
                      <th className="r">Vendu 30j</th>
                      <th className="r">Jours</th>
                      <th>Fournisseur</th>
                      <th className="r" title="Valeur du stock au coût d'achat = stock × coût unitaire">Valeur (coût)</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      [1, 2, 3, 4, 5].map((i) => (<tr key={i}><td colSpan={10}><div className="skeleton-line" /></td></tr>))
                    ) : rows.length === 0 ? (
                      <tr><td colSpan={10}><div style={{ textAlign: 'center', padding: '46px 20px' }}>
                        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}><Package style={{ width: 26, height: 26, color: 'var(--tx-faint)' }} /></div>
                        <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--tx-mid)', margin: '0 0 4px' }}>Aucun produit</p>
                        <p style={{ fontSize: 13, color: 'var(--tx-faint)', margin: 0 }}>Ajuste les filtres pour voir tes produits.</p>
                      </div></td></tr>
                    ) : (
                      rows.map((p) => {
                        const h = health(p)
                        const open = expanded === p.id
                        return (
                          <Fragment key={p.id}>
                            <tr onClick={() => setExpanded(open ? null : p.id)} style={{ cursor: 'pointer' }}>
                              <td>
                                <div className="row gap8" style={{ alignItems: 'center' }}>
                                  {p.image && <img src={p.image} alt={p.name} className="product-thumb" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} />}
                                  <div style={{ minWidth: 0 }}>
                                    <div className="t-strong" title={p.name} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', maxWidth: 230, lineHeight: 1.3 }}>{p.name}</div>
                                    <div className="fs11 tx-lo">{p.brand}</div>
                                  </div>
                                </div>
                              </td>
                              <td><span className={h.cls}>{h.label}</span></td>
                              <td className="r"><span className={`num fw600 ${p.stock === 0 ? 'neg' : p.stock <= p.reorderPoint ? 'tx-lo' : ''}`}>{p.stock}</span></td>
                              <td className="r">
                                {p.toShip > 0
                                  ? <span className="num fw600" style={{ color: p.available < 0 ? 'var(--rose-bright)' : 'var(--tx-hi)' }}>{p.toShip}</span>
                                  : <span className="tx-lo">—</span>}
                              </td>
                              <td className="r"><span className="num fw600" style={{ color: p.available < 0 ? 'var(--rose-bright)' : 'var(--tx-hi)' }}>{p.available}</span></td>
                              <td className="r">
                                {p.sold30d > 0
                                  ? <span className="num fw600" style={{ color: 'var(--tx-hi)' }}>{p.sold30d}</span>
                                  : <span className="tx-lo">—</span>}
                              </td>
                              <td className="r">{p.daysLeft != null ? <span className={`num ${p.daysLeft < 7 ? 'neg' : p.daysLeft < 14 ? 'tx-lo' : ''}`}>{p.daysLeft}j</span> : <span className="tx-lo">—</span>}</td>
                              <td>
                                <button onClick={(e) => { e.stopPropagation(); openSupplierModal(p) }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: p.supplier ? 'var(--tx-lo)' : 'var(--rose-bright)', fontSize: 12, textDecoration: p.supplier ? 'none' : 'underline' }} title="Modifier le fournisseur">
                                  {p.supplier || '+ Ajouter'}
                                </button>
                              </td>
                              <td className="r num fw600">{p.costPrice ? money(p.stock * p.costPrice) : '—'}</td>
                              <td className="r" style={{ whiteSpace: 'nowrap' }}>
                                <button className="btn-modern btn-sm btn-subtle" onClick={(e) => { e.stopPropagation(); openAdjustModal(p, p.suggestedReorder || undefined) }}>Ajuster</button>
                                {(p.openOrdersCount > 0 || p.sold30d > 0) && <ChevronDown style={{ width: 15, height: 15, marginLeft: 6, verticalAlign: 'middle', color: 'var(--tx-faint)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />}
                              </td>
                            </tr>
                            {open && (() => {
                              const unshipped = p.openOrders.filter((o) => !o.shipped)
                              const shipped = p.openOrders.filter((o) => o.shipped)
                              const maxCh = Math.max(1, ...p.salesByChannel.map((c) => c.units))
                              const weekly = p.sold30d > 0 ? Math.round((p.sold30d / 30) * 7 * 10) / 10 : 0
                              return (
                              <tr>
                                <td colSpan={10} style={{ background: 'var(--bg-2)', padding: '14px 16px' }}>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28 }}>
                                    {/* Open orders — split shipped vs to-ship */}
                                    <div style={{ flex: '1 1 300px', minWidth: 250 }}>
                                      <div className="fs11 tx-faint" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Commandes ouvertes</div>
                                      {unshipped.length > 0 && (
                                        <div style={{ marginBottom: 8 }}>
                                          <div className="fs11" style={{ color: 'var(--amber)', fontWeight: 600, marginBottom: 4 }}>À expédier ({unshipped.reduce((s, o) => s + o.qty, 0)}) — prélève du stock</div>
                                          {unshipped.map((o, i) => <OrderLine key={i} o={o} />)}
                                        </div>
                                      )}
                                      {shipped.length > 0 && (
                                        <div>
                                          <div className="fs11" style={{ color: 'var(--green)', fontWeight: 600, marginBottom: 4 }}>Déjà expédié ({shipped.reduce((s, o) => s + o.qty, 0)}) — parti, ne compte plus</div>
                                          {shipped.map((o, i) => <OrderLine key={i} o={o} />)}
                                        </div>
                                      )}
                                      {p.openOrders.length === 0 && <div className="fs12 tx-lo">Aucune commande ouverte.</div>}
                                    </div>

                                    {/* Sales by channel — proves multi-channel */}
                                    <div style={{ flex: '1 1 200px', minWidth: 180 }}>
                                      <div className="fs11 tx-faint" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Vendu 30j · {p.sold30d} unités</div>
                                      {p.salesByChannel.length === 0 ? (
                                        <div className="fs12 tx-lo">Aucune vente sur 30j.</div>
                                      ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                          {p.salesByChannel.map((c, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                                              <span style={{ width: 66, color: 'var(--tx-mid)' }}>{c.channel}</span>
                                              <div style={{ flex: 1, height: 8, background: 'var(--line-soft)', borderRadius: 4, overflow: 'hidden' }}>
                                                <div style={{ width: `${(c.units / maxCh) * 100}%`, height: '100%', background: 'var(--rose-bright)', borderRadius: 4 }} />
                                              </div>
                                              <span className="num fw600" style={{ width: 20, textAlign: 'right', color: 'var(--tx-hi)' }}>{c.units}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    {/* Reorder panel */}
                                    <div style={{ flex: '0 0 auto', minWidth: 190 }}>
                                      <div className="fs11 tx-faint" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Réapprovisionnement</div>
                                      <div className="fs12 tx-mid" style={{ lineHeight: 1.8 }}>
                                        <div>Dispo : <b className="num">{p.available}</b> · Vélocité : <b>{weekly}/sem</b></div>
                                        <div>Autonomie : <b>{p.daysLeft != null ? `${p.daysLeft} j` : '—'}</b> · Seuil : {p.reorderPoint}</div>
                                        <div>Fournisseur : <b>{p.supplier || '—'}</b></div>
                                        {p.suggestedReorder > 0
                                          ? <div style={{ color: 'var(--rose-bright)', marginTop: 4 }}>🔴 Recommander <b>{p.suggestedReorder}</b> unités</div>
                                          : <div style={{ color: 'var(--green)', marginTop: 4 }}>✓ Stock suffisant</div>}
                                      </div>
                                      <button className="btn-modern btn-sm btn-primary" style={{ marginTop: 8 }} onClick={() => openAdjustModal(p, p.suggestedReorder || undefined)}>Enregistrer réappro</button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                              )
                            })()}
                          </Fragment>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="fs11 tx-faint" style={{ marginTop: 8 }}>
              <b>Dispo = stock − à expédier</b> (commandes pas encore parties). <b>Vendu 30j</b> = ventes réelles tous canaux (Instagram, WhatsApp, Sendit, site).
              {' '}<b>Valeur (coût)</b> = stock × coût d'achat unitaire (cash immobilisé, pas le prix de vente).
              {' '}Le stock se <b style={{ color: 'var(--green)' }}>décrémente automatiquement à l'expédition</b> (et revient si la commande est annulée) — n'ajuste plus le stock à la main que pour les <b>réappro fournisseur</b> et les <b>corrections physiques</b> (inventaire, casse). Chaque mouvement auto est tracé dans l'onglet Historique.
            </p>
          </>
        )}

        {/* ─────────── À EXPÉDIER ─────────── */}
        {activeTab === 'ship' && (
          <div style={{ marginTop: 4 }}>
            <p className="fs13 tx-mid" style={{ marginBottom: 14 }}>Commandes confirmées <b>pas encore remises à Sendit</b> — ce qui doit physiquement partir.</p>
            {loading ? (
              <div className="card-modern"><div className="card-body"><div className="skeleton-line" /></div></div>
            ) : toShip.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 20px' }} className="card-modern">
                <PackageCheck style={{ width: 40, height: 40, color: 'var(--green)', margin: '0 auto 12px' }} />
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx-mid)' }}>Rien en attente d'expédition</p>
                <p className="fs13 tx-faint">Toutes les commandes ouvertes ont un suivi Sendit.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {toShip.map((o) => (
                  <div key={o.id} className="card-modern" style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <Link href={`/orders/${o.id}`} style={{ fontWeight: 700, color: 'var(--tx-hi)', fontSize: 14 }}>#{o.id}</Link>
                        <span className="fs13 tx-mid">{o.customer}</span>
                        <span className="fs12 tx-faint">{o.city} · {fmtDate(o.created)} · {o.units} art.</span>
                      </div>
                      {o.canFulfill
                        ? <span className="badge green">Stock OK</span>
                        : <span className="badge red">⚠ Stock insuffisant</span>}
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {o.items.map((it, i) => {
                        const short = it.stock < it.qty
                        return (
                          <span key={i} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, background: short ? 'var(--rose-bg)' : 'var(--bg-2)', color: short ? 'var(--rose-bright)' : 'var(--tx-mid)' }} title={short ? `Stock ${it.stock} < ${it.qty} commandé` : `Stock ${it.stock}`}>
                            {it.name} <b>×{it.qty}</b>{short ? ` (stock ${it.stock})` : ''}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─────────── ACHATS ─────────── */}
        {activeTab === 'purchases' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
              <p className="fs13 tx-mid">Ce que tu as <b>acheté aux fournisseurs</b> — dépenses par produit, enregistrées via "Réappro".</p>
              <div className="filter-strip inline-flex gap-1 p-1 bg-bg-2 rounded-lg">
                {([[7, '7j'], [30, '30j'], [90, '90j'], [3650, 'Tout']] as [number, string][]).map(([d, label]) => (
                  <button key={d} className={`btn-modern btn-sm ${purchasesDays === d ? 'btn-primary' : 'btn-subtle'}`} onClick={() => setPurchasesDays(d)}>{label}</button>
                ))}
              </div>
            </div>

            {loadingPurchases && !purchases ? (
              <div className="card-modern"><div className="card-body"><div className="skeleton-line" /></div></div>
            ) : (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  <Kpi tone="violet" icon={<DollarSign />} label="Total dépensé" value={`${money(purchases?.summary.totalSpent || 0)}`} sub="MAD sur la période" />
                  <Kpi tone="blue" icon={<Package />} label="Unités achetées" value={String(purchases?.summary.unitsPurchased || 0)} sub="entrées de stock" />
                  <Kpi tone="green" icon={<ShoppingCart />} label="Commandes" value={String(purchases?.summary.purchaseCount || 0)} sub={`${purchases?.summary.lineCount || 0} lignes d'achat`} />
                  <Kpi tone="amber" icon={<Truck />} label="Produits" value={String(purchases?.summary.productsRestocked || 0)} sub="réapprovisionnés" />
                </div>

                {(purchases?.byProduct.length ?? 0) === 0 ? (
                  <div style={emptyBox}>
                    Aucun achat enregistré sur cette période. Utilise <b>Réappro</b> (onglet Stock, bouton Ajuster → Entrée) en saisissant le <b>coût/unité</b> et le <b>fournisseur</b> : les dépenses s'accumuleront ici.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                    {/* Spend by product */}
                    <div style={{ flex: '1 1 560px', minWidth: 320 }}>
                      <h3 style={sectionTitle}>Dépenses par produit</h3>
                      <div className="card-modern"><div className="overflow-x-auto">
                        <table className="table-modern">
                          <thead><tr><th>Produit</th><th>Fournisseur</th><th className="r">Unités</th><th className="r">Coût moy.</th><th className="r">Dépensé</th><th className="r">Dernier</th><th className="r">Stock</th></tr></thead>
                          <tbody>
                            {purchases!.byProduct.map((r) => (
                              <tr key={r.id}>
                                <td><div className="t-strong" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>{r.name}</div><div className="fs11 tx-lo">{r.brand}</div></td>
                                <td className="fs12 tx-mid">{r.supplier || '—'}</td>
                                <td className="r num fw600">{r.units}</td>
                                <td className="r num tx-lo">{r.avgCost != null ? money(r.avgCost) : '—'}</td>
                                <td className="r num fw600">{r.spent > 0 ? `${money(r.spent)}` : '—'}</td>
                                <td className="r fs12 tx-lo">{r.lastPurchase ? fmtDate(r.lastPurchase) : '—'}</td>
                                <td className="r num">{r.stock}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div></div>
                    </div>

                    {/* By supplier + recent */}
                    <div style={{ flex: '1 1 260px', minWidth: 240 }}>
                      <h3 style={sectionTitle}>Par fournisseur</h3>
                      <div className="card-modern" style={{ padding: 14, marginBottom: 18 }}>
                        {purchases!.bySupplier.map((s, i) => {
                          const max = Math.max(1, ...purchases!.bySupplier.map((x) => x.spent))
                          return (
                            <div key={i} style={{ marginBottom: 10 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                                <span className="tx-mid">{s.supplier}</span>
                                <span className="num fw600" style={{ color: 'var(--tx-hi)' }}>{money(s.spent)} MAD</span>
                              </div>
                              <div style={{ height: 7, background: 'var(--line-soft)', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ width: `${(s.spent / max) * 100}%`, height: '100%', background: 'var(--rose-bright)', borderRadius: 4 }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <h3 style={sectionTitle}>Achats récents</h3>
                      <div className="card-modern" style={{ padding: 12 }}>
                        {purchases!.recent.length === 0 ? <div className="fs12 tx-lo">—</div> : purchases!.recent.slice(0, 12).map((r) => (
                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--line-soft)' }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div className="tx-hi" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }} title={r.name}>{r.name}</div>
                              <div className="fs11 tx-faint">{fmtDate(r.createdAt)} · +{r.quantity}</div>
                            </div>
                            <div className="num fw600" style={{ color: 'var(--tx-hi)', whiteSpace: 'nowrap' }}>{r.totalCost != null ? `${money(r.totalCost)}` : '—'}</div>
                            <button
                              onClick={() => setEditPurchase({ id: r.id, name: r.name, quantity: String(r.quantity), totalCost: r.totalCost != null ? String(r.totalCost) : '' })}
                              title="Modifier cet achat (quantité / coût)"
                              style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--tx-faint)', padding: 4 }}
                            >
                              <Pencil style={{ width: 14, height: 14 }} />
                            </button>
                            <button
                              onClick={() => deleteMovement(r.id, `${r.name} · +${r.quantity}`)}
                              disabled={deletingId === r.id}
                              title="Supprimer cet achat (annule le stock ajouté)"
                              style={{ display: 'flex', alignItems: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--tx-faint)', padding: 4, opacity: deletingId === r.id ? 0.4 : 1 }}
                            >
                              <Trash2 style={{ width: 14, height: 14 }} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ─────────── HISTORIQUE ─────────── */}
        {activeTab === 'history' && (
          <div className="card-modern">
            <div className="card-header">
              <History className="w-5 h-5" />
              <h3 className="text-lg font-semibold">Historique des mouvements</h3>
              <div className="flex-1" />
              <span className="fs12 tx-lo">{movements.length} mouvements (100 derniers)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Date</th><th>Produit</th><th>Type</th><th className="r">Quantité</th><th className="r">Avant</th><th className="r">Après</th><th>Raison</th><th>Par</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {loadingMovements ? (
                    [1, 2, 3].map((i) => (<tr key={i}><td colSpan={9}><div className="skeleton-line" /></td></tr>))
                  ) : movements.length === 0 ? (
                    <tr><td colSpan={9}><div style={{ textAlign: 'center', padding: '40px 20px' }}>
                      <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}><History style={{ width: 24, height: 24, color: 'var(--tx-faint)' }} /></div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-mid)', margin: '0 0 4px' }}>Aucun mouvement</p>
                      <p style={{ fontSize: 13, color: 'var(--tx-faint)', margin: 0 }}>Les entrées et sorties de stock seront tracées ici.</p>
                    </div></td></tr>
                  ) : (
                    movements.map((m) => {
                      const up = m.quantity > 0
                      const typeColors: Record<string, string> = { Purchase: 'badge blue', Sale: 'badge green', Adjustment: 'badge amber', Return: 'badge violet', Damage: 'badge red', Transfer: 'badge gray' }
                      return (
                        <tr key={m.id}>
                          <td className="fs12">{new Date(m.createdAt).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                          <td><div><div className="t-strong fs13">{m.productName}</div><div className="fs11 tx-lo">{m.productBrand}</div></div></td>
                          <td><span className={typeColors[m.type] || 'badge'}>{m.type}</span></td>
                          <td className="r"><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>{up ? <ArrowUpCircle className="w-4 h-4 text-green-600" /> : <ArrowDownCircle className="w-4 h-4 text-red-600" />}<span className={`num fw600 ${up ? 'text-green-600' : 'text-red-600'}`}>{up ? '+' : ''}{m.quantity}</span></div></td>
                          <td className="r num tx-lo">{m.stockBefore}</td>
                          <td className="r num fw600">{m.stockAfter}</td>
                          <td className="fs12 tx-lo">{m.reason || '—'}</td>
                          <td className="fs11 tx-lo">{m.performedBy?.split('@')[0] || '—'}</td>
                          <td className="r">
                            {['Purchase', 'Adjustment', 'Damage', 'Transfer'].includes(m.type) ? (
                              <button
                                onClick={() => deleteMovement(m.id, `${m.productName} · ${m.quantity > 0 ? '+' : ''}${m.quantity}`)}
                                disabled={deletingId === m.id}
                                title="Supprimer ce mouvement (annule le stock appliqué)"
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--tx-faint)', padding: 4, opacity: deletingId === m.id ? 0.4 : 1 }}
                              >
                                <Trash2 style={{ width: 14, height: 14 }} />
                              </button>
                            ) : (
                              <span className="fs11 tx-faint" title="Mouvement automatique (commande) — non supprimable">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Stock Adjustment Modal */}
        {adjustModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => setAdjustModal(null)}>
            <div className="card-modern" style={{ maxWidth: 500, width: '90%' }} onClick={(e) => e.stopPropagation()}>
              <div className="card-header"><h3 className="text-lg font-semibold">Ajuster le stock</h3></div>
              <div className="card-body">
                <div style={{ marginBottom: 16 }}>
                  <div className="t-strong">{adjustModal.productName}</div>
                  <div className="fs12 tx-lo">Stock actuel : <b className="num">{adjustModal.currentStock}</b></div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label className="fs12 tx-mid fw600" style={{ display: 'block', marginBottom: 6 }}>Type d'ajustement</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className={`btn-modern btn-sm ${adjustType === 'in' ? 'btn-primary' : 'btn-subtle'}`} onClick={() => setAdjustType('in')}><Plus className="w-4 h-4" /> Entrée (réappro)</button>
                    <button className={`btn-modern btn-sm ${adjustType === 'out' ? 'btn-primary' : 'btn-subtle'}`} onClick={() => setAdjustType('out')}><Minus className="w-4 h-4" /> Sortie</button>
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: adjustType === 'in' ? 2 : 1 }}>
                      <label className="fs12 tx-mid fw600" style={{ display: 'block', marginBottom: 6 }}>{adjustType === 'in' ? 'Quantité payée' : 'Quantité'}{adjustModal.prefill ? ' (suggérée)' : ''}</label>
                      <input type="number" min="1" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} placeholder="Ex: 10" className="input-modern" style={{ width: '100%' }} />
                    </div>
                    {adjustType === 'in' && (
                      <div style={{ flex: 1 }}>
                        <label className="fs12 tx-mid fw600" style={{ display: 'block', marginBottom: 6 }}>Dont gratuites</label>
                        <input type="number" min="0" value={adjustFree} onChange={(e) => setAdjustFree(e.target.value)} placeholder="Ex: 3" className="input-modern" style={{ width: '100%' }} />
                      </div>
                    )}
                  </div>
                  {adjustQty && (() => {
                    const paid = Number(adjustQty), free = adjustType === 'in' ? Number(adjustFree) || 0 : 0
                    const recu = paid + free
                    return (
                      <div className="fs11 tx-lo" style={{ marginTop: 4 }}>
                        {adjustType === 'in' ? (
                          <>Nouveau stock : <b className="num">{adjustModal.currentStock + recu}</b>{free > 0 && <> · <b className="num">{paid}</b> payées + <b className="num">{free}</b> gratuites = <b className="num">{recu}</b> reçues</>}</>
                        ) : (
                          <>Nouveau stock : <b className="num">{Math.max(0, adjustModal.currentStock - paid)}</b></>
                        )}
                      </div>
                    )
                  })()}
                </div>
                {adjustType === 'in' && (
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                    <div style={{ flex: 1 }}>
                      <label className="fs12 tx-mid fw600" style={{ display: 'block', marginBottom: 6 }}>Prix / unité payée (MAD)</label>
                      <input type="number" min="0" step="0.01" value={adjustCost} onChange={(e) => setAdjustCost(e.target.value)} placeholder="Ex: 45" className="input-modern" style={{ width: '100%' }} />
                      {adjustCost && adjustQty && (() => {
                        const buy = Number(adjustCost), paid = Number(adjustQty), free = Number(adjustFree) || 0
                        const recu = paid + free, spent = buy * paid
                        const s = adjustModal.currentStock, oc = adjustModal.oldCost
                        // Effective cost blends the money spent over ALL units received (incl. free).
                        const eff = recu > 0 ? Math.round((spent / recu) * 100) / 100 : buy
                        const wac = (oc && s > 0) ? Math.round(((s * oc + spent) / (s + recu)) * 100) / 100 : eff
                        return (
                          <div className="fs11 tx-lo" style={{ marginTop: 4 }}>
                            Dépense : <b className="num">{money(spent)} MAD</b>
                            {free > 0 && <> · coût réel <b className="num">{eff}</b>/unité (avec gratuites)</>}
                            {oc && s > 0 && Math.abs(wac - oc) > 0.01 && <> · Coût moyen après : <b className="num" style={{ color: 'var(--tx-hi)' }}>{wac}</b> (avant {oc})</>}
                          </div>
                        )
                      })()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="fs12 tx-mid fw600" style={{ display: 'block', marginBottom: 6 }}>Fournisseur</label>
                      <input type="text" value={adjustSupplier} onChange={(e) => setAdjustSupplier(e.target.value)} placeholder="Ex: Salerm" className="input-modern" style={{ width: '100%' }} />
                    </div>
                  </div>
                )}
                <div style={{ marginBottom: 16 }}>
                  <label className="fs12 tx-mid fw600" style={{ display: 'block', marginBottom: 6 }}>Raison (optionnel)</label>
                  <input type="text" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder={adjustType === 'in' ? 'Réapprovisionnement fournisseur' : 'Produit endommagé'} className="input-modern" style={{ width: '100%' }} />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn-modern btn-secondary" onClick={() => setAdjustModal(null)}>Annuler</button>
                  <button className="btn-modern btn-primary" onClick={submitAdjustment} disabled={adjusting || !adjustQty || Number(adjustQty) <= 0}>{adjusting ? 'En cours…' : 'Confirmer'}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Purchase Modal */}
        {editPurchase && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => setEditPurchase(null)}>
            <div className="card-modern" style={{ maxWidth: 460, width: '90%' }} onClick={(e) => e.stopPropagation()}>
              <div className="card-header"><h3 className="text-lg font-semibold">Modifier l&apos;achat</h3></div>
              <div className="card-body">
                <p className="fs12 tx-lo" style={{ marginBottom: 14 }}>{editPurchase.name}</p>
                <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                  <div style={{ flex: 1 }}>
                    <label className="fs12 tx-mid fw600" style={{ display: 'block', marginBottom: 6 }}>Quantité reçue</label>
                    <input type="number" min="1" value={editPurchase.quantity} onChange={(e) => setEditPurchase({ ...editPurchase, quantity: e.target.value })} className="input-modern" style={{ width: '100%' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="fs12 tx-mid fw600" style={{ display: 'block', marginBottom: 6 }}>Dépense totale (MAD)</label>
                    <input type="number" min="0" step="0.01" value={editPurchase.totalCost} onChange={(e) => setEditPurchase({ ...editPurchase, totalCost: e.target.value })} className="input-modern" style={{ width: '100%' }} />
                  </div>
                </div>
                {Number(editPurchase.quantity) > 0 && Number(editPurchase.totalCost) > 0 && (
                  <div className="fs11 tx-lo" style={{ marginBottom: 14 }}>Coût réel : <b className="num">{Math.round((Number(editPurchase.totalCost) / Number(editPurchase.quantity)) * 100) / 100}</b> / unité · le stock s&apos;ajuste de la différence de quantité.</div>
                )}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="btn-modern btn-secondary" onClick={() => setEditPurchase(null)}>Annuler</button>
                  <button className="btn-modern btn-primary" onClick={saveEditPurchase} disabled={savingEdit || !(Number(editPurchase.quantity) > 0)}>{savingEdit ? 'En cours…' : 'Enregistrer'}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Supplier Edit Modal */}
        {supplierModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => setSupplierModal(null)}>
            <div className="card-modern" style={{ maxWidth: 450, width: '90%' }} onClick={(e) => e.stopPropagation()}>
              <div className="card-header"><h3 className="text-lg font-semibold">Modifier le fournisseur</h3></div>
              <div className="card-body">
                <div style={{ marginBottom: 16 }}>
                  <div className="t-strong">{supplierModal.productName}</div>
                  <div className="fs12 tx-lo">Fournisseur actuel : <b>{supplierModal.currentSupplier || 'Aucun'}</b></div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label className="fs12 tx-mid fw600" style={{ display: 'block', marginBottom: 6 }}>Nom du fournisseur</label>
                  <input type="text" value={supplierInput} onChange={(e) => setSupplierInput(e.target.value)} placeholder="Ex: Beauty Supply Morocco" className="input-modern" style={{ width: '100%' }} autoFocus />
                  <div className="fs11 tx-lo" style={{ marginTop: 4 }}>Laissez vide pour supprimer le fournisseur</div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn-modern btn-secondary" onClick={() => setSupplierModal(null)}>Annuler</button>
                  <button className="btn-modern btn-primary" onClick={submitSupplier} disabled={savingSupplier}>{savingSupplier ? 'Enregistrement…' : 'Enregistrer'}</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </BosShell>
  )
}

function OrderLine({ o }: { o: OpenOrder }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, flexWrap: 'wrap', padding: '2px 0' }}>
      <Link href={`/orders/${o.orderId}`} style={{ fontWeight: 600, color: 'var(--tx-hi)' }}>#{o.orderId}</Link>
      <span className="tx-mid" style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customer}</span>
      <span className="num" style={{ color: 'var(--tx-hi)' }}>×{o.qty}</span>
      <span className="fs11 tx-faint">{new Date(o.created).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
    </div>
  )
}

function TabBtn({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 16px', background: 'none', border: 'none',
      borderBottom: active ? '2px solid var(--rose-bright)' : '2px solid transparent',
      color: active ? 'var(--tx-hi)' : 'var(--tx-mid)', fontWeight: active ? 600 : 500, fontSize: 14,
      cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {icon}{label}
      {count != null && count > 0 && <span className="badge-modern badge-danger" style={{ marginLeft: 2 }}>{count}</span>}
    </button>
  )
}

function Kpi({ tone, icon, label, value, sub, alert }: { tone: 'blue' | 'amber' | 'red' | 'green' | 'violet'; icon: React.ReactNode; label: string; value: string; sub: string; alert?: boolean }) {
  const map: Record<string, { bg: string; fg: string }> = {
    blue: { bg: 'var(--blue-bg, #eff6ff)', fg: 'var(--blue, #2563eb)' },
    amber: { bg: 'var(--amber-bg)', fg: 'var(--amber)' },
    red: { bg: 'var(--rose-bg)', fg: 'var(--rose-bright)' },
    green: { bg: 'var(--green-bg)', fg: 'var(--green)' },
    violet: { bg: 'var(--violet-bg, #f5f3ff)', fg: 'var(--violet, #7c3aed)' },
  }
  const c = map[tone]
  return (
    <div className="card-modern" style={{ padding: 14, ...(alert ? { borderColor: 'var(--rose-bright)' } : {}) }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: c.fg, background: c.bg, padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
        <span style={{ display: 'inline-flex', width: 15, height: 15 }}>{icon}</span>{label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--tx-hi)', marginTop: 8, lineHeight: 1 }}>{value}</div>
      <div className="fs12 tx-faint" style={{ marginTop: 3 }}>{sub}</div>
    </div>
  )
}
