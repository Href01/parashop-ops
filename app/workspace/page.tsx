'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import BosShell from '@/components/BosShell'
import { Plus, Trash2, FileText, Search, PanelLeftClose, PanelLeft } from 'lucide-react'

const Editor = dynamic(() => import('./Editor'), {
  ssr: false,
  loading: () => <div className="card-modern" style={{ padding: 24, minHeight: 420 }}><div className="skeleton-line" style={{ width: '30%', height: 14 }} /></div>,
})

type Cfg = { url: string; token: string; user: { name: string; email: string } } | null
type Page = { id: number; title: string; icon: string; cover?: string | null; parentId: number | null; updatedAt: string }
type Peer = { email: string; name: string; color: string; pageId: number | null; self: boolean }
type Pulse = { revenueToday: number | null; ordersToday: number | null; pending: number; lowStock: number; leadsToday: number; waitlist: number }

const EMOJIS = ['📄', '📝', '🗒️', '📌', '✅', '📊', '📈', '💡', '🚀', '🔥', '⭐', '🎯', '📦', '🛒', '💰', '🏷️', '📣', '🧪', '🗓️', '🎨', '🔧', '📁', '🧠', '❤️']
const initials = (n: string) => n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'

export default function WorkspacePage() {
  const [cfg, setCfg] = useState<Cfg>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [presence, setPresence] = useState<Peer[]>([])
  const [search, setSearch] = useState('')
  const [iconFor, setIconFor] = useState<number | null>(null)
  const [sideOpen, setSideOpen] = useState(true)
  const [pulse, setPulse] = useState<Pulse | null>(null)
  const selRef = useRef<number | null>(null)
  selRef.current = selectedId

  useEffect(() => { try { setSideOpen(localStorage.getItem('ws-side') !== '0') } catch { /* ignore */ } }, [])
  const toggleSide = () => setSideOpen((v) => { const n = !v; try { localStorage.setItem('ws-side', n ? '1' : '0') } catch { /* ignore */ } return n })

  const loadPages = useCallback(async () => {
    try {
      const r = await fetch('/api/ops/workspace/pages', { cache: 'no-store' })
      if (!r.ok) return
      const d = await r.json()
      const list: Page[] = d.pages || []
      setPages(list)
      if (selRef.current == null && list.length > 0) setSelectedId(list[0].id)
      if (selRef.current != null && !list.some((p) => p.id === selRef.current)) setSelectedId(list[0]?.id ?? null)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch('/api/ops/realtime-token', { cache: 'no-store' })
        if (!r.ok) throw new Error('auth')
        const d = await r.json()
        if (!d.url || !d.token) { setErr('config'); return }
        setCfg(d)
        await loadPages()
      } catch { setErr('auth') } finally { setLoading(false) }
    })()
  }, [loadPages])

  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadPages() }, 6000)
    return () => clearInterval(t)
  }, [loadPages])

  // Live KPI strip — a real-time pulse of the business at the top of the workspace.
  useEffect(() => {
    const load = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const [p, s] = await Promise.all([
          fetch('/api/ops/workspace/pulse', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch('/api/ops/dashboard/stats', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ])
        if (p) setPulse({ revenueToday: s ? Number(s.revenueToday) || 0 : null, ordersToday: s ? Number(s.ordersToday) || 0 : null, pending: p.pending, lowStock: p.lowStock, leadsToday: p.leadsToday, waitlist: p.waitlist })
      } catch { /* ignore */ }
    }
    load()
    const t = setInterval(load, 45000)
    return () => clearInterval(t)
  }, [])

  // Presence heartbeat — tells everyone which page I'm on, gets back who's where.
  useEffect(() => {
    const beat = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const r = await fetch('/api/ops/workspace/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: selRef.current }) })
        if (r.ok) { const d = await r.json(); setPresence(d.presence || []) }
      } catch { /* ignore */ }
    }
    beat()
    const t = setInterval(beat, 5000)
    return () => clearInterval(t)
  }, [])

  const createPage = async (parentId: number | null) => {
    const r = await fetch('/api/ops/workspace/pages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Sans titre', parentId }) })
    if (!r.ok) return
    const d = await r.json()
    await loadPages()
    if (d.page?.id) setSelectedId(d.page.id)
  }
  const deletePage = async (id: number) => {
    const p = pages.find((x) => x.id === id)
    if (!confirm(`Supprimer « ${p?.title || 'cette page'} » et ses sous-pages ?`)) return
    await fetch(`/api/ops/workspace/pages/${id}`, { method: 'DELETE' })
    await loadPages()
  }
  const renamePage = async (id: number, title: string) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, title } : p)))
    await fetch(`/api/ops/workspace/pages/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }).catch(() => {})
  }
  const setIcon = async (id: number, icon: string) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, icon } : p)))
    setIconFor(null)
    await fetch(`/api/ops/workspace/pages/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ icon }) }).catch(() => {})
  }
  const setCover = async (id: number, cover: string | null) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, cover } : p)))
    await fetch(`/api/ops/workspace/pages/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cover }) }).catch(() => {})
  }

  const childrenOf = (pid: number | null) => pages.filter((p) => (p.parentId ?? null) === pid)
  const selected = pages.find((p) => p.id === selectedId) || null
  const peersOn = (pid: number) => presence.filter((p) => !p.self && p.pageId === pid)

  const PageRow = ({ p, depth }: { p: Page; depth: number }) => {
    const peers = peersOn(p.id)
    return (
      <div className={`ws-item${selectedId === p.id ? ' active' : ''}`} style={{ paddingInlineStart: 8 + depth * 15 }} onClick={() => setSelectedId(p.id)}>
        <button className="ws-ico" onClick={(e) => { e.stopPropagation(); setIconFor(iconFor === p.id ? null : p.id) }} title="Changer l'emoji">{p.icon || '📄'}</button>
        <span className="ws-name">{p.title || 'Sans titre'}</span>
        {peers.length > 0 && (
          <span className="ws-peers" title={peers.map((x) => x.name).join(', ') + ' ici'}>
            {peers.slice(0, 3).map((x, i) => <span key={x.email} className="ws-peer" style={{ background: x.color, marginLeft: i ? -6 : 0 }}>{initials(x.name)}</span>)}
          </span>
        )}
        <span className="ws-actions">
          <button title="Sous-page" onClick={(e) => { e.stopPropagation(); createPage(p.id) }}><Plus style={{ width: 13, height: 13 }} /></button>
          <button title="Supprimer" onClick={(e) => { e.stopPropagation(); deletePage(p.id) }}><Trash2 style={{ width: 13, height: 13 }} /></button>
        </span>
        {iconFor === p.id && (
          <div className="ws-emoji" onClick={(e) => e.stopPropagation()}>
            {EMOJIS.map((em) => <button key={em} onClick={() => setIcon(p.id, em)}>{em}</button>)}
          </div>
        )}
      </div>
    )
  }

  const renderTree = (parentId: number | null, depth: number): React.ReactNode =>
    childrenOf(parentId).map((p) => (
      <div key={p.id}>
        <PageRow p={p} depth={depth} />
        {renderTree(p.id, depth + 1)}
      </div>
    ))

  const q = search.trim().toLowerCase()
  const searchResults = q ? pages.filter((p) => (p.title || '').toLowerCase().includes(q)) : null

  if (loading) return <BosShell active="workspace" title="Espace collaboratif" crumb="Équipe"><div style={{ padding: 24 }}><div className="card-modern" style={{ padding: 24, minHeight: 200 }}><div className="skeleton-line" style={{ width: '30%', height: 14 }} /></div></div></BosShell>
  if (err === 'config') return <BosShell active="workspace" title="Espace collaboratif" crumb="Équipe"><div style={{ maxWidth: 620, margin: '30px auto', padding: '0 18px' }}><div className="card-modern" style={{ padding: 26, borderLeft: '3px solid var(--amber)' }}><div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 6 }}>Serveur temps-réel non configuré</div><p className="fs13 tx-mid" style={{ margin: 0, lineHeight: 1.6 }}>Ajoute <b>NEXT_PUBLIC_REALTIME_URL</b> et <b>REALTIME_TOKEN</b> dans Vercel (ops), puis redéploie.</p></div></div></BosShell>
  if (err) return <BosShell active="workspace" title="Espace collaboratif" crumb="Équipe"><div style={{ padding: 24 }}><div className="card-modern" style={{ padding: 24, borderLeft: '3px solid var(--red, #dc2626)' }}><p className="fs13 tx-mid" style={{ margin: 0 }}>Accès non autorisé. Reconnecte-toi au BOS.</p></div></div></BosShell>

  return (
    <BosShell active="workspace" title="Espace collaboratif" crumb="Équipe">
      {pulse && (
        <div className="ws-pulse">
          <span className="ws-pulse-live"><span className="ws-pulse-dot" />LIVE</span>
          {pulse.revenueToday != null && <Link href="/" className="ws-kpi"><span className="ws-kpi-i">💰</span><b>{Math.round(pulse.revenueToday).toLocaleString('fr-FR')} DH</b><span>CA aujourd&apos;hui</span></Link>}
          {pulse.ordersToday != null && <Link href="/orders" className="ws-kpi"><span className="ws-kpi-i">🛒</span><b>{pulse.ordersToday}</b><span>Commandes du jour</span></Link>}
          <Link href="/orders" className={`ws-kpi${pulse.pending > 0 ? ' warn' : ''}`}><span className="ws-kpi-i">⏳</span><b>{pulse.pending}</b><span>À traiter</span></Link>
          <Link href="/inventory" className={`ws-kpi${pulse.lowStock > 0 ? ' warn' : ''}`}><span className="ws-kpi-i">⚠️</span><b>{pulse.lowStock}</b><span>Alertes stock</span></Link>
          <Link href="/leads" className="ws-kpi"><span className="ws-kpi-i">📞</span><b>{pulse.leadsToday}</b><span>Leads du jour</span></Link>
          <Link href="/restock" className={`ws-kpi${pulse.waitlist > 0 ? ' warn' : ''}`}><span className="ws-kpi-i">🔔</span><b>{pulse.waitlist}</b><span>Liste d&apos;attente</span></Link>
        </div>
      )}
      <div className="ws-layout" onClick={() => iconFor != null && setIconFor(null)}>
        {!sideOpen && (
          <button className="ws-reopen" title="Afficher les pages" onClick={toggleSide}><PanelLeft style={{ width: 16, height: 16 }} /></button>
        )}
        <aside className="ws-side" style={sideOpen ? undefined : { display: 'none' }}>
          <div className="ws-side-head">
            <span>Pages</span>
            <div style={{ display: 'inline-flex', gap: 4 }}>
              <button className="ws-new" title="Nouvelle page" onClick={() => createPage(null)}><Plus style={{ width: 15, height: 15 }} /></button>
              <button className="ws-new" title="Masquer" onClick={toggleSide}><PanelLeftClose style={{ width: 15, height: 15 }} /></button>
            </div>
          </div>
          <div className="ws-search">
            <Search style={{ width: 13, height: 13, color: 'var(--tx-faint)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" />
          </div>
          <div className="ws-tree">
            {pages.length === 0 ? (
              <div className="ws-empty">Aucune page.<br /><button className="ws-empty-btn" onClick={() => createPage(null)}>+ Créer la première</button></div>
            ) : searchResults ? (
              searchResults.length === 0 ? <div className="ws-empty">Aucun résultat.</div> : searchResults.map((p) => <PageRow key={p.id} p={p} depth={0} />)
            ) : renderTree(null, 0)}
          </div>
        </aside>

        <main className="ws-main">
          {cfg && selected ? (
            <Editor key={selected.id} url={cfg.url} token={cfg.token} user={cfg.user} page={{ id: selected.id, title: selected.title, icon: selected.icon, cover: selected.cover }} onRename={(t) => renamePage(selected.id, t)} onSetCover={(c) => setCover(selected.id, c)} />
          ) : (
            <div className="card-modern" style={{ padding: 40, textAlign: 'center', color: 'var(--tx-faint)' }}>
              <FileText style={{ width: 30, height: 30, margin: '0 auto 10px', opacity: .5 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-mid)' }}>Sélectionne ou crée une page à gauche</div>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        .ws-pulse { display: flex; align-items: stretch; gap: 8px; padding: 10px 16px 0; overflow-x: auto; }
        .ws-pulse-live { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 800; color: var(--green); align-self: center; white-space: nowrap; letter-spacing: .04em; }
        .ws-pulse-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 0 rgba(22,163,74,.5); animation: wspulse 1.8s infinite; }
        @keyframes wspulse { 0% { box-shadow: 0 0 0 0 rgba(22,163,74,.5); } 70% { box-shadow: 0 0 0 5px rgba(22,163,74,0); } 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0); } }
        .ws-kpi { flex: 0 0 auto; display: flex; flex-direction: column; gap: 1px; padding: 8px 13px; border: 1px solid var(--line-soft); border-radius: 11px; background: var(--card, #fff); text-decoration: none; min-width: 92px; transition: all .12s; }
        .ws-kpi:hover { border-color: var(--rose-bright); box-shadow: 0 2px 8px rgba(0,0,0,.05); }
        .ws-kpi .ws-kpi-i { font-size: 13px; }
        .ws-kpi b { font-size: 15px; font-weight: 800; color: var(--tx-hi); line-height: 1.15; }
        .ws-kpi span:last-child { font-size: 10.5px; color: var(--tx-lo); white-space: nowrap; }
        .ws-kpi.warn { background: var(--amber-bg, #fef7ec); border-color: var(--amber, #d97706); }
        .ws-kpi.warn b { color: var(--amber, #b45309); }
        @media (prefers-reduced-motion: reduce) { .ws-pulse-dot { animation: none; } }
        .ws-layout { display: flex; gap: 14px; padding: 12px 16px 20px; align-items: flex-start; }
        .ws-side { flex: 0 0 208px; position: sticky; top: 12px; background: var(--card, #fff); border: 1px solid var(--line-soft); border-radius: 14px; overflow: visible; max-height: calc(100vh - 130px); display: flex; flex-direction: column; }
        .ws-reopen { position: sticky; top: 12px; flex-shrink: 0; width: 34px; height: 34px; border-radius: 9px; border: 1px solid var(--line-soft); background: var(--card, #fff); color: var(--tx-mid); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        .ws-reopen:hover { background: var(--bg-2); color: var(--tx-hi); }
        .ws-side-head { display: flex; align-items: center; justify-content: space-between; padding: 11px 12px; border-bottom: 1px solid var(--line-soft); font-size: 11px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: var(--tx-faint); }
        .ws-new { border: none; background: var(--bg-2); color: var(--tx-mid); width: 26px; height: 26px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        .ws-new:hover { background: var(--rose-bright); color: #fff; }
        .ws-search { display: flex; align-items: center; gap: 7px; margin: 8px 10px 4px; padding: 6px 9px; background: var(--bg-2); border-radius: 9px; }
        .ws-search input { border: none; background: transparent; outline: none; font-size: 12.5px; color: var(--tx-hi); width: 100%; }
        .ws-tree { overflow-y: auto; padding: 6px; }
        .ws-item { position: relative; display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 8px; cursor: pointer; color: var(--tx-mid); }
        .ws-item:hover { background: var(--bg-2); }
        .ws-item.active { background: var(--rose-bg, #fdeef4); color: var(--tx-hi); }
        .ws-ico { border: none; background: none; font-size: 14px; flex-shrink: 0; cursor: pointer; padding: 0; line-height: 1; border-radius: 5px; }
        .ws-ico:hover { background: var(--card, #fff); }
        .ws-name { flex: 1; min-width: 0; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ws-peers { display: inline-flex; flex-shrink: 0; }
        .ws-peer { width: 18px; height: 18px; border-radius: 50%; color: #fff; font-size: 8px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; border: 1.5px solid var(--card, #fff); }
        .ws-actions { display: none; gap: 2px; flex-shrink: 0; }
        .ws-item:hover .ws-actions { display: inline-flex; }
        .ws-item:hover .ws-peers { display: none; }
        .ws-actions button { border: none; background: none; color: var(--tx-faint); width: 22px; height: 22px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        .ws-actions button:hover { background: var(--card, #fff); color: var(--tx-hi); }
        .ws-emoji { position: absolute; top: 100%; left: 8px; z-index: 20; margin-top: 4px; background: var(--card, #fff); border: 1px solid var(--line-soft); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.12); padding: 7px; display: grid; grid-template-columns: repeat(6, 1fr); gap: 2px; width: 210px; }
        .ws-emoji button { border: none; background: none; font-size: 16px; padding: 5px; border-radius: 6px; cursor: pointer; }
        .ws-emoji button:hover { background: var(--bg-2); }
        .ws-empty { padding: 20px 12px; text-align: center; font-size: 12.5px; color: var(--tx-faint); line-height: 1.7; }
        .ws-empty-btn { margin-top: 8px; border: 1px solid var(--line-soft); background: var(--bg-1); border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600; color: var(--tx-mid); cursor: pointer; }
        .ws-main { flex: 1; min-width: 0; }
        @media (max-width: 720px) {
          .ws-layout { flex-direction: column; }
          .ws-side { flex-basis: auto; width: 100%; position: static; max-height: 300px; }
        }
      `}</style>
    </BosShell>
  )
}
