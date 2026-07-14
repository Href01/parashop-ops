'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react'

/** Compact price-change impact block for the product detail page. Reuses /api/ops/prices. */

type Verdict = { code: 'win' | 'loss' | 'neutral' | 'insufficient'; text: string }
type Confidence = 'low' | 'medium' | 'high'
type PerDay = { units: number; revenue: number; margin: number; conv: number | null }
type Side = { perDay: PerDay }
type Prod = {
  productId: number
  change: { oldPrice: number; newPrice: number; pct: number | null; changedAt: string }
  window: { daysAfter: number }
  before: Side; after: Side
  deltas: { unitsPerDay: number | null; marginPerDay: number | null; conv: number | null }
  elasticity: number | null
  confidence: Confidence
  sample: { unitsBefore: number; unitsAfter: number; viewsBefore: number; viewsAfter: number }
  priceEffect: { reliable: boolean; label: string; note: string }
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
const CONF: Record<Confidence, { label: string; fg: string; dots: number }> = {
  high: { label: 'Fiable', fg: 'var(--green)', dots: 3 },
  medium: { label: 'Moyen', fg: 'var(--amber)', dots: 2 },
  low: { label: 'Signal faible', fg: 'var(--tx-faint)', dots: 1 },
}
function priceLadder(hist: Hist[]): number[] {
  const set = new Set<number>()
  for (const h of hist) { if (h.oldPrice) set.add(Math.round(h.oldPrice)); if (h.newPrice) set.add(Math.round(h.newPrice)) }
  return [...set].sort((a, b) => a - b)
}

function Delta({ v }: { v: number | null }) {
  if (v == null) return <span style={{ fontSize: 11, color: 'var(--tx-faint)' }}>—</span>
  const Icon = v === 0 ? Minus : v > 0 ? ArrowUp : ArrowDown
  const col = v === 0 ? 'var(--tx-faint)' : v > 0 ? 'var(--green)' : 'var(--red, #dc2626)'
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 600, color: col }}><Icon style={{ width: 11, height: 11 }} />{pct(v)}</span>
}

function Cell({ label, before, after, delta, unit, sub }: { label: string; before: string; after: string; delta: number | null; unit?: string; sub?: string }) {
  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ fontSize: 11, color: 'var(--tx-lo)', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontFamily: 'var(--mono)', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--tx-faint)' }}>{before}</span>
        <span style={{ color: 'var(--tx-faint)' }}>→</span>
        <b style={{ color: 'var(--tx-hi)' }}>{after}{unit || ''}</b>
        <Delta v={delta} />
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--tx-faint)', marginTop: 2 }}>{sub}</div>}
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
  const C = CONF[prod.confidence]
  const ladder = priceLadder(hist)
  const days = prod.window.daysAfter
  // Per-unit margin — the founder's number (real cash per sale).
  const uMargeA = prod.sample.unitsAfter > 0 ? (prod.after.perDay.margin * days) / prod.sample.unitsAfter : null
  const uMargeB = prod.sample.unitsBefore > 0 ? (prod.before.perDay.margin * days) / prod.sample.unitsBefore : null
  const uMargeDelta = uMargeB && uMargeB > 0 && uMargeA != null ? (uMargeA - uMargeB) / uMargeB : null

  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderLeft: `3px solid ${V.fg}`, borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)' }}>Impact du changement de prix</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>
            <span style={{ color: 'var(--tx-faint)' }}>{money(prod.change.oldPrice)} → </span>
            <b style={{ color: 'var(--tx-hi)' }}>{money(prod.change.newPrice)} MAD</b>
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: (prod.change.pct ?? 0) >= 0 ? 'var(--rose-bright)' : 'var(--green)', background: 'var(--bg-3)', padding: '2px 7px', borderRadius: 5 }}>{pct(prod.change.pct)}</span>
          <span style={{ fontSize: 11, color: 'var(--tx-faint)' }}>{dfmt(prod.change.changedAt)} · {prod.window.daysAfter}j</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: V.fg, background: V.bg, padding: '4px 10px', borderRadius: 7 }}>{V.label}</span>
          <span title="Fiabilité selon le nombre de ventes et de jours de recul." style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: C.fg }}>
            <span style={{ display: 'inline-flex', gap: 2 }}>{[0, 1, 2].map((i) => <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i < C.dots ? C.fg : 'var(--line-soft)' }} />)}</span>
            {C.label}
          </span>
        </div>
      </div>

      <p style={{ fontSize: 13, color: 'var(--tx-hi)', margin: '10px 0 10px', lineHeight: 1.5 }}>{prod.verdict.text}</p>

      {/* Money metric, highlighted — marge par vente, the founder's number */}
      <div style={{ padding: '9px 11px', background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--line-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-hi)' }}>Marge / unité</span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, fontFamily: 'var(--mono)', fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ color: 'var(--tx-faint)' }}>{uMargeB != null ? money(uMargeB) : '—'}</span>
            <span style={{ color: 'var(--tx-faint)' }}>→</span>
            <b style={{ color: 'var(--tx-hi)', fontSize: 15 }}>{uMargeA != null ? `${money(uMargeA)} MAD` : '—'}</b>
            <Delta v={uMargeDelta} />
          </span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--tx-faint)', marginTop: 1 }}>marge réelle par vente — l&apos;effet direct du prix</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0 20px', marginTop: 4 }}>
        <Cell label="Marge / jour" before={money(prod.before.perDay.margin)} after={`${money(prod.after.perDay.margin)} MAD`} delta={prod.deltas.marginPerDay} sub={uMargeA != null ? `${prod.after.perDay.units.toFixed(1)}/j × ${money(uMargeA)}` : undefined} />
        <Cell label="Ventes / jour" before={prod.before.perDay.units.toFixed(1)} after={prod.after.perDay.units.toFixed(1)} delta={prod.deltas.unitsPerDay} sub={`${prod.sample.unitsBefore} → ${prod.sample.unitsAfter} ventes`} />
        <Cell
          label="Conversion vue→achat"
          before={prod.before.perDay.conv != null ? `${(prod.before.perDay.conv * 100).toFixed(1)}%` : '—'}
          after={prod.after.perDay.conv != null ? `${(prod.after.perDay.conv * 100).toFixed(1)}%` : '—'}
          delta={prod.deltas.conv}
          sub={Math.min(prod.sample.viewsBefore, prod.sample.viewsAfter) < 20 ? 'peu de vues' : undefined}
        />
      </div>

      {/* Price effect — honest read */}
      <div style={{ marginTop: 10, padding: '9px 11px', background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--line-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: prod.priceEffect.reliable ? 'var(--tx-hi)' : 'var(--tx-mid)' }}>Effet du prix : {prod.priceEffect.label}</span>
          {prod.priceEffect.reliable && prod.elasticity != null && <span style={{ fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--tx-faint)' }}>élasticité {Math.abs(prod.elasticity).toFixed(1)}</span>}
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--tx-lo)', margin: '3px 0 0', lineHeight: 1.5 }}>{prod.priceEffect.note}</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        {ladder.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 10.5, color: 'var(--tx-faint)' }}>Prix pratiqués :</span>
            {ladder.map((v) => (
              <span key={v} style={{ fontSize: 10.5, fontFamily: 'var(--mono)', fontWeight: 400, color: 'var(--tx-lo)', background: 'var(--bg-3)', padding: '1px 6px', borderRadius: 4 }}>{money(v)}</span>
            ))}
            <span style={{ fontSize: 10, color: 'var(--tx-faint)' }}>MAD</span>
          </div>
        )}
        <Link href="/prices" style={{ fontSize: 12, color: 'var(--rose-bright)', textDecoration: 'none', marginLeft: 'auto' }}>Toutes les hausses →</Link>
      </div>
    </div>
  )
}
