/**
 * LA LECTURE D'UN ÉCRAN EN UNE PHRASE — « À retenir ».
 *
 * Des fonctions pures : on leur donne les chiffres déjà calculés, elles rendent le
 * titre et le détail. Aucune requête, aucun gabarit dans les pages. Écrites à part
 * pour pouvoir être testées sur les cas qui trompent : une marge stable, un facteur
 * provisoire, un entonnoir dont la première marche est naturellement la pire.
 */

const nf = (n: number) => Math.round(n).toLocaleString('fr-FR')
const mad = (n: number) => `${nf(n)} MAD`
const signe = (n: number) => `${n >= 0 ? '+' : '−'}${mad(Math.abs(n))}`
const pct = (n: number) => `${n.toFixed(n < 10 && n > -10 ? 1 : 0).replace('.', ',')} %`

export type Lecture = { titre: string; detail?: string }

export type FacteurLecture = { label: string; effet: number; de: string; a: string; provisoire?: string }

/** Seuil sous lequel un écart de marge n'est pas une histoire : 5 % de la période précédente. */
export const SEUIL_MARGE_STABLE = 0.05

/**
 * Vue d'ensemble : pourquoi la marge a bougé.
 *
 * Le facteur désigné est celui qui va dans le SENS de l'écart et pèse le plus ; un
 * facteur provisoire (commandes encore en cours de livraison) n'est jamais désigné
 * responsable : il se résorbera, on le signale à part au lieu de l'accuser.
 */
export function lectureMarge(p: { depart: number; arrivee: number; facteurs: FacteurLecture[] }): Lecture | null {
  const { depart, arrivee, facteurs } = p
  if (!Number.isFinite(depart) || !Number.isFinite(arrivee)) return null
  if (depart === 0 && arrivee === 0) return null
  const delta = arrivee - depart
  const variation = depart !== 0 ? (delta / Math.abs(depart)) * 100 : null

  if (depart !== 0 && Math.abs(delta) < Math.abs(depart) * SEUIL_MARGE_STABLE) {
    return { titre: `La marge est stable : ${mad(depart)} → ${mad(arrivee)}.` }
  }

  const verbe = delta >= 0 ? 'progresse' : 'recule'
  const titre = `La marge ${verbe} de ${mad(Math.abs(delta))}${variation != null ? ` (${variation >= 0 ? '+' : '−'}${pct(Math.abs(variation))})` : ''} : ${mad(depart)} → ${mad(arrivee)}.`

  const fermes = facteurs.filter((f) => !f.provisoire)
  const dansLeSens = fermes.filter((f) => Math.sign(f.effet) === Math.sign(delta))
  const pool = dansLeSens.length > 0 ? dansLeSens : fermes
  const principal = [...pool].sort((a, b) => Math.abs(b.effet) - Math.abs(a.effet))[0]

  const morceaux: string[] = []
  if (principal) morceaux.push(`Premier facteur : ${principal.label.toLowerCase()} (${signe(principal.effet)}), ${principal.de} → ${principal.a}.`)
  const provisoire = facteurs.find((f) => f.provisoire)
  if (provisoire) morceaux.push(`${provisoire.label} est provisoire : ${provisoire.provisoire}.`)
  return { titre, detail: morceaux.join(' ') || undefined }
}

export type EtapeLecture = { label: string; sessions: number }

/**
 * Conversion : la réponse avant les barres.
 *
 * La première marche (fiche produit → panier) est TOUJOURS la plus grosse perte en
 * pourcentage : on regarde des fiches par curiosité, pas pour acheter. La désigner
 * seule ne dit rien d'actionnable. On donne donc aussi la pire marche APRÈS la
 * création du panier, où une perte est un vrai abandon.
 */
export function lectureConversion(etapes: EtapeLecture[]): Lecture | null {
  if (etapes.length < 2) return null
  const premiere = etapes[0], derniere = etapes[etapes.length - 1]
  if (!(premiere.sessions > 0)) return null

  const taux = (i: number) => (etapes[i - 1].sessions > 0 ? (etapes[i].sessions / etapes[i - 1].sessions) * 100 : 100)
  const pire = (debut: number) => {
    let idx = -1, mini = 101
    for (let i = debut; i < etapes.length; i++) { const t = taux(i); if (t < mini) { mini = t; idx = i } }
    return idx < 0 ? null : { i: idx, perte: 100 - mini }
  }

  const conv = (derniere.sessions / premiere.sessions) * 100
  const titre = `${nf(derniere.sessions)} session${derniere.sessions > 1 ? 's' : ''} sur ${nf(premiere.sessions)} vont jusqu'à « ${derniere.label} » (${pct(conv)}).`

  const globale = pire(1)
  const apresPanier = etapes.length >= 4 ? pire(2) : null
  const marche = (x: { i: number; perte: number }) =>
    `${etapes[x.i - 1].label} → ${etapes[x.i].label} (${nf(x.perte)} % s'arrêtent)`
  const morceaux: string[] = []
  if (globale) morceaux.push(`Plus grosse perte : ${marche(globale)}.`)
  if (apresPanier && globale && apresPanier.i !== globale.i) {
    morceaux.push(`Une fois le parcours engagé, c'est ${marche(apresPanier)} : c'est là qu'une visiteuse décidée s'en va.`)
  }
  return { titre, detail: morceaux.join(' ') || undefined }
}
