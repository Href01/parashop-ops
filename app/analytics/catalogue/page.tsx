'use client'

import { GroupeVues } from '../_components/GroupeVues'
import Produits from '../_vues/Produits'
import Recherche from '../_vues/Recherche'

/** « Ce qu'elles voient et ce qu'elles cherchent » : les produits du rayon au panier, et la recherche du site. */
export default function Catalogue() {
  return (
    <GroupeVues vues={[
      { cle: 'produits', label: 'Produits', Composant: Produits },
      { cle: 'recherche', label: 'Recherche', Composant: Recherche },
    ]} />
  )
}
