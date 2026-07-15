'use client'

import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { useEffect, useMemo, useState } from 'react'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import type { Awareness } from 'y-protocols/awareness'

type User = { name: string; email: string }
type Presence = { name: string; color: string }
type Page = { id: number; title: string; icon: string }

const PALETTE = ['#E11D48', '#0C6B52', '#7C3AED', '#D97706', '#2563EB', '#DB2777', '#059669', '#4F46E5']
function colorFor(key: string) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}
const initials = (n: string) => n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'

export default function Editor({ url, token, user, page, onRename }: { url: string; token: string; user: User; page: Page; onRename: (title: string) => void }) {
  const docName = `page:${page.id}`
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [authFailed, setAuthFailed] = useState(false)
  const [peers, setPeers] = useState<Presence[]>([])
  const color = useMemo(() => colorFor(user.email || user.name), [user])

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

  // Upload dropped/pasted/inserted files → Postgres → returns the URL. BlockNote's
  // native blocks handle the rest: images preview inline, other files (PDF…) become a
  // file block you click to open (the browser previews it). Native = stable, no data loss.
  const uploadFile = async (file: File) => {
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

  const editor = useCreateBlockNote({
    collaboration: {
      provider: provider as unknown as { awareness?: Awareness },
      fragment: doc.getXmlFragment('document-store'),
      user: { name: user.name, color },
    },
    uploadFile,
  })

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
          <input
            defaultValue={page.title}
            key={page.id}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== page.title) onRename(v) }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            aria-label="Titre de la page"
            className="doc-title-input"
          />
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
          <span className="doc-help" title="Tape « / » pour insérer (titre, tableau, liste…). Glisse une image → aperçu inline. Glisse un PDF → clique dessus pour l'ouvrir/prévisualiser.">?</span>
        </div>
      </div>

      <div className="doc-surface">
        <div className="doc-page">
          <BlockNoteView editor={editor} theme="light" />
        </div>
      </div>

      <style jsx>{`
        .doc-card { background: var(--card, #fff); border: 1px solid var(--line-soft); border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.04), 0 12px 30px rgba(0,0,0,.05); display: flex; flex-direction: column; min-height: calc(100vh - 190px); }
        .doc-bar { display: flex; align-items: center; justify-content: space-between; gap: 12; padding: 11px 16px; border-bottom: 1px solid var(--line-soft); background: var(--bg-1, #fff); position: sticky; top: 0; z-index: 3; flex-wrap: wrap; }
        .doc-title { display: inline-flex; align-items: center; gap: 7px; font-size: 15px; font-weight: 700; color: var(--tx-hi); min-width: 0; flex: 1; }
        .doc-title-input { border: none; background: transparent; font-size: 15px; font-weight: 700; color: var(--tx-hi); outline: none; padding: 3px 7px; border-radius: 7px; min-width: 0; width: 100%; max-width: 360px; transition: background .12s; }
        .doc-title-input:hover, .doc-title-input:focus { background: var(--bg-2); }
        .doc-tools { display: inline-flex; align-items: center; gap: 12px; }
        .doc-status { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; padding: 4px 11px; border-radius: 999px; white-space: nowrap; }
        .doc-dot { width: 7px; height: 7px; border-radius: 50%; }
        .doc-peers { display: inline-flex; }
        .doc-avatar { width: 26px; height: 26px; border-radius: 50%; color: #fff; font-size: 10px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; border: 2px solid var(--card, #fff); position: relative; }
        .doc-help { width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--line-soft); color: var(--tx-lo); font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; cursor: help; user-select: none; }
        .doc-help:hover { color: var(--tx-hi); border-color: var(--tx-faint); }
        .doc-surface { flex: 1; overflow-y: auto; padding: 30px clamp(14px, 4vw, 40px) 80px; }
        .doc-page { max-width: 760px; margin: 0 auto; }
        .doc-page :global(.bn-editor) { padding-inline: 0 !important; }
      `}</style>
    </div>
  )
}
