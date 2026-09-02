'use client'

/**
 * ENGAGEMENT — ce que les visiteuses font sur le site.
 *
 * Orienté par PAGE, façon Hotjar, et non par métrique : on choisit une page et
 * on voit ce qui s'y passe — la lecture atteinte, les clics, ce qui vient après.
 * C'est l'orientation qui manquait : savoir que « 295 sessions ont scrollé »
 * n'aide personne ; savoir que la page produit est lue jusqu'au bout par 38 %
 * des visiteuses, si.
 *
 * L'exploration de chemin répond à la question que le tableau ne sait pas poser :
 * après cette page, où vont-elles ? Une trouvaille immédiate — `/checkout → /`
 * apparaît neuf fois : des clientes quittent le paiement pour revenir à l'accueil.
 */

import { useEffect, useMemo, useState } from 'react'
import { V } from '../_components/Viz'
import { T } from '../_components/Decision'
import { ReportShell, Scorecard, DimensionTable, Squelette, ErreurChargement, type ColonneMesure, type LigneTable } from '../_components/Report'
import { BarreControle } from '../_components/Controls'
import { useReport, interroger } from '../_components/useReport'
import { Chemins, type PasChemin } from '../_components/Charts'

type Reponse = Awaited<ReturnType<typeof interroger>>
const MESURES = ['pagesVues', 'clics', 'lectureDebut', 'lectureFin', 'tauxLecture'] as const

export default function Engagement() {
  const { etat, maj, setJours, setPeriode, setFiltre, periodePersonnalisee } = useReport()
  const [dimension, setDimension] = useState('page')
  const [depart, setDepart] = useState<string | null>(null)
  const [table, setTable] = useState<Reponse | null>(null)
  const [total, setTotal] = useState<Reponse | null>(null)
  const [pas, setPas] = useState<PasChemin[] | null>(null)
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

  useEffect(() => {
    let vivant = true
    setPas(null)
    fetch('/api/ops/analytics/analyses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'chemins', periode: etat.periode, depart }),
    })
      .then((r) => r.json())
      // Ne jamais avaler l'erreur : sans ça, le squelette reste affiché
      // indéfiniment et on croit que la page charge encore.
      .then((j) => {
        if (!vivant) return
        if (j.error) { setErreur(j.error); setPas([]) } else setPas(j.chemins)
      })
      .catch((e) => { if (vivant) { setErreur(e instanceof Error ? e.message : 'Chemins indisponibles'); setPas([]) } })
    return () => { vivant = false }
  }, [etat.periode, depart])

  const m = total?.lignes[0]?.mesures

  const colonnes: ColonneMesure[] = useMemo(
    () => (table?.modele.mesures ?? []).map((x) => ({
      cle: x.cle, label: x.label, definition: x.definition, format: x.format,
      portee: x.portee, hausseEstBonne: x.hausseEstBonne,
      derivee: (x as { derivee?: boolean }).derivee,
    })), [table])

  return (
    <ReportShell
      titre="Engagement"
      sous="Ce que les visiteuses font sur le site — page par page, et ce qui vient après."
      controles={<BarreControle etat={etat} maj={maj} setJours={setJours} setPeriode={setPeriode}
        setFiltre={setFiltre} periodePersonnalisee={periodePersonnalisee} afficherBase={false} />}
      enTete={erreur ? <ErreurChargement message={erreur} /> : null}
      scorecards={!total ? ([0, 1, 2, 3].map((i) => <div key={i}><Squelette lignes={2} hauteur={12} /></div>)) : (
        <>
          <Scorecard label="Pages vues" portee="événements"
            definition="Nombre total de pages affichées, robots écartés."
            valeur={m?.pagesVues?.valeur ?? null} precedent={m?.pagesVues?.precedent} format="entier" hausseEstBonne />
          <Scorecard label="Clics" portee="événements"
            definition="Clics sur un élément interactif."
            valeur={m?.clics?.valeur ?? null} precedent={m?.clics?.precedent} format="entier" hausseEstBonne />
          <Scorecard label="Ont commencé à lire" portee="sessions"
            definition="Sessions ayant fait défiler au moins un quart de la page."
            valeur={m?.lectureDebut?.valeur ?? null} precedent={m?.lectureDebut?.precedent} format="entier" hausseEstBonne />
          <Scorecard label="Lu jusqu'au bout" portee="sessions"
            definition="Part de celles qui ont commencé à lire et sont allées jusqu'en bas."
            valeur={m?.tauxLecture?.valeur ?? null} format="pourcent" hausseEstBonne />
        </>
      )}
      figure={
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={T.label} style={{ color: V.muted }}>
              {depart ? `Après ${depart}, où vont-elles ?` : 'Les enchaînements les plus fréquents'}
            </p>
            {depart && (
              <button onClick={() => setDepart(null)} className="text-[11px] font-semibold underline" style={{ color: V.muted }}>
                repartir de toutes les pages
              </button>
            )}
          </div>
          <p className={`${T.note} mb-3`} style={{ color: V.muted }}>
            Cliquez une destination pour la prendre comme nouveau point de départ.
          </p>
          {!pas ? <Squelette lignes={5} hauteur={14} /> : <Chemins pas={pas} onDepart={setDepart} />}
        </div>
      }
      tableau={!table ? <Squelette lignes={6} hauteur={16} /> : (
        <DimensionTable lignes={table.lignes as LigneTable[]} colonnes={colonnes}
          labelDimension={table.modele.dimension?.label ?? 'Dimension'}
          dimensions={[
            { cle: 'page', label: 'Page' },
            { cle: 'appareil', label: 'Appareil' },
            { cle: 'gammeAppareil', label: "Gamme d'appareil" },
            { cle: 'modeleAppareil', label: 'Modèle' },
            { cle: 'langue', label: 'Langue' },
            { cle: 'ville', label: 'Ville' },
            { cle: 'jour', label: 'Jour' },
          ]}
          onDimension={setDimension} comparaison={!!etat.comparaison} lignesParPage={12} />
      )}
    />
  )
}
