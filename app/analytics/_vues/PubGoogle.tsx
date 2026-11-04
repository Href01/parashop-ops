'use client'

import { ReportShell } from '../_components/Report'
import { BarreControle } from '../_components/Controls'
import { GoogleAds } from '../_components/GoogleAds'
import { useReport } from '../_components/useReport'

/** Google Ads : visites, conversion et profit par campagne, groupe et mot-clé. */
export default function PubGoogle() {
  const { etat, maj, setJours, setPeriode, setFiltre, periodePersonnalisee } = useReport()
  return (
    <ReportShell
      titre="Google Ads"
      sous="Ce que chaque campagne, groupe et mot-clé coûte, amène en visites, et rapporte."
      controles={(
        <BarreControle etat={etat} maj={maj} setJours={setJours} setPeriode={setPeriode}
          setFiltre={setFiltre} periodePersonnalisee={periodePersonnalisee} afficherBase={false} />
      )}
      figure={<GoogleAds debut={etat.periode.debut} fin={etat.periode.fin} auto={false} />}
    />
  )
}
