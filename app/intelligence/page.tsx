'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, Lock, TrendingDown, TrendingUp } from 'lucide-react'
import BosShell from '@/components/BosShell'

interface IntelData {
  period: { start: string; end: string; days: number }
  cod: {
    totalOrders: number
    byStatus: Array<{ status: string; orders: number; revenue: number }>
    confirmationRate: number
    cancellationRate: number
    deliveryRate: number
    revenue: { delivered: number; inTransit: number; pending: number; lost: number }
  }
  velocity: {
    topSellers: Array<{ id: number; name: string; brand: string; units: number; revenue: number }>
    deadStock: Array<{ id: number; name: string; brand: string; stock: number }>
  }
  readiness: {
    cost: { total: number; filled: number }
    channel: { total: number; filled: number }
    marginUnlocked: boolean
    channelUnlocked: boolean
  }
}

const mad = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} MAD`
const pct = (n: number) => `${n.toFixed(0)}%`

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'var(--amber, #F59E0B)',
  CONFIRMED: 'var(--blue, #3B82F6)',
  DELIVERED: 'var(--green, #10B981)',
  CANCELLED: 'var(--rose-bright, #EF4444)',
}

export default function IntelligencePage() {
  const [data, setData] = useState<IntelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(90)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch(`/api/ops/intelligence?days=${days}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (active) setData(d?.error ? null : d) })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [days])

  return (
    <BosShell active="intelligence" title="Focus" crumb="Overview">
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '22px 24px 60px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>OÙ ON GAGNE · OÙ ON PERD · OÙ FOCUS</div>
            <h1 className="serif-display" style={{ fontSize: 28, color: 'var(--tx-hi)', lineHeight: 1.05 }}>Focus</h1>
          </div>
          <div style={{ display: 'inline-flex', border: '1px solid var(--line-soft)', borderRadius: 8, padding: 3, background: 'var(--bg-1)' }}>
            {[30, 90].map((d) => (
              <button key={d} type="button" onClick={() => setDays(d)}
                style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  background: days === d ? 'var(--rose-bright)' : 'transparent', color: days === d ? '#fff' : 'var(--tx-mid)' }}>
                {d}j
              </button>
            ))}
          </div>
        </div>

        {loading && !data && <p style={{ color: 'var(--tx-lo)' }}>Chargement…</p>}
        {!loading && !data && <p style={{ color: 'var(--rose-bright)' }}>Impossible de charger les données.</p>}

        {data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* DATA READINESS — actionable checklist */}
            {(!data.readiness.marginUnlocked || data.readiness.channel.filled < data.readiness.channel.total) && (
              <div style={{ background: 'var(--rose-bg)', border: '1px solid var(--rose-line)', borderRadius: 12, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <AlertTriangle style={{ width: 18, height: 18, color: 'var(--rose-bright)' }} />
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)' }}>Débloque ton intelligence</h3>
                </div>
                <p style={{ fontSize: 13, color: 'var(--tx-mid)', marginBottom: 14 }}>
                  Ces analyses sont prêtes — il manque juste les inputs. Remplis-les et les sections marge & canal se débloquent automatiquement.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                  <ReadinessRow
                    label="Coûts produits"
                    filled={data.readiness.cost.filled} total={data.readiness.cost.total}
                    unlocks="marge, profit, winners/losers"
                    href="/products" cta="Remplir les coûts"
                  />
                  <ReadinessRow
                    label="Canal des commandes"
                    filled={data.readiness.channel.filled} total={data.readiness.channel.total}
                    unlocks="P&L par canal (Insta/TikTok/WhatsApp)"
                    href="/orders" cta="Tagger les commandes"
                  />
                </div>
              </div>
            )}

            {/* COD ECONOMICS */}
            <Section title="Économie COD" hint={`${data.cod.totalOrders} commandes · ${data.period.days}j`}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
                <Kpi label="Taux de confirmation" value={pct(data.cod.confirmationRate)} tone="green" />
                <Kpi label="Taux d'annulation" value={pct(data.cod.cancellationRate)} tone={data.cod.cancellationRate >= 20 ? 'rose' : 'mid'}
                  note={data.cod.cancellationRate >= 20 ? '⚠️ élevé' : undefined} />
                <Kpi label="Taux de livraison" value={pct(data.cod.deliveryRate)} tone="mid" note="des commandes résolues" />
              </div>

              {/* Revenue buckets */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                <RevTile label="✅ Livré (encaissé)" value={mad(data.cod.revenue.delivered)} color="var(--green)" />
                <RevTile label="🚚 En transit" value={mad(data.cod.revenue.inTransit)} color="var(--blue, #3B82F6)" />
                <RevTile label="⏳ En attente (à risque)" value={mad(data.cod.revenue.pending)} color="var(--amber, #F59E0B)" />
                <RevTile label="❌ Perdu (annulé)" value={mad(data.cod.revenue.lost)} color="var(--rose-bright)" />
              </div>
            </Section>

            {/* VELOCITY */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
              <Section title="Ce qui se vend" hint="par unités vendues" icon={<TrendingUp style={{ width: 16, height: 16, color: 'var(--green)' }} />}>
                {data.velocity.topSellers.length === 0 ? <Empty text="Aucune vente sur la période." /> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {data.velocity.topSellers.slice(0, 8).map((p, i) => {
                      const max = data.velocity.topSellers[0]?.units || 1
                      return (
                        <div key={p.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                            <span style={{ color: 'var(--tx-hi)', display: 'flex', gap: 6, minWidth: 0 }}>
                              <span style={{ color: 'var(--tx-faint)', fontFamily: 'var(--mono)' }}>{i + 1}</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                            </span>
                            <span style={{ color: 'var(--tx-mid)', whiteSpace: 'nowrap', marginLeft: 8 }}><b style={{ color: 'var(--tx-hi)' }}>{p.units}</b> u · {mad(p.revenue)}</span>
                          </div>
                          <div style={{ height: 5, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${(p.units / max) * 100}%`, height: '100%', background: 'var(--green)', borderRadius: 3 }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Section>

              <Section title="Dead stock" hint={`${data.velocity.deadStock.length} produits · 0 vente`} icon={<TrendingDown style={{ width: 16, height: 16, color: 'var(--rose-bright)' }} />}>
                {data.velocity.deadStock.length === 0 ? <Empty text="Tout le catalogue se vend 👏" /> : (
                  <>
                    <p style={{ fontSize: 12, color: 'var(--tx-lo)', marginBottom: 10 }}>
                      Produits actifs sans aucune vente sur {data.period.days}j — candidats à promo, bundle, ou retrait.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {data.velocity.deadStock.map((p) => (
                        <Link key={p.id} href={`/products`} style={{ fontSize: 12, padding: '4px 9px', borderRadius: 20, background: 'var(--bg-3)',
                          border: '1px solid var(--line-soft)', color: 'var(--tx-mid)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          {p.name.length > 26 ? p.name.slice(0, 26) + '…' : p.name}
                          <span style={{ color: 'var(--tx-faint)', marginLeft: 6 }}>{p.stock} en stock</span>
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </Section>
            </div>

            {/* LOCKED — margin & channel P&L */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
              {!data.readiness.marginUnlocked && (
                <LockedSection
                  title="Marge & profit produits"
                  reason={`Verrouillé — 0/${data.readiness.cost.total} produits ont un coût.`}
                  unlocks="Quels produits rapportent vraiment, matrice marge × vélocité (pousser/couper)."
                  href="/products" cta="Remplir les coûts"
                />
              )}
              {!data.readiness.channelUnlocked && (
                <LockedSection
                  title="P&L par canal"
                  reason={`Verrouillé — ${data.readiness.channel.filled}/${data.readiness.channel.total} commandes ont un canal.`}
                  unlocks="CA & marge par Instagram / TikTok / WhatsApp, net des annulations."
                  href="/orders" cta="Tagger les commandes"
                />
              )}
            </div>

          </div>
        )}
      </div>
    </BosShell>
  )
}

function Section({ title, hint, icon, children }: { title: string; hint?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 12, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {icon}
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-hi)' }}>{title}</h3>
        </div>
        {hint && <span style={{ fontSize: 11, color: 'var(--tx-lo)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Kpi({ label, value, tone, note }: { label: string; value: string; tone: 'green' | 'rose' | 'mid'; note?: string }) {
  const color = tone === 'green' ? 'var(--green)' : tone === 'rose' ? 'var(--rose-bright)' : 'var(--tx-hi)'
  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line-soft)', borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--tx-lo)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      {note && <div style={{ fontSize: 10, color: 'var(--tx-faint)', marginTop: 2 }}>{note}</div>}
    </div>
  )
}

function RevTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line-soft)', borderRadius: 10, padding: 12, borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 11, color: 'var(--tx-lo)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx-hi)' }}>{value}</div>
    </div>
  )
}

function ReadinessRow({ label, filled, total, unlocks, href, cta }: { label: string; filled: number; total: number; unlocks: string; href: string; cta: string }) {
  const done = total > 0 && filled >= total
  const p = total > 0 ? Math.round((filled / total) * 100) : 0
  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-hi)' }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: done ? 'var(--green)' : 'var(--rose-bright)' }}>{filled}/{total}</span>
      </div>
      <div style={{ height: 5, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ width: `${p}%`, height: '100%', background: done ? 'var(--green)' : 'var(--rose-bright)', borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--tx-lo)', marginBottom: 10 }}>Débloque : {unlocks}</div>
      <Link href={href} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--rose-bright)', textDecoration: 'none' }}>
        {cta} <ArrowRight style={{ width: 13, height: 13 }} />
      </Link>
    </div>
  )
}

function LockedSection({ title, reason, unlocks, href, cta }: { title: string; reason: string; unlocks: string; href: string; cta: string }) {
  return (
    <div style={{ background: 'var(--bg-inset, var(--bg-1))', border: '1px dashed var(--line)', borderRadius: 12, padding: 18, opacity: 0.92 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Lock style={{ width: 16, height: 16, color: 'var(--tx-faint)' }} />
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--tx-mid)' }}>{title}</h3>
      </div>
      <div style={{ fontSize: 12, color: 'var(--rose-bright)', marginBottom: 8 }}>{reason}</div>
      <div style={{ fontSize: 12, color: 'var(--tx-lo)', marginBottom: 12 }}>Débloque : {unlocks}</div>
      <Link href={href} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--rose-bright)', textDecoration: 'none' }}>
        {cta} <ArrowRight style={{ width: 13, height: 13 }} />
      </Link>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p style={{ fontSize: 13, color: 'var(--tx-faint)', textAlign: 'center', padding: '20px 0' }}>{text}</p>
}
