'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import BosShell from '@/components/BosShell'
import { Plus, Trash2, Users, FileText } from 'lucide-react'

const Editor = dynamic(() => import('./Editor'), {
  ssr: false,
  loading: () => <div className="card-modern" style={{ padding: 24, minHeight: 420 }}><div className="skeleton-line" style={{ width: '30%', height: 14 }} /></div>,
})

type Cfg = { url: string; token: string; user: { name: string; email: string } } | null
type Page = { id: number; title: string; icon: string; parentId: number | null; updatedAt: string }

export default function WorkspacePage() {
  const [cfg, setCfg] = useState<Cfg>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const selRef = useRef<number | null>(null)
  selRef.current = selectedId

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

  // Light polling so a page created/renamed by the other founder shows up (~5s).
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadPages() }, 5000)
    return () => clearInterval(t)
  }, [loadPages])

  const createPage = async (parentId: number | null) => {
    const r = await fetch('/api/ops/workspace/pages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Sans titre', parentId }),
    })
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
    await fetch(`/api/ops/workspace/pages/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    }).catch(() => {})
  }

  const childrenOf = (pid: number | null) => pages.filter((p) => (p.parentId ?? null) === pid)
  const selected = pages.find((p) => p.id === selectedId) || null

  const renderTree = (parentId: number | null, depth: number): React.ReactNode =>
    childrenOf(parentId).map((p) => (
      <div key={p.id}>
        <div className={`ws-item${selectedId === p.id ? ' active' : ''}`} style={{ paddingInlineStart: 8 + depth * 15 }} onClick={() => setSelectedId(p.id)}>
          <span className="ws-ico">{p.icon || '📄'}</span>
          <span className="ws-name">{p.title || 'Sans titre'}</span>
          <span className="ws-actions">
            <button title="Sous-page" onClick={(e) => { e.stopPropagation(); createPage(p.id) }}><Plus style={{ width: 13, height: 13 }} /></button>
            <button title="Supprimer" onClick={(e) => { e.stopPropagation(); deletePage(p.id) }}><Trash2 style={{ width: 13, height: 13 }} /></button>
          </span>
        </div>
        {renderTree(p.id, depth + 1)}
      </div>
    ))

  if (loading) {
    return <BosShell active="workspace" title="Espace collaboratif" crumb="Équipe"><div style={{ padding: 24 }}><div className="card-modern" style={{ padding: 24, minHeight: 200 }}><div className="skeleton-line" style={{ width: '30%', height: 14 }} /></div></div></BosShell>
  }
  if (err === 'config') {
    return <BosShell active="workspace" title="Espace collaboratif" crumb="Équipe"><div style={{ maxWidth: 620, margin: '30px auto', padding: '0 18px' }}><div className="card-modern" style={{ padding: 26, borderLeft: '3px solid var(--amber)' }}><div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 6 }}>Serveur temps-réel non configuré</div><p className="fs13 tx-mid" style={{ margin: 0, lineHeight: 1.6 }}>Ajoute <b>NEXT_PUBLIC_REALTIME_URL</b> et <b>REALTIME_TOKEN</b> dans Vercel (ops), puis redéploie.</p></div></div></BosShell>
  }
  if (err) {
    return <BosShell active="workspace" title="Espace collaboratif" crumb="Équipe"><div style={{ padding: 24 }}><div className="card-modern" style={{ padding: 24, borderLeft: '3px solid var(--red, #dc2626)' }}><p className="fs13 tx-mid" style={{ margin: 0 }}>Accès non autorisé. Reconnecte-toi au BOS.</p></div></div></BosShell>
  }

  return (
    <BosShell active="workspace" title="Espace collaboratif" crumb="Équipe">
      <div className="ws-layout">
        {/* Sidebar: page tree */}
        <aside className="ws-side">
          <div className="ws-side-head">
            <span>Pages</span>
            <button className="ws-new" title="Nouvelle page" onClick={() => createPage(null)}><Plus style={{ width: 15, height: 15 }} /></button>
          </div>
          <div className="ws-tree">
            {pages.length === 0
              ? <div className="ws-empty">Aucune page.<br /><button className="ws-empty-btn" onClick={() => createPage(null)}>+ Créer la première</button></div>
              : renderTree(null, 0)}
          </div>
        </aside>

        {/* Main: the selected page's collaborative editor */}
        <main className="ws-main">
          {cfg && selected ? (
            <Editor key={selected.id} url={cfg.url} token={cfg.token} user={cfg.user} page={{ id: selected.id, title: selected.title, icon: selected.icon }} onRename={(t) => renamePage(selected.id, t)} />
          ) : (
            <div className="card-modern" style={{ padding: 40, textAlign: 'center', color: 'var(--tx-faint)' }}>
              <FileText style={{ width: 30, height: 30, margin: '0 auto 10px', opacity: .5 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-mid)' }}>Sélectionne ou crée une page à gauche</div>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        .ws-layout { display: flex; gap: 14px; padding: 12px 16px 20px; align-items: flex-start; }
        .ws-side { flex: 0 0 230px; position: sticky; top: 12px; background: var(--card, #fff); border: 1px solid var(--line-soft); border-radius: 14px; overflow: hidden; max-height: calc(100vh - 130px); display: flex; flex-direction: column; }
        .ws-side-head { display: flex; align-items: center; justify-content: space-between; padding: 11px 12px; border-bottom: 1px solid var(--line-soft); font-size: 11px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: var(--tx-faint); }
        .ws-new { border: none; background: var(--bg-2); color: var(--tx-mid); width: 26px; height: 26px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        .ws-new:hover { background: var(--rose-bright); color: #fff; }
        .ws-tree { overflow-y: auto; padding: 6px; }
        .ws-item { display: flex; align-items: center; gap: 7px; padding: 6px 8px; border-radius: 8px; cursor: pointer; color: var(--tx-mid); }
        .ws-item:hover { background: var(--bg-2); }
        .ws-item.active { background: var(--rose-bg, #fdeef4); color: var(--tx-hi); }
        .ws-ico { font-size: 14px; flex-shrink: 0; }
        .ws-name { flex: 1; min-width: 0; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ws-actions { display: none; gap: 2px; flex-shrink: 0; }
        .ws-item:hover .ws-actions { display: inline-flex; }
        .ws-actions button { border: none; background: none; color: var(--tx-faint); width: 22px; height: 22px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        .ws-actions button:hover { background: var(--card, #fff); color: var(--tx-hi); }
        .ws-empty { padding: 20px 12px; text-align: center; font-size: 12.5px; color: var(--tx-faint); line-height: 1.7; }
        .ws-empty-btn { margin-top: 8px; border: 1px solid var(--line-soft); background: var(--bg-1); border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600; color: var(--tx-mid); cursor: pointer; }
        .ws-main { flex: 1; min-width: 0; }
        @media (max-width: 720px) {
          .ws-layout { flex-direction: column; }
          .ws-side { flex-basis: auto; width: 100%; position: static; max-height: 260px; }
        }
      `}</style>
    </BosShell>
  )
}
