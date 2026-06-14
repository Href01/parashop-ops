'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, X, Link2, Sparkles, AlertCircle, RefreshCw, KeyRound } from 'lucide-react'
import BosShell from '@/components/BosShell'

interface Item {
  id: number
  title: string
  type: string | null
  platform: string | null
  owner: string | null
  status: 'IDEA' | 'TO_PRODUCE' | 'SCHEDULED' | 'PUBLISHED'
  dueDate: string | null
  hook: string | null
  caption: string | null
  assetLink: string | null
  productId: number | null
  productIds: number[] | null
  campaignId: number | null
  permalink?: string | null
  externalId?: string | null
  reach?: number | null
  views?: number | null
  clicks?: number | null
  likes?: number | null
  saves?: number | null
  comments?: number | null
  shares?: number | null
  metricsSyncedAt?: string | null
}

interface ProductLite { id: number; name: string; brand?: string | null }
interface CampaignLite { id: number; name: string }

const COLUMNS: { key: Item['status']; label: string; color: string }[] = [
  { key: 'IDEA', label: 'Idées', color: 'var(--tx-lo)' },
  { key: 'TO_PRODUCE', label: 'À produire', color: 'var(--amber)' },
  { key: 'SCHEDULED', label: 'Planifié', color: 'var(--blue)' },
  { key: 'PUBLISHED', label: 'Publié', color: 'var(--green)' },
]
const PLATFORMS = ['Instagram', 'TikTok', 'Facebook', 'WhatsApp', 'Autre']
const TYPES = ['Reel', 'Post', 'Story', 'Carrousel', 'Live']
const OWNERS = ['AM', 'MH']
const PLAT_COLOR: Record<string, string> = {
  Instagram: 'var(--c-instagram)', TikTok: 'var(--c-tiktok)', Facebook: 'var(--blue)', WhatsApp: 'var(--c-whatsapp)', Autre: 'var(--tx-faint)',
}
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** Compact number: 1500 → 1,5k · 12000 → 12k. */
function fmtNum(n: number | null | undefined): string {
  if (n == null) return '–'
  if (n < 1000) return String(n)
  const k = n / 1000
  return `${k % 1 === 0 ? k : k.toFixed(1).replace('.', ',')}k`
}

/** Format 'YYYY-MM-DD' (timezone-safe — no Date parsing). */
function fmtDate(d: string | null): string {
  if (!d) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
  if (!m) return d
  return `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1] || ''}`
}

export default function ContentPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [platform, setPlatform] = useState('Instagram')
  const [type, setType] = useState('Reel')
  const [owner, setOwner] = useState('MH')
  const [due, setDue] = useState('')
  const [saving, setSaving] = useState(false)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<Item['status'] | null>(null)
  const [editing, setEditing] = useState<Item | null>(null)
  const [products, setProducts] = useState<ProductLite[]>([])
  const [campaigns, setCampaigns] = useState<CampaignLite[]>([])
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  const syncInstagram = async () => {
    if (syncing) return
    setSyncing(true); setNotice(null); setError(null)
    try {
      const res = await fetch('/api/ops/content/sync-instagram', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
      setNotice(`Instagram synchronisé : ${d.updated} post(s) mis à jour.`)
      load()
      setTimeout(() => setNotice(null), 5000)
    } catch (e) { setError(e instanceof Error ? e.message : 'Sync impossible') }
    finally { setSyncing(false) }
  }

  const refreshToken = async () => {
    if (syncing) return
    setSyncing(true); setNotice(null); setError(null)
    try {
      const res = await fetch('/api/ops/content/refresh-instagram-token')
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
      setNotice(`Token Instagram rafraîchi — valable ${d.expiresInDays} jours.`)
      setTimeout(() => setNotice(null), 5000)
    } catch (e) { setError(e instanceof Error ? e.message : 'Refresh impossible') }
    finally { setSyncing(false) }
  }

  // Lookups for chips (id → name)
  const productName = (id: number | null) => products.find((p) => p.id === id)?.name || null
  const campaignName = (id: number | null) => campaigns.find((c) => c.id === id)?.name || null

  const load = () => {
    setLoading(true)
    fetch('/api/ops/content', { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 401 ? 'Session expirée — reconnecte-toi.' : `Erreur ${r.status}`)
        return r.json()
      })
      .then((d) => { setItems(Array.isArray(d.items) ? d.items : []); setError(null) })
      .catch((e) => setError(e.message || 'Chargement impossible'))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    load()
    fetch('/api/ops/products', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setProducts(Array.isArray(d) ? d : []))
      .catch(() => {})
    fetch('/api/ops/campaigns', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { campaigns: [] }))
      .then((d) => setCampaigns(Array.isArray(d?.campaigns) ? d.campaigns : []))
      .catch(() => {})
  }, [])

  const create = async () => {
    if (saving) return
    if (!title.trim()) {
      setError('Écris d’abord un titre pour ton idée de contenu.')
      titleRef.current?.focus()
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/ops/content', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), platform, type, owner, dueDate: due || null }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || (res.status === 401 ? 'Session expirée — reconnecte-toi.' : `Erreur ${res.status}`))
      if (d.item) { setItems((x) => [d.item, ...x]); setTitle(''); setDue('') }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création impossible')
    } finally { setSaving(false) }
  }

  const patch = async (id: number, fields: Partial<Item>) => {
    const prev = items
    setItems((x) => x.map((i) => (i.id === id ? { ...i, ...fields } : i)))
    if (editing?.id === id) setEditing((e) => (e ? { ...e, ...fields } : e))
    try {
      const res = await fetch(`/api/ops/content/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `Erreur ${res.status}`)
      }
      setError(null)
    } catch (e) {
      setItems(prev) // rollback
      setError(e instanceof Error ? e.message : 'Mise à jour impossible')
    }
  }

  const remove = async (id: number) => {
    const prev = items
    setItems((x) => x.filter((i) => i.id !== id))
    if (editing?.id === id) setEditing(null)
    try {
      const res = await fetch(`/api/ops/content/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      setError(null)
    } catch (e) {
      setItems(prev) // rollback
      setError(e instanceof Error ? e.message : 'Suppression impossible')
    }
  }

  const drop = (status: Item['status']) => {
    if (draggingId != null) {
      const it = items.find((i) => i.id === draggingId)
      if (it && it.status !== status) patch(draggingId, { status })
    }
    setDraggingId(null); setDragOver(null)
  }

  const isEmpty = !loading && items.length === 0 && !error

  return (
    <BosShell active="content" title="Content Hub" crumb="Croissance">
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 24px 60px' }}>
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>CALENDRIER DE CONTENU</div>
            <h1 className="serif-display" style={{ fontSize: 28, lineHeight: 1.05 }}>Content Hub</h1>
            <p style={{ fontSize: 13, color: 'var(--tx-mid)', marginTop: 7, lineHeight: 1.55, maxWidth: 640 }}>
              Ton <b>calendrier éditorial social</b> — 1 carte = 1 post (Insta, TikTok, WhatsApp…). Tu planifies, produis et publies tes contenus.
              <br />Pour les tâches, décisions et opérations internes →{' '}
              <a href="/work-hub" style={{ color: 'var(--rose-bright)', fontWeight: 600, textDecoration: 'none' }}>Work Hub</a>.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginTop: 4 }}>
            <button className="btn-modern" onClick={syncInstagram} disabled={syncing} title="Mettre à jour les stats des posts publiés depuis Instagram">
              <RefreshCw style={{ width: 15, height: 15 }} />{syncing ? 'Sync…' : 'Sync Instagram'}
            </button>
            <button className="btn-modern" onClick={refreshToken} disabled={syncing} title="Prolonger le token Instagram de 60 jours" style={{ padding: '0 10px' }}>
              <KeyRound style={{ width: 15, height: 15 }} />
            </button>
          </div>
        </div>

        {/* Sync notice */}
        {notice && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--tx-hi)' }}>✓ {notice}</span>
            <button onClick={() => setNotice(null)} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-faint)', padding: 0 }}><X style={{ width: 14, height: 14 }} /></button>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--rose-bg)', border: '1px solid var(--rose-line)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
            <AlertCircle style={{ width: 16, height: 16, color: 'var(--rose-bright)', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--tx-hi)' }}>{error}</span>
            <button onClick={() => { setError(null); load() }} style={{ fontSize: 12, fontWeight: 600, color: 'var(--rose-bright)', background: 'none', border: 'none', cursor: 'pointer' }}>Réessayer</button>
            <button onClick={() => setError(null)} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-faint)', padding: 0 }}><X style={{ width: 14, height: 14 }} /></button>
          </div>
        )}

        {/* Composer */}
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 12, padding: 12, marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder="Idée de contenu…" style={inp({ flex: '1 1 220px' })} />
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={inp({ width: 120 })}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select>
          <select value={type} onChange={(e) => setType(e.target.value)} style={inp({ width: 110 })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} style={inp({ width: 80 })}>{OWNERS.map((o) => <option key={o}>{o}</option>)}</select>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={inp({ width: 150 })} />
          <button type="button" className="btn-modern btn-primary" onClick={create} disabled={saving} style={{ opacity: title.trim() ? 1 : 0.6 }}><Plus style={{ width: 16, height: 16 }} />{saving ? '…' : 'Ajouter'}</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx-lo)' }}>Chargement…</div>
        ) : isEmpty ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--bg-1)', border: '1px dashed var(--line)', borderRadius: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--rose-bg)', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}>
              <Sparkles style={{ width: 22, height: 22, color: 'var(--rose-bright)' }} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 6 }}>Ton calendrier de contenu est vide</h3>
            <p style={{ fontSize: 13, color: 'var(--tx-mid)', maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
              Ajoute ta première idée ci-dessus (titre + plateforme + type). Ensuite glisse les cartes&nbsp;:
              <b> Idées → À produire → Planifié → Publié</b>. Clique une carte pour ajouter le hook, la légende et le lien du média.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {COLUMNS.map((col) => {
              const colItems = items.filter((i) => i.status === col.key)
              const isOver = dragOver === col.key
              return (
                <div key={col.key}
                  onDragOver={(e) => { e.preventDefault(); if (dragOver !== col.key) setDragOver(col.key) }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver((c) => (c === col.key ? null : c)) }}
                  onDrop={() => drop(col.key)}
                  style={{ background: isOver ? 'var(--rose-bg)' : 'var(--bg-2)', border: `1px solid ${isOver ? 'var(--rose-line)' : 'var(--line-soft)'}`, borderRadius: 12, padding: 10, minHeight: 200, transition: 'background 0.12s, border-color 0.12s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 4px 10px' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: col.color }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-hi)' }}>{col.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--tx-faint)', fontFamily: 'var(--mono)' }}>{colItems.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {colItems.map((it) => {
                      const pids = it.productIds && it.productIds.length ? it.productIds : (it.productId ? [it.productId] : [])
                      const pNames = pids.map(productName).filter(Boolean) as string[]
                      const cName = campaignName(it.campaignId)
                      const accent = it.platform ? (PLAT_COLOR[it.platform] || 'var(--line)') : 'var(--line)'
                      return (
                        <div key={it.id} className="ch-card" draggable
                          onClick={() => setEditing(it)}
                          onDragStart={(e) => { setDraggingId(it.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(it.id)) }}
                          onDragEnd={() => { setDraggingId(null); setDragOver(null) }}
                          style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderLeft: `3px solid ${accent}`, borderRadius: 10, padding: '11px 12px', cursor: 'pointer', opacity: draggingId === it.id ? 0.4 : 1, boxShadow: 'var(--shadow-1)' }}>
                          {/* Title + delete */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--tx-hi)', lineHeight: 1.35 }}>{it.title}</span>
                            <button onClick={(e) => { e.stopPropagation(); remove(it.id) }} aria-label="Supprimer" className="ch-del" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-faint)', padding: 0, flexShrink: 0, marginTop: 1 }}><Trash2 style={{ width: 13, height: 13 }} /></button>
                          </div>

                          {/* Meta: platform · type · date · link · owner */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, flexWrap: 'wrap' }}>
                            {it.platform && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.2, padding: '2px 8px', borderRadius: 20, color: '#fff', background: PLAT_COLOR[it.platform] || 'var(--tx-faint)' }}>{it.platform}</span>}
                            {it.type && <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--tx-lo)' }}>{it.type}</span>}
                            {it.dueDate && <span style={{ fontSize: 10, color: 'var(--tx-lo)', fontFamily: 'var(--mono)' }}>{fmtDate(it.dueDate)}</span>}
                            {it.assetLink && <Link2 style={{ width: 11, height: 11, color: 'var(--blue)' }} />}
                            <span style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, color: '#fff', background: it.owner === 'AM' ? 'var(--rose-bright)' : 'var(--blue)' }}>{it.owner || '–'}</span>
                          </div>

                          {/* Connections: products + campaign */}
                          {(pNames.length > 0 || cName) && (
                            <div style={{ display: 'flex', gap: 5, marginTop: 9, paddingTop: 9, borderTop: '1px solid var(--line-soft)', flexWrap: 'wrap' }}>
                              {pNames.slice(0, 2).map((n, i) => (
                                <span key={i} style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5, color: 'var(--rose-bright)', background: 'var(--rose-bg)', maxWidth: 118, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🛍 {n}</span>
                              ))}
                              {pNames.length > 2 && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 5, color: 'var(--rose-bright)', background: 'var(--rose-bg)' }}>+{pNames.length - 2}</span>}
                              {cName && <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5, color: 'var(--amber)', background: 'var(--amber-bg)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📣 {cName}</span>}
                            </div>
                          )}

                          {/* Organic performance (published posts) */}
                          {it.status === 'PUBLISHED' && (it.reach != null || it.likes != null || it.views != null) && (
                            <div style={{ display: 'flex', gap: 10, marginTop: 9, paddingTop: 9, borderTop: '1px solid var(--line-soft)', fontSize: 10, color: 'var(--tx-lo)' }}>
                              {it.reach != null && <span title="Portée">📡 {fmtNum(it.reach)}</span>}
                              {it.views != null && <span title="Vues">▶ {fmtNum(it.views)}</span>}
                              {it.likes != null && <span title="J'aime">❤ {fmtNum(it.likes)}</span>}
                              {it.saves != null && <span title="Enregistrements">🔖 {fmtNum(it.saves)}</span>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {colItems.length === 0 && <div style={{ fontSize: 11, color: 'var(--tx-faint)', textAlign: 'center', padding: '20px 0' }}>{isOver ? 'Déposer ici' : '—'}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {!isEmpty && !loading && <p style={{ fontSize: 11, color: 'var(--tx-faint)', marginTop: 8 }}>Glisse une carte entre les colonnes • clique une carte pour l&apos;éditer.</p>}
      </div>

      {/* Edit drawer */}
      {editing && <EditDrawer item={editing} products={products} campaigns={campaigns} onClose={() => setEditing(null)} onSave={patch} onDelete={remove} />}
    </BosShell>
  )
}

function EditDrawer({ item, products, campaigns, onClose, onSave, onDelete }: {
  item: Item
  products: ProductLite[]
  campaigns: CampaignLite[]
  onClose: () => void
  onSave: (id: number, fields: Partial<Item>) => void
  onDelete: (id: number) => void
}) {
  const [title, setTitle] = useState(item.title)
  const [platform, setPlatform] = useState(item.platform || 'Instagram')
  const [type, setType] = useState(item.type || 'Reel')
  const [owner, setOwner] = useState(item.owner || 'MH')
  const [due, setDue] = useState(item.dueDate || '')
  const [hook, setHook] = useState(item.hook || '')
  const [caption, setCaption] = useState(item.caption || '')
  const [assetLink, setAssetLink] = useState(item.assetLink || '')
  const [productIds, setProductIds] = useState<number[]>(
    item.productIds && item.productIds.length ? item.productIds : (item.productId != null ? [item.productId] : [])
  )
  const [campaignId, setCampaignId] = useState<string>(item.campaignId != null ? String(item.campaignId) : '')
  // Organic post performance
  const [permalink, setPermalink] = useState(item.permalink || '')
  const [reach, setReach] = useState(item.reach != null ? String(item.reach) : '')
  const [views, setViews] = useState(item.views != null ? String(item.views) : '')
  const [likes, setLikes] = useState(item.likes != null ? String(item.likes) : '')
  const [saves, setSaves] = useState(item.saves != null ? String(item.saves) : '')
  const [comments, setComments] = useState(item.comments != null ? String(item.comments) : '')
  const [shares, setShares] = useState(item.shares != null ? String(item.shares) : '')

  const addProduct = (id: number) => setProductIds((x) => (x.includes(id) ? x : [...x, id]))
  const removeProduct = (id: number) => setProductIds((x) => x.filter((p) => p !== id))
  const pName = (id: number) => products.find((p) => p.id === id)?.name || `#${id}`
  const available = products.filter((p) => !productIds.includes(p.id))
  const metric = (s: string): number | null => { const n = parseInt(s, 10); return Number.isFinite(n) && n >= 0 ? n : null }

  const save = () => {
    onSave(item.id, {
      title: title.trim() || item.title,
      platform, type, owner,
      dueDate: due || null,
      hook: hook || null,
      caption: caption || null,
      assetLink: assetLink || null,
      productIds,
      productId: productIds[0] ?? null, // keep legacy column in sync (first product)
      campaignId: campaignId ? parseInt(campaignId, 10) : null,
      permalink: permalink.trim() || null,
      reach: metric(reach), views: metric(views), likes: metric(likes),
      saves: metric(saves), comments: metric(comments), shares: metric(shares),
    })
    onClose()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 350 / 0.35)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 100%)', height: '100%', background: 'var(--bg-1)', borderLeft: '1px solid var(--line)', boxShadow: '-8px 0 24px oklch(0.4 0.05 350 / 0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--line-soft)', position: 'sticky', top: 0, background: 'var(--bg-1)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, color: '#fff', background: PLAT_COLOR[platform] || 'var(--tx-faint)' }}>{platform}</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)' }}>Éditer le contenu</span>
          <button onClick={onClose} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-lo)', padding: 0 }}><X style={{ width: 18, height: 18 }} /></button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Titre">
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inp({ width: '100%' })} />
          </Field>

          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Plateforme" flex>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={inp({ width: '100%' })}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select>
            </Field>
            <Field label="Type" flex>
              <select value={type} onChange={(e) => setType(e.target.value)} style={inp({ width: '100%' })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
            </Field>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Responsable" flex>
              <select value={owner} onChange={(e) => setOwner(e.target.value)} style={inp({ width: '100%' })}>{OWNERS.map((o) => <option key={o}>{o}</option>)}</select>
            </Field>
            <Field label="Échéance" flex>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={inp({ width: '100%' })} />
            </Field>
          </div>

          <Field label="Hook / accroche">
            <textarea value={hook} onChange={(e) => setHook(e.target.value)} rows={2} placeholder="La 1re phrase qui arrête le scroll…" style={inp({ width: '100%', resize: 'vertical', fontFamily: 'inherit' })} />
          </Field>

          <Field label="Légende (caption)">
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} placeholder="Texte du post, hashtags…" style={inp({ width: '100%', resize: 'vertical', fontFamily: 'inherit' })} />
          </Field>

          <Field label="Lien du média (Drive, Canva…)">
            <input value={assetLink} onChange={(e) => setAssetLink(e.target.value)} placeholder="https://…" style={inp({ width: '100%' })} />
          </Field>

          {/* Connexions — relier le contenu aux produits / à la campagne */}
          <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="🛍 Produits mis en avant">
              {/* selected chips */}
              {productIds.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {productIds.map((id) => (
                    <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '4px 6px 4px 9px', borderRadius: 6, color: 'var(--rose-bright)', background: 'var(--rose-bg)', border: '1px solid var(--rose-line)' }}>
                      {pName(id)}
                      <button onClick={() => removeProduct(id)} aria-label="Retirer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--rose-bright)', padding: 0, display: 'grid', placeItems: 'center' }}><X style={{ width: 13, height: 13 }} /></button>
                    </span>
                  ))}
                </div>
              )}
              {/* add dropdown */}
              <select value="" onChange={(e) => { if (e.target.value) addProduct(parseInt(e.target.value, 10)) }} style={inp({ width: '100%' })} disabled={available.length === 0}>
                <option value="">{available.length === 0 ? (productIds.length ? 'Tous ajoutés' : 'Aucun produit') : '+ Ajouter un produit…'}</option>
                {available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="📣 Campagne">
              <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} style={inp({ width: '100%' })}>
                <option value="">— Aucune —</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>

          {/* Performance du post organique */}
          <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx-hi)' }}>📊 Performance du post</span>
              {item.metricsSyncedAt
                ? <span style={{ fontSize: 10, color: 'var(--green)' }}>sync {fmtDate(item.metricsSyncedAt.slice(0, 10))}</span>
                : <span style={{ fontSize: 10, color: 'var(--tx-faint)' }}>saisie manuelle</span>}
            </div>
            <Field label="Lien du post publié (permalink)">
              <input value={permalink} onChange={(e) => setPermalink(e.target.value)} placeholder="https://instagram.com/p/… ou tiktok.com/@…" style={inp({ width: '100%' })} />
            </Field>
            <div style={{ display: 'flex', gap: 10 }}>
              <Field label="📡 Portée" flex><input value={reach} onChange={(e) => setReach(e.target.value)} type="number" placeholder="–" style={inp({ width: '100%' })} /></Field>
              <Field label="▶ Vues" flex><input value={views} onChange={(e) => setViews(e.target.value)} type="number" placeholder="–" style={inp({ width: '100%' })} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Field label="❤ J'aime" flex><input value={likes} onChange={(e) => setLikes(e.target.value)} type="number" placeholder="–" style={inp({ width: '100%' })} /></Field>
              <Field label="🔖 Enreg." flex><input value={saves} onChange={(e) => setSaves(e.target.value)} type="number" placeholder="–" style={inp({ width: '100%' })} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Field label="💬 Commentaires" flex><input value={comments} onChange={(e) => setComments(e.target.value)} type="number" placeholder="–" style={inp({ width: '100%' })} /></Field>
              <Field label="↪ Partages" flex><input value={shares} onChange={(e) => setShares(e.target.value)} type="number" placeholder="–" style={inp({ width: '100%' })} /></Field>
            </div>
            <p style={{ fontSize: 11, color: 'var(--tx-faint)' }}>Saisie manuelle pour l&apos;instant. La sync auto Instagram/TikTok remplira ces chiffres.</p>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button className="btn-modern btn-primary" onClick={save} style={{ flex: 1, justifyContent: 'center' }}>Enregistrer</button>
            <button className="btn-modern" onClick={() => { onDelete(item.id); onClose() }} style={{ color: 'var(--rose-bright)', borderColor: 'var(--rose-line)' }}><Trash2 style={{ width: 15, height: 15 }} />Supprimer</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: flex ? 1 : undefined, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx-lo)' }}>{label}</span>
      {children}
    </label>
  )
}

function inp(extra: React.CSSProperties): React.CSSProperties {
  return { background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--tx-hi)', boxSizing: 'border-box', ...extra }
}
