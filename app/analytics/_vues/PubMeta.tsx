'use client'

import { ReportShell } from '../_components/Report'
import { BarreControle } from '../_components/Controls'
import { Emplacements } from '../_components/Emplacements'
import { useReport } from '../_components/useReport'

/** Meta : visites, conversion et profit par emplacement — la vue qui vivait cachée dans l'onglet Sessions. */
export default function PubMeta() {
  const { etat, maj, setJours, setPeriode, setFiltre, periodePersonnalisee } = useReport()
  return (
    <ReportShell
      titre="Meta"
      sous="Ce que chaque emplacement Meta coûte, amène en visites, et rapporte une fois les commandes livrées."
      controles={(
        <BarreControle etat={etat} maj={maj} setJours={setJours} setPeriode={setPeriode}
          setFiltre={setFiltre} periodePersonnalisee={periodePersonnalisee} afficherBase={false} />
      )}
      figure={<Emplacements debut={etat.periode.debut} fin={etat.periode.fin} auto={false} />}
    />
  )
}
