'use client'

/**
 * PRODUITS — l'entonnoir de marchandisage.
 *
 * Il sépare deux maladies opposées que le chiffre d'affaires seul confond :
 *
 *   vu en rayon mais jamais cliqué  → le visuel ou le prix n'accroche pas ;
 *   cliqué mais jamais ajouté       → la fiche produit ne convainc pas.
 *
 * Le remède n'est pas le même — refaire une photo, ou réécrire une page. Sans
 * cette distinction on ne sait pas lequel appliquer, et 20 380 impressions
 * dormaient dans la base sans que rien ne les lise.
 */

import { useEffect, useMemo, useState } from 'react'
import { V } from '../_components/Viz'
import { T } from '../_components/Decision'
import { ReportShell, Scorecard, DimensionTable, Squelette, type ColonneMesure, type LigneTable } from '../_components/Report'
import { BarreControle } from '../_components/Controls'
import { useReport, interroger } from '../_components/useReport'

type Reponse = Awaited<ReturnType<typeof interroger>>
const MESURES = ['impressions', 'clicsRayon', 'ctrRayon', 'vuesProduit', 'ajoutsPanier', 'tauxAjout'] as const

export default function Produits() {
  const { etat, maj, setJours, setPeriode, setFiltre, periodePersonnalisee } = useReport()
  const [dimension, setDimension] = useState('produit')
  const [table, setTable] = useState<Reponse | null>(null)
  const [total, setTotal] = useState<Reponse | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const base = useMemo(() => ({
    periode: etat.periode, comparaison: etat.comparaison ?? undefined,
    basis: etat.basis, filtres: etat.filtres,
  }), [etat])

  useEffect(() => {
    let vivant = true
    setTable(null)
    Promise.all([
      interroger({ ...base, dimension, mesures: [...MESURES], limite: 200 }),
      interroger({ ...base, mesures: [...MESURES] }),
    ])
      .then(([t, g]) => { if (vivant) { setTable(t); setTotal(g); setErreur(null) } })
      .catch((e) => vivant && setErreur(e instanceof Error ? e.message : 'Erreur'))
    return () => { vivant = false }
  }, [base, dimension])

  const m = total?.lignes[0]?.mesures

  // Les deux diagnostics opposés, chacun avec son remède. Le seuil d'affichage
  // est explicite : on ne classe pas un produit sur trois impressions.
  const diagnostics = useMemo(() => {
    if (!table || dimension !== 'produit') return null
    const assez = table.lignes.filter((l) => (l.mesures.impressions?.valeur ?? 0) >= 200)
    const ctr = (l: LigneTable) => {
      const i = l.mesures.impressions?.valeur ?? 0
      return i > 0 ? ((l.mesures.clicsRayon?.valeur ?? 0) / i) * 100 : 0
    }
    const ajout = (l: LigneTable) => {
      const v = l.mesures.vuesProduit?.valeur ?? 0
      return v > 0 ? ((l.mesures.ajoutsPanier?.valeur ?? 0) / v) * 100 : 0
    }
    return {
      vusPasClique: [...assez].sort((a, b) => ctr(a) - ctr(b)).slice(0, 3),
      cliquePasAjoute: [...assez]
        .filter((l) => (l.mesures.vuesProduit?.valeur ?? 0) >= 20)
        .sort((a, b) => ajout(a) - ajout(b)).slice(0, 3),
      ctr, ajout,
    }
  }, [table, dimension])

  const colonnes: ColonneMesure[] = useMemo(
    () => (table?.modele.mesures ?? []).map((x) => ({
      cle: x.cle, label: x.label, definition: x.definition, format: x.format,
      portee: x.portee, hausseEstBonne: x.hausseEstBonne,
      derivee: (x as { derivee?: boolean }).derivee,
    })), [table])

  return (
    <ReportShell
      titre="Produits"
      sous="De l'affichage en rayon jusqu'au panier — pour savoir quoi refaire, et de quel côté."
      controles={<BarreControle etat={etat} maj={maj} setJours={setJours} setPeriode={setPeriode}
        setFiltre={setFiltre} periodePersonnalisee={periodePersonnalisee} />}
      enTete={erreur ? <p className="text-[13px] py-3" style={{ color: V.critical }}>Erreur : {erreur}</p> : null}
      scorecards={!total ? ([0, 1, 2, 3].map((i) => <div key={i}><Squelette lignes={2} hauteur={12} /></div>)) : (
        <>
          <Scorecard label="Impressions en rayon" portee="événements"
            definition="Nombre de fois qu'un produit est apparu dans une étagère."
            valeur={m?.impressions?.valeur ?? null} precedent={m?.impressions?.precedent} format="entier" hausseEstBonne />
          <Scorecard label="Clics / impressions" portee="événements"
            definition="Part des affichages qui déclenchent un clic. Mesure l'attrait du visuel et du prix."
            valeur={m?.ctrRayon?.valeur ?? null} format="pourcent" hausseEstBonne />
          <Scorecard label="Fiches produit vues" portee="événements"
            definition="Ouvertures d'une fiche produit, toutes provenances."
            valeur={m?.vuesProduit?.valeur ?? null} precedent={m?.vuesProduit?.precedent} format="entier" hausseEstBonne />
          <Scorecard label="Fiche → panier" portee="événements"
            definition="Part des fiches vues qui finissent au panier. Mesure la force de la page produit."
            valeur={m?.tauxAjout?.valeur ?? null} format="pourcent" hausseEstBonne />
        </>
      )}
      figure={diagnostics && (
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <p className={T.label} style={{ color: V.critical }}>Vus en rayon, jamais cliqués</p>
            <p className={`${T.note} mb-2`} style={{ color: V.muted }}>
              Le visuel ou le prix n&apos;accroche pas. Au moins 200 affichages.
            </p>
            {diagnostics.vusPasClique.map((l) => (
              <div key={l.cle} className="flex items-baseline justify-between gap-3 py-1 border-t" style={{ borderColor: V.grid }}>
                <span className="text-[12px] truncate" style={{ color: V.ink }} title={l.cle}>{l.cle}</span>
                <span className="text-[12px] tabular-nums whitespace-nowrap" style={{ color: V.ink2 }}>
                  {diagnostics.ctr(l).toFixed(2).replace('.', ',')} % · {Math.round(l.mesures.impressions?.valeur ?? 0)} vues
                </span>
              </div>
            ))}
          </div>
          <div>
            <p className={T.label} style={{ color: V.warning }}>Cliqués, jamais ajoutés</p>
            <p className={`${T.note} mb-2`} style={{ color: V.muted }}>
              La fiche produit ne convainc pas. Au moins 20 fiches vues.
            </p>
            {diagnostics.cliquePasAjoute.map((l) => (
              <div key={l.cle} className="flex items-baseline justify-between gap-3 py-1 border-t" style={{ borderColor: V.grid }}>
                <span className="text-[12px] truncate" style={{ color: V.ink }} title={l.cle}>{l.cle}</span>
                <span className="text-[12px] tabular-nums whitespace-nowrap" style={{ color: V.ink2 }}>
                  {diagnostics.ajout(l).toFixed(1).replace('.', ',')} % · {Math.round(l.mesures.vuesProduit?.valeur ?? 0)} fiches
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      tableau={!table ? <Squelette lignes={6} hauteur={16} /> : (
        <DimensionTable lignes={table.lignes as LigneTable[]} colonnes={colonnes}
          labelDimension={table.modele.dimension?.label ?? 'Dimension'}
          dimensions={[
            { cle: 'produit', label: 'Produit' },
            { cle: 'marque', label: 'Marque' },
            { cle: 'categorie', label: 'Catégorie' },
          ]}
          onDimension={setDimension} comparaison={!!etat.comparaison} lignesParPage={12} />
      )}
    />
  )
}
