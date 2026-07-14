'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, X, AlertCircle, Truck } from 'lucide-react'
import BosShell from '@/components/BosShell'

interface Row {
  id: number
  code: string
  senditStatus: string
  name: string
  phone: string
  city: string
  amount: number
  fee: number
  productsText: string | null
  reference: string | null
  senditCreatedAt: string | null
  matchedOrderId: number | null
  matchedUserId: number | null
  matchedCustomerName: string | null
  assignedProducts: Array<{ productId: number; quantity: number; price: number }> | null
  paymentMethod: string | null
  paidAmount: number | null
  paidAt: string | null
  paymentReference: string | null
  state: string
  promoted: boolean
  promotedOrderId: number | null
}
interface Counts { total: number; sendit_only: number; matched: number; mismatch: number; promoted: number; ready: number }

const mad = (v: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v || 0)
const STATE_LABEL: Record<string, string> = { sendit_only: 'Sendit seul', matched: 'Lié', mismatch: 'Divergent' }
const STATE_BADGE: Record<string, { bg: string; fg: string }> = {
  sendit_only: { bg: 'var(--amber-bg)', fg: 'var(--amber)' },
  matched: { bg: 'var(--green-bg)', fg: 'var(--green)' },
  mismatch: { bg: 'var(--rose-bg)', fg: 'var(--rose-bright)' },
}

export default function SenditLabPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [counts, setCounts] = useState<Counts>({ total: 0, sendit_only: 0, matched: 0, mismatch: 0, promoted: 0, ready: 0 })
  const [loading, setLoading] = useState(true)
  const [pulling, setPulling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('sendit_only')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [returnFor, setReturnFor] = useState<{ stagingId: number; orderId: number; name: string } | null>(null)
  const [returnForm, setReturnForm] = useState({ fee: '', restock: true })

  const syncMatched = async () => {
    if (busy) return
    if (!confirm('Synchroniser le statut + COD des commandes déjà liées depuis Sendit ?\n\nCela met à jour les vraies commandes (statut livré/annulé, montant COD, frais).')) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const res = await fetch('/api/ops/sendit/staging', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync-matched' }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
      setNotice(`${d.synced} commande(s) synchronisée(s)${d.statusChanged ? ` · ${d.statusChanged} changement(s) de statut` : ''}.`)
      load()
      setTimeout(() => setNotice(null), 6000)
    } catch (e) { setError(e instanceof Error ? e.message : 'Sync impossible') }
    finally { setBusy(false) }
  }

  const promote = async (promoteIds: number[]) => {
    if (busy || promoteIds.length === 0) return
    if (!confirm(`Rendre officiel ${promoteIds.length} colis ?\n\nCela crée de vraies commandes dans le BOS.`)) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const res = await fetch('/api/ops/sendit/promote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: promoteIds }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
      setNotice(`${d.promoted} commande(s) officialisée(s)${d.skipped?.length ? ` · ${d.skipped.length} ignorée(s)` : ''}.`)
      load()
      setTimeout(() => setNotice(null), 6000)
    } catch (e) { setError(e instanceof Error ? e.message : 'Promotion impossible') }
    finally { setBusy(false) }
  }

  const ignore = async (ignoreIds: number[]) => {
    if (busy || ignoreIds.length === 0) return
    if (!confirm(`Ignorer ${ignoreIds.length} colis ?\n\nPour les colis d'un autre business partageant le compte Sendit. Ils disparaissent de la liste et ne reviendront pas au prochain Pull. Réversible.`)) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const res = await fetch('/api/ops/sendit/staging', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ignore', ids: ignoreIds }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
      setNotice(`${d.ignored} colis ignoré(s).`)
      load()
      setTimeout(() => setNotice(null), 6000)
    } catch (e) { setError(e instanceof Error ? e.message : 'Action impossible') }
    finally { setBusy(false) }
  }

  const submitReturn = async () => {
    if (busy || !returnFor) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const res = await fetch(`/api/ops/orders/${returnFor.orderId}/return`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryFee: Number(returnForm.fee) || 0, restock: returnForm.restock }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
      setNotice(`Retour enregistré pour ${returnFor.name} (commande #${returnFor.orderId}).`)
      setReturnFor(null); setReturnForm({ fee: '', restock: true })
      load()
      setTimeout(() => setNotice(null), 6000)
    } catch (e) { setError(e instanceof Error ? e.message : 'Retour impossible') }
    finally { setBusy(false) }
  }

  const load = () => {
    fetch('/api/ops/sendit/staging', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { rows: [], counts: {} }))
      .then((d) => { setRows(Array.isArray(d.rows) ? d.rows : []); if (d.counts) setCounts(d.counts) })
      .catch(() => setError('Chargement impossible'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const pull = async () => {
    if (pulling) return
    setPulling(true); setError(null); setNotice(null)
    try {
      const res = await fetch('/api/ops/sendit/staging', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pull' }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
      setNotice(`Sendit synchronisé : ${d.pulled} colis (${d.inserted} nouveaux, ${d.updated} mis à jour).`)
      load()
      setTimeout(() => setNotice(null), 6000)
    } catch (e) { setError(e instanceof Error ? e.message : 'Pull impossible') }
    finally { setPulling(false) }
  }

  const shown = rows.filter((r) => filter === 'all' ? !r.promoted : filter === 'promoted' ? r.promoted : (r.state === filter && !r.promoted))

  return (
    <BosShell active="sendit" title="Sendit" crumb="Opérations">
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 24px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>RÉCONCILIATION · LABO</div>
            <h1 className="serif-display" style={{ fontSize: 28, lineHeight: 1.05 }}>Sendit</h1>
            <p style={{ fontSize: 13, color: 'var(--tx-mid)', marginTop: 7, lineHeight: 1.55, maxWidth: 680 }}>
              Zone <b>isolée</b> : on importe les colis Sendit ici, on affecte les produits, on vérifie — <b>rien ne touche le BOS officiel</b> tant que tu n&apos;as pas cliqué « Rendre officiel ».
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginTop: 4 }}>
            {(counts.matched > 0 || counts.mismatch > 0) && (
              <button className="btn-modern btn-subtle" onClick={syncMatched} disabled={busy} title="Pousse le statut + COD Sendit sur les commandes déjà liées">
                Sync statut/COD ({counts.matched + counts.mismatch})
              </button>
            )}
            <button className="btn-modern btn-primary" onClick={pull} disabled={pulling}>
              <RefreshCw style={{ width: 15, height: 15 }} />{pulling ? 'Sync…' : 'Pull Sendit'}
            </button>
          </div>
        </div>

        {/* Counts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
          <Tab label="Sendit seul" value={counts.sendit_only} active={filter === 'sendit_only'} onClick={() => setFilter('sendit_only')} tone="amber" />
          <Tab label="Divergent" value={counts.mismatch} active={filter === 'mismatch'} onClick={() => setFilter('mismatch')} tone="rose" />
          <Tab label="Lié & synchro" value={counts.matched} active={filter === 'matched'} onClick={() => setFilter('matched')} tone="green" />
          <Tab label="Promu (officiel)" value={counts.promoted} active={filter === 'promoted'} onClick={() => setFilter('promoted')} tone="blue" />
          <Tab label="Tout" value={counts.total} active={filter === 'all'} onClick={() => setFilter('all')} tone="gray" />
        </div>

        {notice && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--tx-hi)' }}>✓ {notice}</span>
            <button onClick={() => setNotice(null)} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-faint)', padding: 0 }}><X style={{ width: 14, height: 14 }} /></button>
          </div>
        )}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--rose-bg)', border: '1px solid var(--rose-line)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
            <AlertCircle style={{ width: 16, height: 16, color: 'var(--rose-bright)', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--tx-hi)' }}>{error}</span>
          </div>
        )}

        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--tx-lo)', textAlign: 'center', padding: 30 }}>Chargement…</p>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 14 }}>
            <Truck style={{ width: 28, height: 28, color: 'var(--tx-faint)', margin: '0 auto 10px' }} />
            <p style={{ fontSize: 14, color: 'var(--tx-hi)', fontWeight: 600 }}>Aucun colis importé</p>
            <p style={{ fontSize: 13, color: 'var(--tx-lo)', marginTop: 6 }}>Clique <b>Pull Sendit</b> pour récupérer tes colis (zone isolée, sans risque).</p>
          </div>
        ) : (
          <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line-soft)', textAlign: 'left' }}>
                  <th style={th}>Client</th>
                  <th style={th}>Ville</th>
                  <th style={{ ...th, textAlign: 'right' }}>COD</th>
                  <th style={th}>Date colis</th>
                  <th style={th}>Produits (Sendit)</th>
                  <th style={th}>Statut</th>
                  <th style={th}>État</th>
                  <th style={{ ...th, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const b = STATE_BADGE[r.state] || { bg: 'var(--bg-3)', fg: 'var(--tx-lo)' }
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                      <td style={td}>
                        <div style={{ color: 'var(--tx-hi)', fontWeight: 500 }}>{r.name || '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--tx-faint)', fontFamily: 'var(--mono)' }}>{r.phone}</div>
                        {r.matchedCustomerName && <div style={{ fontSize: 10, color: 'var(--green)' }}>👤 client BOS : {r.matchedCustomerName}</div>}
                      </td>
                      <td style={{ ...td, color: 'var(--tx-mid)' }}>{r.city || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--tx-hi)' }}>{mad(r.amount)}<span style={{ fontSize: 10, color: 'var(--tx-faint)' }}> (liv. {mad(r.fee)})</span></td>
                      <td style={{ ...td, fontSize: 12, color: 'var(--tx-lo)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{r.senditCreatedAt ? new Date(r.senditCreatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}</td>
                      <td style={{ ...td, fontSize: 12, color: 'var(--tx-mid)', maxWidth: 260 }}>{r.productsText || <span style={{ color: 'var(--tx-faint)' }}>—</span>}</td>
                      <td style={{ ...td, fontSize: 11, color: 'var(--tx-lo)', fontFamily: 'var(--mono)' }}>
                        {r.senditStatus}
                        {(() => {
                          if (r.state !== 'matched' || r.senditStatus.toUpperCase() === 'DELIVERED' || !r.senditCreatedAt) return null
                          const age = Math.floor((Date.now() - new Date(r.senditCreatedAt).getTime()) / (1000 * 60 * 60 * 24))
                          if (age > 30) return <div style={{ fontSize: 10, color: 'var(--orange)', marginTop: 2 }}>⚠ Bloquée {age}j</div>
                          return null
                        })()}
                      </td>
                      <td style={td}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5, color: b.fg, background: b.bg }}>{STATE_LABEL[r.state] || r.state}</span>
                      </td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {(() => { const oid = r.promotedOrderId ?? r.matchedOrderId; return oid ? (
                          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                            {r.promoted && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ officiel</span>}
                            <button onClick={() => { setReturnForm({ fee: '', restock: true }); setReturnFor({ stagingId: r.id, orderId: oid, name: r.name }) }} title="Marquer cette commande comme retour / échange" style={{ fontSize: 11, background: 'none', border: '1px solid var(--amber)', borderRadius: 6, padding: '2px 8px', color: 'var(--amber)', cursor: 'pointer' }}>↩️ Retour</button>
                          </div>
                        ) : null })() || (r.state === 'sendit_only' ? (
                          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                            <button className="btn-modern btn-sm btn-subtle" onClick={() => setSelectedId(r.id)} style={{ fontSize: 11 }}>
                              {(r.assignedProducts?.length ?? 0) > 0 ? `✓ ${r.assignedProducts!.length} prod.` : 'Produits'}
                            </button>
                            {(r.assignedProducts?.length ?? 0) > 0 && (
                              <button className="btn-modern btn-sm btn-primary" onClick={() => promote([r.id])} disabled={busy} style={{ fontSize: 11 }}>Officialiser</button>
                            )}
                            <button onClick={() => ignore([r.id])} disabled={busy} title="Colis d'un autre business — masquer et ne plus le repull" style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--tx-faint)', cursor: 'pointer', padding: '2px 4px' }}>Ignorer</button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--tx-faint)' }}>—</span>
                        ))}
                      </td>
                    </tr>
                  )
                })}
                {shown.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24 }} className="tx-faint">Rien dans cette catégorie</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedId != null && (
        <AssignDrawer
          stagingId={selectedId}
          onClose={() => setSelectedId(null)}
          onSaved={() => { setSelectedId(null); load() }}
        />
      )}

      {returnFor && (
        <div onClick={() => !busy && setReturnFor(null)} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 350 / 0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 100%)', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 4 }}>↩️ Retour / Échange</div>
            <div style={{ fontSize: 12, color: 'var(--tx-lo)', marginBottom: 16 }}>{returnFor.name} · commande #{returnFor.orderId}</div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: 'var(--tx-lo)', marginBottom: 14 }}>
              Frais de livraison retour (MAD)
              <input autoFocus type="number" value={returnForm.fee} onChange={(e) => setReturnForm((f) => ({ ...f, fee: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') submitReturn(); if (e.key === 'Escape') setReturnFor(null) }}
                placeholder="0 si le client repaie la livraison"
                style={{ fontSize: 14, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--tx-hi)' }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--tx-hi)', cursor: 'pointer', marginBottom: 6 }}>
              <input type="checkbox" checked={returnForm.restock} onChange={(e) => setReturnForm((f) => ({ ...f, restock: e.target.checked }))} />
              Remettre les produits en stock vendable
            </label>
            <p style={{ fontSize: 11, color: 'var(--tx-faint)', margin: '0 0 18px' }}>Simple retour : coche pour tout remettre en stock. Pour un <b>retour partiel</b> (un seul produit de la commande) ou un <b>échange produit différent</b>, utilise la page de la commande (choix par article + remplacement).</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setReturnFor(null)} disabled={busy} style={{ fontSize: 13, background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 14px', color: 'var(--tx-mid)', cursor: 'pointer' }}>Annuler</button>
              <button onClick={submitReturn} disabled={busy} style={{ fontSize: 13, background: 'var(--amber)', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>{busy ? '…' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}
    </BosShell>
  )
}

const th: React.CSSProperties = { padding: '11px 14px', fontSize: 11, fontWeight: 600, color: 'var(--tx-lo)', textTransform: 'uppercase', letterSpacing: '0.04em' }
const td: React.CSSProperties = { padding: '11px 14px', verticalAlign: 'top' }

interface CatProduct { id: number; name: string; brand: string | null; price: number; costPrice?: number }
interface Assigned { productId: number; quantity: number; price: number }

function AssignDrawer({ stagingId, onClose, onSaved }: { stagingId: number; onClose: () => void; onSaved: () => void }) {
  const [row, setRow] = useState<Row | null>(null)
  const [suggestions, setSuggestions] = useState<Array<{ rawName: string; qty: number; candidates: CatProduct[] }>>([])
  const [catalog, setCatalog] = useState<CatProduct[]>([])
  const [items, setItems] = useState<Assigned[]>([])
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'VIREMENT'>('COD')
  const [paidAmount, setPaidAmount] = useState('')
  const [paidAt, setPaidAt] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch(`/api/ops/sendit/staging/${stagingId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        setRow(d.row)
        setSuggestions(Array.isArray(d.suggestions) ? d.suggestions : [])
        setCatalog(Array.isArray(d.catalog) ? d.catalog : [])
        setItems(Array.isArray(d.row?.assignedProducts) ? d.row.assignedProducts : [])
        setPaymentMethod(d.row?.paymentMethod === 'VIREMENT' ? 'VIREMENT' : 'COD')
        setPaidAmount(d.row?.paidAmount != null ? String(d.row.paidAmount) : '')
        setPaidAt(d.row?.paidAt ? String(d.row.paidAt).slice(0, 10) : '')
        setPaymentReference(d.row?.paymentReference || '')
      })
      .finally(() => setLoading(false))
  }, [stagingId])

  const pName = (id: number) => catalog.find((p) => p.id === id)?.name || `#${id}`
  const addItem = (p: CatProduct, qty = 1) => setItems((x) => x.some((i) => i.productId === p.id) ? x : [...x, { productId: p.id, quantity: qty, price: p.price }])
  const setQty = (id: number, q: number) => setItems((x) => x.map((i) => i.productId === id ? { ...i, quantity: Math.max(1, q) } : i))
  const setPrice = (id: number, pr: number) => setItems((x) => x.map((i) => i.productId === id ? { ...i, price: Math.max(0, pr) } : i))
  const remove = (id: number) => setItems((x) => x.filter((i) => i.productId !== id))

  const productsTotal = items.reduce((s, i) => s + i.price * i.quantity, 0)
  const cod = Number(row?.amount) || 0
  const fee = Number(row?.fee) || 0
  const isVirement = paymentMethod === 'VIREMENT'
  // Cash actually received for the order: COD collected by Sendit, OR (virement)
  // the bank transfer = products + charged delivery (the customer paid both).
  const cashReceived = isVirement ? Number(paidAmount) || 0 : cod
  // Reconciliation only makes sense for COD (compare products to COD − delivery).
  const expected = isVirement ? productsTotal : cod - fee
  const diff = productsTotal - expected
  const reconciled = isVirement || Math.abs(diff) <= 5
  // P&L preview (same logic as the Commandes section)
  const costOf = (id: number) => Number(catalog.find((p) => p.id === id)?.costPrice) || 0
  const cogs = items.reduce((s, i) => s + costOf(i.productId) * i.quantity, 0)
  const missingCost = items.some((i) => costOf(i.productId) === 0)
  // Delivery is a pass-through (charged then paid to Sendit) → margin = cash − COGS − fee.
  const margin = cashReceived - cogs - fee
  const marginPct = cashReceived > 0 ? (margin / cashReceived) * 100 : 0

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/ops/sendit/staging/${stagingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedProducts: items, paymentMethod, paidAmount, paidAt, paymentReference }),
      })
      if (!res.ok) throw new Error()
      onSaved()
    } catch { setSaving(false) }
  }

  const filtered = search.trim().length >= 2
    ? catalog.filter((p) => `${p.name} ${p.brand || ''}`.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : []

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 350 / 0.35)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(480px, 100%)', height: '100%', background: 'var(--bg-1)', borderLeft: '1px solid var(--line)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--line-soft)', position: 'sticky', top: 0, background: 'var(--bg-1)' }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)' }}>Affecter les produits</span>
          <button onClick={onClose} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-lo)', padding: 0 }}><X style={{ width: 18, height: 18 }} /></button>
        </div>

        {loading || !row ? (
          <p style={{ padding: 24, fontSize: 13, color: 'var(--tx-lo)' }}>Chargement…</p>
        ) : (
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--bg-2)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-hi)' }}>{row.name} · <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx-mid)' }}>{row.phone}</span></div>
              <div style={{ fontSize: 12, color: 'var(--tx-lo)', marginTop: 2 }}>{row.city} · COD {mad(cod)} MAD (liv. {mad(fee)})</div>
              {row.productsText && <div style={{ fontSize: 12, color: 'var(--rose-bright)', marginTop: 6 }}>📦 Sendit : {row.productsText}</div>}
            </div>

            {/* Payment method — virement (prepaid) means Sendit COD = 0; profit must
                be based on the bank transfer, not the 0 COD. */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx-lo)', textTransform: 'uppercase', marginBottom: 8 }}>Mode de paiement</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['COD', 'VIREMENT'] as const).map((m) => (
                  <button key={m} onClick={() => setPaymentMethod(m)} style={{
                    flex: 1, padding: '8px 10px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${paymentMethod === m ? 'var(--green)' : 'var(--line)'}`,
                    boxShadow: paymentMethod === m ? '0 0 0 1px var(--green)' : 'none',
                    background: paymentMethod === m ? 'var(--green-bg)' : 'var(--bg-2)',
                    color: paymentMethod === m ? 'var(--green)' : 'var(--tx-mid)',
                  }}>{m === 'COD' ? '💵 COD (à la livraison)' : '🏦 Virement'}</button>
                ))}
              </div>
              {isVirement && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                  <label style={{ fontSize: 11, color: 'var(--tx-lo)' }}>
                    Montant reçu (MAD)
                    <input type="number" min={0.01} step={0.01} value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} required
                      style={{ width: '100%', marginTop: 4, padding: '7px 9px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--tx-hi)' }} />
                  </label>
                  <label style={{ fontSize: 11, color: 'var(--tx-lo)' }}>
                    Date de réception
                    <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)}
                      style={{ width: '100%', marginTop: 4, padding: '7px 9px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--tx-hi)' }} />
                  </label>
                  <label style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--tx-lo)' }}>
                    Référence bancaire
                    <input type="text" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Référence ou note du virement"
                      style={{ width: '100%', marginTop: 4, padding: '7px 9px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--tx-hi)' }} />
                  </label>
                  <p style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--tx-lo)' }}>COD Sendit = 0. Le dashboard utilisera uniquement ce montant bancaire confirmé.</p>
                </div>
              )}
            </div>

            {/* Suggestions */}
            {suggestions.some((s) => s.candidates.length > 0) && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx-lo)', textTransform: 'uppercase', marginBottom: 8 }}>💡 Suggestions (depuis le texte Sendit)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {suggestions.map((s, i) => (
                    <div key={i} style={{ fontSize: 12 }}>
                      <div style={{ color: 'var(--tx-mid)', marginBottom: 3 }}>« {s.rawName} » ×{s.qty}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {s.candidates.length === 0 && <span style={{ color: 'var(--tx-faint)', fontSize: 11 }}>aucune correspondance</span>}
                        {s.candidates.map((c) => (
                          <button key={c.id} onClick={() => addItem(c, s.qty)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--tx-hi)', cursor: 'pointer' }}>
                            + {c.name} <span style={{ color: 'var(--tx-faint)' }}>{mad(c.price)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Manual add */}
            <div>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ajouter un produit du catalogue…" style={{ width: '100%', padding: '8px 11px', fontSize: 13, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--tx-hi)' }} />
              {filtered.length > 0 && (
                <div style={{ marginTop: 4, border: '1px solid var(--line-soft)', borderRadius: 8, maxHeight: 180, overflowY: 'auto' }}>
                  {filtered.map((p) => (
                    <button key={p.id} onClick={() => { addItem(p); setSearch('') }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--tx-hi)' }}>
                      {p.name} <span style={{ color: 'var(--tx-faint)' }}>· {p.brand} · {mad(p.price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Assigned */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx-lo)', textTransform: 'uppercase', marginBottom: 8 }}>Produits affectés</div>
              {items.length === 0 ? <p style={{ fontSize: 12, color: 'var(--tx-faint)' }}>Aucun produit. Utilise les suggestions ou la recherche.</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.map((it) => (
                    <div key={it.productId} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-2)', borderRadius: 8, padding: '7px 10px' }}>
                      <span style={{ flex: 1, fontSize: 12, color: 'var(--tx-hi)' }}>{pName(it.productId)}</span>
                      <input type="number" min={1} value={it.quantity} onChange={(e) => setQty(it.productId, parseInt(e.target.value, 10) || 1)} style={{ width: 44, fontSize: 12, padding: '3px 5px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-1)', color: 'var(--tx-hi)' }} />
                      <span style={{ fontSize: 11, color: 'var(--tx-faint)' }}>×</span>
                      <input type="number" min={0} value={it.price} onChange={(e) => setPrice(it.productId, parseFloat(e.target.value) || 0)} style={{ width: 60, fontSize: 12, padding: '3px 5px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--bg-1)', color: 'var(--tx-hi)' }} />
                      <button onClick={() => remove(it.productId)} aria-label="Retirer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rose-bright)', padding: 0 }}><X style={{ width: 13, height: 13 }} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reconciliation */}
            <div style={{ background: reconciled ? 'var(--green-bg)' : 'var(--amber-bg)', borderRadius: 10, padding: 12, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Σ Produits</span><b style={{ fontFamily: 'var(--mono)' }}>{mad(productsTotal)} MAD</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--tx-lo)' }}><span>{isVirement ? 'Encaissé (virement, produits)' : 'Attendu (COD − livraison)'}</span><span style={{ fontFamily: 'var(--mono)' }}>{mad(expected)} MAD</span></div>
              {!isVirement && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, color: reconciled ? 'var(--green)' : 'var(--amber)', fontWeight: 600 }}>
                  <span>{reconciled ? '✓ Réconcilié' : 'Écart'}</span><span style={{ fontFamily: 'var(--mono)' }}>{diff > 0 ? '+' : ''}{mad(diff)} MAD</span>
                </div>
              )}
            </div>

            {/* P&L preview — what the official order's economics will be */}
            <div style={{ background: 'var(--bg-2)', borderRadius: 10, padding: 12, fontSize: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx-lo)', textTransform: 'uppercase' }}>Aperçu P&L (commande officielle)</span>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 5, background: 'var(--rose-bg)', color: 'var(--rose-bright)' }}>source : Sendit</span>
              </div>
              <Line label={isVirement ? 'CA (virement)' : 'CA (COD)'} value={`${mad(cashReceived)} MAD`} />
              <Line label="− Coût produits (COGS)" value={`${mad(cogs)} MAD`} dim />
              <Line label="− Livraison" value={`${mad(fee)} MAD`} dim />
              <div style={{ borderTop: '1px solid var(--line-soft)', margin: '6px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: margin >= 0 ? 'var(--green)' : 'var(--red)' }}>
                <span>Marge nette</span><span style={{ fontFamily: 'var(--mono)' }}>{mad(margin)} MAD · {marginPct.toFixed(0)}%</span>
              </div>
              {missingCost && <p style={{ fontSize: 11, color: 'var(--amber)', marginTop: 6 }}>⚠️ Un produit n&apos;a pas de coût (costPrice) → marge sous-estimée. Renseigne-le dans Produits.</p>}
            </div>

            <button onClick={save} disabled={saving || (isVirement && (!(Number(paidAmount) > 0) || !paidAt))} className="btn-modern btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              {saving ? 'Enregistrement…' : 'Enregistrer l\'affectation'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Line({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', color: dim ? 'var(--tx-lo)' : 'var(--tx-mid)', marginBottom: 2 }}>
      <span>{label}</span><span style={{ fontFamily: 'var(--mono)' }}>{value}</span>
    </div>
  )
}

function Tab({ label, value, active, onClick, tone }: { label: string; value: number; active: boolean; onClick: () => void; tone: string }) {
  const tones: Record<string, string> = { amber: 'var(--amber)', rose: 'var(--rose-bright)', green: 'var(--green)', blue: 'var(--blue)', gray: 'var(--tx-lo)' }
  const c = tones[tone] || 'var(--tx-lo)'
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', background: 'var(--bg-1)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer',
      border: `1px solid ${active ? c : 'var(--line-soft)'}`, boxShadow: active ? `0 0 0 1px ${c}` : 'none',
    }}>
      <div style={{ fontSize: 11, color: 'var(--tx-lo)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', color: c }}>{value}</div>
    </button>
  )
}
