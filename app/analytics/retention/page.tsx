'use client'

/**
 * RÉTENTION — reviennent-elles ?
 *
 * La question la plus chère à ignorer, et celle que rien ne posait. Mesuré sur
 * sept cohortes mensuelles : chacune ne ramène qu'entre 0 et 9 % de ses clientes
 * le mois suivant. La boutique acquiert, elle ne retient pas — et tout l'effort
 * publicitaire se dépense donc à remplacer, jamais à empiler.
 *
 * La personne est identifiée par son numéro de livraison : c'est le seul
 * identifiant stable ici, puisque 61 % des commandes n'ont pas de session web.
 */

import { useEffect, useMemo, useState } from 'react'
import { V } from '../_components/Viz'
import { T } from '../_components/Decision'
import { ReportShell, Scorecard, Squelette, ErreurChargement } from '../_components/Report'
import { TableCohortes, type CelluleCohorte } from '../_components/Charts'
import { Clientes, type Segment, type Cliente } from '../_components/Clientes'

type Personnes = { segments: Segment[]; clientes: Cliente[]; deuxiemeCommande: { effectif: number; medianeJours: number } }

export default function Retention() {
  const [cellules, setCellules] = useState<CelluleCohorte[] | null>(null)
  const [personnes, setPersonnes] = useState<Personnes | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    let vivant = true
    const poste = (corps: object) =>
      fetch('/api/ops/analytics/analyses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      }).then(async (r) => {
        const j = await r.json().catch(() => ({ error: `Réponse illisible (${r.status})` }))
        if (!r.ok || j.error) throw new Error(j.error || `Erreur ${r.status}`)
        return j
      })

    Promise.all([poste({ type: 'cohortes', mois: 12 }), poste({ type: 'clientes' })])
      .then(([coh, cli]) => { if (vivant) { setCellules(coh.cohortes); setPersonnes(cli) } })
      .catch((e) => {
        if (!vivant) return
        // Jamais de squelette éternel : l'échec s'écrit, et on sort de l'attente.
        setErreur(e instanceof Error ? e.message : 'Chargement impossible')
        setCellules([]); setPersonnes({ segments: [], clientes: [], deuxiemeCommande: { effectif: 0, medianeJours: 0 } })
      })
    return () => { vivant = false }
  }, [])

  const resume = useMemo(() => {
    if (!cellules) return null
    const par = new Map<string, Map<number, CelluleCohorte>>()
    for (const c of cellules) {
      if (!par.has(c.cohorte)) par.set(c.cohorte, new Map())
      par.get(c.cohorte)!.set(c.rang, c)
    }
    const cohortes = [...par.keys()].sort()
    let total = 0, ca = 0, caRepeat = 0
    // On exclut la cohorte du mois en cours, si elle existe. Retirer
    // systématiquement la dernière cohorte supprimait aussi un mois déjà mûr
    // lorsqu'aucune livraison n'avait encore eu lieu ce mois-ci.
    const moisCourant = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit',
    }).format(new Date())
    const mures = cohortes.filter((co) => co < moisCourant)
    let baseM1 = 0, retoursM1 = 0
    for (const co of mures) {
      const base = par.get(co)?.get(0)?.clientes ?? 0
      total += base
      baseM1 += base
      retoursM1 += par.get(co)?.get(1)?.clientes ?? 0
      for (const [r, c] of par.get(co)?.entries() ?? []) { ca += c.ca; if (r > 0) caRepeat += c.ca }
    }
    return {
      clientes: total,
      tauxM1: baseM1 > 0 ? (retoursM1 / baseM1) * 100 : null,
      partCaRepeat: ca > 0 ? (caRepeat / ca) * 100 : null,
      cohortes: cohortes.length,
    }
  }, [cellules])

  return (
    <ReportShell
      titre="Rétention"
      sous="Une cliente acquise revient-elle ? Groupées par mois de première commande livrée."
      enTete={erreur ? <ErreurChargement message={erreur} /> : null}
      scorecards={!resume ? (
        [0, 1, 2, 3].map((i) => <div key={i}><Squelette lignes={2} hauteur={12} /></div>)
      ) : (
        <>
          <Scorecard label="Clientes suivies" portee="personnes"
            definition="Personnes distinctes ayant été livrées, hors cohorte du mois en cours."
            valeur={resume.clientes} format="entier" hausseEstBonne />
          <Scorecard label="Retour le mois suivant" portee="personnes"
            definition="Part des clientes d'une cohorte qui recommandent le mois d'après, en moyenne."
            valeur={resume.tauxM1} format="pourcent" hausseEstBonne />
          <Scorecard label="CA de réachat" portee="personnes"
            definition="Part du chiffre d'affaires venant d'une commande qui n'est pas la première."
            valeur={resume.partCaRepeat} format="pourcent" hausseEstBonne />
          {/* « Cohortes : 7 » décrivait la donnée, pas le commerce. Le délai
              avant la deuxième commande dit QUAND relancer — c'est un chiffre
              sur lequel on peut agir dès demain. */}
          <Scorecard label="Délai avant la 2e commande" portee="personnes"
            definition="Médiane du nombre de jours entre la première et la deuxième commande livrée. C'est la fenêtre où une relance a encore un sens."
            valeur={personnes?.deuxiemeCommande.effectif ? personnes.deuxiemeCommande.medianeJours : null}
            format="entier" hausseEstBonne={false}
            note={personnes?.deuxiemeCommande.effectif
              ? `jours — médiane sur ${personnes.deuxiemeCommande.effectif} clientes`
              : 'aucune deuxième commande'} />
        </>
      )}
      figure={
        <div className="space-y-5">
          <div>
            <p className={T.label} style={{ color: V.muted }}>Part des clientes qui recommandent, mois après mois</p>
            <div className="mt-3">
              {!cellules ? <Squelette lignes={6} hauteur={20} /> : <TableCohortes cellules={cellules} maxRangs={6} />}
            </div>
          </div>

          {resume && resume.tauxM1 != null && (
            <p className={`${T.body} max-w-[70ch]`} style={{ color: V.ink2 }}>
              {resume.tauxM1 < 15 ? (
                <>
                  <b>Le réachat est le point faible.</b> En moyenne {resume.tauxM1.toFixed(0)} % des clientes
                  reviennent le mois suivant : chaque dirham de publicité sert donc à <i>remplacer</i> une
                  cliente, pas à en ajouter une. À ce niveau, gagner dix points de rétention rapporte
                  davantage que doubler le budget d&apos;acquisition — et coûte moins cher.
                </>
              ) : (
                <>En moyenne {resume.tauxM1.toFixed(0)} % des clientes reviennent le mois suivant.</>
              )}
            </p>
          )}

          <p className={T.note} style={{ color: V.muted }}>
            Lecture : chaque ligne est un mois de première commande. M0 vaut 100 % par construction —
            c&apos;est la cohorte elle-même. La cohorte du mois en cours est affichée mais exclue des
            moyennes : elle n&apos;a pas encore eu l&apos;occasion de revenir.
          </p>
        </div>
      }
      tableau={!personnes ? <Squelette lignes={6} hauteur={16} /> : (
        <Clientes segments={personnes.segments} clientes={personnes.clientes}
          deuxieme={personnes.deuxiemeCommande} />
      )}
    />
  )
}
