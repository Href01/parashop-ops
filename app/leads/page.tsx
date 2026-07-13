'use client'

import { useEffect, useState } from 'react'
import BosShell from '@/components/BosShell'
import { PhoneCall, MessageCircle, Check, Trash2, AlertTriangle, ShoppingBag } from 'lucide-react'

type CartItem = { id: number; name: string; quantity: number; price: number }
type Lead = {
  id: number; sessionId: string; name: string | null; phone: string | null; city: string | null
  address: string | null; cartItems: CartItem[] | null; cartTotal: number | null; lastStep: string | null
  reason: string | null; createdAt: string; updatedAt: string
}
type ErrRow = { kind: string; label: string | null; detail: string | null; at: string }
type Data = {
  leads: Lead[]
  errors: ErrRow[]
  summary: { leads: number; otp_failed_24h: number; purchase_failed_24h: number }
}

const money = (v: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v)
const waLink = (phone: string, name?: string | null) => {
  const digits = phone.replace(/\D/g, '')
  const num = digits.startsWith('212') ? digits : `212${digits.replace(/^0/, '')}`
  const msg = encodeURIComponent(`Bonjour${name ? ' ' + name.split(' ')[0] : ''}, c'est Shine Cosmetics 🌸 Vous avez commencé une commande sur notre site — je peux vous aider à la finaliser ?`)
  return `https://wa.me/${num}?text=${msg}`
}
const timeAgo = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`
  return `il y a ${Math.round(s / 86400)} j`
}
const errLabel: Record<string, { txt: string; hint: string }> = {
  otp_delivery_failed: { txt: 'OTP non livré', hint: 'code WhatsApp non reçu' },
  otp_send_failed: { txt: "Échec d'envoi OTP", hint: 'envoi du code impossible' },
  purchase_failed: { txt: 'Commande échouée', hint: 'erreur à la validation' },
}

export default function LeadsPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)

  const load = async () => {
    try {
      const res = await fetch('/api/ops/leads', { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const act = async (id: number, method: 'PATCH' | 'DELETE') => {
    setBusy(id)
    try {
      await fetch(`/api/ops/leads/${id}`, method === 'PATCH'
        ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contacted: true }) }
        : { method })
      await load()
    } finally { setBusy(null) }
  }

  return (
    <BosShell active="leads" title="Leads & Alertes" crumb="Relation client">
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '22px 24px 60px' }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>RELATION CLIENT</div>
        <h1 className="serif-display" style={{ fontSize: 28, lineHeight: 1.05 }}>Leads &amp; Alertes</h1>
        <p style={{ fontSize: 13, color: 'var(--tx-mid)', marginTop: 7, maxWidth: 680, lineHeight: 1.55 }}>
          Les clients qui ont saisi leurs infos <b>sans finaliser</b> — à rappeler manuellement. Et les <b>erreurs</b> récentes (OTP, commande) pour réagir vite.
        </p>

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, margin: '16px 0 20px' }}>
          <div className="card-modern" style={{ padding: 14 }}>
            <div className="fs12 tx-lo">Leads à rappeler</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--rose-bright)' }}>{data?.summary.leads ?? '—'}</div>
          </div>
          <div className="card-modern" style={{ padding: 14 }}>
            <div className="fs12 tx-lo">OTP échoués (24h)</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: (data?.summary.otp_failed_24h ?? 0) > 0 ? 'var(--red, #dc2626)' : 'var(--tx-hi)' }}>{data?.summary.otp_failed_24h ?? '—'}</div>
          </div>
          <div className="card-modern" style={{ padding: 14 }}>
            <div className="fs12 tx-lo">Commandes échouées (24h)</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: (data?.summary.purchase_failed_24h ?? 0) > 0 ? 'var(--red, #dc2626)' : 'var(--tx-hi)' }}>{data?.summary.purchase_failed_24h ?? '—'}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 18 }} className="leads-grid">
          {/* Leads to call */}
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <PhoneCall style={{ width: 16, height: 16 }} /> Leads à rappeler
            </h3>
            {loading ? <div className="fs13 tx-lo">Chargement…</div>
              : !data?.leads.length ? <div className="card-modern" style={{ padding: 20, textAlign: 'center', color: 'var(--tx-faint)', fontSize: 13 }}>Aucun lead en attente 🎉</div>
              : data.leads.map((l) => (
                <div key={l.id} className="card-modern" style={{ padding: 14, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)' }}>{l.name || 'Client'}</div>
                      <div className="fs12 tx-mid" style={{ marginTop: 2 }}>{l.phone} · {l.city || '—'}</div>
                      {l.cartItems?.length ? (
                        <div className="fs11 tx-lo" style={{ marginTop: 6 }}>
                          🛒 {l.cartItems.map((it) => `${it.quantity}× ${it.name?.slice(0, 24)}`).join(', ')}
                          {l.cartTotal ? <b style={{ color: 'var(--tx-mid)' }}> · {money(l.cartTotal)} MAD</b> : null}
                        </div>
                      ) : null}
                      <div className="fs11 tx-faint" style={{ marginTop: 4 }}>
                        {l.lastStep === 'summary' ? 'Bloqué au paiement' : `Étape: ${l.lastStep || '—'}`} · {timeAgo(l.updatedAt)}
                        {l.reason ? ` · ${l.reason}` : ''}
                      </div>
                    </div>
                    <span className="badge amber" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>à rappeler</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {l.phone && <a href={waLink(l.phone, l.name)} target="_blank" rel="noreferrer" className="btn-modern btn-sm btn-primary" style={{ textDecoration: 'none' }}><MessageCircle style={{ width: 14, height: 14 }} /> WhatsApp</a>}
                    {l.phone && <a href={`tel:${l.phone}`} className="btn-modern btn-sm btn-subtle" style={{ textDecoration: 'none' }}><PhoneCall style={{ width: 14, height: 14 }} /> Appeler</a>}
                    <button className="btn-modern btn-sm btn-subtle" disabled={busy === l.id} onClick={() => act(l.id, 'PATCH')}><Check style={{ width: 14, height: 14 }} /> Traité</button>
                    <button className="btn-modern btn-sm btn-subtle" disabled={busy === l.id} onClick={() => act(l.id, 'DELETE')} title="Supprimer"><Trash2 style={{ width: 14, height: 14 }} /></button>
                  </div>
                </div>
              ))}
          </div>

          {/* Errors */}
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle style={{ width: 16, height: 16 }} /> Alertes erreurs (7j)
            </h3>
            <div className="card-modern" style={{ padding: 12 }}>
              {loading ? <div className="fs13 tx-lo">Chargement…</div>
                : !data?.errors.length ? <div style={{ padding: 12, textAlign: 'center', color: 'var(--tx-faint)', fontSize: 13 }}>Aucune erreur ✓</div>
                : data.errors.map((e, i) => {
                  const meta = errLabel[e.kind] || { txt: e.kind, hint: '' }
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 12 }}>
                      <span className="badge red" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{meta.txt}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="tx-hi" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.label || meta.hint}{e.detail ? ` · ${e.detail}` : ''}
                        </div>
                        <div className="fs11 tx-faint">{timeAgo(e.at)}</div>
                      </div>
                      {e.kind.startsWith('otp') && e.label && /\d/.test(e.label) && (
                        <a href={waLink(e.label)} target="_blank" rel="noreferrer" className="btn-modern btn-sm btn-subtle" style={{ textDecoration: 'none' }} title="Contacter"><MessageCircle style={{ width: 13, height: 13 }} /></a>
                      )}
                    </div>
                  )
                })}
            </div>
            <p className="fs11 tx-faint" style={{ marginTop: 8, lineHeight: 1.5 }}>
              <ShoppingBag style={{ width: 12, height: 12, display: 'inline', verticalAlign: -1 }} /> Un « OTP non livré » = le client n'a pas reçu son code (souvent un souci de facturation WhatsApp). Le site renvoie maintenant le code automatiquement, mais tu peux le contacter directement ici.
            </p>
          </div>
        </div>
      </div>
      <style jsx>{`@media (max-width: 900px) { .leads-grid { grid-template-columns: 1fr !important; } }`}</style>
    </BosShell>
  )
}
