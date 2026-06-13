'use client'

import { useEffect, useState } from 'react'
import { BookOpen, FlaskConical, GripVertical, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import BosShell from '@/components/BosShell'

interface Task {
  id: number
  title: string
  owner: string | null
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE'
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
  dueDate: string | null
  linkedType?: string | null
  linkedId?: number | null
}

const LINK_HREF: Record<string, string> = { order: '/orders', product: '/products', customer: '/customers', campaign: '/campaigns' }
const LINK_LABEL: Record<string, string> = { order: 'Cmd', product: 'Produit', customer: 'Cliente', campaign: 'Campagne' }

interface Decision { id: number; title: string; decision: string | null; owner: string | null; decisionDate: string | null }
interface Experiment { id: number; name: string; successMetric: string | null; status: string }

const EXP_LABEL: Record<string, string> = { PLANNED: 'Planifiée', RUNNING: 'En cours', WON: 'Gagnée', LOST: 'Perdue', PAUSED: 'En pause' }
const EXP_TONE: Record<string, { c: string; bg: string }> = {
  PLANNED: { c: 'var(--tx-lo)', bg: 'var(--bg-3)' },
  RUNNING: { c: 'var(--blue)', bg: 'var(--blue-bg)' },
  WON: { c: 'var(--green)', bg: 'var(--green-bg)' },
  LOST: { c: 'var(--red)', bg: 'var(--red-bg)' },
  PAUSED: { c: 'var(--amber)', bg: 'var(--amber-bg)' },
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
  const [linkType, setLinkType] = useState('')
  const [linkId, setLinkId] = useState('')
  const [saving, setSaving] = useState(false)
  // drag & drop
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<Task['status'] | null>(null)
  // decisions & experiments
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [dTitle, setDTitle] = useState('')
  const [dWhy, setDWhy] = useState('')
  const [eName, setEName] = useState('')
  const [eMetric, setEMetric] = useState('')

  useEffect(() => {
    const j = (r: Response) => r.json()
    Promise.all([
      fetch('/api/ops/tasks', { cache: 'no-store' }).then(j).then((d) => setTasks(Array.isArray(d.tasks) ? d.tasks : [])),
      fetch('/api/ops/decisions', { cache: 'no-store' }).then(j).then((d) => setDecisions(Array.isArray(d.decisions) ? d.decisions : [])),
      fetch('/api/ops/experiments', { cache: 'no-store' }).then(j).then((d) => setExperiments(Array.isArray(d.experiments) ? d.experiments : [])),
    ].map((p) => p.catch(() => {}))).finally(() => setLoading(false))
  }, [])

  const createDecision = async () => {
    if (!dTitle.trim()) return
    const res = await fetch('/api/ops/decisions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: dTitle, decision: dWhy, owner }) }).catch(() => null)
    const d = res && res.ok ? await res.json() : null
    if (d?.decision) { setDecisions((x) => [d.decision, ...x]); setDTitle(''); setDWhy('') }
  }
  const deleteDecision = async (id: number) => {
    setDecisions((x) => x.filter((d) => d.id !== id))
    await fetch(`/api/ops/decisions/${id}`, { method: 'DELETE' }).catch(() => {})
  }
  const createExperiment = async () => {
    if (!eName.trim()) return
    const res = await fetch('/api/ops/experiments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: eName, successMetric: eMetric, status: 'RUNNING' }) }).catch(() => null)
    const d = res && res.ok ? await res.json() : null
    if (d?.experiment) { setExperiments((x) => [d.experiment, ...x]); setEName(''); setEMetric('') }
  }
  const cycleExp = async (e: Experiment) => {
    const next: Record<string, string> = { PLANNED: 'RUNNING', RUNNING: 'WON', WON: 'LOST', LOST: 'PLANNED', PAUSED: 'RUNNING' }
    const status = next[e.status] || 'RUNNING'
    setExperiments((x) => x.map((y) => (y.id === e.id ? { ...y, status } : y)))
    await fetch(`/api/ops/experiments/${e.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }).catch(() => {})
  }
  const deleteExperiment = async (id: number) => {
    setExperiments((x) => x.filter((e) => e.id !== id))
    await fetch(`/api/ops/experiments/${id}`, { method: 'DELETE' }).catch(() => {})
  }

  const createTask = async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    try {
      const lid = parseInt(linkId, 10)
      const res = await fetch('/api/ops/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, owner, priority, dueDate: due || null,
          linkedType: linkType && Number.isInteger(lid) ? linkType : null,
          linkedId: linkType && Number.isInteger(lid) ? lid : null,
        }),
      })
      const d = await res.json()
      if (res.ok && d.task) {
        setTasks((t) => [d.task, ...t])
        setTitle(''); setDue(''); setPriority('MEDIUM'); setLinkType(''); setLinkId('')
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
          <select value={linkType} onChange={(e) => setLinkType(e.target.value)} style={inp({ width: 110 })} title="Lier à">
            <option value="">Lier à…</option>
            <option value="order">Commande</option>
            <option value="product">Produit</option>
            <option value="customer">Cliente</option>
            <option value="campaign">Campagne</option>
          </select>
          {linkType && <input value={linkId} onChange={(e) => setLinkId(e.target.value)} type="number" placeholder="N°" style={inp({ width: 72 })} />}
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
                          {t.linkedType && t.linkedId && LINK_HREF[t.linkedType] && (
                            <Link href={`${LINK_HREF[t.linkedType]}/${t.linkedId}`} onClick={(ev) => ev.stopPropagation()}
                              style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20, background: 'var(--rose-bg)', color: 'var(--rose-bright)', textDecoration: 'none' }}>
                              🔗 {LINK_LABEL[t.linkedType]} #{t.linkedId}
                            </Link>
                          )}
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

        {/* Decision log + Growth experiments (persisted) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginTop: 22 }}>
          {/* Decision log */}
          <div style={panel()}>
            <div style={panelHead()}><BookOpen style={{ width: 16, height: 16, color: 'var(--rose)' }} /><h3 style={h3()}>Journal de décisions</h3></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              <input value={dTitle} onChange={(e) => setDTitle(e.target.value)} placeholder="Décision prise…" style={inp({})} />
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={dWhy} onChange={(e) => setDWhy(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createDecision()} placeholder="Pourquoi / rationale" style={inp({ flex: 1 })} />
                <button className="btn-modern btn-primary" onClick={createDecision} disabled={!dTitle.trim()}><Plus className="w-4 h-4" /></button>
              </div>
            </div>
            {decisions.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--tx-faint)', textAlign: 'center', padding: '12px 0' }}>Aucune décision enregistrée.</p>
            ) : decisions.map((d) => (
              <div key={d.id} className="wh-row" style={{ padding: '9px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--tx-hi)' }}>{d.title}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {d.decisionDate && <span style={{ fontSize: 11, color: 'var(--tx-faint)', fontFamily: 'var(--mono)' }}>{new Date(d.decisionDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>}
                    <button onClick={() => deleteDecision(d.id)} aria-label="Supprimer" className="wh-del" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-faint)', padding: 0 }}><Trash2 style={{ width: 12, height: 12 }} /></button>
                  </span>
                </div>
                {d.decision && <div style={{ fontSize: 12, color: 'var(--tx-mid)' }}>{d.decision}</div>}
              </div>
            ))}
          </div>

          {/* Growth experiments */}
          <div style={panel()}>
            <div style={panelHead()}><FlaskConical style={{ width: 16, height: 16, color: 'var(--rose)' }} /><h3 style={h3()}>Expériences de croissance</h3></div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <input value={eName} onChange={(e) => setEName(e.target.value)} placeholder="Expérience…" style={inp({ flex: 2 })} />
              <input value={eMetric} onChange={(e) => setEMetric(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createExperiment()} placeholder="Métrique" style={inp({ flex: 1 })} />
              <button className="btn-modern btn-primary" onClick={createExperiment} disabled={!eName.trim()}><Plus className="w-4 h-4" /></button>
            </div>
            {experiments.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--tx-faint)', textAlign: 'center', padding: '12px 0' }}>Aucune expérience.</p>
            ) : experiments.map((e) => {
              const tone = EXP_TONE[e.status] || EXP_TONE.PLANNED
              return (
                <div key={e.id} className="wh-row" style={{ padding: '9px 0', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--tx-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                    {e.successMetric && <div style={{ fontSize: 11, color: 'var(--tx-lo)' }}>{e.successMetric}</div>}
                  </div>
                  <button onClick={() => cycleExp(e)} title="Changer le statut"
                    style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, border: 'none', cursor: 'pointer', color: tone.c, background: tone.bg }}>
                    {EXP_LABEL[e.status] || e.status}
                  </button>
                  <button onClick={() => deleteExperiment(e.id)} aria-label="Supprimer" className="wh-del" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-faint)', padding: 0, flexShrink: 0 }}><Trash2 style={{ width: 12, height: 12 }} /></button>
                </div>
              )
            })}
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
