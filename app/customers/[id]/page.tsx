'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Mail, Phone, MapPin } from 'lucide-react'
import BosShell from '@/components/BosShell'

interface Detail {
  customer: Record<string, unknown> | null
  orders: Array<{ id: number; total: number | string; status: string; createdAt: string; deliveryCity: string | null; paymentMethod: string | null }>
  metrics: { totalOrders: number | string; totalSpent: number | string; avgOrderValue: number | string; lastOrderDate: string | null } | null
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const mad = (v: unknown) => `${Math.round(num(v)).toLocaleString('fr-FR')} MAD`
const STATUS_FR: Record<string, string> = { PENDING: 'En attente', CONFIRMED: 'Confirmée', DELIVERED: 'Livrée', CANCELLED: 'Annulée', SHIPPED: 'En livraison' }
const STATUS_CLS: Record<string, string> = { PENDING: 'st-pending', CONFIRMED: 'st-confirmed', DELIVERED: 'st-delivered', CANCELLED: 'st-cancelled', SHIPPED: 'st-shipped' }

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/ops/customers/${id}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  const c = (data?.customer || {}) as Record<string, any>
  const m = data?.metrics

  return (
    <BosShell active="customers" title="Cliente" crumb="Croissance">
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '22px 24px 60px' }}>
        <Link href="/customers" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--tx-lo)', textDecoration: 'none', marginBottom: 16 }}>
          <ArrowLeft style={{ width: 15, height: 15 }} /> Toutes les clientes
        </Link>

        {loading ? (
          <p style={{ color: 'var(--tx-lo)' }}>Chargement…</p>
        ) : !data?.customer ? (
          <p style={{ color: 'var(--rose-bright)' }}>Cliente introuvable.</p>
        ) : (
          <>
            <div style={{ marginBottom: 22 }}>
              <h1 className="serif-display" style={{ fontSize: 30, lineHeight: 1.05 }}>{c.name || 'Sans nom'}</h1>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8, fontSize: 13, color: 'var(--tx-lo)' }}>
                {c.email && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Mail style={{ width: 14, height: 14 }} />{c.email}</span>}
                {c.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Phone style={{ width: 14, height: 14 }} />{c.phone}</span>}
                {c.city && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><MapPin style={{ width: 14, height: 14 }} />{c.city}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {c.segment && <span className="badge green">{c.segment}</span>}
                {c.tier && <span className="badge amber">{c.tier}</span>}
              </div>
            </div>

            {m && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 22 }}>
                <Stat label="Commandes" value={String(num(m.totalOrders))} />
                <Stat label="Total dépensé" value={mad(m.totalSpent)} accent />
                <Stat label="Panier moyen" value={mad(m.avgOrderValue)} />
                <Stat label="Dernière commande" value={m.lastOrderDate ? new Date(m.lastOrderDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} />
              </div>
            )}

            <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-soft)', fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)' }}>
                Historique de commandes
              </div>
              {(!data.orders || data.orders.length === 0) ? (
                <p style={{ padding: 28, textAlign: 'center', color: 'var(--tx-faint)', fontSize: 13 }}>Aucune commande.</p>
              ) : (
                <table className="table-modern">
                  <thead><tr><th>Commande</th><th>Statut</th><th>Ville</th><th className="r">Total</th><th className="r">Date</th></tr></thead>
                  <tbody>
                    {data.orders.map((o) => (
                      <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => (window.location.href = `/orders/${o.id}`)}>
                        <td className="num t-strong">#{o.id}</td>
                        <td><span className={`st ${STATUS_CLS[o.status] || 'st-pending'}`}><span className="sd" />{STATUS_FR[o.status] || o.status}</span></td>
                        <td className="t-sub">{o.deliveryCity || '—'}</td>
                        <td className="r num t-strong">{mad(o.total)}</td>
                        <td className="r t-sub">{new Date(o.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</td>
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

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius)', padding: 14, boxShadow: 'var(--shadow-1)' }}>
      <div style={{ fontSize: 11, color: 'var(--tx-lo)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, fontFamily: 'var(--mono)', color: accent ? 'var(--rose-bright)' : 'var(--tx-hi)' }}>{value}</div>
    </div>
  )
}
