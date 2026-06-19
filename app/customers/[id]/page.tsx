'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Mail, Phone, MapPin, MessageCircle, Star } from 'lucide-react'
import BosShell from '@/components/BosShell'

interface Msg { id: number; direction: string; type: string; body: string | null; status: string | null; createdAt: string; orderId: number | null }
interface Rev { id: number; rating: number; comment: string | null; approved: boolean | null; createdAt: string; productName: string | null }
interface Detail {
  customer: Record<string, unknown> | null
  orders: Array<{ id: number; total: number | string; status: string; createdAt: string; deliveryCity: string | null; paymentMethod: string | null }>
  metrics: { totalOrders: number | string; totalSpent: number | string; avgOrderValue: number | string; lastOrderDate: string | null } | null
  messages?: Msg[]
  reviews?: Rev[]
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const mad = (v: unknown) => `${Math.round(num(v)).toLocaleString('fr-FR')} MAD`
const STATUS_FR: Record<string, string> = { PENDING: 'En attente', CONFIRMED: 'Confirmée', DELIVERED: 'Livrée', CANCELLED: 'Annulée', SHIPPED: 'En livraison' }
const STATUS_CLS: Record<string, string> = { PENDING: 'st-pending', CONFIRMED: 'st-confirmed', DELIVERED: 'st-delivered', CANCELLED: 'st-cancelled', SHIPPED: 'st-shipped' }

// Deterministic avatar hue (same as Messages)
function avatarHue(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return h
}
function initials(name: string | null) {
  if (name) return name.trim().charAt(0).toUpperCase()
  return 'C'
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [sendingReward, setSendingReward] = useState(false)
  const [rewardMsg, setRewardMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function sendReward() {
    if (sendingReward) return
    if (!confirm('Envoyer la confirmation WhatsApp des 50 DH à cette cliente ?')) return
    setSendingReward(true)
    setRewardMsg(null)
    try {
      const res = await fetch(`/api/ops/customers/${id}/send-reward`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { setRewardMsg({ ok: false, text: json.error || 'Échec' }); return }
      setRewardMsg({ ok: true, text: 'Message envoyé ✓' })
    } catch {
      setRewardMsg({ ok: false, text: 'Erreur réseau' })
    } finally {
      setSendingReward(false)
    }
  }

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 22 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 26, background: `oklch(0.62 0.15 ${avatarHue(c.name || c.phone || String(c.id))})` }}>
                  {initials(c.name)}
                </div>
                <div>
              <h1 className="serif-display" style={{ fontSize: 30, lineHeight: 1.05, marginBottom: 0 }}>{c.name || 'Sans nom'}</h1>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 8, fontSize: 13, color: 'var(--tx-lo)' }}>
                {c.email && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Mail style={{ width: 14, height: 14 }} />{c.email}</span>}
                {c.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Phone style={{ width: 14, height: 14 }} />{c.phone}</span>}
                {c.city && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><MapPin style={{ width: 14, height: 14 }} />{c.city}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {c.segment && <span className="badge-modern badge-success badge-sm">{c.segment}</span>}
                {c.tier && <span className="badge-modern badge-warning badge-sm">{c.tier}</span>}
              </div>
              </div>
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <button
                  onClick={sendReward}
                  disabled={sendingReward}
                  className="btn-modern btn-sm btn-primary"
                  style={{ whiteSpace: 'nowrap' }}
                  title="Envoyer la confirmation WhatsApp des 50 DH de récompense"
                >
                  🎁 {sendingReward ? 'Envoi…' : 'Confirmer les 50 DH'}
                </button>
                {rewardMsg && (
                  <p style={{ fontSize: 12, marginTop: 6, fontWeight: 600, color: rewardMsg.ok ? 'var(--green)' : 'var(--rose-bright)' }}>
                    {rewardMsg.text}
                  </p>
                )}
              </div>
            </div>

            {m && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, marginBottom: 22 }}>
                <Stat label="Commandes" value={String(num(m.totalOrders))} />
                <Stat label="Total dépensé" value={mad(m.totalSpent)} accent />
                <Stat label="Panier moyen" value={mad(m.avgOrderValue)} />
                <Stat label="Cagnotte fidélité" value={`${Math.floor(num(c.points) / 10)} DH`} />
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

            {/* CRM: WhatsApp + reviews */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 16 }}>
              {/* Messages */}
              <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--line-soft)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)' }}>
                    <MessageCircle style={{ width: 15, height: 15 }} /> Messages WhatsApp
                  </span>
                  {c.phone && (
                    <Link href={`/messages/${encodeURIComponent(String(c.phone).startsWith('+') ? c.phone : '+' + String(c.phone).replace(/^0/, '212'))}`} style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none' }}>
                      Conversation →
                    </Link>
                  )}
                </div>
                {(!data.messages || data.messages.length === 0) ? (
                  <p style={{ padding: 24, textAlign: 'center', color: 'var(--tx-faint)', fontSize: 13 }}>Aucun message.</p>
                ) : (
                  <div>
                    {data.messages.map((msg) => (
                      <div key={msg.id} style={{ padding: '11px 18px', borderBottom: '1px solid var(--line-soft)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: msg.direction === 'in' ? 'var(--blue)' : 'var(--tx-lo)' }}>
                            {msg.direction === 'in' ? '← Réponse' : msg.type === 'otp' ? '🔐 OTP' : msg.type === 'review' ? '⭐ Demande d\'avis' : '→ Envoyé'}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--tx-faint)' }}>
                            {new Date(msg.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            {msg.direction === 'out' && msg.status === 'read' ? ' · Vu' : msg.direction === 'out' && msg.status === 'delivered' ? ' · Livré' : ''}
                          </span>
                        </div>
                        <p style={{ fontSize: 12.5, color: 'var(--tx-mid)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {msg.body?.startsWith('[Image]') ? '🖼️ Image' :
                           msg.body?.startsWith('[Audio') ? '🎵 Message vocal' :
                           msg.body?.startsWith('[Document') ? '📄 Document' :
                           msg.body || `[${msg.type}]`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reviews */}
              <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '14px 18px', borderBottom: '1px solid var(--line-soft)', fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)' }}>
                  <Star style={{ width: 15, height: 15 }} /> Avis laissés
                </div>
                {(!data.reviews || data.reviews.length === 0) ? (
                  <p style={{ padding: 24, textAlign: 'center', color: 'var(--tx-faint)', fontSize: 13 }}>Aucun avis.</p>
                ) : (
                  <div>
                    {data.reviews.map((rev) => (
                      <div key={rev.id} style={{ padding: '11px 18px', borderBottom: '1px solid var(--line-soft)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx-hi)' }}>
                            {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                          </span>
                          <span className={`badge-modern ${rev.approved === true ? 'badge-success' : 'badge-warning'} badge-sm`}>
                            {rev.approved === true ? '✓ Publié' : '⏳ En attente'}
                          </span>
                        </div>
                        <p style={{ fontSize: 11.5, color: 'var(--tx-lo)', margin: '0 0 2px' }}>{rev.productName || '—'}</p>
                        {rev.comment && <p style={{ fontSize: 12.5, color: 'var(--tx-mid)', margin: 0 }}>{rev.comment}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
