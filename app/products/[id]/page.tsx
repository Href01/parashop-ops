'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import BosShell from '@/components/BosShell'

interface ProductDetail {
  name?: string; brand?: string; category?: string
  price?: number | string; costPrice?: number | string | null
  sku?: string; stock?: number; lowStockThreshold?: number
  recentOrders?: Array<{ id: number; status: string; createdAt: string; deliveryCity: string | null; sourceChannel: string | null; quantity: number; price: number | string }>
  sold?: { units: number | string; revenue: number | string }
  error?: string
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const mad = (v: unknown) => `${Math.round(num(v)).toLocaleString('fr-FR')} MAD`
const STATUS_FR: Record<string, string> = { PENDING: 'En attente', CONFIRMED: 'Confirmée', DELIVERED: 'Livrée', CANCELLED: 'Annulée', SHIPPED: 'En livraison' }
const STATUS_CLS: Record<string, string> = { PENDING: 'st-pending', CONFIRMED: 'st-confirmed', DELIVERED: 'st-delivered', CANCELLED: 'st-cancelled', SHIPPED: 'st-shipped' }

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [p, setP] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [cost, setCost] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => fetch(`/api/ops/products/${id}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : { error: 'not found' }))
    .then((d) => { setP(d); setCost(d?.costPrice != null ? String(d.costPrice) : '') })
    .catch(() => {})
    .finally(() => setLoading(false))

  useEffect(() => { load() }, [id])

  const saveCost = async () => {
    const v = parseFloat(cost)
    if (!v || v <= 0 || saving) return
    setSaving(true)
    await fetch(`/api/ops/products/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ costPrice: v }) }).catch(() => {})
    await load()
    setSaving(false)
  }

  const price = num(p?.price)
  const c = num(p?.costPrice)
  const margin = price > 0 && c > 0 ? ((price - c) / price) * 100 : null

  return (
    <BosShell active="products" title="Produit" crumb="Opérations">
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '22px 24px 60px' }}>
        <Link href="/products" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--tx-lo)', textDecoration: 'none', marginBottom: 16 }}>
          <ArrowLeft style={{ width: 15, height: 15 }} /> Tous les produits
        </Link>

        {loading ? <p style={{ color: 'var(--tx-lo)' }}>Chargement…</p>
        : !p || p.error ? <p style={{ color: 'var(--rose-bright)' }}>Produit introuvable.</p>
        : (
          <>
            <div style={{ marginBottom: 20 }}>
              <h1 className="serif-display" style={{ fontSize: 28, lineHeight: 1.06 }}>{p.name}</h1>
              <div style={{ fontSize: 13, color: 'var(--tx-lo)', marginTop: 6 }}>
                {p.brand}{p.category ? ` · ${p.category}` : ''}{p.sku ? ` · SKU ${p.sku}` : ''}
              </div>
              <a href="https://www.shinecosmetics.ma/admin/products" target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--rose-bright)', textDecoration: 'none', marginTop: 8 }}>
                Voir sur shinecosmetics.ma <ExternalLink style={{ width: 12, height: 12 }} />
              </a>
            </div>

            {/* Economics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 16 }}>
              <Stat label="Prix de vente" value={mad(p.price)} />
              <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius)', padding: 14, boxShadow: 'var(--shadow-1)' }}>
                <div style={{ fontSize: 11, color: 'var(--tx-lo)', marginBottom: 6 }}>Coût d&apos;achat</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={cost} onChange={(e) => setCost(e.target.value)} type="number" placeholder="—"
                    style={{ width: '100%', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 7, padding: '5px 8px', fontSize: 15, fontFamily: 'var(--mono)', color: 'var(--tx-hi)' }} />
                  <button className="btn-modern btn-primary btn-sm" onClick={saveCost} disabled={saving || !cost}>{saving ? '…' : 'OK'}</button>
                </div>
              </div>
              <Stat label="Marge" value={margin == null ? '—' : `${margin.toFixed(0)}%`} accent={margin != null && margin >= 35} warn={margin != null && margin < 20} />
              <Stat label="Stock" value={`${num(p.stock)} u.`} warn={num(p.stock) <= num(p.lowStockThreshold)} />
              <Stat label="Vendus (total)" value={`${num(p.sold?.units)} u.`} />
              <Stat label="CA livré (total)" value={mad(p.sold?.revenue)} accent />
            </div>

            {/* Recent orders with this product */}
            <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-soft)', fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)' }}>
                Commandes récentes avec ce produit
              </div>
              {(!p.recentOrders || p.recentOrders.length === 0) ? (
                <p style={{ padding: 28, textAlign: 'center', color: 'var(--tx-faint)', fontSize: 13 }}>Aucune vente enregistrée.</p>
              ) : (
                <table className="table-modern">
                  <thead><tr><th>Commande</th><th>Statut</th><th>Canal</th><th>Ville</th><th className="r">Qté</th><th className="r">Date</th></tr></thead>
                  <tbody>
                    {p.recentOrders.map((o) => (
                      <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => (window.location.href = `/orders/${o.id}`)}>
                        <td className="num t-strong">#{o.id}</td>
                        <td><span className={`st ${STATUS_CLS[o.status] || 'st-pending'}`}><span className="sd" />{STATUS_FR[o.status] || o.status}</span></td>
                        <td className="t-sub">{o.sourceChannel || '—'}</td>
                        <td className="t-sub">{o.deliveryCity || '—'}</td>
                        <td className="r num">{o.quantity}</td>
                        <td className="r t-sub">{new Date(o.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </BosShell>
  )
}

function Stat({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius)', padding: 14, boxShadow: 'var(--shadow-1)' }}>
      <div style={{ fontSize: 11, color: 'var(--tx-lo)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, fontFamily: 'var(--mono)', color: warn ? 'var(--red)' : accent ? 'var(--rose-bright)' : 'var(--tx-hi)' }}>{value}</div>
    </div>
  )
}
