'use client'

import { useEffect, useState } from 'react'
import BosShell from '@/components/BosShell'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react'

type Verdict = { code: 'win' | 'loss' | 'neutral' | 'insufficient'; text: string }
type PerDay = { units: number; revenue: number; margin: number; conv: number | null; cartRate: number | null }
type Side = { units: number; revenue: number; margin: number; orders: number; views: number; carts: number; perDay: PerDay }
type Prod = {
  productId: number; name: string; brand: string | null; currentPrice: number; costPrice: number
  change: { oldPrice: number; newPrice: number; pct: number | null; changedAt: string; source: string }
  window: { daysAfter: number; from: string; changeAt: string }
  before: Side; after: Side
  deltas: { unitsPerDay: number | null; revenuePerDay: number | null; marginPerDay: number | null; conv: number | null }
  elasticity: number | null
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

function Delta({ v }: { v: number | null }) {
  if (v == null) return <span style={{ fontSize: 11, color: 'var(--tx-faint)' }}>—</span>
  const up = v >= 0
  const Icon = v === 0 ? Minus : up ? ArrowUp : ArrowDown
  const col = v === 0 ? 'var(--tx-faint)' : up ? 'var(--green)' : 'var(--red, #dc2626)'
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 600, color: col }}><Icon style={{ width: 11, height: 11 }} />{pct(v)}</span>
}

function Metric({ label, before, after, delta, fmt }: { label: string; before: string; after: string; delta: number | null; fmt?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, padding: '5px 0' }}>
      <span style={{ fontSize: 12, color: 'var(--tx-lo)' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, fontFamily: 'var(--mono)', fontSize: 12.5 }}>
        <span style={{ color: 'var(--tx-faint)' }}>{before}</span>
        <span style={{ color: 'var(--tx-faint)' }}>→</span>
        <b style={{ color: 'var(--tx-hi)' }}>{after}{fmt ? ' MAD' : ''}</b>
        <Delta v={delta} />
      </span>
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
          Historique des changements de prix + <b>impact mesuré</b> : ventes, marge et conversion <b>avant/après</b> chaque hausse, avec l&apos;<b>élasticité</b> et un verdict. Comparaison sur la période depuis le changement vs la même durée avant.
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
            return (
              <div key={p.productId} className="card-modern pz-card" style={{ padding: 16, borderLeft: `3px solid ${V.fg}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-hi)' }}>{p.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>
                        <span style={{ color: 'var(--tx-faint)' }}>{money(p.change.oldPrice)}</span>
                        <span style={{ color: 'var(--tx-faint)' }}> → </span>
                        <b style={{ color: 'var(--tx-hi)' }}>{money(p.change.newPrice)} MAD</b>
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: (p.change.pct ?? 0) >= 0 ? 'var(--rose-bright)' : 'var(--green)', background: 'var(--bg-3)', padding: '2px 7px', borderRadius: 5 }}>{pct(p.change.pct)}</span>
                      <span style={{ fontSize: 11, color: 'var(--tx-faint)' }}>{dfmt(p.change.changedAt)} · {p.window.daysAfter}j de recul</span>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: V.fg, background: V.bg, padding: '4px 10px', borderRadius: 7, whiteSpace: 'nowrap' }}>{V.label}</span>
                </div>

                {/* Verdict text */}
                <p style={{ fontSize: 12.5, color: 'var(--tx-mid)', margin: '10px 0 4px', lineHeight: 1.5 }}>{p.verdict.text}</p>

                {/* Before / After metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '2px 24px', marginTop: 8, borderTop: '1px solid var(--line-soft)', paddingTop: 8 }}>
                  <Metric label="Ventes / jour" before={p.before.perDay.units.toFixed(1)} after={p.after.perDay.units.toFixed(1)} delta={p.deltas.unitsPerDay} />
                  <Metric label="Marge / jour" before={money(p.before.perDay.margin)} after={money(p.after.perDay.margin)} delta={p.deltas.marginPerDay} fmt />
                  <Metric label="CA / jour" before={money(p.before.perDay.revenue)} after={money(p.after.perDay.revenue)} delta={p.deltas.revenuePerDay} fmt />
                  <Metric
                    label="Conversion (vue→achat)"
                    before={p.before.perDay.conv != null ? `${(p.before.perDay.conv * 100).toFixed(1)}%` : '—'}
                    after={p.after.perDay.conv != null ? `${(p.after.perDay.conv * 100).toFixed(1)}%` : '—'}
                    delta={p.deltas.conv}
                  />
                </div>

                {/* Elasticity + history */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--tx-lo)' }}>
                    Élasticité-prix : <b style={{ color: 'var(--tx-hi)', fontFamily: 'var(--mono)' }}>{p.elasticity != null ? p.elasticity.toFixed(2) : '—'}</b>
                    {p.elasticity != null && (
                      <span style={{ color: 'var(--tx-faint)' }}> · {Math.abs(p.elasticity) < 1 ? 'demande peu sensible (inélastique)' : 'demande sensible (élastique)'}</span>
                    )}
                  </div>
                  {hist.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 10.5, color: 'var(--tx-faint)' }}>Historique :</span>
                      {hist.slice(0, 5).map((h, i) => (
                        <span key={i} title={`${dfmt(h.changedAt)}${h.source === 'backfill' ? ' · reconstruit' : ''}`} style={{ fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--tx-lo)', background: 'var(--bg-3)', padding: '1px 6px', borderRadius: 4 }}>
                          {money(h.oldPrice)}→{money(h.newPrice)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
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
