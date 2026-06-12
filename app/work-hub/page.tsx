'use client'

import { useEffect, useState } from 'react'
import { BookOpen, FlaskConical, GripVertical, Plus, Trash2 } from 'lucide-react'
import BosShell from '@/components/BosShell'

interface Task {
  id: number
  title: string
  owner: string | null
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE'
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
  dueDate: string | null
}

const PRIO_LABEL: Record<Task['priority'], string> = { URGENT: 'Urgent', HIGH: 'Haute', MEDIUM: 'Moyenne', LOW: 'Basse' }
const PRIO_COLOR: Record<Task['priority'], string> = { URGENT: 'var(--red)', HIGH: 'var(--amber)', MEDIUM: 'var(--blue)', LOW: 'var(--tx-faint)' }
const PRIORITIES: Task['priority'][] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']

const COLUMNS: { key: Task['status']; label: string; color: string }[] = [
  { key: 'TODO', label: 'À faire', color: 'var(--tx-lo)' },
  { key: 'IN_PROGRESS', label: 'En cours', color: 'var(--blue)' },
  { key: 'BLOCKED', label: 'Bloqué', color: 'var(--red)' },
  { key: 'DONE', label: 'Fait', color: 'var(--green)' },
]

export default function WorkHubPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  // composer
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState('AM')
  const [priority, setPriority] = useState<Task['priority']>('MEDIUM')
  const [due, setDue] = useState('')
  const [saving, setSaving] = useState(false)
  // drag & drop
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<Task['status'] | null>(null)

  useEffect(() => {
    fetch('/api/ops/tasks', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setTasks(Array.isArray(d.tasks) ? d.tasks : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const createTask = async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/ops/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, owner, priority, dueDate: due || null }),
      })
      const d = await res.json()
      if (res.ok && d.task) {
        setTasks((t) => [d.task, ...t])
        setTitle(''); setDue(''); setPriority('MEDIUM')
      }
    } finally { setSaving(false) }
  }

  const patchTask = async (id: number, fields: Partial<Task>) => {
    setTasks((t) => t.map((x) => (x.id === id ? { ...x, ...fields } : x)))
    await fetch(`/api/ops/tasks/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
    }).catch(() => {})
  }

  const deleteTask = async (id: number) => {
    const prev = tasks
    setTasks((t) => t.filter((x) => x.id !== id))
    const res = await fetch(`/api/ops/tasks/${id}`, { method: 'DELETE' }).catch(() => null)
    if (!res || !res.ok) setTasks(prev)
  }

  const drop = (status: Task['status']) => {
    if (draggingId != null) {
      const task = tasks.find((t) => t.id === draggingId)
      if (task && task.status !== status) patchTask(draggingId, { status })
    }
    setDraggingId(null); setDragOver(null)
  }

  return (
    <BosShell active="work" title="Work Hub" crumb="Team">
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 24px 60px' }}>
        <div style={{ marginBottom: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>PRIORITÉS · TÂCHES · DÉCISIONS</div>
          <h1 className="serif-display" style={{ fontSize: 28, color: 'var(--tx-hi)', lineHeight: 1.05 }}>Work Hub</h1>
        </div>

        {/* Composer */}
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 12, padding: 12, marginBottom: 16,
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createTask()}
            placeholder="Nouvelle tâche…" style={inp({ flex: '1 1 240px' })} />
          <select value={owner} onChange={(e) => setOwner(e.target.value)} style={inp({ width: 80 })}>
            <option value="AM">AM</option><option value="MH">MH</option>
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value as Task['priority'])} style={inp({ width: 120 })}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIO_LABEL[p]}</option>)}
          </select>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={inp({ width: 150 })} />
          <button className="btn-modern btn-primary" onClick={createTask} disabled={!title.trim() || saving}>
            <Plus className="w-4 h-4" />{saving ? '…' : 'Ajouter'}
          </button>
        </div>

        {/* Kanban board */}
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx-lo)' }}>Chargement…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {COLUMNS.map((col) => {
              const colTasks = tasks.filter((t) => t.status === col.key)
              const isOver = dragOver === col.key
              return (
                <div key={col.key}
                  onDragOver={(e) => { e.preventDefault(); if (dragOver !== col.key) setDragOver(col.key) }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver((c) => (c === col.key ? null : c)) }}
                  onDrop={() => drop(col.key)}
                  style={{
                    background: isOver ? 'var(--rose-bg)' : 'var(--bg-2)',
                    border: `1px solid ${isOver ? 'var(--rose-line)' : 'var(--line-soft)'}`,
                    borderRadius: 12, padding: 10, minHeight: 200, transition: 'background 0.12s, border-color 0.12s',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 4px 10px' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: col.color }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-hi)' }}>{col.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--tx-faint)', fontFamily: 'var(--mono)' }}>{colTasks.length}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {colTasks.map((t) => (
                      <div key={t.id} draggable
                        onDragStart={(e) => { setDraggingId(t.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(t.id)) }}
                        onDragEnd={() => { setDraggingId(null); setDragOver(null) }}
                        style={{
                          background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 9, padding: 10,
                          cursor: 'grab', opacity: draggingId === t.id ? 0.4 : 1, boxShadow: 'var(--shadow-1)',
                        }}
                        className="kanban-card">
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <GripVertical style={{ width: 14, height: 14, color: 'var(--tx-faint)', flexShrink: 0, marginTop: 1 }} />
                          <span style={{ flex: 1, fontSize: 13, color: 'var(--tx-hi)', lineHeight: 1.3,
                            textDecoration: t.status === 'DONE' ? 'line-through' : 'none', opacity: t.status === 'DONE' ? 0.6 : 1 }}>
                            {t.title}
                          </span>
                          <button onClick={() => deleteTask(t.id)} aria-label="Supprimer" className="kanban-del"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--tx-faint)', padding: 0, flexShrink: 0 }}>
                            <Trash2 style={{ width: 13, height: 13 }} />
                          </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, paddingLeft: 20 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', color: PRIO_COLOR[t.priority] }}>
                            {PRIO_LABEL[t.priority].toUpperCase()}
                          </span>
                          {t.dueDate && <span style={{ fontSize: 10, color: 'var(--tx-lo)', fontFamily: 'var(--mono)' }}>
                            {new Date(t.dueDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                          </span>}
                          <span style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center',
                            fontSize: 9, fontWeight: 700, color: '#fff', background: t.owner === 'MH' ? 'var(--blue)' : 'var(--rose-bright)' }}>
                            {t.owner || '–'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {colTasks.length === 0 && (
                      <div style={{ fontSize: 11, color: 'var(--tx-faint)', textAlign: 'center', padding: '16px 0' }}>
                        {isOver ? 'Déposer ici' : '—'}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p style={{ fontSize: 11, color: 'var(--tx-faint)', marginTop: 8 }}>Glisse une carte entre les colonnes pour changer son statut.</p>

        {/* Static context panels (decision log + experiments) — next slice */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 22 }}>
          <div style={panel()}>
            <div style={panelHead()}><BookOpen style={{ width: 16, height: 16, color: 'var(--tx-mid)' }} /><h3 style={h3()}>Journal de décisions</h3><Soon /></div>
            {[
              ['Passer à Sendit comme transporteur', 'Meilleurs tarifs Casa + tracking API', '28 mai'],
              ['Maintenir les prix tout l\'été', 'Marge saine ~42% ; compétition sur le contenu', '24 mai'],
              ['Doubler TikTok vs Facebook', 'ROAS TikTok 4.2x vs FB 1.8x', '20 mai'],
            ].map(([t, b, d]) => (
              <div key={t} style={{ padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--tx-hi)' }}>{t}</span>
                  <span style={{ fontSize: 11, color: 'var(--tx-faint)', fontFamily: 'var(--mono)' }}>{d}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--tx-mid)' }}>{b}</div>
              </div>
            ))}
          </div>
          <div style={panel()}>
            <div style={panelHead()}><FlaskConical style={{ width: 16, height: 16, color: 'var(--tx-mid)' }} /><h3 style={h3()}>Expériences de croissance</h3><Soon /></div>
            {[
              ['Cadeau offert dès 500 MAD', '+11% panier moyen'],
              ['Relance WhatsApp paniers abandonnés', '18% récupérés'],
              ['Pack routine soin', 'démarre 8 juin'],
            ].map(([t, m]) => (
              <div key={t} style={{ padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--tx-hi)' }}>{t}</span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--green-bg)', color: 'var(--green)', fontWeight: 600 }}>{m}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BosShell>
  )
}

function inp(extra: React.CSSProperties): React.CSSProperties {
  return { background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--tx-hi)', ...extra }
}
function panel(): React.CSSProperties { return { background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 12, padding: 16 } }
function panelHead(): React.CSSProperties { return { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } }
function h3(): React.CSSProperties { return { fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)', flex: 1 } }
function Soon() {
  return <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'var(--bg-3)', color: 'var(--tx-lo)' }}>bientôt persistant</span>
}
