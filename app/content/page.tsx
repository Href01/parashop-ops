'use client'

import { useEffect, useState } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import BosShell from '@/components/BosShell'

interface Item {
  id: number
  title: string
  type: string | null
  platform: string | null
  owner: string | null
  status: 'IDEA' | 'TO_PRODUCE' | 'SCHEDULED' | 'PUBLISHED'
  dueDate: string | null
}

const COLUMNS: { key: Item['status']; label: string; color: string }[] = [
  { key: 'IDEA', label: 'Idées', color: 'var(--tx-lo)' },
  { key: 'TO_PRODUCE', label: 'À produire', color: 'var(--amber)' },
  { key: 'SCHEDULED', label: 'Planifié', color: 'var(--blue)' },
  { key: 'PUBLISHED', label: 'Publié', color: 'var(--green)' },
]
const PLATFORMS = ['Instagram', 'TikTok', 'Facebook', 'WhatsApp', 'Autre']
const TYPES = ['Reel', 'Post', 'Story', 'Carrousel', 'Live']
const PLAT_COLOR: Record<string, string> = {
  Instagram: 'var(--c-instagram)', TikTok: 'var(--c-tiktok)', Facebook: 'var(--blue)', WhatsApp: 'var(--c-whatsapp)', Autre: 'var(--tx-faint)',
}

export default function ContentPage() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [platform, setPlatform] = useState('Instagram')
  const [type, setType] = useState('Reel')
  const [owner, setOwner] = useState('MH')
  const [due, setDue] = useState('')
  const [saving, setSaving] = useState(false)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<Item['status'] | null>(null)

  useEffect(() => {
    fetch('/api/ops/content', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d.items) ? d.items : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const create = async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/ops/content', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, platform, type, owner, dueDate: due || null }),
      })
      const d = await res.json()
      if (res.ok && d.item) { setItems((x) => [d.item, ...x]); setTitle(''); setDue('') }
    } finally { setSaving(false) }
  }
  const patch = async (id: number, fields: Partial<Item>) => {
    setItems((x) => x.map((i) => (i.id === id ? { ...i, ...fields } : i)))
    await fetch(`/api/ops/content/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) }).catch(() => {})
  }
  const remove = async (id: number) => {
    const prev = items
    setItems((x) => x.filter((i) => i.id !== id))
    const res = await fetch(`/api/ops/content/${id}`, { method: 'DELETE' }).catch(() => null)
    if (!res || !res.ok) setItems(prev)
  }
  const drop = (status: Item['status']) => {
    if (draggingId != null) {
      const it = items.find((i) => i.id === draggingId)
      if (it && it.status !== status) patch(draggingId, { status })
    }
    setDraggingId(null); setDragOver(null)
  }

  return (
    <BosShell active="content" title="Content Hub" crumb="Croissance">
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 24px 60px' }}>
        <div style={{ marginBottom: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>CALENDRIER DE CONTENU</div>
          <h1 className="serif-display" style={{ fontSize: 28, lineHeight: 1.05 }}>Content Hub</h1>
        </div>

        {/* Composer */}
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 12, padding: 12, marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} placeholder="Idée de contenu…" style={inp({ flex: '1 1 220px' })} />
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={inp({ width: 120 })}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select>
          <select value={type} onChange={(e) => setType(e.target.value)} style={inp({ width: 110 })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} style={inp({ width: 80 })}><option value="AM">AM</option><option value="MH">MH</option></select>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={inp({ width: 150 })} />
          <button className="btn-modern btn-primary" onClick={create} disabled={!title.trim() || saving}><Plus className="w-4 h-4" />{saving ? '…' : 'Ajouter'}</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx-lo)' }}>Chargement…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {COLUMNS.map((col) => {
              const colItems = items.filter((i) => i.status === col.key)
              const isOver = dragOver === col.key
              return (
                <div key={col.key}
                  onDragOver={(e) => { e.preventDefault(); if (dragOver !== col.key) setDragOver(col.key) }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver((c) => (c === col.key ? null : c)) }}
                  onDrop={() => drop(col.key)}
                  style={{ background: isOver ? 'var(--rose-bg)' : 'var(--bg-2)', border: `1px solid ${isOver ? 'var(--rose-line)' : 'var(--line-soft)'}`, borderRadius: 12, padding: 10, minHeight: 200, transition: 'background 0.12s, border-color 0.12s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 4px 10px' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: col.color }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-hi)' }}>{col.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--tx-faint)', fontFamily: 'var(--mono)' }}>{colItems.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {colItems.map((it) => (
                      <div key={it.id} draggable
                        onDragStart={(e) => { setDraggingId(it.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(it.id)) }}
                        onDragEnd={() => { setDraggingId(null); setDragOver(null) }}
                        style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 9, padding: 10, cursor: 'grab', opacity: draggingId === it.id ? 0.4 : 1, boxShadow: 'var(--shadow-1)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <GripVertical style={{ width: 14, height: 14, color: 'var(--tx-faint)', flexShrink: 0, marginTop: 1 }} />
                          <span style={{ flex: 1, fontSize: 13, color: 'var(--tx-hi)', lineHeight: 1.3 }}>{it.title}</span>
                          <button onClick={() => remove(it.id)} aria-label="Supprimer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-faint)', padding: 0, flexShrink: 0 }}><Trash2 style={{ width: 13, height: 13 }} /></button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, paddingLeft: 20, flexWrap: 'wrap' }}>
                          {it.platform && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, color: '#fff', background: PLAT_COLOR[it.platform] || 'var(--tx-faint)' }}>{it.platform}</span>}
                          {it.type && <span style={{ fontSize: 10, color: 'var(--tx-lo)' }}>{it.type}</span>}
                          {it.dueDate && <span style={{ fontSize: 10, color: 'var(--tx-lo)', fontFamily: 'var(--mono)' }}>{new Date(it.dueDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>}
                          <span style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, color: '#fff', background: it.owner === 'AM' ? 'var(--rose-bright)' : 'var(--blue)' }}>{it.owner || '–'}</span>
                        </div>
                      </div>
                    ))}
                    {colItems.length === 0 && <div style={{ fontSize: 11, color: 'var(--tx-faint)', textAlign: 'center', padding: '16px 0' }}>{isOver ? 'Déposer ici' : '—'}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p style={{ fontSize: 11, color: 'var(--tx-faint)', marginTop: 8 }}>Glisse une carte entre les colonnes pour faire avancer le contenu.</p>
      </div>
    </BosShell>
  )
}

function inp(extra: React.CSSProperties): React.CSSProperties {
  return { background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--tx-hi)', ...extra }
}
