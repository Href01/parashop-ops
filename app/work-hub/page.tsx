'use client'

import { useEffect, useState } from 'react'
import { BookOpen, FlaskConical, GripVertical, Plus, Trash2, X, AlertCircle, ChevronRight } from 'lucide-react'
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
interface Experiment {
  id: number
  name: string
  hypothesis: string | null
  channel: string | null
  successMetric: string | null
  status: string
  result: string | null
  learnings: string | null
  startDate: string | null
  endDate: string | null
  budget: number | string | null
}

const EXP_LABEL: Record<string, string> = { PLANNED: 'Planifiée', RUNNING: 'En cours', WON: 'Gagnée', LOST: 'Perdue', PAUSED: 'En pause' }
const EXP_STATUS_LIST = ['PLANNED', 'RUNNING', 'PAUSED', 'WON', 'LOST']
const EXP_TONE: Record<string, { c: string; bg: string }> = {
  PLANNED: { c: 'var(--tx-lo)', bg: 'var(--bg-3)' },
  RUNNING: { c: 'var(--blue)', bg: 'var(--blue-bg)' },
  WON: { c: 'var(--green)', bg: 'var(--green-bg)' },
  LOST: { c: 'var(--red)', bg: 'var(--red-bg)' },
  PAUSED: { c: 'var(--amber)', bg: 'var(--amber-bg)' },
}
const EXP_CHANNELS = ['Instagram', 'TikTok', 'WhatsApp', 'Facebook', 'Email', 'Site web', 'Influence', 'Autre']

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
  const [error, setError] = useState<string | null>(null)
  const [editingExp, setEditingExp] = useState<Experiment | null>(null)

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
    try {
      const res = await fetch('/api/ops/experiments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: eName.trim(), successMetric: eMetric, status: 'PLANNED' }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
      if (d.experiment) { setExperiments((x) => [d.experiment, ...x]); setEName(''); setEMetric(''); setError(null) }
    } catch (e) { setError(e instanceof Error ? e.message : 'Création impossible') }
  }
  const patchExp = async (id: number, fields: Partial<Experiment>) => {
    const prev = experiments
    setExperiments((x) => x.map((y) => (y.id === id ? { ...y, ...fields } : y)))
    if (editingExp?.id === id) setEditingExp((e) => (e ? { ...e, ...fields } : e))
    try {
      const res = await fetch(`/api/ops/experiments/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Erreur ${res.status}`) }
      setError(null)
    } catch (e) { setExperiments(prev); setError(e instanceof Error ? e.message : 'Mise à jour impossible') }
  }
  const deleteExperiment = async (id: number) => {
    const prev = experiments
    setExperiments((x) => x.filter((e) => e.id !== id))
    if (editingExp?.id === id) setEditingExp(null)
    try {
      const res = await fetch(`/api/ops/experiments/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      setError(null)
    } catch (e) { setExperiments(prev); setError(e instanceof Error ? e.message : 'Suppression impossible') }
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
          <p style={{ fontSize: 13, color: 'var(--tx-mid)', marginTop: 7, lineHeight: 1.55, maxWidth: 640 }}>
            Ton <b>pilotage interne</b> — tâches, journal de décisions et expériences de croissance. Tout le travail qui fait tourner le business.
            <br />Pour planifier tes posts Insta/TikTok →{' '}
            <a href="/content" style={{ color: 'var(--rose-bright)', fontWeight: 600, textDecoration: 'none' }}>Content Hub</a>.
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--rose-bg)', border: '1px solid var(--rose-line)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
            <AlertCircle style={{ width: 16, height: 16, color: 'var(--rose-bright)', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--tx-hi)' }}>{error}</span>
            <button onClick={() => setError(null)} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-faint)', padding: 0 }}><X style={{ width: 14, height: 14 }} /></button>
          </div>
        )}

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
            <Plus style={{ width: 16, height: 16 }} />{saving ? '…' : 'Ajouter'}
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
                <button className="btn-modern btn-primary" onClick={createDecision} disabled={!dTitle.trim()}><Plus style={{ width: 16, height: 16 }} /></button>
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
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input value={eName} onChange={(e) => setEName(e.target.value)} placeholder="Hypothèse à tester…" style={inp({ flex: 2 })} />
              <input value={eMetric} onChange={(e) => setEMetric(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createExperiment()} placeholder="Métrique de succès" style={inp({ flex: 1 })} />
              <button className="btn-modern btn-primary" onClick={createExperiment} disabled={!eName.trim()}><Plus style={{ width: 16, height: 16 }} /></button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--tx-faint)', marginBottom: 12 }}>Clique une expérience pour définir hypothèse, canal, budget, issue & apprentissages.</p>
            {experiments.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--tx-faint)', textAlign: 'center', padding: '12px 0' }}>Aucune expérience. Lance-en une : « tester X pour améliorer Y ».</p>
            ) : experiments.map((e) => {
              const tone = EXP_TONE[e.status] || EXP_TONE.PLANNED
              return (
                <div key={e.id} className="wh-row" onClick={() => setEditingExp(e)}
                  style={{ padding: '10px 0', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: tone.c, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--tx-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                    {(e.channel || e.successMetric) && (
                      <div style={{ fontSize: 11, color: 'var(--tx-lo)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[e.channel, e.successMetric].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, color: tone.c, background: tone.bg }}>{EXP_LABEL[e.status] || e.status}</span>
                  <ChevronRight style={{ width: 14, height: 14, color: 'var(--tx-faint)', flexShrink: 0 }} />
                  <button onClick={(ev) => { ev.stopPropagation(); deleteExperiment(e.id) }} aria-label="Supprimer" className="wh-del" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-faint)', padding: 0, flexShrink: 0 }}><Trash2 style={{ width: 12, height: 12 }} /></button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Experiment drawer */}
      {editingExp && <ExperimentDrawer exp={editingExp} onClose={() => setEditingExp(null)} onSave={patchExp} onDelete={deleteExperiment} />}
    </BosShell>
  )
}

function ExperimentDrawer({ exp, onClose, onSave, onDelete }: {
  exp: Experiment
  onClose: () => void
  onSave: (id: number, fields: Partial<Experiment>) => void
  onDelete: (id: number) => void
}) {
  const [name, setName] = useState(exp.name)
  const [status, setStatus] = useState(exp.status || 'PLANNED')
  const [hypothesis, setHypothesis] = useState(exp.hypothesis || '')
  const [channel, setChannel] = useState(exp.channel || '')
  const [metric, setMetric] = useState(exp.successMetric || '')
  const [budget, setBudget] = useState(exp.budget != null ? String(exp.budget) : '')
  const [startDate, setStartDate] = useState(exp.startDate || '')
  const [endDate, setEndDate] = useState(exp.endDate || '')
  const [result, setResult] = useState(exp.result || '')
  const [learnings, setLearnings] = useState(exp.learnings || '')
  const tone = EXP_TONE[status] || EXP_TONE.PLANNED
  const isOutcome = status === 'WON' || status === 'LOST'

  const save = () => {
    onSave(exp.id, {
      name: name.trim() || exp.name,
      status,
      hypothesis: hypothesis || null,
      channel: channel || null,
      successMetric: metric || null,
      budget: budget ? Number(budget) : null,
      startDate: startDate || null,
      endDate: endDate || null,
      result: result || null,
      learnings: learnings || null,
    })
    onClose()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'oklch(0.2 0.02 350 / 0.35)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(460px, 100%)', height: '100%', background: 'var(--bg-1)', borderLeft: '1px solid var(--line)', boxShadow: '-8px 0 24px oklch(0.4 0.05 350 / 0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--line-soft)', position: 'sticky', top: 0, background: 'var(--bg-1)', zIndex: 1 }}>
          <FlaskConical style={{ width: 16, height: 16, color: 'var(--rose)' }} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)' }}>Expérience de croissance</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, color: tone.c, background: tone.bg }}>{EXP_LABEL[status] || status}</span>
          <button onClick={onClose} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-lo)', padding: 0 }}><X style={{ width: 18, height: 18 }} /></button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <WField label="Nom de l'expérience">
            <input value={name} onChange={(e) => setName(e.target.value)} style={inp({ width: '100%' })} />
          </WField>

          <WField label="Statut">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {EXP_STATUS_LIST.map((s) => {
                const t = EXP_TONE[s]
                const on = status === s
                return (
                  <button key={s} onClick={() => setStatus(s)}
                    style={{ fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 20, cursor: 'pointer', color: on ? t.c : 'var(--tx-lo)', background: on ? t.bg : 'transparent', border: `1px solid ${on ? t.c : 'var(--line)'}` }}>
                    {EXP_LABEL[s]}
                  </button>
                )
              })}
            </div>
          </WField>

          <WField label="Hypothèse">
            <textarea value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} rows={3} placeholder="On pense que [changement] va améliorer [métrique] parce que [raison]." style={inp({ width: '100%', resize: 'vertical', fontFamily: 'inherit' })} />
          </WField>

          <div style={{ display: 'flex', gap: 10 }}>
            <WField label="Canal" flex>
              <select value={channel} onChange={(e) => setChannel(e.target.value)} style={inp({ width: '100%' })}>
                <option value="">—</option>
                {EXP_CHANNELS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </WField>
            <WField label="Budget (MAD)" flex>
              <input value={budget} onChange={(e) => setBudget(e.target.value)} type="number" placeholder="—" style={inp({ width: '100%' })} />
            </WField>
          </div>

          <WField label="Métrique de succès">
            <input value={metric} onChange={(e) => setMetric(e.target.value)} placeholder="ex. +15% taux de conversion" style={inp({ width: '100%' })} />
          </WField>

          <div style={{ display: 'flex', gap: 10 }}>
            <WField label="Début" flex>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inp({ width: '100%' })} />
            </WField>
            <WField label="Fin" flex>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inp({ width: '100%' })} />
            </WField>
          </div>

          {/* Outcome — encouraged once won/lost */}
          <div style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <WField label={`Résultat${isOutcome ? '' : ' (à remplir à la fin)'}`}>
              <textarea value={result} onChange={(e) => setResult(e.target.value)} rows={2} placeholder="Ce qui s'est passé, les chiffres obtenus…" style={inp({ width: '100%', resize: 'vertical', fontFamily: 'inherit' })} />
            </WField>
            <WField label="Apprentissages">
              <textarea value={learnings} onChange={(e) => setLearnings(e.target.value)} rows={3} placeholder="Ce qu'on retient, ce qu'on refait ou pas…" style={inp({ width: '100%', resize: 'vertical', fontFamily: 'inherit' })} />
            </WField>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button className="btn-modern btn-primary" onClick={save} style={{ flex: 1, justifyContent: 'center' }}>Enregistrer</button>
            <button className="btn-modern" onClick={() => { onDelete(exp.id); onClose() }} style={{ color: 'var(--rose-bright)', borderColor: 'var(--rose-line)' }}><Trash2 style={{ width: 15, height: 15 }} />Supprimer</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function WField({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: flex ? 1 : undefined, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx-lo)' }}>{label}</span>
      {children}
    </label>
  )
}

function inp(extra: React.CSSProperties): React.CSSProperties {
  return { background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'var(--tx-hi)', boxSizing: 'border-box', ...extra }
}
function panel(): React.CSSProperties { return { background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 12, padding: 16 } }
function panelHead(): React.CSSProperties { return { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } }
function h3(): React.CSSProperties { return { fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)', flex: 1 } }
