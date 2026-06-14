'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, X, AlertCircle, KeyRound } from 'lucide-react'
import BosShell from '@/components/BosShell'

interface Ad {
  id: number
  name: string
  platform: string
  spend: number
  revenue: number
  roas: number
  status: string
  externalId: string | null
  eventId: number | null
  eventName: string | null
  productIds: number[]
  impressions: number | null
  clicks: number | null
  lastSyncedAt: string | null
}
interface EventLite { id: number; name: string }
interface ProductLite { id: number; name: string }

const mad = (v: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v || 0)
const PLAT_COLOR: Record<string, string> = { Meta: '#0866FF', TikTok: '#000000', Google: '#EA4335', Snapchat: '#FFC400', Influence: 'var(--rose-bright)', Autre: 'var(--tx-lo)' }

export default function AdsPage() {
  const [ads, setAds] = useState<Ad[]>([])
  const [events, setEvents] = useState<EventLite[]>([])
  const [products, setProducts] = useState<ProductLite[]>([])
  const [totals, setTotals] = useState({ spend: 0, revenue: 0, roas: 0 })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = () => {
    fetch('/api/ops/ads', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { ads: [], totals: {} }))
      .then((d) => { setAds(Array.isArray(d.ads) ? d.ads : []); if (d.totals) setTotals(d.totals) })
      .catch(() => setError('Chargement impossible'))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    load()
    fetch('/api/ops/events', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { events: [] })).then((d) => setEvents(Array.isArray(d.events) ? d.events : [])).catch(() => {})
    fetch('/api/ops/products', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])).then((d) => setProducts(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])

  const syncMeta = async () => {
    if (syncing) return
    setSyncing(true); setError(null); setNotice(null)
    try {
      const res = await fetch('/api/ops/ads/sync-meta', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
      setNotice(`Meta synchronisé : ${d.created} nouvelle(s), ${d.updated} mise(s) à jour.`)
      load()
      setTimeout(() => setNotice(null), 5000)
    } catch (e) { setError(e instanceof Error ? e.message : 'Sync impossible') }
    finally { setSyncing(false) }
  }

  const refreshToken = async () => {
    if (syncing) return
    setSyncing(true); setError(null); setNotice(null)
    try {
      const res = await fetch('/api/ops/ads/refresh-meta-token')
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
      setNotice(d.neverExpires ? 'Token Meta rafraîchi (System User — n\'expire jamais).' : `Token Meta rafraîchi — valable ${d.expiresInDays} jours.`)
      setTimeout(() => setNotice(null), 5000)
    } catch (e) { setError(e instanceof Error ? e.message : 'Refresh impossible') }
    finally { setSyncing(false) }
  }

  const patchAd = async (id: number, patch: Record<string, unknown>) => {
    // optimistic
    setAds((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch, eventName: 'eventId' in patch ? (events.find((e) => e.id === patch.eventId)?.name ?? null) : a.eventName } : a)))
    try {
      await fetch(`/api/ops/ads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    } catch { load() }
  }

  const pName = (id: number) => products.find((p) => p.id === id)?.name || `#${id}`
  // Suggest an event when the Meta campaign name contains an event name
  const suggestEvent = (ad: Ad): EventLite | null => {
    if (ad.eventId) return null
    const n = ad.name.toLowerCase()
    return events.find((e) => e.name && n.includes(e.name.toLowerCase())) || null
  }

  return (
    <BosShell active="ads" title="Régie pub" crumb="Croissance">
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 24px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>PUBLICITÉ PAYANTE</div>
            <h1 className="serif-display" style={{ fontSize: 28, lineHeight: 1.05 }}>Régie pub</h1>
            <p style={{ fontSize: 13, color: 'var(--tx-mid)', marginTop: 7, lineHeight: 1.55, maxWidth: 640 }}>
              Tes campagnes <b>Meta</b> importées automatiquement. Relie chaque campagne à un <b>event</b> et à des <b>produits</b> — la dépense se met à jour toute seule.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginTop: 4 }}>
            <button className="btn-modern" onClick={syncMeta} disabled={syncing}>
              <RefreshCw style={{ width: 15, height: 15 }} />{syncing ? 'Sync…' : 'Sync Meta'}
            </button>
            <button className="btn-modern" onClick={refreshToken} disabled={syncing} title="Prolonger le token Meta" style={{ padding: '0 10px' }}>
              <KeyRound style={{ width: 15, height: 15 }} />
            </button>
          </div>
        </div>

        {/* Totals */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Stat label="Dépense totale" value={`${mad(totals.spend)} MAD`} />
          <Stat label="CA Meta (pixel)" value={`${mad(totals.revenue)} MAD`} />
          <Stat label="ROAS Meta" value={`${(totals.roas || 0).toFixed(1)}x`} accent />
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
        ) : ads.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 14 }}>
            <p style={{ fontSize: 14, color: 'var(--tx-hi)', fontWeight: 600 }}>Aucune campagne pub</p>
            <p style={{ fontSize: 13, color: 'var(--tx-lo)', marginTop: 6 }}>Configure Meta puis clique <b>Sync Meta</b> pour importer tes campagnes.</p>
          </div>
        ) : (
          <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line-soft)', textAlign: 'left' }}>
                  <th style={th}>Campagne</th>
                  <th style={{ ...th, textAlign: 'right' }}>Dépense</th>
                  <th style={{ ...th, textAlign: 'right' }}>ROAS</th>
                  <th style={th}>Event</th>
                  <th style={th}>Produits</th>
                </tr>
              </thead>
              <tbody>
                {ads.map((ad) => {
                  const suggestion = suggestEvent(ad)
                  return (
                    <tr key={ad.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, color: '#fff', background: PLAT_COLOR[ad.platform] || 'var(--tx-lo)' }}>{ad.platform}</span>
                          <span style={{ color: 'var(--tx-hi)', fontWeight: 500 }}>{ad.name}</span>
                        </div>
                        {ad.lastSyncedAt && <span style={{ fontSize: 10, color: 'var(--tx-faint)' }}>sync {new Date(ad.lastSyncedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--tx-hi)' }}>{mad(ad.spend)}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: ad.roas >= 2 ? 'var(--green)' : ad.roas > 0 ? 'var(--tx-hi)' : 'var(--tx-faint)' }}>{(ad.roas || 0).toFixed(1)}x</td>
                      <td style={td}>
                        <select
                          value={ad.eventId ?? ''}
                          onChange={(e) => patchAd(ad.id, { eventId: e.target.value ? Number(e.target.value) : null })}
                          style={{ fontSize: 12, padding: '5px 8px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--tx-hi)', maxWidth: 170 }}
                        >
                          <option value="">— Aucun —</option>
                          {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                        {suggestion && (
                          <button onClick={() => patchAd(ad.id, { eventId: suggestion.id })} style={{ display: 'block', marginTop: 4, fontSize: 10, color: 'var(--rose-bright)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            💡 Suggéré : {suggestion.name}
                          </button>
                        )}
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                          {ad.productIds.map((pid) => (
                            <span key={pid} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, padding: '2px 4px 2px 7px', borderRadius: 5, color: 'var(--rose-bright)', background: 'var(--rose-bg)' }}>
                              {pName(pid)}
                              <button onClick={() => patchAd(ad.id, { productIds: ad.productIds.filter((x) => x !== pid) })} aria-label="Retirer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rose-bright)', padding: 0, display: 'grid', placeItems: 'center' }}><X style={{ width: 11, height: 11 }} /></button>
                            </span>
                          ))}
                          <select
                            value=""
                            onChange={(e) => { if (e.target.value) patchAd(ad.id, { productIds: Array.from(new Set([...ad.productIds, Number(e.target.value)])) }) }}
                            style={{ fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px dashed var(--line)', background: 'transparent', color: 'var(--tx-lo)' }}
                          >
                            <option value="">+ produit</option>
                            {products.filter((p) => !ad.productIds.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </BosShell>
  )
}

const th: React.CSSProperties = { padding: '11px 14px', fontSize: 11, fontWeight: 600, color: 'var(--tx-lo)', textTransform: 'uppercase', letterSpacing: '0.04em' }
const td: React.CSSProperties = { padding: '11px 14px', verticalAlign: 'top' }

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--tx-lo)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: accent ? 'var(--rose-bright)' : 'var(--tx-hi)' }}>{value}</div>
    </div>
  )
}
