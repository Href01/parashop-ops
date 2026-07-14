'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react'

/** Compact price-change impact block for the product detail page. Reuses /api/ops/prices. */

type Verdict = { code: 'win' | 'loss' | 'neutral' | 'insufficient'; text: string }
type PerDay = { units: number; revenue: number; margin: number; conv: number | null }
type Side = { perDay: PerDay }
type Prod = {
  productId: number
  change: { oldPrice: number; newPrice: number; pct: number | null; changedAt: string }
  window: { daysAfter: number }
  before: Side; after: Side
  deltas: { unitsPerDay: number | null; marginPerDay: number | null; conv: number | null }
  elasticity: number | null
  verdict: Verdict
}
type Hist = { oldPrice: number; newPrice: number; changedAt: string; source: string }

const money = (v: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v || 0)
const dfmt = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })
const pct = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`)
const VERDICT: Record<Verdict['code'], { bg: string; fg: string; label: string }> = {
  win: { bg: 'var(--green-bg)', fg: 'var(--green)', label: '✓ Gagnant' },
  loss: { bg: 'var(--red-bg, #fee2e2)', fg: 'var(--red, #dc2626)', label: '✕ Perdant' },
  neutral: { bg: 'var(--bg-3)', fg: 'var(--tx-mid)', label: '≈ Neutre' },
  insufficient: { bg: 'var(--amber-bg)', fg: 'var(--amber)', label: '⏳ À surveiller' },
}

function Delta({ v }: { v: number | null }) {
  if (v == null) return <span style={{ fontSize: 11, color: 'var(--tx-faint)' }}>—</span>
  const Icon = v === 0 ? Minus : v > 0 ? ArrowUp : ArrowDown
  const col = v === 0 ? 'var(--tx-faint)' : v > 0 ? 'var(--green)' : 'var(--red, #dc2626)'
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 600, color: col }}><Icon style={{ width: 11, height: 11 }} />{pct(v)}</span>
}

function Cell({ label, before, after, delta, unit }: { label: string; before: string; after: string; delta: number | null; unit?: string }) {
  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ fontSize: 11, color: 'var(--tx-lo)', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontFamily: 'var(--mono)', fontSize: 12.5, flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--tx-faint)' }}>{before}</span>
        <span style={{ color: 'var(--tx-faint)' }}>→</span>
        <b style={{ color: 'var(--tx-hi)' }}>{after}{unit || ''}</b>
        <Delta v={delta} />
      </div>
    </div>
  )
}

export default function PriceImpact({ productId }: { productId: number }) {
  const [prod, setProd] = useState<Prod | null>(null)
  const [hist, setHist] = useState<Hist[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/ops/prices?productId=${productId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) { setProd(d.products?.[0] || null); setHist(d.history?.[productId] || []) } })
      .finally(() => setLoading(false))
  }, [productId])

  if (loading || !prod) return null // no price change recorded → nothing to show
  const V = VERDICT[prod.verdict.code]

  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)' }}>Impact du changement de prix</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>
            <span style={{ color: 'var(--tx-faint)' }}>{money(prod.change.oldPrice)} → </span>
            <b style={{ color: 'var(--tx-hi)' }}>{money(prod.change.newPrice)} MAD</b>
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: (prod.change.pct ?? 0) >= 0 ? 'var(--rose-bright)' : 'var(--green)', background: 'var(--bg-3)', padding: '2px 7px', borderRadius: 5 }}>{pct(prod.change.pct)}</span>
          <span style={{ fontSize: 11, color: 'var(--tx-faint)' }}>{dfmt(prod.change.changedAt)} · {prod.window.daysAfter}j</span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: V.fg, background: V.bg, padding: '4px 10px', borderRadius: 7 }}>{V.label}</span>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--tx-mid)', margin: '9px 0 2px', lineHeight: 1.5 }}>{prod.verdict.text}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0 20px', marginTop: 4, borderTop: '1px solid var(--line-soft)', paddingTop: 4 }}>
        <Cell label="Ventes / jour" before={prod.before.perDay.units.toFixed(1)} after={prod.after.perDay.units.toFixed(1)} delta={prod.deltas.unitsPerDay} />
        <Cell label="Marge / jour" before={money(prod.before.perDay.margin)} after={money(prod.after.perDay.margin)} delta={prod.deltas.marginPerDay} unit=" MAD" />
        <Cell
          label="Conversion vue→achat"
          before={prod.before.perDay.conv != null ? `${(prod.before.perDay.conv * 100).toFixed(1)}%` : '—'}
          after={prod.after.perDay.conv != null ? `${(prod.after.perDay.conv * 100).toFixed(1)}%` : '—'}
          delta={prod.deltas.conv}
        />
        <div style={{ padding: '8px 0' }}>
          <div style={{ fontSize: 11, color: 'var(--tx-lo)', marginBottom: 3 }}>Élasticité-prix</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--tx-hi)' }}>
            <b>{prod.elasticity != null ? prod.elasticity.toFixed(2) : '—'}</b>
            {prod.elasticity != null && <span style={{ fontSize: 10.5, color: 'var(--tx-faint)', fontFamily: 'inherit' }}> {Math.abs(prod.elasticity) < 1 ? '· inélastique' : '· élastique'}</span>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        {hist.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10.5, color: 'var(--tx-faint)' }}>Historique :</span>
            {hist.slice(0, 6).map((h, i) => (
              <span key={i} title={dfmt(h.changedAt)} style={{ fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--tx-lo)', background: 'var(--bg-3)', padding: '1px 6px', borderRadius: 4 }}>{money(h.oldPrice)}→{money(h.newPrice)}</span>
            ))}
          </div>
        )}
        <Link href="/prices" style={{ fontSize: 12, color: 'var(--rose-bright)', textDecoration: 'none', marginLeft: 'auto' }}>Toutes les hausses →</Link>
      </div>
    </div>
  )
}
