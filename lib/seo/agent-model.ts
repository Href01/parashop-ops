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

/* ------------------------------------------------------------------ */
/* ACTIONS « ARTICLE DE BLOG » : UN BOUTON VERS L'ATELIER DEEPSEEK     */
/* ------------------------------------------------------------------ */

export const ATELIER_BLOG = 'https://www.shinecosmetics.ma/admin/blog/new'

/**
 * Une action « article de blog » ne s'applique pas en un clic : l'article se
 * redige dans l'atelier DeepSeek de la boutique. Ce lien l'ouvre deja rempli —
 * sujet (le premier « … »), recherche visee (« requête « … » »), produits
 * (« fiches 34, 2 et 50 »). Un article existant (URL /blog/<slug> dans la page)
 * ouvre son editeur. null : pas une action de blog, ou pas de sujet lisible.
 */
export function lienRedaction(a: { action: string; page?: string | null; levier?: string | null }): { url: string; libelle: string } | null {
  const texte = `${a.levier || ''} ${a.action}`
  if (!/\bblog\b/i.test(`${texte} ${a.page || ''}`) || !/article/i.test(texte)) return null
  const existant = !/nouvel article/i.test(a.page || '') ? /\/blog\/([a-z0-9]+(?:-[a-z0-9]+)*)/.exec(a.page || '') : null
  if (existant) return { url: `${ATELIER_BLOG}?article=${existant[1]}`, libelle: 'Ouvrir l’article' }
  const requete = /requ[êe]te\s*«\s*([^»]{3,150}?)\s*»/i.exec(a.action)?.[1]
  const sujet = [...a.action.matchAll(/«\s*([^»]{8,200}?)\s*»/g)].map((m) => m[1]).find((g) => g !== requete)
  if (!sujet) return null
  const fiches = [...new Set([...`${a.action} ${a.page || ''}`.matchAll(/fiches?\s+(\d+(?:\s*(?:,|et|\/)\s*\d+)*)/gi)]
    .flatMap((m) => m[1].match(/\d+/g) || []).map(Number))].slice(0, 6)
  const q = new URLSearchParams({ sujet })
  if (requete) q.set('requete', requete)
  if (fiches.length) q.set('produits', fiches.join(','))
  return { url: `${ATELIER_BLOG}?${q}`, libelle: 'Rédiger avec DeepSeek' }
}

/* ------------------------------------------------------------------ */
/* « FAIRE PAR L'AGENT » : CE QU'IL PEUT EXECUTER, ET CE QU'IL LIVRE   */
/* ------------------------------------------------------------------ */

export type Execution = 'article' | 'code'

/**
 * L'agent execute deux sortes d'actions, jamais en production directement :
 *  - un NOUVEL article de blog → enregistre en brouillon (non publie) ;
 *  - une modification du CODE d'une page (marque, categorie, K-beauty…) →
 *    branche claude/… et pull request, fusionnee par Achraf.
 * Titre ou FAQ d'une fiche : c'est le « changement » + « Appliquer ». Avis,
 * prix, offre : decisions d'Achraf. Article existant : son editeur.
 */
export function executable(a: { action: string; page?: string | null; levier?: string | null; changement?: unknown }): Execution | null {
  if (validerChangement(a.changement)) return null
  const lien = lienRedaction(a)
  if (lien) return lien.libelle === 'Rédiger avec DeepSeek' ? 'article' : null
  const levier = `${a.levier || ''}`
  if (/avis|prix|offre|campagne|metaTitle|admin produit|Search Console|technique/i.test(levier)) return null
  return /page marque|page cat[ée]gorie|page besoin|\bcode\b|BRAND_META|CATEGORY_META|\bapp\/|\blib\//i.test(levier) ? 'code' : null
}

export type Livrable =
  | { type: 'brouillon'; postId: number; slug: string; titre: string }
  | { type: 'pr'; branche: string; url: string | null; resume: string }

/** La livraison d'une modification de code : une branche claude/… de ce depot, et sa PR si l'agent a pu l'ouvrir. */
export function validerLivrablePr(o: unknown): Extract<Livrable, { type: 'pr' }> | null {
  if (!o || typeof o !== 'object') return null
  const x = o as Record<string, unknown>
  const branche = typeof x.branche === 'string' && /^claude\/[a-z0-9._-]+(?:\/[a-z0-9._-]+)*$/i.test(x.branche) && x.branche.length <= 120 ? x.branche : null
  const url = x.url == null || x.url === '' ? null : typeof x.url === 'string' && /^https:\/\/github\.com\/Href01\/parashop\/pull\/\d+$/.test(x.url) ? x.url : undefined
  const resume = chaine(x.resume, 10, 1500)
  return branche && url !== undefined && resume ? { type: 'pr', branche, url, resume } : null
}

/** Le bouton qui ouvre ce que l'agent a livre. */
export function lienLivrable(l: Livrable): { url: string; libelle: string } {
  if (l.type === 'brouillon') return { url: `https://www.shinecosmetics.ma/admin/blog/${l.postId}`, libelle: 'Relire le brouillon' }
  return l.url
    ? { url: l.url, libelle: 'Voir la modification (PR)' }
    : { url: `https://github.com/Href01/parashop/compare/main...${l.branche}?expand=1`, libelle: 'Créer la PR' }
}
