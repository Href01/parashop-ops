'use client'

/**
 * L'ACTIVITÉ DU SITE, D'UN COUP D'ŒIL : sessions par heure (une journée) ou par jour (plusieurs).
 *
 * Forme : des colonnes, parce que ce sont des quantités par créneau à comparer. Un seul axe vertical : les commandes ne
 * sont PAS une seconde échelle (interdit) mais des repères posés sur les colonnes où elles ont eu lieu. Pour une
 * journée, la même heure d'hier est tracée en ligne fine : « est-ce plus calme que d'habitude ? » se lit sans calcul.
 *
 * Marques : colonnes ≤ 24 px, sommet arrondi 4 px, base droite ; grille et axes en retrait ; survol par créneau ;
 * valeur écrite seulement au pic. Les robots sont écartés (même règle que les indicateurs) ; une vue en tableau existe.
 */

import { useEffect, useMemo, useState } from 'react'
import { V, MARQUE } from './Viz'
import { T } from './Decision'
import { interroger } from './useReport'

type Creneau = { cle: string; label: string; n: number; prec: number | null; commandes: number; futur: boolean }

const TZ = 'Africa/Casablanca'
const ROSE = '#e11d74'
const W = 720, H = 168, PG = 34, PD = 8, PH = 14, PB = 24

const jourCourt = (d: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))
const ajoute = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const jourMaroc = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
const heureMaroc = () => Number(new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ }).format(new Date()))
const lundiDe = (d: string) => { const x = new Date(`${d}T00:00:00Z`); const j = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - j); return x.toISOString().slice(0, 10) }
const nf = (n: number) => n.toLocaleString('fr-FR')

/** Sommet arrondi (4 px), base droite : la colonne « pousse » depuis la ligne de base. */
function colonne(x: number, y: number, w: number, base: number, r = 4): string {
  const h = base - y
  if (h <= 0) return ''
  const rr = Math.min(r, h, w / 2)
  return `M${x},${base} V${y + rr} a${rr},${rr} 0 0 1 ${rr},${-rr} h${w - 2 * rr} a${rr},${rr} 0 0 1 ${rr},${rr} V${base} Z`
}

export function Activite({ debut, fin }: { debut: string; fin: string }) {
  const [creneaux, setCreneaux] = useState<Creneau[] | null>(null)
  const [erreur, setErreur] = useState(false)
  const [survol, setSurvol] = useState<number | null>(null)
  const [tableau, setTableau] = useState(false)
  const horaire = debut === fin
  const jours = Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86400000) + 1
  const hebdo = !horaire && jours > 60

  useEffect(() => {
    let vivant = true
    setCreneaux(null); setErreur(false)
    const dimension = horaire ? 'heure' : 'jour'
    const periode = { debut, fin }
    const veille = ajoute(debut, -1)
    Promise.all([
      interroger({ periode, dimension, mesures: ['sessions'], limite: 400 }),
      interroger({ periode, dimension, mesures: ['commandesSite'], limite: 400 }),
      // La même heure, la veille : seulement pour une journée (les jours d'une autre période ne s'alignent pas).
      horaire ? interroger({ periode: { debut: veille, fin: veille }, dimension: 'heure', mesures: ['sessions'], limite: 400 }) : Promise.resolve(null),
    ]).then(([s, c, p]) => {
      if (!vivant) return
      const val = (r: Awaited<ReturnType<typeof interroger>> | null, cle: string) => r?.lignes.find((l) => l.cle === cle)?.mesures
      const sessions = (cle: string) => Number(val(s, cle)?.sessions?.valeur ?? 0)
      const commandes = (cle: string) => Number(val(c, cle)?.commandesSite?.valeur ?? 0)
      let liste: Creneau[]
      if (horaire) {
        const aujourdhui = jourMaroc() === debut, h = heureMaroc()
        liste = Array.from({ length: 24 }, (_, i) => {
          const cle = `${String(i).padStart(2, '0')} h`
          return { cle, label: cle, n: sessions(cle), prec: p ? Number(val(p, cle)?.sessions?.valeur ?? 0) : null, commandes: commandes(cle), futur: aujourdhui && i > h }
        })
      } else {
        const jourCles: string[] = []
        for (let d = debut; d <= fin; d = ajoute(d, 1)) jourCles.push(d)
        if (!hebdo) {
          liste = jourCles.map((d) => ({ cle: d, label: jourCourt(d), n: sessions(d), prec: null, commandes: commandes(d), futur: false }))
        } else {
          const semaines = new Map<string, Creneau>()
          for (const d of jourCles) {
            const k = lundiDe(d)
            const e = semaines.get(k) ?? { cle: k, label: `sem. du ${jourCourt(k)}`, n: 0, prec: null, commandes: 0, futur: false }
            e.n += sessions(d); e.commandes += commandes(d); semaines.set(k, e)
          }
          liste = [...semaines.values()]
        }
      }
      setCreneaux(liste)
    }).catch(() => { if (vivant) setErreur(true) })
    return () => { vivant = false }
  }, [debut, fin, horaire, hebdo])

  const g = useMemo(() => {
    if (!creneaux || creneaux.length === 0) return null
    const reels = creneaux.filter((c) => !c.futur)
    const max = Math.max(1, ...reels.map((c) => c.n), ...creneaux.map((c) => c.prec ?? 0))
    // Échelle « propre » : 0 / moitié / maximum, arrondis vers le haut à un pas lisible.
    const pas = max <= 5 ? 1 : max <= 20 ? 5 : max <= 60 ? 10 : max <= 200 ? 50 : 100
    const haut = Math.ceil(max / pas) * pas
    const pw = W - PG - PD, ph = H - PH - PB, base = H - PB
    const slot = pw / creneaux.length, larg = Math.min(24, Math.max(3, slot * 0.62))
    const pic = reels.reduce((m, c, i) => (c.n > (reels[m]?.n ?? -1) ? i : m), 0)
    const cx = (i: number) => PG + slot * i + slot / 2
    const cy = (n: number) => base - (n / haut) * ph
    const total = reels.reduce((a, c) => a + c.n, 0)
    return { max, haut, pas, pw, ph, base, slot, larg, pic, cx, cy, total, reels }
  }, [creneaux])

  const titre = horaire ? 'Activité heure par heure' : hebdo ? 'Activité semaine par semaine' : 'Activité jour par jour'

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className={T.label} style={{ color: V.muted }}>{titre}</h2>
        <p className={T.note} style={{ color: V.muted }}>
          Sessions humaines (robots écartés)
          {horaire && ' · ligne grise : la veille'}
          {' · '}<span aria-hidden="true" style={{ color: V.ink }}>●</span> une commande
        </p>
      </div>

      {erreur && <p className={`${T.note} mt-2`} style={{ color: V.criticalInk }}>Activité indisponible pour le moment.</p>}
      {!creneaux && !erreur && <div className="mt-2 rp-sk" style={{ height: 150 }} aria-hidden="true" />}

      {g && creneaux && (
        <div className="relative mt-1">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" className="w-full h-auto select-none"
            aria-label={`${titre} : ${nf(g.total)} sessions, pic à ${creneaux[g.pic]?.label} avec ${nf(creneaux[g.pic]?.n ?? 0)}.`}>
            {/* Grille : trois repères (0, moitié, maximum), trait fin et plein, en retrait. */}
            {[0, 0.5, 1].map((f) => {
              const v = Math.round(g.haut * f), y = g.cy(v)
              return (
                <g key={f}>
                  <line x1={PG} x2={W - PD} y1={y} y2={y} stroke={f === 0 ? V.axis : V.grid} strokeWidth={1} />
                  <text x={PG - 6} y={y + 3.5} textAnchor="end" fontSize={10} fill={V.muted}>{v >= 1000 ? `${v / 1000}K` : v}</text>
                </g>
              )
            })}

            {creneaux.map((c, i) => {
              const x = g.cx(i) - g.larg / 2, y = g.cy(c.n)
              const surCreneau = survol === i, pic = i === g.pic && c.n > 0
              return (
                <g key={c.cle}>
                  {!c.futur && c.n > 0 && (
                    <path d={colonne(x, y, g.larg, g.base)} fill={ROSE} opacity={pic || surCreneau ? 1 : 0.38} />
                  )}
                  {c.futur && <circle cx={g.cx(i)} cy={g.base} r={1.5} fill={V.axis} />}
                  {c.commandes > 0 && !c.futur && (
                    // Anneau de la couleur du fond : le repère reste lisible là où il touche une colonne.
                    <circle cx={g.cx(i)} cy={Math.max(PH - 2, y - 9)} r={4.5} fill={V.ink} stroke="#fff" strokeWidth={2} />
                  )}
                  {pic && <text x={g.cx(i)} y={Math.max(11, y - (c.commandes > 0 ? 19 : 7))} textAnchor="middle" fontSize={11} fontWeight={700} fill={V.ink}>{nf(c.n)}</text>}
                  {/* Cible de survol : bien plus large que la colonne. */}
                  <rect x={PG + g.slot * i} y={PH - 4} width={g.slot} height={g.ph + 4} fill="transparent"
                    onMouseEnter={() => setSurvol(i)} onMouseLeave={() => setSurvol((s) => (s === i ? null : s))}
                    onFocus={() => setSurvol(i)} onBlur={() => setSurvol((s) => (s === i ? null : s))} tabIndex={0}
                    aria-label={`${c.label} : ${c.n} sessions${c.commandes ? `, ${c.commandes} commande${c.commandes > 1 ? 's' : ''}` : ''}`} />
                </g>
              )
            })}

            {/* La même heure, la veille : une ligne fine et grise, jamais une seconde échelle. */}
            {horaire && (
              <polyline fill="none" stroke={V.muted} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.85}
                points={creneaux.map((c, i) => `${g.cx(i)},${g.cy(c.prec ?? 0)}`).join(' ')} />
            )}

            {/* Axe horizontal : quelques repères seulement, jamais un libellé par colonne. */}
            {creneaux.map((c, i) => {
              const marque = horaire ? i % 3 === 0 : i === 0 || i === creneaux.length - 1 || i % Math.max(1, Math.ceil(creneaux.length / 6)) === 0
              return marque ? (
                <text key={c.cle} x={g.cx(i)} y={H - 7} textAnchor="middle" fontSize={10} fill={V.muted}>{horaire ? c.label.replace(' h', 'h') : c.label}</text>
              ) : null
            })}
          </svg>

          {survol != null && creneaux[survol] && (
            <div role="status" className="pointer-events-none absolute z-10 rounded-lg px-2.5 py-1.5 text-[11px] leading-snug"
              style={{
                left: `${((PG + g.slot * survol + g.slot / 2) / W) * 100}%`, top: 0, transform: 'translate(-50%, -4px)',
                background: '#fff', border: `1px solid ${MARQUE.carteLigne}`, boxShadow: MARQUE.ombre, color: V.ink, whiteSpace: 'nowrap',
              }}>
              <b>{creneaux[survol].label}</b>
              <div className="tabular-nums">{nf(creneaux[survol].n)} session{creneaux[survol].n > 1 ? 's' : ''}</div>
              {creneaux[survol].prec != null && <div className="tabular-nums" style={{ color: V.ink2 }}>hier, même heure : {nf(creneaux[survol].prec!)}</div>}
              {creneaux[survol].commandes > 0 && <div style={{ color: V.ink2 }}>{creneaux[survol].commandes} commande{creneaux[survol].commandes > 1 ? 's' : ''}</div>}
            </div>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <button type="button" onClick={() => setTableau((t) => !t)} aria-expanded={tableau}
              className="text-[11px] font-semibold underline" style={{ color: V.muted }}>
              {tableau ? 'Masquer le tableau' : 'Voir en tableau'}
            </button>
            <span className={T.note} style={{ color: V.muted }}>
              {nf(g.total)} sessions · pic {creneaux[g.pic]?.label} ({nf(creneaux[g.pic]?.n ?? 0)})
            </span>
          </div>

          {tableau && (
            <div className="mt-2 max-h-56 overflow-auto rounded-lg" style={{ border: `1px solid ${MARQUE.carteLigne}` }}>
              <table className="w-full text-[12px] tabular-nums">
                <thead>
                  <tr style={{ background: MARQUE.surface, color: V.muted }}>
                    <th scope="col" className="px-3 py-1.5 text-left font-semibold">{horaire ? 'Heure' : hebdo ? 'Semaine' : 'Jour'}</th>
                    <th scope="col" className="px-3 py-1.5 text-right font-semibold">Sessions</th>
                    {horaire && <th scope="col" className="px-3 py-1.5 text-right font-semibold">Hier</th>}
                    <th scope="col" className="px-3 py-1.5 text-right font-semibold">Commandes</th>
                  </tr>
                </thead>
                <tbody>
                  {creneaux.filter((c) => !c.futur).map((c) => (
                    <tr key={c.cle} style={{ borderTop: `1px solid ${MARQUE.carteLigne}` }}>
                      <th scope="row" className="px-3 py-1 text-left font-medium" style={{ color: V.ink2 }}>{c.label}</th>
                      <td className="px-3 py-1 text-right">{nf(c.n)}</td>
                      {horaire && <td className="px-3 py-1 text-right" style={{ color: V.ink2 }}>{nf(c.prec ?? 0)}</td>}
                      <td className="px-3 py-1 text-right">{c.commandes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
