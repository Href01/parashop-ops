'use client'

import { useEffect, useState } from 'react'

/**
 * Renders an Excel/CSV file as a readable table. Lazy-loads SheetJS (xlsx) and fetches
 * the file client-side (same-origin, session-authed). Read-only, derived — never stored
 * in the collaborative doc, so it can't cause data loss.
 */
const cell = (head: boolean): React.CSSProperties => ({
  border: '1px solid var(--line-soft, #e5e7eb)', padding: '6px 9px', textAlign: 'left',
  whiteSpace: 'nowrap', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis',
  background: head ? 'var(--bg-1, #f9fafb)' : 'transparent',
  fontWeight: head ? 700 : 400, color: head ? 'var(--tx-hi, #1f2937)' : 'var(--tx-mid, #374151)',
  fontSize: 12,
})

export default function SheetPreview({ url }: { url: string }) {
  const [rows, setRows] = useState<string[][] | null>(null)
  const [more, setMore] = useState(0)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const [XLSX, res] = await Promise.all([import('xlsx'), fetch(url, { cache: 'no-store' })])
        if (!res.ok) throw new Error()
        const buf = await res.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][]
        const trimmed = data.slice(0, 200).map((r) => (r || []).slice(0, 40).map((c) => (c == null ? '' : String(c))))
        if (!cancel) { setRows(trimmed); setMore(Math.max(0, data.length - 200)) }
      } catch { if (!cancel) setErr('Impossible de lire ce fichier.') }
    })()
    return () => { cancel = true }
  }, [url])

  if (err) return <div style={{ padding: 16, fontSize: 12, color: 'var(--red, #b3261e)' }}>{err}</div>
  if (!rows) return <div style={{ padding: 16, fontSize: 12, color: 'var(--tx-lo, #6b7280)' }}>Lecture du tableau…</div>
  if (rows.length === 0) return <div style={{ padding: 16, fontSize: 12, color: 'var(--tx-lo, #6b7280)' }}>Fichier vide.</div>

  const [head, ...body] = rows
  const cols = Math.max(...rows.map((r) => r.length))
  return (
    <div style={{ overflow: 'auto', maxHeight: 460 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr>{Array.from({ length: cols }).map((_, i) => <th key={i} style={cell(true)}>{head[i] ?? ''}</th>)}</tr></thead>
        <tbody>{body.map((r, ri) => <tr key={ri}>{Array.from({ length: cols }).map((_, ci) => <td key={ci} style={cell(false)}>{r[ci] ?? ''}</td>)}</tr>)}</tbody>
      </table>
      {more > 0 && <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--tx-faint, #9ca3af)' }}>+{more} lignes non affichées — clique « Ouvrir » pour le fichier complet.</div>}
    </div>
  )
}
