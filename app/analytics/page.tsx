'use client'

/**
 * VUE D'ENSEMBLE — le premier module bâti sur le modèle sémantique.
 *
 * Il ne contient AUCUN SQL et aucune définition : il demande des mesures au
 * modèle et met en forme ce qui revient. C'est tout l'intérêt — la même mesure
 * demandée ici et dans un autre module renvoie forcément le même nombre, et une
 * définition corrigée l'est partout d'un coup.
 *
 * Structure : la séquence GA4, identique dans les huit modules —
 *   contrôles → scorecards → figure → tableau de dimension.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { V } from './_components/Viz'
import { T } from './_components/Decision'
import { ReportShell, Scorecard, DimensionTable, Squelette, ErreurChargement, type ColonneMesure, type LigneTable } from './_components/Report'
import { BarreControle } from './_components/Controls'
import { useReport, interroger } from './_components/useReport'
import { Cascade, type FacteurVue } from './_components/Decision'

type Reponse = Awaited<ReturnType<typeof interroger>>

/** Les mesures de tête : ce que la période a produit, et ce qu'elle a laissé. */
const MESURES_TETE = ['commandes', 'livrees', 'caLivre', 'marge'] as const
const MESURES_TETE_LIVRAISON = ['livrees', 'caLivre', 'marge', 'margeParCommande'] as const
/** Les colonnes du tableau par canal. */
const MESURES_TABLE = ['commandes', 'livrees', 'tauxLivraison', 'caLivre', 'marge', 'margeParCommande'] as const
const MESURES_TABLE_LIVRAISON = ['livrees', 'caLivre', 'marge', 'margeParCommande'] as const

const DIMENSIONS_PROPOSEES = [
  { cle: 'canal', label: "Canal d'acquisition" },
  { cle: 'ville', label: 'Ville' },
  { cle: 'appareil', label: 'Appareil' },
  { cle: 'statut', label: 'Statut de commande' },
  { cle: 'jour', label: 'Jour' },
]

export default function VueEnsemble() {
  const { etat, maj, setJours, setPeriode, setFiltre, periodePersonnalisee } = useReport()
  const [dimension, setDimension] = useState('canal')
  const [tete, setTete] = useState<Reponse | null>(null)
  const [table, setTable] = useState<Reponse | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const mesuresTete = etat.basis === 'cash' ? MESURES_TETE_LIVRAISON : MESURES_TETE
  const mesuresTable = etat.basis === 'cash' ? MESURES_TABLE_LIVRAISON : MESURES_TABLE

  const base = useMemo(() => ({
    periode: etat.periode,
    comparaison: etat.comparaison ?? undefined,
    basis: etat.basis,
    filtres: etat.filtres,
  }), [etat])

  useEffect(() => {
    let vivant = true
    Promise.all([
      interroger({ ...base, mesures: [...mesuresTete] }),
      interroger({ ...base, dimension, mesures: [...mesuresTable], limite: 100 }),
    ])
      .then(([t, d]) => { if (vivant) { setTete(t); setTable(d); setErreur(null) } })
      .catch((e) => { if (vivant) setErreur(e instanceof Error ? e.message : 'Erreur') })
    return () => { vivant = false }
  }, [base, dimension, mesuresTete, mesuresTable])

  const total = tete?.lignes[0]?.mesures
  const val = (c: string) => total?.[c]?.valeur ?? null
  const prec = (c: string) => total?.[c]?.precedent ?? null

  // ── D'OÙ VIENT L'ÉCART ───────────────────────────────────────────────────
  // « La marge a bougé de X » ne dit rien. Nommer le facteur, en dirhams, désigne
  // l'endroit où agir. La somme des effets reconstitue exactement l'écart.
  const cascade = useMemo((): { depart: number; arrivee: number; facteurs: FacteurVue[] } | null => {
    if (!etat.comparaison || !total || etat.basis === 'cash') return null
    const courant = (c: string) => total[c]?.valeur ?? 0
    const precedent = (c: string) => total[c]?.precedent ?? 0
    const C1 = courant('commandes'), C0 = precedent('commandes')
    const L1 = C1 > 0 ? courant('livrees') / C1 : 0
    const L0 = C0 > 0 ? precedent('livrees') / C0 : 0
    const liv1 = courant('livrees'), liv0 = precedent('livrees')
    const M1 = liv1 > 0 ? courant('marge') / liv1 : 0
    const M0 = liv0 > 0 ? precedent('marge') / liv0 : 0
    if (C0 === 0 || liv0 === 0) return null
    const nf = (n: number) => Math.round(n).toLocaleString('fr-FR')
    const pc = (n: number) => `${(n * 100).toFixed(1).replace('.', ',')} %`
    return {
      depart: C0 * L0 * M0,
      arrivee: C1 * L1 * M1,
      facteurs: [
        { label: 'Volume de commandes', effet: (C1 - C0) * L0 * M0, de: `${nf(C0)} cmd`, a: `${nf(C1)} cmd` },
        { label: 'Taux de livraison', effet: C1 * (L1 - L0) * M0, de: pc(L0), a: pc(L1) },
        { label: 'Marge par commande', effet: C1 * L1 * (M1 - M0), de: `${nf(M0)} MAD`, a: `${nf(M1)} MAD` },
      ],
    }
  }, [total, etat.comparaison, etat.basis])

  const colonnes: ColonneMesure[] = useMemo(
    () => (table?.modele.mesures ?? []).map((m) => ({
      cle: m.cle, label: m.label, definition: m.definition,
      format: m.format, portee: m.portee, hausseEstBonne: m.hausseEstBonne,
      derivee: (m as { derivee?: boolean }).derivee,
    })),
    [table]
  )

  return (
    <ReportShell
        titre="Vue d'ensemble"
        sous="Ce que la période a produit, et ce qui explique l'écart avec la précédente."
        controles={
          <BarreControle etat={etat} maj={maj} setJours={setJours} setPeriode={setPeriode}
            setFiltre={setFiltre} periodePersonnalisee={periodePersonnalisee}
            segments={{ appareil: ['mobile', 'desktop'], langue: ['fr', 'ar'] }} />
        }
        enTete={erreur ? <ErreurChargement message={erreur} /> : null}
        scorecards={!tete ? (
          // Un squelette garde la place : la page ne saute pas quand les
          // chiffres arrivent, et l'œil sait déjà où ils vont apparaître.
          mesuresTete.map((c) => <div key={c}><Squelette lignes={2} hauteur={12} /></div>)
        ) : (tete.modele.mesures.map((m) => (
          <Scorecard
            key={m.cle}
            label={m.label} definition={m.definition} portee={m.portee}
            valeur={val(m.cle)} precedent={prec(m.cle)}
            format={m.format} hausseEstBonne={m.hausseEstBonne}
          />
        )))}
        figure={tete && (
          <div className="space-y-6">
            {cascade && (
              <div>
                <p className={T.label} style={{ color: V.muted }}>D&apos;où vient l&apos;écart avec la période précédente</p>
                <div className="mt-3">
                  <Cascade
                    depart={cascade.depart} arrivee={cascade.arrivee} facteurs={cascade.facteurs}
                    labelDepart="Marge période précédente" labelArrivee="Marge période courante"
                  />
                </div>
                <p className={`${T.note} mt-2`} style={{ color: V.muted }}>
                  La somme des trois effets reconstitue exactement l&apos;écart. La publicité n&apos;y figure pas :
                  elle est traitée dans <Link href="/analytics/acquisition" className="underline">Acquisition</Link>.
                </p>
              </div>
            )}
          </div>
        )}
        tableau={!table ? <Squelette lignes={6} hauteur={16} /> : (
          <DimensionTable
            lignes={table.lignes as LigneTable[]}
            colonnes={colonnes}
            labelDimension={table.modele.dimension?.label ?? 'Dimension'}
            dimensions={DIMENSIONS_PROPOSEES}
            onDimension={setDimension}
            comparaison={!!etat.comparaison}
            lignesParPage={10}
          />
        )}
      />
  )
}
