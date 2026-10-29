/**
 * SUGGÉRER LA ZONE SENDIT D'UNE COMMANDE À PARTIR DE LA VILLE SAISIE.
 *
 * Une commande du site peut arriver sans zone Sendit : la cliente a écrit « Sale » ou
 * « Casablanca » au lieu de choisir le quartier. Sendit exige la zone exacte pour créer le colis,
 * et la page de commande n'offrait aucun moyen de la choisir.
 *
 * On ne devine pas à la place de l'équipe : on PROPOSE. Un nom de zone qui correspond au texte
 * saisi devient une suggestion ; si trop de zones correspondent (« Casablanca » en a des dizaines),
 * on n'en propose AUCUNE et on le dit, plutôt que d'afficher cinq quartiers au hasard.
 *
 * Comparaison sans accents ni casse (« Salé » = « sale » : l'écart d'accent est déjà une cause
 * connue de zones non reconnues).
 */

export type Zone = { id: number; ville: string; name: string; arabic_name?: string | null; price?: number; delais?: string }

/** Au-delà, la ville est trop générale pour qu'une suggestion ait un sens. */
export const MAX_SUGGESTIONS = 6

export const normaliser = (v: string) =>
  v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ').trim()

/**
 * Vrai si `mots` figure dans `texte` comme MOT ENTIER. Une simple inclusion rangeait la ville
 * « Autre » (valeur par défaut d'un formulaire) sous « Casablanca - Autres quartiers » : le
 * premier test sur les 517 zones réelles l'a montré, pas les cas écrits à la main.
 */
const contientMot = (texte: string, mots: string) => ` ${texte} `.includes(` ${mots} `)

export type Suggestions<T extends Zone = Zone> =
  | { type: 'aucune' }
  | { type: 'trop-large'; total: number }
  | { type: 'propositions'; zones: T[] }

/** Generique : l'appelant retrouve SON type de zone (celui du selecteur), sans conversion. */
export function suggererZones<T extends Zone>(villeSaisie: string | null | undefined, zones: readonly T[]): Suggestions<T> {
  const q = normaliser(villeSaisie ?? '')
  if (q.length < 3) return { type: 'aucune' }

  const exactes = zones.filter((z) => normaliser(z.name) === q)
  const proches = zones.filter((z) => {
    const n = normaliser(z.name)
    return n !== q && (contientMot(n, q) || (n.length >= 4 && contientMot(q, n)))
  })
  // Une correspondance EXACTE d'abord ; sinon les noms qui contiennent le texte saisi.
  const retenues = exactes.length > 0 ? exactes : proches
  if (retenues.length === 0) return { type: 'aucune' }
  if (retenues.length > MAX_SUGGESTIONS) return { type: 'trop-large', total: retenues.length }
  return { type: 'propositions', zones: [...retenues].sort((a, b) => a.name.localeCompare(b.name, 'fr')) }
}
