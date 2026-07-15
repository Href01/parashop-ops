'use client'

import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { useCreateBlockNote, SuggestionMenuController, getDefaultReactSlashMenuItems } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import { BlockNoteSchema, defaultBlockSpecs, filterSuggestionItems } from '@blocknote/core'
import type { Awareness } from 'y-protocols/awareness'
import { AttachmentBlock } from './FileBlock'

// Extend BlockNote with our inline file-preview block (same schema on every client).
const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, attachment: AttachmentBlock() },
})

type User = { name: string; email: string }
type Presence = { name: string; color: string }

// Stable per-name color for the live cursor + presence avatars.
const PALETTE = ['#E11D48', '#0C6B52', '#7C3AED', '#D97706', '#2563EB', '#DB2777', '#059669', '#4F46E5']
function colorFor(key: string) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}
const initials = (n: string) => n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'

type Page = { id: number; title: string; icon: string }

export default function Editor({ url, token, user, page, onRename }: { url: string; token: string; user: User; page: Page; onRename: (title: string) => void }) {
  const docName = `page:${page.id}`
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [authFailed, setAuthFailed] = useState(false)
  const [peers, setPeers] = useState<Presence[]>([])
  const color = useMemo(() => colorFor(user.email || user.name), [user])

  // One Y.Doc + provider for the lifetime of this editor.
  const { doc, provider } = useMemo(() => {
    const doc = new Y.Doc()
    // Normalize to a WebSocket URL — accept https/http and force wss/ws (common config slip).
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
    // Presence: read the awareness states (each collaborator's user info).
    const aw = provider.awareness
    const refresh = () => {
      if (!aw) return
      const seen = new Map<string, Presence>()
      aw.getStates().forEach((s: any) => {
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
    schema,
    collaboration: {
      // Same object at runtime; cast narrows Hocuspocus's `awareness: Awareness|null`
      // to BlockNote's expected `awareness?: Awareness` (it's non-null from construction).
      provider: provider as unknown as { awareness?: Awareness },
      fragment: doc.getXmlFragment('document-store'),
      user: { name: user.name, color },
    },
    uploadFile,
  })

  // Insert one or more files as preview blocks (used by drop, paste AND the slash command).
  const fileRef = useRef<HTMLInputElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const insertFiles = async (files: File[]) => {
    for (const file of files) {
      try {
        const fileUrl = await uploadFile(file)
        const ref = editor.getTextCursorPosition().block
        editor.insertBlocks(
          [{ type: 'attachment', props: { url: fileUrl, name: file.name, mime: file.type || '', size: file.size, preview: true } } as never],
          ref, 'after'
        )
      } catch { /* ignore individual failures */ }
    }
  }
  const insertAttachment = () => fileRef.current?.click()
  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length) insertFiles(files)
  }

  // Intercept drag-drop & paste of files BEFORE BlockNote (capture phase) so ANY file —
  // PDF, image, video… — becomes our inline-preview block, not the plain default one.
  useEffect(() => {
    const el = surfaceRef.current
    if (!el) return
    const hasFiles = (dt: DataTransfer | null) => !!dt && Array.from(dt.types || []).includes('Files')
    const onDrop = (e: DragEvent) => { if (!hasFiles(e.dataTransfer)) return; e.preventDefault(); e.stopPropagation(); insertFiles(Array.from(e.dataTransfer!.files)) }
    const onPaste = (e: ClipboardEvent) => { const f = e.clipboardData?.files; if (!f || f.length === 0) return; e.preventDefault(); e.stopPropagation(); insertFiles(Array.from(f)) }
    const onDragOver = (e: DragEvent) => { if (hasFiles(e.dataTransfer)) e.preventDefault() }
    el.addEventListener('drop', onDrop, true)
    el.addEventListener('paste', onPaste, true)
    el.addEventListener('dragover', onDragOver, true)
    return () => { el.removeEventListener('drop', onDrop, true); el.removeEventListener('paste', onPaste, true); el.removeEventListener('dragover', onDragOver, true) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  const st = authFailed
    ? { fg: 'var(--red, #dc2626)', bg: 'var(--red-bg, #fee2e2)', dot: '#DC2626', label: 'Token invalide' }
    : status === 'connected'
      ? { fg: 'var(--green)', bg: 'var(--green-bg)', dot: '#16A34A', label: 'En ligne' }
      : status === 'connecting'
        ? { fg: 'var(--amber)', bg: 'var(--amber-bg)', dot: '#D97706', label: 'Connexion…' }
        : { fg: 'var(--red, #dc2626)', bg: 'var(--red-bg, #fee2e2)', dot: '#DC2626', label: 'Hors ligne' }

  return (
    <div className="doc-card">
      {/* Compact toolbar: title · live status · who's here · help */}
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
          <span className="doc-help" title="Tape « / » pour insérer (titre, tableau, image, liste…). Glisse un fichier (image, PDF) pour l'ajouter et le prévisualiser.">?</span>
        </div>
      </div>

      {/* Paper surface — centered content like a real doc */}
      <div className="doc-surface" ref={surfaceRef}>
        <div className="doc-page">
          <BlockNoteView editor={editor} theme="light" slashMenu={false}>
            <SuggestionMenuController
              triggerCharacter="/"
              getItems={async (query) =>
                filterSuggestionItems(
                  [
                    ...getDefaultReactSlashMenuItems(editor),
                    {
                      title: 'Fichier & aperçu',
                      subtext: 'PDF, image, vidéo… avec aperçu',
                      aliases: ['fichier', 'file', 'pdf', 'piece jointe', 'attachment', 'upload'],
                      group: 'Média',
                      icon: <span style={{ fontSize: 16 }}>📎</span>,
                      onItemClick: insertAttachment,
                    },
                  ],
                  query
                )
              }
            />
          </BlockNoteView>
        </div>
      </div>
      <input ref={fileRef} type="file" onChange={onFilePicked} style={{ display: 'none' }} />

      <style jsx>{`
        .doc-card {
          background: var(--card, #fff);
          border: 1px solid var(--line-soft);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,.04), 0 12px 30px rgba(0,0,0,.05);
          display: flex; flex-direction: column;
          min-height: calc(100vh - 190px);
        }
        .doc-bar {
          display: flex; align-items: center; justify-content: space-between; gap: 12;
          padding: 11px 16px; border-bottom: 1px solid var(--line-soft);
          background: var(--bg-1, #fff); position: sticky; top: 0; z-index: 3; flex-wrap: wrap;
        }
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
        /* Let BlockNote breathe + match the app font */
        .doc-page :global(.bn-editor) { padding-inline: 0 !important; }
      `}</style>
    </div>
  )
}
