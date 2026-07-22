'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AreaChart as AreaIcon, LineChart as LineIcon, BarChart3 as BarIcon } from 'lucide-react'
import {
  ResponsiveContainer, ComposedChart, Area, Line, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot, Brush,
} from 'recharts'

/**
 * Revenue/Profit/Orders trend with smart period comparison.
 *
 * - Metric switch: CA · Profit · Commandes (all three live in each daily point).
 * - Chart style: aire / ligne / barres (customer's choice).
 * - Comparison overlay: jour / semaine / mois / année précédente, période
 *   précédente, ou une période personnalisée — fetched from the SAME stats
 *   endpoint with the shifted range (no backend change), aligned day-by-day.
 * - Expert touches: peak-day highlight, partial "today" bar/dot, 7-day moving
 *   average trend line, honest zero baseline, brush for long ranges.
 */

type SeriesPoint = { date: string; label: string; revenue: number; profit: number; orders: number }
type Metric = 'revenue' | 'profit' | 'orders'
type ChartType = 'area' | 'line' | 'bar'
type Compare = 'none' | 'prev' | 'dod' | 'wow' | 'mom' | 'yoy' | 'custom'

type Props = { series: SeriesPoint[]; from: string; to: string; periodLabel: string }

const mad = (v: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(v)
const int = (v: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(v))
const MA_COLOR = '#f59e0b'
const WEEKDAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']

const METRICS: Record<Metric, { label: string; color: string; unit: string; fmt: (v: number) => string; perDay: string }> = {
  revenue: { label: 'CA', color: 'var(--rose-bright)', unit: 'MAD', fmt: mad, perDay: 'MAD/jour · CA confirmé + livré' },
  profit: { label: 'Profit', color: 'var(--green)', unit: 'MAD', fmt: mad, perDay: 'MAD/jour · profit estimé' },
  orders: { label: 'Commandes', color: '#6366f1', unit: '', fmt: int, perDay: 'commandes/jour' },
}

const CMP_LABEL: Record<Exclude<Compare, 'none'>, string> = {
  prev: 'période préc.', dod: 'jour préc.', wow: 'semaine préc.', mom: 'mois préc.', yoy: 'année préc.', custom: 'période choisie',
}

const DAY = 86400000
const parseISO = (s: string) => new Date(s + 'T00:00:00Z')
const fmtISO = (d: Date) => d.toISOString().slice(0, 10)

// Shift the [from,to] window to the comparison window for the chosen preset.
function shiftRange(from: string, to: string, mode: Exclude<Compare, 'none' | 'custom'>): { from: string; to: string } {
  const f = parseISO(from), t = parseISO(to)
  const periodDays = Math.round((t.getTime() - f.getTime()) / DAY) + 1
  const nf = new Date(f), nt = new Date(t)
  if (mode === 'prev') { nt.setTime(f.getTime() - DAY); nf.setTime(nt.getTime() - (periodDays - 1) * DAY) }
  else if (mode === 'dod') { nf.setTime(f.getTime() - DAY); nt.setTime(t.getTime() - DAY) }
  else if (mode === 'wow') { nf.setTime(f.getTime() - 7 * DAY); nt.setTime(t.getTime() - 7 * DAY) }
  else if (mode === 'mom') { nf.setUTCMonth(nf.getUTCMonth() - 1); nt.setUTCMonth(nt.getUTCMonth() - 1) }
  else if (mode === 'yoy') { nf.setUTCFullYear(nf.getUTCFullYear() - 1); nt.setUTCFullYear(nt.getUTCFullYear() - 1) }
  return { from: fmtISO(nf), to: fmtISO(nt) }
}

const compact = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1_000_000) return (v / 1_000_000).toFixed(a % 1_000_000 ? 1 : 0) + 'M'
  if (a >= 1_000) return (v / 1_000).toFixed(a % 1_000 ? 1 : 0) + 'k'
  return int(v)
}

// Trailing simple moving average; null until the window is filled.
function movingAverage(vals: number[], win: number): (number | null)[] {
  const out: (number | null)[] = []
  let sum = 0
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i]
    if (i >= win) sum -= vals[i - win]
    out.push(i >= win - 1 ? sum / win : null)
  }
  return out
}

export default function RevenueTrendChart({ series, from, to, periodLabel }: Props) {
  const [metric, setMetric] = useState<Metric>('revenue')
  const [chartType, setChartType] = useState<ChartType>('bar')
  const [compare, setCompare] = useState<Compare>('none')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showMA, setShowMA] = useState(false)
  const [cmpSeries, setCmpSeries] = useState<SeriesPoint[] | null>(null)
  const [cmpLoading, setCmpLoading] = useState(false)
  const [cmpErr, setCmpErr] = useState(false)

  const m = METRICS[metric]
  const maWin = series.length >= 14 ? 7 : Math.max(2, Math.floor(series.length / 2))

  // Local (Morocco) today, to flag the in-progress day.
  const todayISO = useMemo(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  }, [])

  // Resolve the comparison window (or null when comparison is off / custom is incomplete).
  const cmpRange = useMemo<{ from: string; to: string } | null>(() => {
    if (compare === 'none') return null
    if (compare === 'custom') return customFrom && customTo ? { from: customFrom, to: customTo } : null
    return shiftRange(from, to, compare)
  }, [compare, customFrom, customTo, from, to])

  // Fetch the comparison period's daily series from the same stats endpoint.
  const reqId = useRef(0)
  useEffect(() => {
    if (!cmpRange) { setCmpSeries(null); setCmpErr(false); setCmpLoading(false); return }
    const id = ++reqId.current
    setCmpLoading(true); setCmpErr(false)
    fetch(`/api/ops/dashboard/stats?from=${cmpRange.from}&to=${cmpRange.to}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('fetch'))))
      .then((d) => { if (id === reqId.current) setCmpSeries(Array.isArray(d.revenueSeries) ? d.revenueSeries : []) })
      .catch(() => { if (id === reqId.current) { setCmpErr(true); setCmpSeries(null) } })
      .finally(() => { if (id === reqId.current) setCmpLoading(false) })
  }, [cmpRange])

  const hasCmp = !!cmpSeries && cmpSeries.length > 0

  const ma = useMemo(() => movingAverage(series.map((p) => p[metric]), maWin), [series, metric, maWin])

  const data = useMemo(() => series.map((p, i) => ({
    label: p.label,
    date: p.date,
    isToday: p.date === todayISO,
    weekday: WEEKDAYS[parseISO(p.date).getUTCDay()],
    cur: p[metric],
    ma: ma[i],
    cmp: hasCmp ? (cmpSeries![i]?.[metric] ?? null) : null,
    cmpLabel: hasCmp ? cmpSeries![i]?.label : undefined,
    revenue: p.revenue, profit: p.profit, orders: p.orders,
  })), [series, metric, ma, cmpSeries, hasCmp, todayISO])

  const curTotal = useMemo(() => series.reduce((s, p) => s + p[metric], 0), [series, metric])
  const cmpTotal = useMemo(() => (hasCmp ? cmpSeries!.reduce((s, p) => s + p[metric], 0) : null), [cmpSeries, hasCmp, metric])
  const avg = series.length ? curTotal / series.length : 0
  const bestIdx = series.length ? series.reduce((b, p, i) => (p[metric] > series[b][metric] ? i : b), 0) : -1
  const delta = cmpTotal != null && cmpTotal > 0 ? ((curTotal - cmpTotal) / cmpTotal) * 100 : null
  const headline = metric === 'orders' ? int(curTotal) : int(Math.round(curTotal))

  const tickInterval = Math.max(0, Math.ceil(data.length / 8) - 1)
  const yDomain: [number | string, number | string] = metric === 'profit' ? ['auto', 'auto'] : [0, 'auto']
  const best = bestIdx >= 0 ? data[bestIdx] : null
  const todayPoint = data.find((d) => d.isToday) || null

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--tx-faint)' }}>
            Tendance · {periodLabel}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--mono)', letterSpacing: '-0.02em', color: 'var(--tx-hi)', lineHeight: 1 }}>{headline}</span>
            {m.unit && <span style={{ fontSize: 12, color: 'var(--tx-faint)', fontWeight: 500 }}>{m.unit}</span>}
            {delta != null && (
              <span style={{ fontSize: 12, fontWeight: 700, color: delta >= 0 ? 'var(--green)' : 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                {delta >= 0 ? '▲' : '▼'} {int(Math.abs(delta))}%
                <span style={{ fontWeight: 500, color: 'var(--tx-faint)' }}>vs {CMP_LABEL[compare as Exclude<Compare, 'none'>]}</span>
              </span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--tx-faint)', marginTop: 4 }}>
            ≈ {m.fmt(avg)} {m.perDay}
          </div>
        </div>
        {best && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--tx-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Meilleur jour</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: m.color, fontFamily: 'var(--mono)' }}>{m.fmt(best.cur)}</div>
            <div style={{ fontSize: 10.5, color: 'var(--tx-faint)' }}>{best.label}</div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0 6px' }}>
        <Segmented
          options={[['revenue', 'CA'], ['profit', 'Profit'], ['orders', 'Cmd']] as [Metric, React.ReactNode][]}
          value={metric} onChange={setMetric} activeColor={m.color}
        />
        <Segmented
          options={[
            ['bar', <BarIcon key="b" size={15} />],
            ['line', <LineIcon key="l" size={15} />],
            ['area', <AreaIcon key="a" size={15} />],
          ] as [ChartType, React.ReactNode][]}
          value={chartType} onChange={setChartType} activeColor="var(--tx-hi)"
        />
        <select
          value={compare}
          onChange={(e) => setCompare(e.target.value as Compare)}
          style={{ fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--tx-hi)', cursor: 'pointer' }}
        >
          <option value="none">Comparer…</option>
          <option value="prev">Période précédente</option>
          <option value="dod">Jour précédent</option>
          <option value="wow">Semaine précédente</option>
          <option value="mom">Mois précédent</option>
          <option value="yoy">Année précédente</option>
          <option value="custom">Personnalisé…</option>
        </select>
        {compare === 'custom' && (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={dateInput} />
            <span style={{ color: 'var(--tx-faint)', fontSize: 12 }}>→</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={dateInput} />
          </span>
        )}
        <button
          onClick={() => setShowMA((v) => !v)}
          title={`Moyenne mobile ${maWin} jours`}
          style={{
            fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            border: `1px solid ${showMA ? MA_COLOR : 'var(--line)'}`,
            background: showMA ? 'rgba(245,158,11,0.10)' : 'transparent',
            color: showMA ? MA_COLOR : 'var(--tx-lo)',
          }}
        >
          <span style={{ width: 12, height: 2, background: MA_COLOR, borderRadius: 2, opacity: showMA ? 1 : 0.5 }} />
          Tendance
        </button>
        {cmpLoading && <span style={{ fontSize: 11, color: 'var(--tx-faint)' }}>chargement…</span>}
        {cmpErr && <span style={{ fontSize: 11, color: 'var(--red)' }}>comparaison indisponible</span>}
      </div>

      {/* Legend when comparing / MA on */}
      {(hasCmp || showMA) && (
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--tx-lo)', marginBottom: 2, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 14, height: 2.5, background: m.color, borderRadius: 2 }} /> {periodLabel}
          </span>
          {hasCmp && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 14, height: 0, borderTop: '2px dashed var(--tx-faint)' }} /> {CMP_LABEL[compare as Exclude<Compare, 'none'>]}
              {cmpTotal != null && <b style={{ color: 'var(--tx-mid)' }}>· {m.fmt(cmpTotal)}{m.unit ? ` ${m.unit}` : ''}</b>}
            </span>
          )}
          {showMA && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 14, height: 2.5, background: MA_COLOR, borderRadius: 2 }} /> moyenne {maWin}j
            </span>
          )}
          {todayPoint && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--tx-faint)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: m.color, opacity: 0.4 }} /> aujourd’hui (en cours)
            </span>
          )}
        </div>
      )}

      {/* Chart */}
      <div style={{ width: '100%', height: 236, marginTop: 4 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="rt-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={m.color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={m.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--line-soft)" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--tx-faint)' }} interval={tickInterval} axisLine={false} tickLine={false} minTickGap={16} />
            <YAxis domain={yDomain} tick={{ fontSize: 10, fill: 'var(--tx-faint)' }} width={46} axisLine={false} tickLine={false} tickFormatter={compact} />
            <Tooltip content={<ChartTooltip metric={metric} compareName={compare !== 'none' ? CMP_LABEL[compare] : undefined} />} cursor={{ fill: 'var(--line-soft)', fillOpacity: 0.4, stroke: 'var(--line)' }} />
            {metric === 'profit' && <ReferenceLine y={0} stroke="var(--line)" />}

            {/* Comparison overlay (behind) */}
            {hasCmp && (
              <Line type="monotone" dataKey="cmp" stroke="var(--tx-faint)" strokeWidth={1.8} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
            )}

            {/* Current metric */}
            {chartType === 'area' && (
              <Area type="monotone" dataKey="cur" stroke={m.color} strokeWidth={2.5} fill="url(#rt-fill)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            )}
            {chartType === 'line' && (
              <Line type="monotone" dataKey="cur" stroke={m.color} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            )}
            {chartType === 'bar' && (
              <Bar dataKey="cur" fill={m.color} radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false}>
                {data.map((d, i) => (
                  <Cell key={i} fillOpacity={i === bestIdx ? 1 : d.isToday ? 0.38 : 0.85} />
                ))}
              </Bar>
            )}

            {/* Moving-average trend */}
            {showMA && (
              <Line type="monotone" dataKey="ma" stroke={MA_COLOR} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            )}

            {/* Peak marker (non-bar, since bars already highlight the peak cell) */}
            {best && chartType !== 'bar' && (
              <ReferenceDot x={best.label} y={best.cur} r={4.5} fill={m.color} stroke="var(--bg-1)" strokeWidth={2} />
            )}
            {/* Today marker (non-bar) */}
            {todayPoint && chartType !== 'bar' && (
              <ReferenceDot x={todayPoint.label} y={todayPoint.cur} r={4} fill="var(--bg-1)" stroke={m.color} strokeWidth={2} />
            )}

            {data.length > 60 && (
              <Brush dataKey="label" height={18} stroke="var(--line)" fill="var(--bg-2)" travellerWidth={8} tickFormatter={() => ''} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

const dateInput: React.CSSProperties = {
  fontSize: 12, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--tx-hi)',
}

function Segmented<T extends string>({ options, value, onChange, activeColor }: {
  options: [T, React.ReactNode][]; value: T; onChange: (v: T) => void; activeColor: string
}) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
      {options.map(([v, label], i) => {
        const active = v === value
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            style={{
              fontSize: 12, fontWeight: 600, padding: '6px 11px', cursor: 'pointer', border: 'none',
              borderLeft: i === 0 ? 'none' : '1px solid var(--line)',
              background: active ? 'var(--bg-2)' : 'transparent',
              color: active ? activeColor : 'var(--tx-lo)',
              minWidth: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >{label}</button>
        )
      })}
    </div>
  )
}

type Row = { label: string; weekday: string; isToday: boolean; cur: number; ma: number | null; cmp: number | null; cmpLabel?: string; revenue: number; profit: number; orders: number }

function ChartTooltip({ active, payload, metric, compareName }: {
  active?: boolean; payload?: Array<{ payload: Row }>; metric: Metric; compareName?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  const m = METRICS[metric]
  const cmp = d.cmp
  const dayDelta = cmp != null && cmp > 0 ? ((d.cur - cmp) / cmp) * 100 : null
  return (
    <div style={{ background: 'var(--bg-1)', border: `1px solid ${m.color}`, borderRadius: 8, padding: '9px 11px', boxShadow: '0 6px 20px rgba(0,0,0,0.12)', minWidth: 154 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx-mid)', marginBottom: 5 }}>
        {d.weekday} {d.label}{d.isToday ? <span style={{ color: 'var(--tx-faint)', fontWeight: 500 }}> · en cours</span> : ''}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-hi)' }}>{m.fmt(d.cur)}{m.unit ? ` ${m.unit}` : ''}</div>
      {d.ma != null && (
        <div style={{ fontSize: 10.5, color: MA_COLOR, marginTop: 2 }}>tendance {m.fmt(d.ma)}{m.unit ? ` ${m.unit}` : ''}</div>
      )}
      {cmp != null && (
        <div style={{ fontSize: 11, color: 'var(--tx-lo)', marginTop: 3 }}>
          {compareName || 'comparaison'}: <b style={{ color: 'var(--tx-mid)' }}>{m.fmt(cmp)}{m.unit ? ` ${m.unit}` : ''}</b>
          {d.cmpLabel ? <span style={{ color: 'var(--tx-faint)' }}> ({d.cmpLabel})</span> : null}
          {dayDelta != null && <span style={{ color: dayDelta >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}> {dayDelta >= 0 ? '▲' : '▼'}{int(Math.abs(dayDelta))}%</span>}
        </div>
      )}
      {metric !== 'orders' && (
        <div style={{ fontSize: 10, color: 'var(--tx-faint)', marginTop: 4 }}>
          {metric !== 'revenue' && <>CA {mad(d.revenue)} · </>}
          {metric !== 'profit' && <>Profit {mad(d.profit)} · </>}
          {d.orders} cmd
        </div>
      )}
    </div>
  )
}
