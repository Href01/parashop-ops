'use client'

import { GroupeVues } from '../_components/GroupeVues'
import Conversion from '../_vues/Conversion'
import Engagement from '../_vues/Engagement'
import Qualite from '../_vues/Qualite'

/** « Où le parcours décroche » : l'entonnoir, ce que font les visiteuses page par page, et ce qui les bloque. */
export default function Parcours() {
  return (
    <GroupeVues vues={[
      { cle: 'conversion', label: 'Conversion', Composant: Conversion },
      { cle: 'engagement', label: 'Engagement', Composant: Engagement },
      { cle: 'qualite', label: 'Qualité', Composant: Qualite },
    ]} />
  )
}
