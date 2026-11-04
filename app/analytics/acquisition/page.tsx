'use client'

import { GroupeVues } from '../_components/GroupeVues'
import AcquisitionResultat from '../_vues/AcquisitionResultat'
import VueEnsemble from '../_vues/VueEnsemble'
import PubMeta from '../_vues/PubMeta'
import PubGoogle from '../_vues/PubGoogle'

/** « Ce que rapporte la pub » : le résultat par canal, la marge et son écart, puis Meta et Google en détail. */
export default function Acquisition() {
  return (
    <GroupeVues vues={[
      { cle: 'resultat', label: 'Résultat par canal', Composant: AcquisitionResultat },
      { cle: 'marge', label: 'Marge & écart', Composant: VueEnsemble },
      { cle: 'meta', label: 'Meta', Composant: PubMeta },
      { cle: 'google', label: 'Google Ads', Composant: PubGoogle },
    ]} />
  )
}
