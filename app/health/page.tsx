'use client'

import { useEffect, useState, useCallback } from 'react'
import BosShell from '@/components/BosShell'

type Health = {
  generatedAt: string
  compute: { awakeSince: string; awakeHours: number; warn: boolean }
  database: { bytes: number; pretty: string }
  connections: { total: number; active: number; idle: number; max: number; usage: number }
  cache: { hitRatio: number; commits: number; rollbacks: number }
  events: { last24h: number; last7d: number; total: number; perDay: number; projectedYear: number }
  tables: Array<{ name: string; rows: number; pretty: string }>
  neonRates: { computePerCuHour: number; storagePerGbMonth: number; currency: string }
  neon:
    | { configured: false; missing: string[] }
    | { configured: true; error: string }
    | { configured: true; cuHours: number; days: Array<{ date: string; cuHours: number }>; projectedMonth: number; monthStart: string }
}

const int = (v: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v || 0)

function duration(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`
  if (h < 48) return `${Math.floor(h)} h ${Math.round((h % 1) * 60)} min`
  return `${Math.floor(h / 24)} j ${Math.round(h % 24)} h`
}

export default function HealthPage() {
  const [d, setD] = useState<Health | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/ops/health', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`)
      setD(j); setErr(null)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Échec') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <BosShell active="health" title="Santé technique" crumb="Aide">
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '18px 24px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 3 }}>AIDE</div>
            <h1 className="serif-display" style={{ fontSize: 21, lineHeight: 1.05 }}>Santé technique</h1>
            <p style={{ fontSize: 12, color: 'var(--tx-lo)', marginTop: 4, maxWidth: 640 }}>
              Consommation serveur et base <b>sans ouvrir de console</b>. Tout est lu directement
              dans PostgreSQL — aucune clé d&apos;API, aucun accès externe.
            </p>
          </div>
          <button className="btn-modern btn-secondary" onClick={load} disabled={loading} style={{ fontSize: 12 }}>
            {loading ? 'Lecture…' : 'Actualiser'}
          </button>
        </div>

        {err && <p style={{ fontSize: 13, color: 'var(--red)' }}>{err}</p>}
        {!d && !err && <p style={{ fontSize: 13, color: 'var(--tx-faint)' }}>Lecture des compteurs…</p>}

        {d && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* LE chiffre qui compte : Neon facture le temps d'éveil du compute. */}
            <div className="card-modern" style={{ padding: 16, borderLeft: `3px solid ${d.compute.warn ? 'var(--red)' : 'var(--green)'}` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--tx-lo)', fontWeight: 600 }}>COMPUTE NEON — ÉVEILLÉ DEPUIS</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: d.compute.warn ? 'var(--red)' : 'var(--green)', lineHeight: 1.1, marginTop: 3 }}>
                    {duration(d.compute.awakeHours)}
                  </div>
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--tx-lo)', maxWidth: 460, lineHeight: 1.5 }}>
                  Neon facture le <b>temps d&apos;éveil</b>, pas le nombre de requêtes. Avec la mise en
                  veille automatique, ce compteur doit retomber à quelques minutes quand personne
                  n&apos;utilise le back-office.
                </p>
              </div>
              {d.compute.warn && (
                <p style={{ marginTop: 10, fontSize: 12, padding: '8px 10px', borderRadius: 8, background: 'var(--red-bg)', border: '1px solid var(--red)', color: 'var(--tx-hi)' }}>
                  ⚠ Éveillé depuis plus de 12 h d&apos;affilée : la base ne se met jamais en veille.
                  Quelque chose l&apos;interroge en boucle — onglet du back-office resté ouvert, cron
                  trop fréquent, ou service de ping pointé sur une URL qui touche la base.
                  <b> C&apos;est exactement ce qui a provoqué la panne du 26 juillet.</b>
                </p>
              )}
            </div>

            {/* Consommation réellement facturée par Neon (CU-heures). Le compteur
                « éveillé depuis » ci-dessus donne le symptôme en direct ; celui-ci
                donne le cumul du mois et la projection. */}
            {'error' in d.neon ? (
              <div className="card-modern" style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--tx-lo)', fontWeight: 600 }}>CONSOMMATION NEON</div>
                <p style={{ fontSize: 12, color: 'var(--amber)', marginTop: 4 }}>
                  Lecture impossible : {d.neon.error}
                </p>
                <p style={{ fontSize: 11, color: 'var(--tx-faint)', marginTop: 3 }}>
                  Vérifie <code>NEON_API_KEY</code>, <code>NEON_PROJECT_ID</code> et <code>NEON_ORG_ID</code> dans Vercel.
                </p>
              </div>
            ) : d.neon.configured === false ? (
              <div className="card-modern" style={{ padding: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--tx-lo)', fontWeight: 600 }}>CONSOMMATION NEON</div>
                <p style={{ fontSize: 12, color: 'var(--amber)', marginTop: 4 }}>
                  Variable(s) absente(s) au moment de l&apos;exécution : <b>{d.neon.missing.join(', ') || 'aucune'}</b>
                </p>
                <p style={{ fontSize: 11, color: 'var(--tx-faint)', marginTop: 4, lineHeight: 1.5 }}>
                  Si tu viens de les ajouter dans Vercel : <b>il faut redéployer</b>. Vercel n&apos;injecte les
                  variables qu&apos;au build suivant — le déploiement en cours a été construit avant.
                  Vérifie aussi qu&apos;elles sont sur le projet <b>parashop-ops</b> et cochées pour
                  l&apos;environnement <b>Production</b>.
                </p>
              </div>
            ) : (() => {
              const n = d.neon
              const r = d.neonRates
              // Launch est 100 % a l'usage : pas de forfait, pas d'heures incluses.
              // On affiche donc un cout estime, pas un pourcentage de quota.
              const gb = d.database.bytes / 1024 ** 3
              const computeCost = n.cuHours * r.computePerCuHour
              const storageCost = gb * r.storagePerGbMonth
              const monthCost = computeCost + storageCost
              const projectedCost = n.projectedMonth * r.computePerCuHour + storageCost
              const max = Math.max(...n.days.map((x) => x.cuHours), 0.01)
              const usd = (v: number) => `$${v.toFixed(2)}`
              return (
                <div className="card-modern" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--tx-lo)', fontWeight: 600 }}>COÛT NEON — CE MOIS</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 3 }}>
                        <span style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--tx-hi)' }}>
                          {usd(monthCost)}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--tx-faint)' }}>
                          dont {usd(computeCost)} de compute · {usd(storageCost)} de stockage
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--tx-faint)', marginTop: 2 }}>
                        {n.cuHours.toFixed(1)} CU-h × {usd(r.computePerCuHour)} · {gb.toFixed(2)} Go × {usd(r.storagePerGbMonth)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10.5, color: 'var(--tx-faint)' }}>Projection fin de mois</div>
                      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--tx-hi)' }}>
                        {usd(projectedCost)}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--tx-faint)' }}>au rythme actuel</div>
                    </div>
                  </div>

                  {n.days.length > 0 && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 46, marginTop: 12 }}>
                        {n.days.map((x) => (
                          <div key={x.date} title={`${x.date} — ${x.cuHours.toFixed(2)} CU-h`}
                            style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                            <div style={{ height: `${Math.max((x.cuHours / max) * 100, x.cuHours > 0 ? 4 : 0)}%`, background: 'var(--rose-bright)', borderRadius: '3px 3px 0 0', opacity: 0.85 }} />
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--tx-faint)', marginTop: 3 }}>
                        <span>{n.monthStart}</span>
                        <span>aujourd&apos;hui · un pic isolé = une journée où la base n&apos;a pas dormi</span>
                      </div>
                    </>
                  )}
                </div>
              )
            })()}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <Stat label="Taille de la base" value={d.database.pretty}
                sub={`${int(d.events.total)} événements analytics inclus`} />
              <Stat label="Connexions ouvertes" value={`${d.connections.total} / ${d.connections.max}`}
                sub={`${d.connections.active} actives · ${d.connections.idle} au repos`}
                tone={d.connections.usage > 70 ? 'red' : d.connections.usage > 40 ? 'amber' : 'green'} />
              <Stat label="Taux de cache" value={`${d.cache.hitRatio.toFixed(2)} %`}
                sub={d.cache.hitRatio >= 99 ? 'excellent — presque tout en mémoire' : 'sous 99 % : la base lit trop le disque'}
                tone={d.cache.hitRatio >= 99 ? 'green' : 'amber'} />
              <Stat label="Événements / jour" value={int(Math.round(d.events.perDay))}
                sub={`≈ ${int(d.events.projectedYear)} par an au rythme actuel`} />
            </div>

            <div className="card-modern" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx-hi)', marginBottom: 10 }}>Tables les plus lourdes</div>
              {d.tables.map((t) => (
                <div key={t.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 12.5 }}>
                  <span style={{ color: 'var(--tx-hi)' }}>{t.name}</span>
                  <span style={{ color: 'var(--tx-lo)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
                    {int(t.rows)} lignes · <b style={{ color: 'var(--tx-hi)' }}>{t.pretty}</b>
                  </span>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 11, color: 'var(--tx-faint)', lineHeight: 1.6 }}>
              Relevé du {new Date(d.generatedAt).toLocaleString('fr-FR')}. Ces compteurs viennent de
              PostgreSQL et suffisent à repérer une dérive. Pour le <b>montant facturé exact</b> (Neon)
              et le <b>temps d&apos;exécution des fonctions</b> (Vercel), il faudrait une clé d&apos;API de
              chaque service — dis-le moi si tu veux que je les branche ici aussi.
            </p>
          </div>
        )}
      </div>
    </BosShell>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'green' | 'amber' | 'red' }) {
  const color = tone === 'red' ? 'var(--red)' : tone === 'amber' ? 'var(--amber)' : tone === 'green' ? 'var(--green)' : 'var(--tx-hi)'
  return (
    <div className="card-modern" style={{ padding: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--tx-lo)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 3, fontFamily: 'var(--mono)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--tx-faint)', marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}
