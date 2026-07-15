'use client'

import { useEffect, useState } from 'react'
import BosShell from '@/components/BosShell'
import { Bell, Check, MessageCircle, PackageCheck } from 'lucide-react'

type Pending = { id: number; phone: string; locale: string; createdAt: string }
type Prod = {
  productId: number; name: string; brand: string | null; image: string | null
  stock: number; virtualStock: number; sellable: number; importUnavailable: boolean
  pending: Pending[]; notifiedCount: number
}
type Data = { products: Prod[]; totalPending: number }

const dfmt = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })

// WhatsApp deep link (phone stored as 0XXXXXXXXX → 212XXXXXXXXX) with a pre-filled,
// locale-aware "back in stock" message.
function waLink(phone: string, name: string, locale: string) {
  const intl = phone.startsWith('0') ? '212' + phone.slice(1) : phone
  const msg = locale === 'ar'
    ? `مرحباً 👋 خبر سار: *${name}* عاد متوفراً على shinecosmetics.ma! لقد تركت رقمك ليتم إخبارك عند عودته. اطلبه الآن قبل نفاده مجدداً 🛒`
    : `Bonjour 👋 Bonne nouvelle : *${name}* est de nouveau disponible sur shinecosmetics.ma ! Vous nous aviez laissé votre numéro pour être prévenu·e. Commandez vite avant la prochaine rupture 🛒`
  return `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`
}

export default function RestockWaitlistPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/ops/restock-notify', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setData(d) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const markNotified = async (ids: number[]) => {
    if (ids.length === 0) return
    setBusy(ids[0])
    // Optimistic: drop those from pending locally.
    setData((prev) => prev && {
      ...prev,
      products: prev.products.map((p) => ({ ...p, pending: p.pending.filter((x) => !ids.includes(x.id)), notifiedCount: p.notifiedCount + p.pending.filter((x) => ids.includes(x.id)).length })),
      totalPending: prev.totalPending - ids.length,
    })
    await fetch('/api/ops/restock-notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }).catch(() => {})
    setBusy(null)
  }

  // Clicking "Prévenir" opens WhatsApp AND marks that person notified.
  const notifyOne = (p: Prod, person: Pending) => {
    window.open(waLink(person.phone, `${p.brand ? p.brand + ' ' : ''}${p.name}`, person.locale), '_blank', 'noopener')
    markNotified([person.id])
  }

  return (
    <BosShell active="restock" title="Liste d'attente" crumb="Relation client">
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '22px 24px 60px' }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>RELATION CLIENT</div>
        <h1 className="serif-display" style={{ fontSize: 28, lineHeight: 1.05 }}>Liste d&apos;attente</h1>
        <p style={{ fontSize: 13, color: 'var(--tx-mid)', marginTop: 7, maxWidth: 720, lineHeight: 1.55 }}>
          Les clients qui ont laissé leur numéro sur un produit <b>indisponible (importation)</b>. Dès qu&apos;un produit revient, préviens-les en un clic sur WhatsApp — ce sont des ventes quasi garanties.
        </p>

        {loading ? (
          <div className="card-modern" style={{ padding: 24, marginTop: 18 }}><div className="skeleton-line" style={{ width: '40%', height: 14 }} /></div>
        ) : !data || data.products.length === 0 ? (
          <div className="card-modern" style={{ padding: 40, textAlign: 'center', marginTop: 18 }}>
            <Bell style={{ width: 34, height: 34, color: 'var(--tx-faint)', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx-mid)', margin: 0 }}>Aucune inscription pour l&apos;instant</p>
            <p className="fs13 tx-faint" style={{ marginTop: 4 }}>Quand un produit indisponible collecte des numéros, ils apparaîtront ici.</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, margin: '18px 0 20px', flexWrap: 'wrap' }}>
              <div className="card-modern" style={{ padding: '12px 16px' }}>
                <div className="fs12 tx-lo">En attente (à prévenir)</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--amber)', fontFamily: 'var(--mono)' }}>{data.totalPending}</div>
              </div>
              <div className="card-modern" style={{ padding: '12px 16px' }}>
                <div className="fs12 tx-lo">Produits concernés</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--tx-hi)', fontFamily: 'var(--mono)' }}>{data.products.filter((p) => p.pending.length > 0).length}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {data.products.map((p) => {
                const back = p.sellable > 0 && !p.importUnavailable
                const pendingIds = p.pending.map((x) => x.id)
                return (
                  <div key={p.productId} className="card-modern" style={{ padding: 0, overflow: 'hidden', borderLeft: `3px solid ${back ? 'var(--green)' : 'var(--amber)'}` }}>
                    {/* header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', flexWrap: 'wrap' }}>
                      {p.image && <img src={p.image} alt={p.name} style={{ width: 40, height: 40, borderRadius: 7, objectFit: 'cover', flexShrink: 0 }} />}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)', lineHeight: 1.3 }}>{p.name}</div>
                        <div className="fs11 tx-lo" style={{ marginTop: 2 }}>{p.brand} · {p.pending.length} en attente{p.notifiedCount > 0 && ` · ${p.notifiedCount} déjà prévenus`}</div>
                      </div>
                      {back
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--green)', background: 'var(--green-bg)', padding: '5px 11px', borderRadius: 8 }}><PackageCheck style={{ width: 14, height: 14 }} /> De retour — préviens !</span>
                        : <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)', background: 'var(--amber-bg)', padding: '5px 11px', borderRadius: 8 }}>🚫 Encore indisponible</span>}
                    </div>

                    {/* pending list */}
                    {p.pending.length > 0 && (
                      <div style={{ borderTop: '1px solid var(--line-soft)' }}>
                        {p.pending.map((person) => (
                          <div key={person.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: '1px solid var(--line-soft)', flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--tx-hi)', direction: 'ltr' }}>{person.phone}</span>
                            {person.locale === 'ar' && <span className="fs10" style={{ color: 'var(--tx-faint)', border: '1px solid var(--line-soft)', borderRadius: 4, padding: '0 5px' }}>AR</span>}
                            <span className="fs11 tx-faint">inscrit le {dfmt(person.createdAt)}</span>
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                              <button onClick={() => notifyOne(p, person)} className="btn-modern btn-sm" style={{ background: '#25D366', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <MessageCircle style={{ width: 13, height: 13 }} /> Prévenir
                              </button>
                              <button onClick={() => markNotified([person.id])} disabled={busy === person.id} className="btn-modern btn-subtle btn-sm" title="Marquer comme prévenu sans WhatsApp">
                                <Check style={{ width: 13, height: 13 }} />
                              </button>
                            </div>
                          </div>
                        ))}
                        <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'flex-end' }}>
                          <button onClick={() => markNotified(pendingIds)} className="btn-modern btn-subtle btn-sm">Tout marquer prévenu ({p.pending.length})</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </BosShell>
  )
}
