'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Truck, PackageCheck, AlertTriangle, RefreshCw, ChevronRight } from 'lucide-react'
import BosShell from '@/components/BosShell'

interface OrderRef {
  orderId: number
  qty: number
  status: string
  shipped: boolean
  customer: string
  created: string
}
interface StockRow {
  id: number
  name: string
  brand: string
  stock: number
  committed: number
  toShip: number
  inTransit: number
  available: number
  reorderPoint: number
  reorderQty: number
  supplier: string | null
  orders: OrderRef[]
}
interface ToShipItem { productId: number; name: string; brand: string; qty: number; stock: number }
interface ToShipOrder {
  id: number
  customer: string
  city: string
  phone: string | null
  status: string
  created: string
  units: number
  canFulfill: boolean
  items: ToShipItem[]
}
interface Data {
  summary: { toShipOrders: number; toShipUnits: number; shortages: number; atRisk: number }
  toShip: ToShipOrder[]
  stockDemand: StockRow[]
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })

/** Stock health for a product given its open demand. */
function healthOf(r: StockRow): { label: string; bg: string; fg: string } {
  if (r.available < 0) return { label: 'Rupture', bg: 'var(--rose-bg)', fg: 'var(--rose-bright)' }
  if (r.stock <= r.reorderPoint || r.available <= r.reorderPoint) return { label: 'Stock bas', bg: 'var(--amber-bg)', fg: 'var(--amber)' }
  return { label: 'OK', bg: 'var(--green-bg)', fg: 'var(--green)' }
}

export default function FulfillmentPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [onlyProblems, setOnlyProblems] = useState(false)

  const load = async () => {
    try {
      const res = await fetch('/api/ops/fulfillment', { cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || `API ${res.status}`)
      setData(j)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const rows = (data?.stockDemand ?? []).filter((r) => !onlyProblems || r.available < 0 || r.stock <= r.reorderPoint)

  return (
    <BosShell active="fulfillment" title="Suivi & Réappro" crumb="Opérations">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '8px 4px 40px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--rose)' }}>Opérations</p>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--tx-hi)' }}>Suivi & Réappro</h1>
            <p style={{ fontSize: 13, color: 'var(--tx-mid)', marginTop: 4 }}>
              Ce qui reste à <b>expédier</b>, et par produit le <b>stock face aux commandes ouvertes</b> — pour ne plus rater une rupture.
            </p>
          </div>
          <button className="btn-modern btn-subtle" onClick={() => { setLoading(true); load() }} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} /> Actualiser
          </button>
        </div>

        {error && <div style={{ padding: 14, borderRadius: 10, background: 'var(--rose-bg)', color: 'var(--rose-bright)', fontSize: 13, marginBottom: 16 }}>{error}</div>}
        {loading && !data ? (
          <p style={{ color: 'var(--tx-faint)', fontSize: 13, padding: 24, textAlign: 'center' }}>Chargement…</p>
        ) : data && (
          <>
            {/* Summary chips */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 22 }}>
              <Stat icon={<Truck size={16} />} label="À expédier" value={`${data.summary.toShipOrders} cmd`} sub={`${data.summary.toShipUnits} articles`} tone="rose" />
              <Stat icon={<AlertTriangle size={16} />} label="Ruptures" value={String(data.summary.shortages)} sub="commandé > stock" tone={data.summary.shortages > 0 ? 'rose' : 'green'} />
              <Stat icon={<PackageCheck size={16} />} label="Stock bas" value={String(data.summary.atRisk)} sub="sous le seuil" tone={data.summary.atRisk > 0 ? 'amber' : 'green'} />
            </div>

            {/* ── À EXPÉDIER ── */}
            <section style={{ marginBottom: 30 }}>
              <h2 style={sectionTitle}>À expédier <span style={{ color: 'var(--tx-faint)', fontWeight: 500 }}>· commandes confirmées pas encore remises à Sendit</span></h2>
              {data.toShip.length === 0 ? (
                <div style={emptyBox}>✅ Rien en attente d'expédition — toutes les commandes ouvertes ont un suivi Sendit.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.toShip.map((o) => (
                    <div key={o.id} style={{ border: '1px solid var(--line)', borderRadius: 10, background: 'var(--card)', padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <Link href={`/orders/${o.id}`} style={{ fontWeight: 700, color: 'var(--tx-hi)', fontSize: 14 }}>#{o.id}</Link>
                          <span style={{ fontSize: 13, color: 'var(--tx-mid)' }}>{o.customer}</span>
                          <span style={{ fontSize: 12, color: 'var(--tx-faint)' }}>{o.city} · {fmtDate(o.created)}</span>
                        </div>
                        {o.canFulfill
                          ? <span style={{ ...pill, background: 'var(--green-bg)', color: 'var(--green)' }}>Stock OK</span>
                          : <span style={{ ...pill, background: 'var(--rose-bg)', color: 'var(--rose-bright)' }}>⚠ Stock insuffisant</span>}
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {o.items.map((it, i) => {
                          const short = it.stock < it.qty
                          return (
                            <span key={i} style={{
                              fontSize: 12, padding: '3px 8px', borderRadius: 6,
                              background: short ? 'var(--rose-bg)' : 'var(--hover)',
                              color: short ? 'var(--rose-bright)' : 'var(--tx-mid)',
                            }} title={short ? `Stock ${it.stock} < ${it.qty} commandé` : `Stock ${it.stock}`}>
                              {it.name} <b>×{it.qty}</b>{short ? ` (stock ${it.stock})` : ''}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── STOCK vs DEMANDE ── */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                <h2 style={{ ...sectionTitle, marginBottom: 0 }}>Stock vs demande <span style={{ color: 'var(--tx-faint)', fontWeight: 500 }}>· par produit ayant des commandes ouvertes</span></h2>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--tx-mid)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Problèmes seulement
                </label>
              </div>
              {rows.length === 0 ? (
                <div style={emptyBox}>Aucun produit avec des commandes ouvertes.</div>
              ) : (
                <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
                      <thead>
                        <tr style={{ background: 'var(--hover)' }}>
                          <th style={th}>Produit</th>
                          <th style={{ ...th, textAlign: 'right' }}>Stock</th>
                          <th style={{ ...th, textAlign: 'right' }}>Commandé</th>
                          <th style={{ ...th, textAlign: 'right' }}>À expédier</th>
                          <th style={{ ...th, textAlign: 'right' }}>Dispo</th>
                          <th style={th}>État</th>
                          <th style={th}>Fournisseur</th>
                          <th style={{ ...th, width: 28 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const h = healthOf(r)
                          const open = expanded === r.id
                          return (
                            <>
                              <tr key={r.id} onClick={() => setExpanded(open ? null : r.id)} style={{ borderTop: '1px solid var(--line-soft)', cursor: 'pointer' }}>
                                <td style={td}>
                                  <div style={{ fontWeight: 600, color: 'var(--tx-hi)' }}>{r.name}</div>
                                  <div style={{ fontSize: 11, color: 'var(--tx-faint)' }}>{r.brand}</div>
                                </td>
                                <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.stock}</td>
                                <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--tx-hi)', fontWeight: 600 }}>{r.committed}</td>
                                <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--tx-mid)' }}>{r.toShip}{r.inTransit > 0 && <span style={{ color: 'var(--tx-faint)', fontSize: 11 }}> (+{r.inTransit} transit)</span>}</td>
                                <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: r.available < 0 ? 'var(--rose-bright)' : 'var(--tx-hi)' }}>{r.available}</td>
                                <td style={td}>
                                  <span style={{ ...pill, background: h.bg, color: h.fg }}>{h.label}</span>
                                  {r.available < 0 && <span style={{ fontSize: 11, color: 'var(--rose-bright)', marginLeft: 6 }}>manque {Math.abs(r.available)}</span>}
                                </td>
                                <td style={{ ...td, color: 'var(--tx-mid)', fontSize: 12 }}>{r.supplier || '—'}</td>
                                <td style={{ ...td, color: 'var(--tx-faint)' }}><ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} /></td>
                              </tr>
                              {open && (
                                <tr style={{ background: 'var(--hover)' }}>
                                  <td colSpan={8} style={{ padding: '10px 14px' }}>
                                    <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--tx-faint)', marginBottom: 8 }}>
                                      Commandes qui demandent ce produit
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      {r.orders.map((ord, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, flexWrap: 'wrap' }}>
                                          <Link href={`/orders/${ord.orderId}`} style={{ fontWeight: 600, color: 'var(--tx-hi)' }}>#{ord.orderId}</Link>
                                          <span style={{ color: 'var(--tx-mid)' }}>{ord.customer}</span>
                                          <span style={{ fontFamily: 'var(--mono)', color: 'var(--tx-hi)' }}>×{ord.qty}</span>
                                          {ord.shipped
                                            ? <span style={{ ...pill, background: 'var(--green-bg)', color: 'var(--green)' }}>Expédié</span>
                                            : <span style={{ ...pill, background: 'var(--amber-bg)', color: 'var(--amber)' }}>À expédier</span>}
                                          <span style={{ color: 'var(--tx-faint)', fontSize: 11 }}>{fmtDate(ord.created)}</span>
                                        </div>
                                      ))}
                                    </div>
                                    {r.available < 0 && (
                                      <p style={{ marginTop: 10, fontSize: 12, color: 'var(--rose-bright)' }}>
                                        🔴 {r.committed} commandés pour {r.stock} en stock — <b>recommander {r.reorderQty || Math.abs(r.available)} au fournisseur{r.supplier ? ` (${r.supplier})` : ''}</b>.
                                      </p>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <p style={{ fontSize: 11, color: 'var(--tx-faint)', marginTop: 8 }}>
                Dispo = stock − commandé (commandes non livrées). Négatif = tu as vendu plus que ton stock → recommander. Le stock n'est pas décrémenté automatiquement.
              </p>
            </section>
          </>
        )}
      </div>
    </BosShell>
  )
}

const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 12 }
const th: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 600, color: 'var(--tx-lo)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'left', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top' }
const pill: React.CSSProperties = { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5, whiteSpace: 'nowrap' }
const emptyBox: React.CSSProperties = { padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--tx-mid)', border: '1px dashed var(--line)', borderRadius: 10 }

function Stat({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub: string; tone: 'rose' | 'amber' | 'green' }) {
  const toneMap = {
    rose: { bg: 'var(--rose-bg)', fg: 'var(--rose-bright)' },
    amber: { bg: 'var(--amber-bg)', fg: 'var(--amber)' },
    green: { bg: 'var(--green-bg)', fg: 'var(--green)' },
  }[tone]
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--card)', padding: 14 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: toneMap.fg, background: toneMap.bg, padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--tx-hi)', marginTop: 8 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--tx-faint)' }}>{sub}</div>
    </div>
  )
}
