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

// Stable per-name color for the live cursor + presence avatars.
const PALETTE = ['#E11D48', '#0C6B52', '#7C3AED', '#D97706', '#2563EB', '#DB2777', '#059669', '#4F46E5']
function colorFor(key: string) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}
const initials = (n: string) => n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'

export default function Editor({ url, token, docName, user }: { url: string; token: string; docName: string; user: User }) {
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

  const editor = useCreateBlockNote({
    collaboration: {
      // Same object at runtime; cast narrows Hocuspocus's `awareness: Awareness|null`
      // to BlockNote's expected `awareness?: Awareness` (it's non-null from construction).
      provider: provider as unknown as { awareness?: Awareness },
      fragment: doc.getXmlFragment('document-store'),
      user: { name: user.name, color },
    },
  })

  const dot = authFailed ? '#DC2626' : status === 'connected' ? '#16A34A' : status === 'connecting' ? '#D97706' : '#DC2626'
  const label = authFailed ? 'Token invalide (REALTIME_TOKEN)' : status === 'connected' ? 'En ligne' : status === 'connecting' ? 'Connexion…' : 'Reconnexion…'

  return (
    <div>
      {/* Status + presence bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--tx-mid)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} /> {label}
        </span>
        {peers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--tx-faint)' }}>En ce moment :</span>
            <div style={{ display: 'flex' }}>
              {peers.map((p, i) => (
                <span key={i} title={p.name} style={{ width: 24, height: 24, borderRadius: '50%', background: p.color, color: '#fff', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--card, #fff)', marginLeft: i ? -8 : 0 }}>
                  {initials(p.name)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card-modern" style={{ padding: '8px 4px', minHeight: 420 }}>
        <BlockNoteView editor={editor} theme="light" />
      </div>
    </div>
  )
}
