'use client'

/**
 * QUALITÉ — ce qui est cassé, et ce que ça coûte.
 *
 * Un module que le tableau de bord n'avait pas, alors que c'est le seul endroit
 * où un bouton défectueux peut se signaler tout seul. Le crash du panier a été
 * découvert par une cliente ; le clic de rage l'aurait fait remonter ici.
 *
 * La friction la plus chère est en bas du parcours : une commande REJETÉE au
 * dernier pas. La cliente avait tout rempli, choisi sa ville, saisi son
 * numéro — et le site a dit non. Mesuré sur l'historique : 13 sessions
 * bloquées, dont 20 fois parce que le prix avait changé pendant la visite.
 */

import { useEffect, useMemo, useState } from 'react'
import { V } from '../_components/Viz'
import { T } from '../_components/Decision'
import { ReportShell, Scorecard, DimensionTable, Squelette, ErreurChargement, type ColonneMesure, type LigneTable } from '../_components/Report'
import { BarreControle } from '../_components/Controls'
import { useReport, interroger } from '../_components/useReport'

type Reponse = Awaited<ReturnType<typeof interroger>>
const MESURES = ['erreurs', 'commandesRefusees', 'clicsRage', 'clicsMorts'] as const

export default function Qualite() {
  const { etat, maj, setJours, setPeriode, setFiltre, periodePersonnalisee } = useReport()
  const [dimension, setDimension] = useState('page')
  const [table, setTable] = useState<Reponse | null>(null)
  const [total, setTotal] = useState<Reponse | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const base = useMemo(() => ({
    periode: etat.periode, comparaison: etat.comparaison ?? undefined,
    filtres: etat.filtres,
  }), [etat])

  useEffect(() => {
    let vivant = true
    Promise.all([
      interroger({ ...base, dimension, mesures: [...MESURES], limite: 100 }),
      interroger({ ...base, mesures: [...MESURES] }),
    ])
      .then(([t, g]) => { if (vivant) { setTable(t); setTotal(g); setErreur(null) } })
      .catch((e) => vivant && setErreur(e instanceof Error ? e.message : 'Erreur'))
    return () => { vivant = false }
  }, [base, dimension])

  const m = total?.lignes[0]?.mesures
  const rage = m?.clicsRage?.valeur ?? 0
  const morts = m?.clicsMorts?.valeur ?? 0
  const refus = m?.commandesRefusees?.valeur ?? 0

  const colonnes: ColonneMesure[] = useMemo(
    () => (table?.modele.mesures ?? []).map((x) => ({
      cle: x.cle, label: x.label, definition: x.definition, format: x.format,
      portee: x.portee, hausseEstBonne: x.hausseEstBonne,
      derivee: (x as { derivee?: boolean }).derivee,
    })), [table])

  return (
    <ReportShell
      titre="Qualité"
      sous="Erreurs observées et signaux de friction à vérifier."
      controles={<BarreControle etat={etat} maj={maj} setJours={setJours} setPeriode={setPeriode}
        setFiltre={setFiltre} periodePersonnalisee={periodePersonnalisee} afficherBase={false} />}
      enTete={erreur ? <ErreurChargement message={erreur} /> : null}
      scorecards={!total ? ([0, 1, 2, 3].map((i) => <div key={i}><Squelette lignes={2} hauteur={12} /></div>)) : (
        <>
          <Scorecard label="Frictions" portee="événements"
            definition="Erreurs observées et signaux à vérifier : commande rejetée, validation refusée, code promo rejeté, recherche sans résultat, échec du code SMS, clics répétés ou réponse non détectée."
            valeur={m?.erreurs?.valeur ?? null} precedent={m?.erreurs?.precedent} format="entier" hausseEstBonne={false} />
          <Scorecard label="Commandes rejetées" portee="événements"
            definition="Refusées par le site au dernier pas — la cliente avait tout rempli."
            valeur={refus} precedent={m?.commandesRefusees?.precedent} format="entier" hausseEstBonne={false}
            note={refus > 0 ? 'la perte la plus chère du parcours' : undefined} />
          <Scorecard label="Clics répétés" portee="événements"
            definition="Clics rapprochés sur le même élément : friction possible à vérifier, pas une panne confirmée."
            valeur={rage} precedent={m?.clicsRage?.precedent} format="entier" hausseEstBonne={false} />
          <Scorecard label="Réponses non détectées" portee="événements"
            definition="Clics sans réponse observée par le détecteur. Signal à vérifier : les anciens événements peuvent inclure des fenêtres ouvertes hors de la carte."
            valeur={morts} precedent={m?.clicsMorts?.precedent} format="entier" hausseEstBonne={false} />
        </>
      )}
      figure={total && (
        <div className="rounded-xl p-4" style={{ border: `1px solid ${V.grid}` }}>
          <p className={T.label} style={{ color: V.muted }}>Comment lire ce module</p>
          <p className={`${T.body} mt-2 max-w-[72ch]`} style={{ color: V.ink2 }}>
            {rage + morts === 0 ? (
              <>
                Aucun clic répété ni réponse non détectée enregistré sur la période.
                Cela ne garantit pas l&apos;absence de problème : le détecteur ne voit pas toutes les réponses.
              </>
            ) : (
              <>
                <b>{rage} signal{rage > 1 ? 's' : ''} de clics répétés</b> et <b>{morts} réponse{morts > 1 ? 's' : ''} non détectée{morts > 1 ? 's' : ''}</b> sur
                la période. Le tableau ci-dessous indique les pages concernées.
                Ces signaux ne prouvent ni une panne ni la cause d&apos;un départ.
              </>
            )}
          </p>
          <p className={`${T.note} mt-2`} style={{ color: V.muted }}>
            Vérifiez le parcours avant de conclure. Les anciens clics peuvent être des faux positifs
            liés aux fenêtres ouvertes hors de la carte ; les erreurs de commande sont des échecs observés.
          </p>
        </div>
      )}
      tableau={!table ? <Squelette lignes={6} hauteur={16} /> : (
        <DimensionTable lignes={table.lignes as LigneTable[]} colonnes={colonnes}
          labelDimension={table.modele.dimension?.label ?? 'Dimension'}
          dimensions={[
            { cle: 'page', label: 'Page' },
            { cle: 'appareil', label: 'Appareil' },
            { cle: 'gammeAppareil', label: "Gamme d'appareil" },
            { cle: 'modeleAppareil', label: 'Modèle' },
            { cle: 'langue', label: 'Langue' },
            { cle: 'jour', label: 'Jour' },
          ]}
          onDimension={setDimension} comparaison={!!etat.comparaison} lignesParPage={12}
          vide="Aucune friction enregistrée sur la période." />
      )}
    />
  )
}
