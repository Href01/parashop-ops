/**
 * L'ÉCART ENTRE DEUX PÉRIODES — et le moment où un pourcentage cesse d'être lisible.
 *
 * Sur Engagement, la comparaison affichait « ▲ 4 863 % », « ▲ 5 200 % », « ▲ 15 475 % »
 * (pages, clics, lectures). Ce n'est pas de la croissance : la période précédente
 * n'avait presque pas d'événements de défilement ni de durée (ils n'étaient pas
 * encore émis), donc on divisait par presque rien. Un pourcentage à quatre chiffres
 * ne se lit pas, et il fait passer une différence de MESURE pour une différence de
 * RÉSULTAT.
 *
 * Au-delà de ×11 on montre le RAPPORT (« × 49 »), en gris, avec l'explication au
 * survol. Le chiffre reste vrai, il cesse seulement de se présenter comme un bilan.
 */

export const SEUIL_ECART_EXTREME_PCT = 1000

export type EcartCalcule = {
  /** Variation en %, signée. */
  pct: number
  monte: boolean
  /** « ▲ 12 % » ou, au-delà du seuil, « × 49 ». */
  texte: string
  /** Vrai quand le pourcentage n'est plus un bilan : à afficher sans couleur de verdict. */
  extreme: boolean
  /** Explication à poser en infobulle quand `extreme`. */
  explication?: string
}

export function calculerEcart(courant: number | null | undefined, precedent: number | null | undefined): EcartCalcule | null {
  if (courant == null || precedent == null || precedent === 0) return null
  const pct = ((courant - precedent) / Math.abs(precedent)) * 100
  if (!Number.isFinite(pct)) return null
  const monte = pct >= 0
  if (Math.abs(pct) >= SEUIL_ECART_EXTREME_PCT) {
    const rapport = courant / precedent
    const r = Math.abs(rapport) < 100 ? Math.abs(rapport).toFixed(0) : Math.round(Math.abs(rapport)).toLocaleString('fr-FR')
    return {
      pct, monte, extreme: true,
      texte: `× ${r}`,
      explication:
        `Période précédente : ${Math.round(precedent).toLocaleString('fr-FR')}. À cet écart, la période précédente était trop petite ` +
        `ou mesurée autrement (événements ajoutés depuis) : le rapport est exact, mais ce n'est pas une croissance.`,
    }
  }
  return { pct, monte, extreme: false, texte: `${monte ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)} %` }
}
