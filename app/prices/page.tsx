'use client'

import { useEffect, useState } from 'react'
import BosShell from '@/components/BosShell'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react'

type Verdict = { code: 'win' | 'loss' | 'neutral' | 'insufficient'; text: string }
type PerDay = { units: number; revenue: number; margin: number; conv: number | null; cartRate: number | null }
type Side = { units: number; revenue: number; margin: number; orders: number; views: number; carts: number; perDay: PerDay }
type Confidence = 'low' | 'medium' | 'high'
type PriceEffect = { reliable: boolean; label: string; note: string }
type Sample = { unitsBefore: number; unitsAfter: number; viewsBefore: number; viewsAfter: number }
type Prod = {
  productId: number; name: string; brand: string | null; currentPrice: number; costPrice: number
  change: { oldPrice: number; newPrice: number; pct: number | null; changedAt: string; source: string }
  window: { daysAfter: number; from: string; changeAt: string }
  before: Side; after: Side
  deltas: { unitsPerDay: number | null; revenuePerDay: number | null; marginPerDay: number | null; conv: number | null }
  elasticity: number | null
  confidence: Confidence
  sample: Sample
  priceEffect: PriceEffect
  verdict: Verdict
}
type Hist = { oldPrice: number; newPrice: number; changedAt: string; source: string; note: string | null }
type Data = {
  products: Prod[]
  history: Record<number, Hist[]>
  summary: { changedProducts: number; wins: number; losses: number; pending: number; marginPerDayDelta: number }
}

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

/** Distinct price levels the product has actually sold at — sorted, deduped. Avoids the
 *  confusing "185→175" reversal chips that the backfilled history produced. */
function priceLadder(hist: Hist[]): number[] {
  const set = new Set<number>()
  for (const h of hist) { if (h.oldPrice) set.add(Math.round(h.oldPrice)); if (h.newPrice) set.add(Math.round(h.newPrice)) }
  return [...set].sort((a, b) => a - b)
}

function ConfBadge({ level }: { level: Confidence }) {
  const c = CONF[level]
  return (
    <span title="Fiabilité du verdict, selon le nombre de ventes et de jours de recul." style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: c.fg }}>
      <span style={{ display: 'inline-flex', gap: 2 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i < c.dots ? c.fg : 'var(--line-soft)' }} />
        ))}
      </span>
      {c.label}
    </span>
  )
}

function Delta({ v }: { v: number | null }) {
  if (v == null) return <span style={{ fontSize: 11, color: 'var(--tx-faint)' }}>—</span>
  const up = v >= 0
  const Icon = v === 0 ? Minus : up ? ArrowUp : ArrowDown
  const col = v === 0 ? 'var(--tx-faint)' : up ? 'var(--green)' : 'var(--red, #dc2626)'
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 600, color: col }}><Icon style={{ width: 11, height: 11 }} />{pct(v)}</span>
}

// Aligned before/after table. Every row shares this column template so values line up.
const ROW_COLS = 'minmax(96px, 1fr) 72px 84px 76px'

function RowHead() {
  const cell = { fontSize: 10, color: 'var(--tx-faint)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', textAlign: 'right' as const }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: ROW_COLS, gap: 10, padding: '0 2px 6px' }}>
      <span />
      <span style={cell}>Avant</span>
      <span style={cell}>Après</span>
      <span style={cell}>Δ</span>
    </div>
  )
}

/** One before→after row. `hero` highlights the money metric; `sub` shows the sample/caveat. */
function Row({ label, before, after, delta, hero, sub }: { label: string; before: string; after: string; delta: number | null; hero?: boolean; sub?: string }) {
  const numeric = { textAlign: 'right' as const, fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums' as const }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: ROW_COLS, gap: 10, alignItems: 'baseline', padding: hero ? '9px 10px' : '7px 2px', borderRadius: hero ? 8 : 0, background: hero ? 'var(--bg-2)' : undefined, border: hero ? '1px solid var(--line-soft)' : undefined }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: hero ? 12.5 : 12, fontWeight: hero ? 700 : 400, color: hero ? 'var(--tx-hi)' : 'var(--tx-lo)' }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: 'var(--tx-faint)', marginTop: 1 }}>{sub}</div>}
      </div>
      <span style={{ ...numeric, fontSize: 12, color: 'var(--tx-faint)' }}>{before}</span>
      <b style={{ ...numeric, fontSize: hero ? 15 : 12.5, fontWeight: hero ? 800 : 600, color: 'var(--tx-hi)' }}>{after}</b>
      <span style={{ display: 'flex', justifyContent: 'flex-end' }}><Delta v={delta} /></span>
    </div>
  )
}

export default function PricesPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/ops/prices', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !d.error) setData(d) })
      .finally(() => setLoading(false))
  }, [])

  return (
    <BosShell active="prices" title="Prix & Marges" crumb="Opérations">
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '22px 24px 60px' }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>OPÉRATIONS</div>
        <h1 className="serif-display" style={{ fontSize: 28, lineHeight: 1.05 }}>Prix &amp; Marges</h1>
        <p style={{ fontSize: 13, color: 'var(--tx-mid)', marginTop: 7, maxWidth: 720, lineHeight: 1.55 }}>
          Pour chaque changement de prix : ta <b>marge par jour avant vs après</b> — le seul chiffre qui compte. On compare la période <b>depuis</b> le changement à la <b>même durée avant</b>. Le verdict n&apos;est vert que si l&apos;on a assez de ventes pour y croire.
        </p>

        {/* Summary */}
        <div className="pz-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '16px 0 20px' }}>
          {[
            { l: 'Produits changés', v: data?.summary.changedProducts ?? '—', c: 'var(--tx-hi)' },
            { l: 'Hausses gagnantes', v: data?.summary.wins ?? '—', c: 'var(--green)' },
            { l: 'Hausses perdantes', v: data?.summary.losses ?? '—', c: 'var(--red, #dc2626)' },
            { l: 'À surveiller', v: data?.summary.pending ?? '—', c: 'var(--amber)' },
            { l: 'Δ Marge / jour', v: data ? `${data.summary.marginPerDayDelta >= 0 ? '+' : ''}${money(data.summary.marginPerDayDelta)}` : '—', c: (data?.summary.marginPerDayDelta ?? 0) >= 0 ? 'var(--green)' : 'var(--red, #dc2626)', unit: 'MAD' },
          ].map((k) => (
            <div key={k.l} className="card-modern pz-card" style={{ padding: 14 }}>
              <div className="fs12 tx-lo">{k.l}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: k.c, fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', marginTop: 4 }}>{k.v}{k.unit && <span style={{ fontSize: 12, color: 'var(--tx-faint)', marginLeft: 3 }}>{k.unit}</span>}</div>
            </div>
          ))}
        </div>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="card-modern" style={{ padding: 16, opacity: 1 - i * 0.22 }}>
                <div className="skeleton-line" style={{ width: '45%', height: 14, marginBottom: 12 }} />
                <div className="skeleton-line" style={{ width: '70%', height: 10, marginBottom: 16 }} />
                <div style={{ display: 'flex', gap: 20 }}>{[0, 1, 2, 3].map((j) => <div key={j} className="skeleton-line" style={{ flex: 1, height: 24 }} />)}</div>
              </div>
            ))}
          </div>
        )}
        {!loading && (!data || data.products.length === 0) && (
          <div className="card-modern" style={{ padding: 30, textAlign: 'center', color: 'var(--tx-faint)', fontSize: 13 }}>
            Aucun changement de prix enregistré. Dès que tu modifies un prix, il apparaîtra ici avec son impact.
          </div>
        )}

        {/* Products */}
        <div className="pz-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {data?.products.map((p) => {
            const V = VERDICT[p.verdict.code]
            const hist = data.history[p.productId] || []
            const ladder = priceLadder(hist)
            const days = p.window.daysAfter
            const lowViews = Math.min(p.sample.viewsBefore, p.sample.viewsAfter) < 20
            const convStr = (v: number | null) => (v != null ? `${(v * 100).toFixed(1)}%` : '—')
            // Per-unit margin — the number the founder actually knows (≈120 MAD here).
            // margin/day × days = total margin for the window; ÷ units = margin per sale.
            const uMargeB = p.sample.unitsBefore > 0 ? (p.before.perDay.margin * days) / p.sample.unitsBefore : null
            const uMargeA = p.sample.unitsAfter > 0 ? (p.after.perDay.margin * days) / p.sample.unitsAfter : null
            const uMargeDelta = uMargeB && uMargeB > 0 && uMargeA != null ? (uMargeA - uMargeB) / uMargeB : null
            return (
              <div key={p.productId} className="card-modern pz-card" style={{ padding: 0, borderLeft: `3px solid ${V.fg}`, overflow: 'hidden' }}>
                {/* Zone 1 — what changed + verdict */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', padding: '14px 16px 12px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-hi)' }}>{p.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>
                        <span style={{ color: 'var(--tx-faint)' }}>{money(p.change.oldPrice)}</span>
                        <span style={{ color: 'var(--tx-faint)' }}> → </span>
                        <b style={{ color: 'var(--tx-hi)' }}>{money(p.change.newPrice)} MAD</b>
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: (p.change.pct ?? 0) >= 0 ? 'var(--rose-bright)' : 'var(--green)', background: 'var(--bg-3)', padding: '2px 7px', borderRadius: 5 }}>{pct(p.change.pct)}</span>
                      <span style={{ fontSize: 11, color: 'var(--tx-faint)' }}>{dfmt(p.change.changedAt)} · {days}j de recul</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: V.fg, background: V.bg, padding: '4px 10px', borderRadius: 7, whiteSpace: 'nowrap' }}>{V.label}</span>
                    <ConfBadge level={p.confidence} />
                  </div>
                </div>

                {/* Zone 2 — the plain-language takeaway */}
                <div style={{ padding: '0 16px 14px' }}>
                  <p style={{ fontSize: 13, color: 'var(--tx-hi)', margin: 0, lineHeight: 1.55 }}>{p.verdict.text}</p>
                </div>

                {/* Zone 3 — aligned before/after table, money metric first */}
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line-soft)' }}>
                  <RowHead />
                  <Row label="Marge / unité" before={uMargeB != null ? money(uMargeB) : '—'} after={uMargeA != null ? `${money(uMargeA)} MAD` : '—'} delta={uMargeDelta} hero
                    sub="marge réelle par vente — l'effet direct du prix" />
                  <div style={{ marginTop: 4 }}>
                    <Row label="Marge / jour" before={money(p.before.perDay.margin)} after={`${money(p.after.perDay.margin)} MAD`} delta={p.deltas.marginPerDay}
                      sub={uMargeA != null ? `${p.after.perDay.units.toFixed(1)} ventes/j × ${money(uMargeA)} MAD = ${money(p.after.perDay.margin * days)} MAD sur ${days}j` : `${money(p.after.perDay.margin * days)} MAD sur ${days}j`} />
                    <Row label="Ventes / jour" before={p.before.perDay.units.toFixed(1)} after={p.after.perDay.units.toFixed(1)} delta={p.deltas.unitsPerDay}
                      sub={`${p.sample.unitsBefore} → ${p.sample.unitsAfter} ventes`} />
                    <Row label="CA / jour" before={money(p.before.perDay.revenue)} after={`${money(p.after.perDay.revenue)} MAD`} delta={p.deltas.revenuePerDay} />
                    <Row label="Conversion (vue→achat)" before={convStr(p.before.perDay.conv)} after={convStr(p.after.perDay.conv)} delta={p.deltas.conv}
                      sub={lowViews ? 'peu de vues — indicatif' : undefined} />
                  </div>
                </div>

                {/* Zone 4 — honest read of the price effect */}
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line-soft)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: p.priceEffect.reliable ? 'var(--tx-hi)' : 'var(--tx-mid)' }}>Effet du prix : {p.priceEffect.label}</span>
                    {p.priceEffect.reliable && p.elasticity != null && (
                      <span style={{ fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--tx-faint)' }}>élasticité {Math.abs(p.elasticity).toFixed(1)}</span>
                    )}
                  </div>
                  <p style={{ fontSize: 11.5, color: 'var(--tx-lo)', margin: 0, lineHeight: 1.5 }}>{p.priceEffect.note}</p>
                </div>

                {/* Zone 5 — price ladder footer (distinct levels, no noisy reversals) */}
                {ladder.length > 1 && (
                  <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line-soft)', background: 'var(--bg-1)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 10.5, color: 'var(--tx-faint)' }}>Prix pratiqués :</span>
                    {ladder.map((v, i) => (
                      <span key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10.5, fontFamily: 'var(--mono)', fontWeight: v === Math.round(p.currentPrice) ? 700 : 400, color: v === Math.round(p.currentPrice) ? 'var(--rose-bright)' : 'var(--tx-lo)', background: 'var(--bg-3)', padding: '1px 7px', borderRadius: 4 }}>{money(v)}</span>
                        {i < ladder.length - 1 && <span style={{ color: 'var(--line-soft)', fontSize: 10 }}>·</span>}
                      </span>
                    ))}
                    <span style={{ fontSize: 10, color: 'var(--tx-faint)' }}>MAD</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <style jsx>{`
        .pz-stagger > :global(*) { animation: pzIn .44s cubic-bezier(.16,1,.3,1) both; }
        .pz-stagger > :global(*):nth-child(1) { animation-delay: .03s; }
        .pz-stagger > :global(*):nth-child(2) { animation-delay: .07s; }
        .pz-stagger > :global(*):nth-child(3) { animation-delay: .11s; }
        .pz-stagger > :global(*):nth-child(4) { animation-delay: .15s; }
        .pz-stagger > :global(*):nth-child(5) { animation-delay: .19s; }
        .pz-stagger > :global(*):nth-child(6) { animation-delay: .23s; }
        .pz-stagger > :global(*):nth-child(7) { animation-delay: .27s; }
        .pz-stagger > :global(*):nth-child(8) { animation-delay: .31s; }
        @keyframes pzIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        :global(.pz-card) { transition: transform .16s cubic-bezier(.16,1,.3,1), box-shadow .16s ease; }
        :global(.pz-card:hover) { transform: translateY(-2px); box-shadow: 0 8px 22px rgba(0,0,0,.08); }
        @media (prefers-reduced-motion: reduce) {
          .pz-stagger > :global(*), :global(.pz-card) { animation: none !important; transition: none !important; }
        }
      `}</style>
    </BosShell>
  )
}
