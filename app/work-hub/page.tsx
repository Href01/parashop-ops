'use client'

import { useEffect, useState } from 'react'
import { BookOpen, FlaskConical, Plus, Trash2 } from 'lucide-react'
import BosShell from '@/components/BosShell'

interface Task {
  id: number
  title: string
  owner: string | null
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE'
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
  dueDate: string | null
}

const STATUS_LABEL: Record<Task['status'], string> = { TODO: 'À faire', IN_PROGRESS: 'En cours', BLOCKED: 'Bloqué', DONE: 'Fait' }
const STATUS_COLOR: Record<Task['status'], string> = { TODO: 'var(--tx-lo)', IN_PROGRESS: 'var(--blue)', BLOCKED: 'var(--red)', DONE: 'var(--green)' }
const PRIO_LABEL: Record<Task['priority'], string> = { URGENT: 'Urgent', HIGH: 'Haute', MEDIUM: 'Moyenne', LOW: 'Basse' }
const PRIO_COLOR: Record<Task['priority'], string> = { URGENT: 'var(--red)', HIGH: 'var(--amber)', MEDIUM: 'var(--blue)', LOW: 'var(--tx-faint)' }
const STATUSES: Task['status'][] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE']
const PRIORITIES: Task['priority'][] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']

export default function WorkHubPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'ALL' | Task['status']>('ALL')
  // composer
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState('AM')
  const [priority, setPriority] = useState<Task['priority']>('MEDIUM')
  const [due, setDue] = useState('')
  const [saving, setSaving] = useState(false)

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

  const visible = filter === 'ALL' ? tasks : tasks.filter((t) => t.status === filter)
  const count = (s: 'ALL' | Task['status']) => (s === 'ALL' ? tasks.length : tasks.filter((t) => t.status === s).length)

  return (
    <BosShell active="work" title="Work Hub" crumb="Team">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 24px 60px' }}>
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

        {/* Filters */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {(['ALL', ...STATUSES] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              style={chip(filter === s)}>
              {s === 'ALL' ? 'Toutes' : STATUS_LABEL[s]} <span style={{ opacity: 0.6 }}>{count(s)}</span>
            </button>
          ))}
        </div>

        {/* Task list */}
        <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 12, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--tx-lo)' }}>Chargement…</div>
          ) : visible.length === 0 ? (
            <div style={{ padding: 36, textAlign: 'center', color: 'var(--tx-faint)' }}>
              {tasks.length === 0 ? 'Aucune tâche. Ajoute la première ci-dessus.' : 'Aucune tâche dans ce filtre.'}
            </div>
          ) : (
            visible.map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: '1px solid var(--line-soft)' }}>
                <input type="checkbox" checked={t.status === 'DONE'}
                  onChange={() => patchTask(t.id, { status: t.status === 'DONE' ? 'TODO' : 'DONE' })}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--rose-bright)' }} />
                <span style={{ width: 64, flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: PRIO_COLOR[t.priority] }}>
                  {PRIO_LABEL[t.priority].toUpperCase()}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--tx-hi)',
                  textDecoration: t.status === 'DONE' ? 'line-through' : 'none', opacity: t.status === 'DONE' ? 0.55 : 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                {t.dueDate && <span style={{ flexShrink: 0, fontSize: 11, color: 'var(--tx-lo)', fontFamily: 'var(--mono)' }}>
                  {new Date(t.dueDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                </span>}
                <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center',
                  fontSize: 10, fontWeight: 700, color: '#fff', background: t.owner === 'MH' ? 'var(--blue)' : 'var(--rose-bright)' }}>
                  {t.owner || '–'}
                </span>
                <select value={t.status} onChange={(e) => patchTask(t.id, { status: e.target.value as Task['status'] })}
                  style={{ ...inp({ width: 116 }), color: STATUS_COLOR[t.status], fontWeight: 600, fontSize: 12 }}>
                  {STATUSES.map((s) => <option key={s} value={s} style={{ color: 'var(--tx-hi)' }}>{STATUS_LABEL[s]}</option>)}
                </select>
                <button onClick={() => deleteTask(t.id)} aria-label="Supprimer"
                  style={{ flexShrink: 0, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--tx-faint)', padding: 4 }}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Static context panels (decision log + experiments) — next slice of Pilier 2 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 20 }}>
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
function chip(active: boolean): React.CSSProperties {
  return { padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line-soft)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
    background: active ? 'var(--rose-bright)' : 'var(--bg-1)', color: active ? '#fff' : 'var(--tx-mid)' }
}
function panel(): React.CSSProperties { return { background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 12, padding: 16 } }
function panelHead(): React.CSSProperties { return { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } }
function h3(): React.CSSProperties { return { fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)', flex: 1 } }
function Soon() {
  return <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'var(--bg-3)', color: 'var(--tx-lo)' }}>bientôt persistant</span>
}
