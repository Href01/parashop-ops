'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, X, AlertCircle, Truck } from 'lucide-react'
import BosShell from '@/components/BosShell'

interface Row {
  id: number
  code: string
  senditStatus: string
  name: string
  phone: string
  city: string
  amount: number
  fee: number
  productsText: string | null
  reference: string | null
  senditCreatedAt: string | null
  matchedOrderId: number | null
  matchedUserId: number | null
  matchedCustomerName: string | null
  assignedProducts: Array<{ productId: number; quantity: number; price: number }> | null
  state: string
  promoted: boolean
  promotedOrderId: number | null
}
interface Counts { total: number; sendit_only: number; matched: number; mismatch: number; promoted: number; ready: number }

const mad = (v: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v || 0)
const STATE_LABEL: Record<string, string> = { sendit_only: 'Sendit seul', matched: 'Lié', mismatch: 'Divergent' }
const STATE_BADGE: Record<string, { bg: string; fg: string }> = {
  sendit_only: { bg: 'var(--amber-bg)', fg: 'var(--amber)' },
  matched: { bg: 'var(--green-bg)', fg: 'var(--green)' },
  mismatch: { bg: 'var(--rose-bg)', fg: 'var(--rose-bright)' },
}

export default function SenditLabPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [counts, setCounts] = useState<Counts>({ total: 0, sendit_only: 0, matched: 0, mismatch: 0, promoted: 0, ready: 0 })
  const [loading, setLoading] = useState(true)
  const [pulling, setPulling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('sendit_only')

  const load = () => {
    fetch('/api/ops/sendit/staging', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { rows: [], counts: {} }))
      .then((d) => { setRows(Array.isArray(d.rows) ? d.rows : []); if (d.counts) setCounts(d.counts) })
      .catch(() => setError('Chargement impossible'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const pull = async () => {
    if (pulling) return
    setPulling(true); setError(null); setNotice(null)
    try {
      const res = await fetch('/api/ops/sendit/staging', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pull' }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Erreur ${res.status}`)
      setNotice(`Sendit synchronisé : ${d.pulled} colis (${d.inserted} nouveaux, ${d.updated} mis à jour).`)
      load()
      setTimeout(() => setNotice(null), 6000)
    } catch (e) { setError(e instanceof Error ? e.message : 'Pull impossible') }
    finally { setPulling(false) }
  }

  const shown = rows.filter((r) => filter === 'all' ? !r.promoted : filter === 'promoted' ? r.promoted : (r.state === filter && !r.promoted))

  return (
    <BosShell active="sendit" title="Sendit" crumb="Opérations">
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 24px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>RÉCONCILIATION · LABO</div>
            <h1 className="serif-display" style={{ fontSize: 28, lineHeight: 1.05 }}>Sendit</h1>
            <p style={{ fontSize: 13, color: 'var(--tx-mid)', marginTop: 7, lineHeight: 1.55, maxWidth: 680 }}>
              Zone <b>isolée</b> : on importe les colis Sendit ici, on affecte les produits, on vérifie — <b>rien ne touche le BOS officiel</b> tant que tu n&apos;as pas cliqué « Rendre officiel ».
            </p>
          </div>
          <button className="btn-modern btn-primary" onClick={pull} disabled={pulling} style={{ flexShrink: 0, marginTop: 4 }}>
            <RefreshCw style={{ width: 15, height: 15 }} />{pulling ? 'Sync…' : 'Pull Sendit'}
          </button>
        </div>

        {/* Counts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
          <Tab label="Sendit seul" value={counts.sendit_only} active={filter === 'sendit_only'} onClick={() => setFilter('sendit_only')} tone="amber" />
          <Tab label="Divergent" value={counts.mismatch} active={filter === 'mismatch'} onClick={() => setFilter('mismatch')} tone="rose" />
          <Tab label="Lié & synchro" value={counts.matched} active={filter === 'matched'} onClick={() => setFilter('matched')} tone="green" />
          <Tab label="Promu (officiel)" value={counts.promoted} active={filter === 'promoted'} onClick={() => setFilter('promoted')} tone="blue" />
          <Tab label="Tout" value={counts.total} active={filter === 'all'} onClick={() => setFilter('all')} tone="gray" />
        </div>

        {notice && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--tx-hi)' }}>✓ {notice}</span>
            <button onClick={() => setNotice(null)} aria-label="Fermer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-faint)', padding: 0 }}><X style={{ width: 14, height: 14 }} /></button>
          </div>
        )}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--rose-bg)', border: '1px solid var(--rose-line)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
            <AlertCircle style={{ width: 16, height: 16, color: 'var(--rose-bright)', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--tx-hi)' }}>{error}</span>
          </div>
        )}

        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--tx-lo)', textAlign: 'center', padding: 30 }}>Chargement…</p>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 14 }}>
            <Truck style={{ width: 28, height: 28, color: 'var(--tx-faint)', margin: '0 auto 10px' }} />
            <p style={{ fontSize: 14, color: 'var(--tx-hi)', fontWeight: 600 }}>Aucun colis importé</p>
            <p style={{ fontSize: 13, color: 'var(--tx-lo)', marginTop: 6 }}>Clique <b>Pull Sendit</b> pour récupérer tes colis (zone isolée, sans risque).</p>
          </div>
        ) : (
          <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line-soft)', textAlign: 'left' }}>
                  <th style={th}>Client</th>
                  <th style={th}>Ville</th>
                  <th style={{ ...th, textAlign: 'right' }}>COD</th>
                  <th style={th}>Produits (Sendit)</th>
                  <th style={th}>Statut</th>
                  <th style={th}>État</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const b = STATE_BADGE[r.state] || { bg: 'var(--bg-3)', fg: 'var(--tx-lo)' }
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                      <td style={td}>
                        <div style={{ color: 'var(--tx-hi)', fontWeight: 500 }}>{r.name || '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--tx-faint)', fontFamily: 'var(--mono)' }}>{r.phone}</div>
                        {r.matchedCustomerName && <div style={{ fontSize: 10, color: 'var(--green)' }}>👤 client BOS : {r.matchedCustomerName}</div>}
                      </td>
                      <td style={{ ...td, color: 'var(--tx-mid)' }}>{r.city || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--tx-hi)' }}>{mad(r.amount)}<span style={{ fontSize: 10, color: 'var(--tx-faint)' }}> (liv. {mad(r.fee)})</span></td>
                      <td style={{ ...td, fontSize: 12, color: 'var(--tx-mid)', maxWidth: 260 }}>{r.productsText || <span style={{ color: 'var(--tx-faint)' }}>—</span>}</td>
                      <td style={{ ...td, fontSize: 11, color: 'var(--tx-lo)', fontFamily: 'var(--mono)' }}>{r.senditStatus}</td>
                      <td style={td}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5, color: b.fg, background: b.bg }}>{STATE_LABEL[r.state] || r.state}</span>
                      </td>
                    </tr>
                  )
                })}
                {shown.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24 }} className="tx-faint">Rien dans cette catégorie</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </BosShell>
  )
}

const th: React.CSSProperties = { padding: '11px 14px', fontSize: 11, fontWeight: 600, color: 'var(--tx-lo)', textTransform: 'uppercase', letterSpacing: '0.04em' }
const td: React.CSSProperties = { padding: '11px 14px', verticalAlign: 'top' }

function Tab({ label, value, active, onClick, tone }: { label: string; value: number; active: boolean; onClick: () => void; tone: string }) {
  const tones: Record<string, string> = { amber: 'var(--amber)', rose: 'var(--rose-bright)', green: 'var(--green)', blue: 'var(--blue)', gray: 'var(--tx-lo)' }
  const c = tones[tone] || 'var(--tx-lo)'
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', background: 'var(--bg-1)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer',
      border: `1px solid ${active ? c : 'var(--line-soft)'}`, boxShadow: active ? `0 0 0 1px ${c}` : 'none',
    }}>
      <div style={{ fontSize: 11, color: 'var(--tx-lo)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', color: c }}>{value}</div>
    </button>
  )
}
