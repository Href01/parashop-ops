'use client'

import { GroupeVues } from '../_components/GroupeVues'
import Retention from '../_vues/Retention'

/** « Reviennent-elles ? » : les cohortes et les groupes de clientes. */
export default function Clientes() {
  return <GroupeVues vues={[{ cle: 'retention', label: 'Rétention', Composant: Retention }]} />
}
