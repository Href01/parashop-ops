/**
 * Les regles pures de l'agent SEO, sans base ni serveur : testables seules.
 */
const VIDES = new Set(['de', 'du', 'la', 'le', 'les', 'des', 'et', 'en', 'au', 'pour', 'a', 'un', 'une', 'sur', 'maroc', 'prix', 'pas', 'cher', 'acheter', 'original', 'avis'])
export const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Les mots qui portent le sens d'une requete. « n°3 », « n3 », « no 3 » deviennent « 3 ». */
export function motsPorteurs(requete: string): string[] {
  const t = norm(requete).replace(/\bn\s*[°º.]?\s*(\d+)/g, ' $1 ').replace(/\bno\.?\s+(\d+)/g, ' $1 ')
  return [...new Set(t.split(/[^a-z0-9\u0600-\u06ff&]+/).filter((m) => m && !VIDES.has(m)))]
}

export const domaine = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }


/* ------------------------------------------------------------------ */
/* CHANGEMENTS PRETS A APPLIQUER                                       */
/* ------------------------------------------------------------------ */

/**
 * Les seules modifications que le bouton « Appliquer » sait faire : celles que
 * l'agent recommande le plus souvent, et qu'on peut annuler exactement. Tout le
 * reste (page marque, categorie, article) reste une recommandation a faire a la
 * main — un texte de page n'est pas un champ qu'on remplace sans relire.
 */
export type Changement =
  | { type: 'metaTitle'; produitId: number; valeur: string }
  | { type: 'faq'; produitId: number; questionFR: string; reponseFR: string; questionAR: string; reponseAR: string }

const chaine = (v: unknown, min: number, max: number) =>
  typeof v === 'string' && v.trim().length >= min && v.trim().length <= max ? v.trim() : null

/** Un changement propose par l'agent, verifie champ par champ ; null s'il est incomplet ou d'un type inconnu. */
export function validerChangement(c: unknown): Changement | null {
  if (!c || typeof c !== 'object') return null
  const o = c as Record<string, unknown>
  const produitId = Number(o.produitId)
  if (!Number.isInteger(produitId) || produitId <= 0) return null
  if (o.type === 'metaTitle') {
    const valeur = chaine(o.valeur, 10, 70)
    return valeur ? { type: 'metaTitle', produitId, valeur } : null
  }
  if (o.type === 'faq') {
    const q = chaine(o.questionFR, 5, 200), r = chaine(o.reponseFR, 20, 1500)
    const qa = chaine(o.questionAR, 3, 200), ra = chaine(o.reponseAR, 10, 1500)
    return q && r && qa && ra ? { type: 'faq', produitId, questionFR: q, reponseFR: r, questionAR: qa, reponseAR: ra } : null
  }
  return null
}

/* ------------------------------------------------------------------ */
/* MESURE D'IMPACT                                                     */
/* ------------------------------------------------------------------ */

/** La page qu'une action touche : un produit (par son id) ou un chemin du site. */
export type CiblePage = { produitId: number } | { chemin: string } | null

export function cibleDeAction(page: string | null | undefined, changement?: Changement | null): CiblePage {
  if (changement?.produitId) return { produitId: changement.produitId }
  const t = String(page || '')
  const produit = /\/products\/(\d+)/.exec(t) || /\bfiches?\s*(?:n°\s*)?(\d+)\b/i.exec(t) || /#(\d+)\b/.exec(t)
  if (produit) return { produitId: Number(produit[1]) }
  const chemin = /(?:shinecosmetics\.ma)?(\/(?:marques|categorie|blog|k-beauty)[^\s?#»"')]*)/i.exec(t)
  return chemin ? { chemin: chemin[1].replace(/\/$/, '') } : null
}

/** Cette URL de Search Console correspond-elle a la cible ? (version francaise de la page) */
export function pageCorrespond(url: string, cible: Exclude<CiblePage, null>): boolean {
  let chemin: string
  try { chemin = new URL(url).pathname.replace(/\/$/, '') } catch { return false }
  if ('produitId' in cible) return chemin.startsWith(`/products/${cible.produitId}-`) || chemin === `/products/${cible.produitId}`
  return chemin === cible.chemin
}

const decaler = (jour: string, n: number) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

/**
 * Deux fenetres de meme longueur autour du jour ou l'action a ete faite : les
 * N jours avant, les N jours apres (N ≤ 28). Le jour meme est exclu : Google
 * n'a pas encore revu la page. Moins de 7 jours de recul : trop tot pour dire
 * quoi que ce soit — on l'ecrit, on ne devine pas.
 */
export function fenetresImpact(faitLe: string, derniereJournee: string | null) {
  if (!derniereJournee) return { tropTot: true as const, joursDispo: 0 }
  const fait = faitLe.slice(0, 10)
  const dispo = Math.floor((Date.parse(`${derniereJournee}T00:00:00Z`) - Date.parse(`${fait}T00:00:00Z`)) / 864e5)
  if (dispo < 7) return { tropTot: true as const, joursDispo: Math.max(0, dispo) }
  const n = Math.min(28, dispo)
  return { tropTot: false as const, jours: n, avant: [decaler(fait, -n), decaler(fait, -1)] as const, apres: [decaler(fait, 1), decaler(fait, n)] as const }
}
