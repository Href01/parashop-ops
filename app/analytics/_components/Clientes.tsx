'use client'

/**
 * LES CLIENTES, UNE PAR UNE.
 *
 * Rapatrie depuis l'ancienne page « Clientes », et refait — le barème qu'elle
 * appliquait ne pouvait rien désigner sur ces données (voir le commentaire de
 * `analyses/route.ts`). Ici les scores sont des quintiles de la distribution
 * réelle, et la fréquence s'affiche en nombre brut tant qu'elle ne dépasse pas
 * trois commandes.
 *
 * Deux choix d'affichage qui portent le sens :
 *
 *  · LES SEGMENTS SONT ORDONNÉS PAR CYCLE DE VIE, pas par chiffre d'affaires.
 *    Nouvelle → à convertir → fidèle → à réactiver → perdue de vue raconte un
 *    parcours ; trier par CA n'aurait raconté qu'un classement.
 *  · LA BARRE MESURE LA PART DE CHIFFRE D'AFFAIRES, pas la part de clientes.
 *    C'est ce qui rend visible qu'un petit groupe fidèle pèse plus qu'un grand
 *    groupe de passage — 13 clientes fidèles contre 52 nouvelles, et pourtant
 *    des cumuls du même ordre.
 */

import { useMemo, useState } from 'react'
import { V } from './Viz'
import { T } from './Decision'
import { fmt } from './Report'

export type SegmentCle = 'nouvelle' | 'a_convertir' | 'fidele' | 'a_reactiver' | 'perdue_de_vue'

export type Segment = {
  cle: string; clientes: number; ca: number; marge: number
  ltvMoyen: number; recence: number; cmdMoyen: number
}

export type Cliente = {
  tel: string; nom: string; ville: string
  cmd: number; ltv: number; marge: number; recence: number
  segment: string; r: number; m: number
  premiere: string; derniere: string
}

/** L'ordre est celui du cycle de vie, et il est volontaire. */
export const SEGMENTS: Array<{ cle: SegmentCle; label: string; sens: string; ton: 'bon' | 'neutre' | 'attention' | 'mauvais' }> = [
  { cle: 'nouvelle', label: 'Nouvelles', ton: 'neutre',
    sens: 'Une seule commande, livrée il y a moins d’un mois. Trop tôt pour juger.' },
  { cle: 'a_convertir', label: 'À convertir', ton: 'attention',
    sens: 'Une seule commande, entre un et trois mois. C’est là que la deuxième se joue.' },
  { cle: 'fidele', label: 'Fidèles', ton: 'bon',
    sens: 'Au moins deux commandes, et encore actives. Le socle.' },
  { cle: 'a_reactiver', label: 'À réactiver', ton: 'mauvais',
    sens: 'Elles revenaient, elles ont cessé. Les plus rentables à rappeler.' },
  { cle: 'perdue_de_vue', label: 'Perdues de vue', ton: 'neutre',
    sens: 'Une commande, plus de trois mois. Une reconquête coûte, mais moins qu’une acquisition.' },
]

const COULEUR: Record<string, string> = {
  bon: V.good, neutre: V.muted, attention: V.warning, mauvais: V.critical,
}

/** Le score en cinq crans, écrit ET dessiné — la couleur ne porte jamais seule. */
function Score({ n, titre }: { n: number; titre: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={titre}>
      <span className="tabular-nums font-semibold" style={{ color: V.ink }}>{n}</span>
      <span aria-hidden="true" className="inline-flex gap-[1.5px]">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} style={{
            width: 3, height: 9, borderRadius: 1,
            background: i <= n ? V.ink : V.grid,
          }} />
        ))}
      </span>
    </span>
  )
}

export function Clientes({ segments, clientes, deuxieme }: {
  segments: Segment[]
  clientes: Cliente[]
  deuxieme: { effectif: number; medianeJours: number }
}) {
  const [filtre, setFiltre] = useState<string | null>(null)
  const [tri, setTri] = useState<'ltv' | 'recence' | 'cmd'>('ltv')
  const [page, setPage] = useState(0)

  const parCle = useMemo(() => {
    const m = new Map<string, Segment>()
    for (const s of segments) m.set(s.cle, s)
    return m
  }, [segments])

  const caTotal = useMemo(() => segments.reduce((s, x) => s + x.ca, 0), [segments])

  const lignes = useMemo(() => {
    const l = filtre ? clientes.filter((c) => c.segment === filtre) : clientes
    return [...l].sort((a, b) =>
      tri === 'ltv' ? b.ltv - a.ltv : tri === 'cmd' ? b.cmd - a.cmd || b.ltv - a.ltv : a.recence - b.recence
    )
  }, [clientes, filtre, tri])

  const PAR_PAGE = 12
  const pages = Math.max(1, Math.ceil(lignes.length / PAR_PAGE))
  // Changer de filtre alors qu'on est page 4 laisserait un tableau vide sans
  // rien dire : on borne la page au lieu d'attendre que l'utilisateur devine.
  const p = Math.min(page, pages - 1)
  const visibles = lignes.slice(p * PAR_PAGE, (p + 1) * PAR_PAGE)

  return (
    <div className="space-y-5">
      <div>
        <p className={T.label} style={{ color: V.muted }}>Où en sont les clientes</p>
        <p className={`${T.note} mb-3`} style={{ color: V.muted }}>
          La barre mesure la part de chiffre d’affaires, pas la part de clientes. Cliquez un
          groupe pour ne garder que lui dans la liste.
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {SEGMENTS.map((s) => {
            const d = parCle.get(s.cle)
            const n = d?.clientes ?? 0
            const part = caTotal > 0 ? ((d?.ca ?? 0) / caTotal) * 100 : 0
            const actif = filtre === s.cle
            return (
              <button
                key={s.cle}
                onClick={() => setFiltre(actif ? null : s.cle)}
                title={s.sens}
                className="text-left rounded-[10px] p-3 transition-colors"
                style={{
                  border: `1px solid ${actif ? V.ink : V.grid}`,
                  background: actif ? '#FAFAFA' : '#fff',
                }}
              >
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em]"
                  style={{ color: COULEUR[s.ton] }}>
                  {s.label}
                </p>
                <p className="text-[19px] font-black leading-none mt-1 tabular-nums" style={{ color: V.ink }}>
                  {n}
                </p>
                <p className={`${T.note} mt-0.5 tabular-nums`} style={{ color: V.muted }}>
                  {fmt(d?.ca ?? 0, 'mad')}
                </p>
                <div className="mt-2 h-[3px] rounded-full overflow-hidden" style={{ background: V.grid }}>
                  <div className="h-full rounded-full"
                    style={{ width: `${part}%`, background: COULEUR[s.ton] }} />
                </div>
              </button>
            )
          })}
        </div>

        {filtre && (
          <p className={`${T.note} mt-2`} style={{ color: V.ink2 }}>
            {SEGMENTS.find((s) => s.cle === filtre)?.sens}{' '}
            <button onClick={() => setFiltre(null)} className="underline font-semibold">
              voir tout le monde
            </button>
          </p>
        )}
      </div>

      {deuxieme.effectif > 0 && (
        <p className={`${T.body} max-w-[70ch]`} style={{ color: V.ink2 }}>
          <b>La deuxième commande arrive au bout de {Math.round(deuxieme.medianeJours)} jours</b>
          {deuxieme.effectif < 30 && (
            <span style={{ color: V.muted }}> (médiane sur {deuxieme.effectif} clientes seulement)</span>
          )}
          . C’est la fenêtre où une relance a un sens : au-delà, le groupe « à convertir »
          s’éloigne mois après mois sans que rien ne le rappelle.
        </p>
      )}

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2">
          <p className={T.label} style={{ color: V.muted }}>
            {lignes.length} cliente{lignes.length > 1 ? 's' : ''}
            {filtre ? ` — ${SEGMENTS.find((s) => s.cle === filtre)?.label.toLowerCase()}` : ''}
          </p>
          <div className="flex items-center gap-1">
            {([
              ['ltv', 'Cumul'],
              ['cmd', 'Commandes'],
              ['recence', 'Récence'],
            ] as const).map(([cle, label]) => (
              <button key={cle} onClick={() => setTri(cle)}
                className="text-[11.5px] font-semibold rounded-md px-2 py-1"
                style={{
                  border: `1px solid ${tri === cle ? V.ink : V.grid}`,
                  background: tri === cle ? V.ink : '#fff',
                  color: tri === cle ? '#fff' : V.ink2,
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {lignes.length === 0 ? (
          <p className={T.note} style={{ color: V.muted }}>Aucune cliente dans ce groupe.</p>
        ) : (
          <>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 660 }}>
                <thead>
                  <tr>
                    {(['Cliente', 'Groupe'] as const).map((h) => (
                      <th key={h} className={`${T.note} font-semibold text-left pb-2`}
                        style={{ color: V.muted, borderBottom: `1px solid ${V.axis}` }}>{h}</th>
                    ))}
                    {([
                      ['Commandes', undefined],
                      ['Cumul livré', undefined],
                      ['Valeur', 'Quintile de dépense : 5 = parmi le cinquième qui a le plus dépensé, toutes clientes confondues.'],
                      ['Marge', undefined],
                      ['Dernière', undefined],
                    ] as const).map(([h, t]) => (
                      <th key={h} title={t} className={`${T.note} font-semibold text-right pb-2 whitespace-nowrap`}
                        style={{ color: V.muted, borderBottom: `1px solid ${V.axis}` }}>
                        {t ? <span className="border-b border-dotted cursor-help" style={{ borderColor: V.axis }}>{h}</span> : h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((c) => {
                    const s = SEGMENTS.find((x) => x.cle === c.segment)
                    return (
                      <tr key={c.tel} className="rp-row" style={{ background: '#fff' }}>
                        <td className="text-[13px] py-1.5" style={{ borderBottom: `1px solid ${V.grid}` }}>
                          <span className="font-semibold" style={{ color: V.ink }}>{c.nom || 'Cliente'}</span>
                          <span className={`${T.note} block`} style={{ color: V.muted }}>
                            {[c.ville, c.tel].filter(Boolean).join(' · ')}
                          </span>
                        </td>
                        <td className="text-[11.5px] font-semibold whitespace-nowrap pr-3"
                          style={{ color: COULEUR[s?.ton ?? 'neutre'], borderBottom: `1px solid ${V.grid}` }}>
                          {s?.label ?? c.segment}
                        </td>
                        <td className="text-[13px] text-right tabular-nums" style={{ color: V.ink, borderBottom: `1px solid ${V.grid}` }}>{c.cmd}</td>
                        <td className="text-[13px] text-right tabular-nums font-semibold whitespace-nowrap"
                          style={{ color: V.ink, borderBottom: `1px solid ${V.grid}` }}>{fmt(c.ltv, 'mad')}</td>
                        <td className="text-[13px] text-right whitespace-nowrap" style={{ borderBottom: `1px solid ${V.grid}` }}>
                          <Score n={c.m} titre={`${fmt(c.ltv, 'mad')} cumulés — quintile ${c.m} sur 5`} />
                        </td>
                        <td className="text-[13px] text-right tabular-nums whitespace-nowrap"
                          style={{ color: V.ink2, borderBottom: `1px solid ${V.grid}` }}>{fmt(c.marge, 'mad')}</td>
                        <td className="text-[13px] text-right tabular-nums whitespace-nowrap"
                          style={{ color: V.muted, borderBottom: `1px solid ${V.grid}` }}>{c.recence} j</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div className="flex items-center gap-2 mt-2">
                <button onClick={() => setPage(Math.max(0, p - 1))} disabled={p === 0}
                  className="text-[12px] px-2 py-0.5 rounded disabled:opacity-30"
                  style={{ border: `1px solid ${V.grid}`, color: V.ink2 }}>‹</button>
                <span className={T.note} style={{ color: V.muted }}>{p + 1} / {pages}</span>
                <button onClick={() => setPage(Math.min(pages - 1, p + 1))} disabled={p >= pages - 1}
                  className="text-[12px] px-2 py-0.5 rounded disabled:opacity-30"
                  style={{ border: `1px solid ${V.grid}`, color: V.ink2 }}>›</button>
              </div>
            )}
          </>
        )}

        {/* Ce qui reste du R/F/M, et pourquoi. Un score n'a de valeur que là où
            le nombre brut ne dit pas où l'on se situe. La récence est déjà
            donnée en jours — plus précise, et directement actionnable : on
            relance à soixante jours, on ne relance pas « à R=3 ». La fréquence
            plafonne à trois commandes, une échelle sur cinq crans y serait une
            mise en scène. Reste la dépense : « 894 MAD » ne dit pas si c'est
            beaucoup ici ; le quintile, si. */}
        <p className={`${T.note} mt-2`} style={{ color: V.muted }}>
          « Valeur » est un quintile de la distribution réelle : 5 signifie « parmi le cinquième
          qui a le plus dépensé ». Il reste juste quand la boutique grandit, contrairement à un
          seuil en dirhams. Pas de score de récence — la colonne « Dernière » la donne en jours,
          ce qui est plus précis ; ni de score de fréquence — avec trois commandes au maximum,
          le nombre brut dit tout.
        </p>
      </div>
    </div>
  )
}
