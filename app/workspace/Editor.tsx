'use client'

import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import type { Awareness } from 'y-protocols/awareness'
import SheetPreview from './SheetPreview'

type User = { name: string; email: string }
type Presence = { name: string; color: string }
type Page = { id: number; title: string; icon: string; cover?: string | null }
type Comment = { id: number; authorEmail: string; authorName: string | null; body: string; createdAt: string; self: boolean }
type Ver = { id: number; label: string | null; createdBy: string | null; createdAt: string; bytes: number }

const PALETTE = ['#E11D48', '#0C6B52', '#7C3AED', '#D97706', '#2563EB', '#DB2777', '#059669', '#4F46E5']
function colorFor(key: string) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}
const initials = (n: string) => n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'

// Templates = plain native blocks inserted into a *fresh empty* page (user action → safe).
type Blk = { type: string; props?: Record<string, unknown>; content?: string }
const TEMPLATES: { key: string; icon: string; label: string; blocks: Blk[] }[] = [
  {
    key: 'sop', icon: '📋', label: 'Procédure (SOP)', blocks: [
      { type: 'heading', props: { level: 1 }, content: 'Nom de la procédure' },
      { type: 'paragraph', content: 'Objectif : à quoi sert cette procédure et quand l’appliquer.' },
      { type: 'heading', props: { level: 2 }, content: 'Étapes' },
      { type: 'checkListItem', content: 'Étape 1' },
      { type: 'checkListItem', content: 'Étape 2' },
      { type: 'checkListItem', content: 'Étape 3' },
      { type: 'heading', props: { level: 2 }, content: 'Points de vigilance' },
      { type: 'bulletListItem', content: 'À vérifier avant de valider' },
    ],
  },
  {
    key: 'meeting', icon: '🗓️', label: 'Notes de réunion', blocks: [
      { type: 'heading', props: { level: 1 }, content: 'Réunion — ' },
      { type: 'paragraph', content: 'Date · Participants' },
      { type: 'heading', props: { level: 2 }, content: 'Ordre du jour' },
      { type: 'bulletListItem', content: 'Sujet 1' },
      { type: 'heading', props: { level: 2 }, content: 'Décisions' },
      { type: 'bulletListItem', content: '' },
      { type: 'heading', props: { level: 2 }, content: 'À faire' },
      { type: 'checkListItem', content: 'Action — qui ? pour quand ?' },
    ],
  },
  {
    key: 'launch', icon: '🚀', label: 'Lancement produit', blocks: [
      { type: 'heading', props: { level: 1 }, content: 'Lancement : nom du produit' },
      { type: 'paragraph', content: 'Cible · prix · marge visée · date de lancement.' },
      { type: 'heading', props: { level: 2 }, content: 'Avant lancement' },
      { type: 'checkListItem', content: 'Stock/réappro confirmé' },
      { type: 'checkListItem', content: 'Photos & fiche produit prêtes' },
      { type: 'checkListItem', content: 'Prix & promo définis' },
      { type: 'heading', props: { level: 2 }, content: 'Marketing' },
      { type: 'checkListItem', content: 'Créa pub prête' },
      { type: 'checkListItem', content: 'Budget & audience définis' },
      { type: 'heading', props: { level: 2 }, content: 'Après lancement' },
      { type: 'bulletListItem', content: 'Suivi ventes J+1 / J+7' },
    ],
  },
]

export default function Editor({ url, token, user, page, onRename, onSetCover }: {
  url: string; token: string; user: User; page: Page
  onRename: (title: string) => void
  onSetCover: (cover: string | null) => void
}) {
  const docName = `page:${page.id}`
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [authFailed, setAuthFailed] = useState(false)
  const [peers, setPeers] = useState<Presence[]>([])
  const color = useMemo(() => colorFor(user.email || user.name), [user])

  // Full-width reading mode (per page) — wide tables/catalogues use the whole
  // surface instead of the 760px reading column. Persisted so it sticks per doc.
  const [wide, setWide] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setWide(localStorage.getItem(`ws-wide:${page.id}`) === '1') } catch { /* ignore */ }
  }, [page.id])
  const toggleWide = () => setWide((w) => {
    const n = !w
    try { localStorage.setItem(`ws-wide:${page.id}`, n ? '1' : '0') } catch { /* ignore */ }
    return n
  })

  const { doc, provider } = useMemo(() => {
    const doc = new Y.Doc()
    const wsUrl = (url || '').replace(/^http(s?):\/\//i, (_m, s) => (s ? 'wss://' : 'ws://')).replace(/\/+$/, '')
    const provider = new HocuspocusProvider({ url: wsUrl, name: docName, token, document: doc })
    return { doc, provider }
  }, [url, token, docName])

  useEffect(() => {
    const onStatus = (e: { status: string }) => setStatus(e.status === 'connected' ? 'connected' : e.status === 'disconnected' ? 'disconnected' : 'connecting')
    const onAuthFail = () => setAuthFailed(true)
    const onAuthOk = () => setAuthFailed(false)
    provider.on('status', onStatus)
    provider.on('authenticationFailed', onAuthFail)
    provider.on('authenticated', onAuthOk)
    const aw = provider.awareness
    const refresh = () => {
      if (!aw) return
      const seen = new Map<string, Presence>()
      aw.getStates().forEach((s: { user?: { name?: string; color?: string } }) => {
        const u = s?.user
        if (u?.name) seen.set(u.name + (u.color || ''), { name: u.name, color: u.color || '#888' })
      })
      setPeers([...seen.values()])
    }
    aw?.on('change', refresh)
    refresh()
    return () => {
      provider.off('status', onStatus)
      provider.off('authenticationFailed', onAuthFail)
      provider.off('authenticated', onAuthOk)
      aw?.off('change', refresh)
      provider.destroy()
      doc.destroy()
    }
  }, [provider, doc])

  // Upload dropped/pasted/inserted files → Postgres → URL. Native blocks round-trip
  // through Yjs with no data loss (images preview inline; PDFs open inline on click).
  // Big files (catalogue PDFs, spreadsheets) are chunked to get under Vercel's ~4.5 MB
  // serverless body limit — otherwise the request is rejected and the block hangs on
  // "Loading…" forever. Chunks are appended into the same WorkspaceFile row.
  const CHUNK = 3.5 * 1024 * 1024
  const uploadFile = async (file: File) => {
    if (file.size <= CHUNK) {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/ops/workspace/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error || 'Échec de l’upload')
      }
      const d = await res.json()
      return d.url as string
    }
    // Chunked path for large files.
    const total = Math.ceil(file.size / CHUNK)
    let id: number | undefined
    for (let i = 0; i < total; i++) {
      const slice = file.slice(i * CHUNK, (i + 1) * CHUNK)
      const fd = new FormData()
      fd.append('index', String(i))
      fd.append('total', String(total))
      fd.append('name', file.name)
      fd.append('mime', file.type || 'application/octet-stream')
      if (id != null) fd.append('id', String(id))
      fd.append('chunk', slice)
      const res = await fetch('/api/ops/workspace/upload-chunk', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error || 'Échec de l’upload')
      id = d.id
      if (d.url) return d.url as string
    }
    throw new Error('Échec de l’upload')
  }

  const editor = useCreateBlockNote({
    collaboration: {
      provider: provider as unknown as { awareness?: Awareness },
      fragment: doc.getXmlFragment('document-store'),
      user: { name: user.name, color },
    },
    uploadFile,
  })

  // Is the page effectively empty? (only a single empty paragraph) → offer templates.
  const [isEmpty, setIsEmpty] = useState(false)
  // Derived, read-only previews (never stored in the doc → cannot lose data).
  const [docs, setDocs] = useState<{ url: string; name: string; kind: 'pdf' | 'sheet' }[]>([])
  useEffect(() => {
    const scan = () => {
      const out: { url: string; name: string; kind: 'pdf' | 'sheet' }[] = []
      const walk = (blocks: Array<{ type: string; props?: Record<string, unknown>; children?: unknown[] }>) => {
        for (const b of blocks) {
          const u = b.props?.url as string | undefined
          if (b.type === 'file' && u) {
            const name = (b.props?.name as string) || decodeURIComponent(u.split('/').pop() || 'fichier')
            const ext = (name.split('.').pop() || '').toLowerCase()
            if (ext === 'pdf') out.push({ url: u, name, kind: 'pdf' })
            else if (ext === 'csv' || ext === 'xls' || ext === 'xlsx') out.push({ url: u, name, kind: 'sheet' })
          }
          if (Array.isArray(b.children) && b.children.length) walk(b.children as never)
        }
      }
      try { walk(editor.document as never) } catch { /* ignore */ }
      setDocs((prev) => (JSON.stringify(prev) === JSON.stringify(out) ? prev : out))
      try {
        const d = editor.document as Array<{ type: string; content?: unknown }>
        const empty = d.length <= 1 && (!d[0] || (d[0].type === 'paragraph' && (!Array.isArray(d[0].content) || d[0].content.length === 0)))
        setIsEmpty(empty)
      } catch { /* ignore */ }
    }
    scan()
    const t = setInterval(scan, 1500) // catch remote-synced content too
    return () => clearInterval(t)
  }, [editor])

  const applyTemplate = (blocks: Blk[]) => {
    try {
      const cur = editor.document
      editor.replaceBlocks(cur, blocks as never)
      setIsEmpty(false)
    } catch { /* ignore */ }
  }

  // ---- Cover ----
  const coverInput = useRef<HTMLInputElement>(null)
  const [coverBusy, setCoverBusy] = useState(false)
  const pickCover = async (file: File) => {
    setCoverBusy(true)
    try { onSetCover(await uploadFile(file)) } catch { /* ignore */ } finally { setCoverBusy(false) }
  }

  // ---- Comments ----
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const loadComments = useCallback(async () => {
    try {
      const r = await fetch(`/api/ops/workspace/comments?pageId=${page.id}`, { cache: 'no-store' })
      if (r.ok) { const d = await r.json(); setComments(d.comments || []) }
    } catch { /* ignore */ }
  }, [page.id])
  useEffect(() => {
    loadComments()
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadComments() }, 8000)
    return () => clearInterval(t)
  }, [loadComments])
  const send = async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const r = await fetch('/api/ops/workspace/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: page.id, body }) })
      if (r.ok) { const d = await r.json(); setComments((c) => [...c, d.comment]); setDraft('') }
    } catch { /* ignore */ } finally { setSending(false) }
  }
  const del = async (id: number) => {
    setComments((c) => c.filter((x) => x.id !== id))
    try { await fetch(`/api/ops/workspace/comments?id=${id}`, { method: 'DELETE' }) } catch { /* ignore */ }
  }

  // ---- Version history (safety net) ----
  const [historyOpen, setHistoryOpen] = useState(false)
  const [versions, setVersions] = useState<Ver[]>([])
  const [vBusy, setVBusy] = useState(false)
  const loadVersions = useCallback(async () => {
    try {
      const r = await fetch(`/api/ops/workspace/versions?pageId=${page.id}`, { cache: 'no-store' })
      if (r.ok) { const d = await r.json(); setVersions(d.versions || []) }
    } catch { /* ignore */ }
  }, [page.id])
  useEffect(() => { if (historyOpen) loadVersions() }, [historyOpen, loadVersions])
  const saveVersion = async () => {
    if (vBusy) return
    setVBusy(true)
    try {
      const r = await fetch('/api/ops/workspace/versions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: page.id }) })
      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.message || 'Impossible d’enregistrer la version.') }
      else await loadVersions()
    } catch { /* ignore */ } finally { setVBusy(false) }
  }
  const restore = async (id: number) => {
    if (!confirm('Restaurer cette version ?\n\nLa version actuelle est sauvegardée automatiquement avant.\nImportant : demande à chacun de FERMER la page, puis rouvrez-la pour voir la version restaurée.')) return
    setVBusy(true)
    try {
      const r = await fetch('/api/ops/workspace/versions/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: page.id, versionId: id }) })
      if (r.ok) alert('Version restaurée. Fermez puis rouvrez la page pour la voir (rechargez si besoin).')
      else alert('Échec de la restauration.')
      await loadVersions()
    } catch { /* ignore */ } finally { setVBusy(false) }
  }
  const openComments = () => { setHistoryOpen(false); setCommentsOpen((v) => !v) }
  const openHistory = () => { setCommentsOpen(false); setHistoryOpen((v) => !v) }
  const vAgo = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  const st = authFailed
    ? { fg: 'var(--red, #dc2626)', bg: 'var(--red-bg, #fee2e2)', dot: '#DC2626', label: 'Token invalide' }
    : status === 'connected'
      ? { fg: 'var(--green)', bg: 'var(--green-bg)', dot: '#16A34A', label: 'En ligne' }
      : status === 'connecting'
        ? { fg: 'var(--amber)', bg: 'var(--amber-bg)', dot: '#D97706', label: 'Connexion…' }
        : { fg: 'var(--red, #dc2626)', bg: 'var(--red-bg, #fee2e2)', dot: '#DC2626', label: 'Hors ligne' }

  return (
    <div className="doc-card">
      <div className="doc-bar">
        <div className="doc-title">
          <span aria-hidden>{page.icon || '📄'}</span>
          <span className="doc-title-text">{page.title}</span>
        </div>
        <div className="doc-tools">
          <span className="doc-status" style={{ color: st.fg, background: st.bg }}>
            <span className="doc-dot" style={{ background: st.dot }} />{st.label}
          </span>
          {peers.length > 0 && (
            <div className="doc-peers">
              {peers.slice(0, 5).map((p, i) => (
                <span key={i} title={p.name} className="doc-avatar" style={{ background: p.color, marginLeft: i ? -9 : 0, zIndex: 5 - i }}>{initials(p.name)}</span>
              ))}
            </div>
          )}
          <button className={`doc-cbtn${wide ? ' on' : ''}`} onClick={toggleWide} title={wide ? 'Largeur de lecture' : 'Pleine largeur (grands tableaux)'}>
            {wide ? '↹' : '↔'}
          </button>
          <button className={`doc-cbtn${commentsOpen ? ' on' : ''}`} onClick={openComments} title="Commentaires">
            💬{comments.length > 0 && <span className="doc-cbadge">{comments.length}</span>}
          </button>
          <button className={`doc-cbtn${historyOpen ? ' on' : ''}`} onClick={openHistory} title="Historique des versions">🕓</button>
          <span className="doc-help" title="Tape « / » pour insérer. Glisse une image → aperçu inline. Glisse un PDF → clique dessus pour l'ouvrir en aperçu.">?</span>
        </div>
      </div>

      <div className="doc-body">
        <div className={`doc-surface${wide ? ' wide' : ''}`}>
          {/* Cover */}
          <input ref={coverInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pickCover(f); e.target.value = '' }} />
          {page.cover ? (
            <div className="doc-cover">
              <img src={page.cover} alt="" />
              <div className="doc-cover-tools">
                <button onClick={() => coverInput.current?.click()} disabled={coverBusy}>Changer</button>
                <button onClick={() => onSetCover(null)}>Retirer</button>
              </div>
            </div>
          ) : null}

          <div className="doc-page">
            {/* Big header: emoji + editable title */}
            <div className="doc-head">
              <span className="doc-head-emoji" aria-hidden>{page.icon || '📄'}</span>
              {!page.cover && (
                <button className="doc-cover-add" onClick={() => coverInput.current?.click()} disabled={coverBusy}>
                  {coverBusy ? '⏳ …' : '🖼️ Ajouter une couverture'}
                </button>
              )}
            </div>
            <input
              defaultValue={page.title}
              key={page.id}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== page.title) onRename(v) }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              aria-label="Titre de la page"
              className="doc-h1"
              placeholder="Sans titre"
            />

            {/* Template quick-start on empty pages */}
            {isEmpty && (
              <div className="tpl">
                <div className="tpl-lbl">Commencer avec un modèle</div>
                <div className="tpl-row">
                  {TEMPLATES.map((t) => (
                    <button key={t.key} className="tpl-btn" onClick={() => applyTemplate(t.blocks)}>
                      <span>{t.icon}</span>{t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <BlockNoteView editor={editor} theme="light" />
          </div>

          {/* Safe previews (derived from the doc's file blocks, not stored in it) */}
          {docs.length > 0 && (
            <div className="doc-page" style={{ marginTop: 26 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--tx-faint)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>📎 Aperçu des fichiers du document</div>
              {docs.map((a, i) => (
                <div key={a.url + i} style={{ border: '1px solid var(--line-soft)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 12px', background: 'var(--bg-1)', borderBottom: '1px solid var(--line-soft)' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.kind === 'pdf' ? '📄' : '📊'} {a.name}</span>
                    <a href={a.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', textDecoration: 'none', whiteSpace: 'nowrap' }}>Ouvrir ↗</a>
                  </div>
                  {a.kind === 'pdf'
                    ? <iframe src={a.url} title={a.name} style={{ width: '100%', height: 560, border: 0, display: 'block', background: '#fff' }} />
                    : <SheetPreview url={a.url} />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Comments rail */}
        {commentsOpen && (
          <aside className="doc-comments">
            <div className="dc-head">
              <span>💬 Commentaires</span>
              <button onClick={() => setCommentsOpen(false)} aria-label="Fermer">✕</button>
            </div>
            <div className="dc-list">
              {comments.length === 0 ? (
                <p className="dc-empty">Aucun commentaire. Lance la discussion — mentionne l’autre avec @prénom.</p>
              ) : comments.map((c) => (
                <div key={c.id} className="dc-item">
                  <span className="dc-av" style={{ background: colorFor(c.authorEmail) }}>{initials(c.authorName || c.authorEmail)}</span>
                  <div className="dc-body">
                    <div className="dc-meta">
                      <b>{c.authorName || c.authorEmail.split('@')[0]}</b>
                      <span>{new Date(c.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      {c.self && <button className="dc-del" onClick={() => del(c.id)} title="Supprimer">✕</button>}
                    </div>
                    <div className="dc-text">
                      {c.body.split(/(@[\p{L}0-9._-]+)/u).map((part, i) => part.startsWith('@')
                        ? <span key={i} className="dc-mention">{part}</span>
                        : <span key={i}>{part}</span>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="dc-compose">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() } }}
                placeholder="Écrire un commentaire…  (Ctrl/⌘+Entrée pour envoyer)"
                rows={3}
              />
              <button className="dc-send" onClick={send} disabled={sending || !draft.trim()}>{sending ? '…' : 'Envoyer'}</button>
            </div>
          </aside>
        )}

        {/* Version history rail */}
        {historyOpen && (
          <aside className="doc-comments">
            <div className="dc-head">
              <span>🕓 Historique</span>
              <button onClick={() => setHistoryOpen(false)} aria-label="Fermer">✕</button>
            </div>
            <div className="dc-compose" style={{ borderTop: 0, borderBottom: '1px solid var(--line-soft)' }}>
              <button className="dc-send" onClick={saveVersion} disabled={vBusy} style={{ marginTop: 0 }}>{vBusy ? '…' : '📌 Enregistrer une version'}</button>
              <p style={{ fontSize: 11, color: 'var(--tx-faint)', margin: '8px 0 0', lineHeight: 1.5 }}>Une sauvegarde à restaurer en cas de souci. Les 40 dernières sont conservées.</p>
            </div>
            <div className="dc-list">
              {versions.length === 0 ? (
                <p className="dc-empty">Aucune version enregistrée. Clique « Enregistrer une version » pour créer un point de restauration.</p>
              ) : versions.map((v) => (
                <div key={v.id} className="hv-item">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="hv-lbl">{v.label || 'Version'}</div>
                    <div className="hv-meta">{vAgo(v.createdAt)}{v.createdBy ? ' · ' + v.createdBy.split('@')[0] : ''} · {(v.bytes / 1024).toFixed(1)} Ko</div>
                  </div>
                  <button className="hv-restore" onClick={() => restore(v.id)} disabled={vBusy}>Restaurer</button>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>

      <style jsx>{`
        .doc-card { background: var(--card, #fff); border: 1px solid var(--line-soft); border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.04), 0 12px 30px rgba(0,0,0,.05); display: flex; flex-direction: column; min-height: calc(100vh - 190px); }
        .doc-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 16px; border-bottom: 1px solid var(--line-soft); background: var(--bg-1, #fff); position: sticky; top: 0; z-index: 3; flex-wrap: wrap; }
        .doc-title { display: inline-flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 700; color: var(--tx-hi); min-width: 0; flex: 1; }
        .doc-title-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 340px; }
        .doc-tools { display: inline-flex; align-items: center; gap: 10px; }
        .doc-status { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; padding: 4px 11px; border-radius: 999px; white-space: nowrap; }
        .doc-dot { width: 7px; height: 7px; border-radius: 50%; }
        .doc-peers { display: inline-flex; }
        .doc-avatar { width: 26px; height: 26px; border-radius: 50%; color: #fff; font-size: 10px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; border: 2px solid var(--card, #fff); position: relative; }
        .doc-cbtn { position: relative; height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line-soft); background: var(--card, #fff); font-size: 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
        .doc-cbtn:hover { background: var(--bg-2); }
        .doc-cbtn.on { background: var(--green-bg); border-color: var(--green); }
        .doc-cbadge { font-size: 10px; font-weight: 800; color: #fff; background: var(--green); border-radius: 999px; padding: 0 5px; min-width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; }
        .doc-help { width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--line-soft); color: var(--tx-lo); font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; cursor: help; user-select: none; }
        .doc-help:hover { color: var(--tx-hi); border-color: var(--tx-faint); }

        .doc-body { flex: 1; display: flex; min-height: 0; }
        .doc-surface { flex: 1; overflow-y: auto; padding: 0 clamp(14px, 4vw, 40px) 80px; }

        .doc-cover { position: relative; margin: 0 clamp(-14px, -4vw, -40px) 0; height: 180px; overflow: hidden; }
        .doc-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .doc-cover-tools { position: absolute; right: 14px; bottom: 12px; display: flex; gap: 6px; opacity: 0; transition: opacity .15s; }
        .doc-cover:hover .doc-cover-tools { opacity: 1; }
        .doc-cover-tools button { font-size: 11.5px; font-weight: 700; padding: 5px 10px; border-radius: 7px; border: 0; background: rgba(0,0,0,.55); color: #fff; cursor: pointer; backdrop-filter: blur(4px); }

        .doc-page { max-width: 760px; margin: 0 auto; padding-top: 30px; transition: max-width .18s ease; }
        .doc-surface.wide .doc-page { max-width: 1180px; }
        .doc-head { display: flex; align-items: center; gap: 12px; min-height: 34px; }
        .doc-head-emoji { font-size: 46px; line-height: 1; }
        .doc-cover-add { opacity: 0; transition: opacity .15s; font-size: 12px; font-weight: 600; color: var(--tx-lo); background: transparent; border: 0; cursor: pointer; padding: 5px 8px; border-radius: 7px; }
        .doc-page:hover .doc-cover-add { opacity: 1; }
        .doc-cover-add:hover { background: var(--bg-2); color: var(--tx-hi); }
        .doc-h1 { display: block; width: 100%; border: none; background: transparent; font-family: var(--font-serif, Georgia, serif); font-size: 38px; font-weight: 800; line-height: 1.12; color: var(--tx-hi); outline: none; padding: 8px 0 2px; margin-bottom: 4px; letter-spacing: -.01em; }
        .doc-h1::placeholder { color: var(--tx-faint); }

        .tpl { margin: 6px 0 14px; padding: 12px 14px; border: 1px dashed var(--line-soft); border-radius: 12px; background: var(--bg-1); }
        .tpl-lbl { font-size: 11px; font-weight: 800; color: var(--tx-faint); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 9px; }
        .tpl-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .tpl-btn { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 700; color: var(--tx-hi); padding: 8px 12px; border-radius: 9px; border: 1px solid var(--line-soft); background: var(--card, #fff); cursor: pointer; transition: all .12s; }
        .tpl-btn:hover { border-color: var(--green); background: var(--green-bg); }
        /* ── Pro reading typography for the document body ─────────────────────── */
        .doc-page :global(.bn-editor) {
          padding-inline: 0 !important;
          font-size: 16px;
          line-height: 1.7;
          color: var(--tx-hi);
          -webkit-font-smoothing: antialiased;
        }
        .doc-page :global(.bn-block-content) { line-height: 1.7; }
        .doc-page :global(.bn-block-content[data-content-type="paragraph"]) { font-size: 16px; }
        .doc-page :global(.bn-block-content li) { line-height: 1.65; }

        /* Clear heading hierarchy (BlockNote sets the level via data-attr) */
        .doc-page :global(.bn-block-content[data-content-type="heading"][data-level="1"]),
        .doc-page :global(.bn-editor h1) {
          font-size: 28px; font-weight: 800; line-height: 1.25; letter-spacing: -.01em;
          margin-top: 28px; color: var(--tx-hi);
        }
        .doc-page :global(.bn-block-content[data-content-type="heading"][data-level="2"]),
        .doc-page :global(.bn-editor h2) {
          font-size: 22px; font-weight: 800; line-height: 1.3;
          margin-top: 24px; color: var(--tx-hi);
        }
        .doc-page :global(.bn-block-content[data-content-type="heading"][data-level="3"]),
        .doc-page :global(.bn-editor h3) {
          font-size: 18px; font-weight: 700; line-height: 1.35;
          margin-top: 18px; color: var(--tx-hi);
        }

        /* ── Tables: readable data, scroll instead of getting cut off ─────────── */
        .doc-page :global(.bn-block-content[data-content-type="table"]),
        .doc-page :global(.bn-editor .tableWrapper) {
          overflow-x: auto;
          max-width: 100%;
        }
        .doc-page :global(.bn-editor table) {
          border-collapse: collapse;
          font-size: 14px;
          line-height: 1.5;
        }
        .doc-page :global(.bn-editor th),
        .doc-page :global(.bn-editor td) {
          border: 1px solid var(--line-soft);
          padding: 9px 12px;
          text-align: left;
          vertical-align: top;
          min-width: 90px;
        }
        /* First row reads as a header: tinted background + bold */
        .doc-page :global(.bn-editor tr:first-child th),
        .doc-page :global(.bn-editor tr:first-child td) {
          background: var(--bg-1);
          font-weight: 700;
          color: var(--tx-hi);
          white-space: nowrap;
        }
        /* Zebra striping on data rows for scannability */
        .doc-page :global(.bn-editor tr:nth-child(even):not(:first-child) td) {
          background: rgba(0,0,0,.018);
        }

        .doc-comments { width: 330px; flex-shrink: 0; border-left: 1px solid var(--line-soft); background: var(--bg-1, #fafafa); display: flex; flex-direction: column; }
        .dc-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--line-soft); font-size: 13px; font-weight: 800; color: var(--tx-hi); }
        .dc-head button { border: 0; background: transparent; font-size: 14px; cursor: pointer; color: var(--tx-lo); }
        .dc-list { flex: 1; overflow-y: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 14px; }
        .dc-empty { font-size: 12.5px; color: var(--tx-lo); line-height: 1.6; }
        .dc-item { display: flex; gap: 9px; }
        .dc-av { flex-shrink: 0; width: 26px; height: 26px; border-radius: 50%; color: #fff; font-size: 10px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
        .dc-body { min-width: 0; flex: 1; }
        .dc-meta { display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--tx-faint); }
        .dc-meta b { color: var(--tx-hi); font-size: 12px; }
        .dc-del { margin-left: auto; border: 0; background: transparent; cursor: pointer; color: var(--tx-faint); font-size: 11px; }
        .dc-del:hover { color: var(--red, #dc2626); }
        .dc-text { font-size: 13px; color: var(--tx-mid); line-height: 1.5; margin-top: 3px; white-space: pre-wrap; word-break: break-word; }
        .dc-mention { color: var(--green); font-weight: 700; background: var(--green-bg); padding: 0 3px; border-radius: 4px; }
        .dc-compose { border-top: 1px solid var(--line-soft); padding: 10px 12px; }
        .dc-compose textarea { width: 100%; resize: none; border: 1px solid var(--line-soft); border-radius: 9px; padding: 8px 10px; font-size: 13px; font-family: inherit; outline: none; background: var(--card, #fff); color: var(--tx-hi); }
        .dc-compose textarea:focus { border-color: var(--green); }
        .dc-send { margin-top: 8px; width: 100%; padding: 8px; border-radius: 9px; border: 0; background: var(--green); color: #fff; font-size: 12.5px; font-weight: 800; cursor: pointer; }
        .dc-send:disabled { opacity: .5; cursor: default; }
        .hv-item { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: 1px solid var(--line-soft); border-radius: 10px; background: var(--card, #fff); }
        .hv-lbl { font-size: 12.5px; font-weight: 700; color: var(--tx-hi); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hv-meta { font-size: 10.5px; color: var(--tx-faint); margin-top: 2px; }
        .hv-restore { flex-shrink: 0; font-size: 11.5px; font-weight: 700; padding: 5px 10px; border-radius: 7px; border: 1px solid var(--line-soft); background: var(--bg-1); color: var(--tx-mid); cursor: pointer; }
        .hv-restore:hover { border-color: var(--green); color: var(--green); background: var(--green-bg); }
        .hv-restore:disabled { opacity: .5; cursor: default; }

        @media (max-width: 900px) {
          .doc-body { flex-direction: column; }
          .doc-comments { width: auto; border-left: 0; border-top: 1px solid var(--line-soft); max-height: 60vh; }
        }
      `}</style>
    </div>
  )
}
