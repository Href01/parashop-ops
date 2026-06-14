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
  content?: Array<{ id: number; title: string; platform: string | null; type: string | null; status: string; dueDate: string | null }>
  tasks?: Array<{ id: number; title: string; status: string; priority: string; owner: string | null; dueDate: string | null }>
  decisions?: Array<{ id: number; title: string; decision: string | null; owner: string | null; decisionDate: string | null }>
  experiments?: Array<{ id: number; name: string; status: string; channel: string | null; successMetric: string | null }>
  error?: string
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const mad = (v: unknown) => `${Math.round(num(v)).toLocaleString('fr-FR')} MAD`
const STATUS_FR: Record<string, string> = { PENDING: 'En attente', CONFIRMED: 'Confirmée', DELIVERED: 'Livrée', CANCELLED: 'Annulée', SHIPPED: 'En livraison' }
const STATUS_CLS: Record<string, string> = { PENDING: 'st-pending', CONFIRMED: 'st-confirmed', DELIVERED: 'st-delivered', CANCELLED: 'st-cancelled', SHIPPED: 'st-shipped' }
const CONTENT_FR: Record<string, string> = { IDEA: 'Idée', TO_PRODUCE: 'À produire', SCHEDULED: 'Planifié', PUBLISHED: 'Publié' }
const CONTENT_COLOR: Record<string, string> = { IDEA: 'var(--tx-lo)', TO_PRODUCE: 'var(--amber)', SCHEDULED: 'var(--blue)', PUBLISHED: 'var(--green)' }
const TASK_STATUS_FR: Record<string, string> = { TODO: 'À faire', IN_PROGRESS: 'En cours', BLOCKED: 'Bloqué', DONE: 'Fait' }
const TASK_STATUS_COLOR: Record<string, string> = { TODO: 'var(--tx-lo)', IN_PROGRESS: 'var(--blue)', BLOCKED: 'var(--red)', DONE: 'var(--green)' }
const PRIO_COLOR: Record<string, string> = { URGENT: 'var(--red)', HIGH: 'var(--amber)', MEDIUM: 'var(--blue)', LOW: 'var(--tx-faint)' }
const EXP_FR: Record<string, string> = { PLANNED: 'Planifiée', RUNNING: 'En cours', WON: 'Gagnée', LOST: 'Perdue', PAUSED: 'En pause' }
const EXP_COLOR: Record<string, string> = { PLANNED: 'var(--tx-lo)', RUNNING: 'var(--blue)', WON: 'var(--green)', LOST: 'var(--red)', PAUSED: 'var(--amber)' }
const fmtDate = (d: string | null) => { if (!d) return ''; const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d); if (!m) return d; const months = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.']; return `${parseInt(m[3],10)} ${months[parseInt(m[2],10)-1] || ''}`; }

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

            {/* Content promoting this product */}
            {p.content && p.content.length > 0 && (
              <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderBottom: '1px solid var(--line-soft)' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)' }}>Contenus qui mettent en avant ce produit</span>
                  <span style={{ fontSize: 11, color: 'var(--tx-faint)', fontFamily: 'var(--mono)' }}>{p.content.length}</span>
                  <a href="/content" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--rose-bright)', textDecoration: 'none' }}>Content Hub →</a>
                </div>
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {p.content.map((c) => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: CONTENT_COLOR[c.status] || 'var(--tx-lo)', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--tx-hi)' }}>{c.title}</span>
                      {c.platform && <span style={{ fontSize: 11, color: 'var(--tx-lo)' }}>{c.platform}</span>}
                      {c.type && <span style={{ fontSize: 11, color: 'var(--tx-faint)' }}>{c.type}</span>}
                      <span style={{ fontSize: 10, fontWeight: 700, color: CONTENT_COLOR[c.status] || 'var(--tx-lo)' }}>{CONTENT_FR[c.status] || c.status}</span>
                      {c.dueDate && <span style={{ fontSize: 10, color: 'var(--tx-faint)', fontFamily: 'var(--mono)' }}>{c.dueDate.slice(8, 10)}/{c.dueDate.slice(5, 7)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tasks linked to this product (Work Hub) */}
            {p.tasks && p.tasks.length > 0 && (
              <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderBottom: '1px solid var(--line-soft)' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)' }}>📋 Tâches liées à ce produit</span>
                  <span style={{ fontSize: 11, color: 'var(--tx-faint)', fontFamily: 'var(--mono)' }}>{p.tasks.length}</span>
                  <a href="/work-hub" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--rose-bright)', textDecoration: 'none' }}>Work Hub →</a>
                </div>
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {p.tasks.map((t) => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 8, borderLeft: `3px solid ${PRIO_COLOR[t.priority] || 'var(--line)'}` }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: TASK_STATUS_COLOR[t.status] || 'var(--tx-lo)', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--tx-hi)' }}>{t.title}</span>
                      {t.owner && <span style={{ fontSize: 11, color: 'var(--tx-lo)' }}>{t.owner}</span>}
                      <span style={{ fontSize: 10, fontWeight: 700, color: TASK_STATUS_COLOR[t.status] || 'var(--tx-lo)' }}>{TASK_STATUS_FR[t.status] || t.status}</span>
                      {t.dueDate && <span style={{ fontSize: 10, color: 'var(--tx-faint)', fontFamily: 'var(--mono)' }}>{fmtDate(t.dueDate)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Decisions linked to this product */}
            {p.decisions && p.decisions.length > 0 && (
              <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderBottom: '1px solid var(--line-soft)' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)' }}>📖 Décisions sur ce produit</span>
                  <span style={{ fontSize: 11, color: 'var(--tx-faint)', fontFamily: 'var(--mono)' }}>{p.decisions.length}</span>
                  <a href="/work-hub" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--rose-bright)', textDecoration: 'none' }}>Work Hub →</a>
                </div>
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {p.decisions.map((d) => (
                    <div key={d.id} style={{ padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--tx-hi)' }}>{d.title}</span>
                        {d.owner && <span style={{ fontSize: 11, color: 'var(--tx-lo)' }}>{d.owner}</span>}
                        {d.decisionDate && <span style={{ fontSize: 10, color: 'var(--tx-faint)', fontFamily: 'var(--mono)' }}>{fmtDate(d.decisionDate)}</span>}
                      </div>
                      {d.decision && <div style={{ fontSize: 12, color: 'var(--tx-mid)' }}>{d.decision}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Experiments linked to this product */}
            {p.experiments && p.experiments.length > 0 && (
              <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderBottom: '1px solid var(--line-soft)' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)' }}>🧪 Expériences sur ce produit</span>
                  <span style={{ fontSize: 11, color: 'var(--tx-faint)', fontFamily: 'var(--mono)' }}>{p.experiments.length}</span>
                  <a href="/work-hub" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--rose-bright)', textDecoration: 'none' }}>Work Hub →</a>
                </div>
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {p.experiments.map((e) => (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: EXP_COLOR[e.status] || 'var(--tx-lo)', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--tx-hi)' }}>{e.name}</span>
                      {e.channel && <span style={{ fontSize: 11, color: 'var(--tx-lo)' }}>{e.channel}</span>}
                      {e.successMetric && <span style={{ fontSize: 11, color: 'var(--tx-faint)' }}>{e.successMetric}</span>}
                      <span style={{ fontSize: 10, fontWeight: 700, color: EXP_COLOR[e.status] || 'var(--tx-lo)' }}>{EXP_FR[e.status] || e.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
