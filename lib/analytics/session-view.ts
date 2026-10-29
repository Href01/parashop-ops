/**
 * LA LECTURE D'UNE SESSION — ce qu'on affiche, decide ici et testé.
 *
 * Une ligne de la liste doit repondre en une seconde a trois questions : qu'est-ce
 * que cette visiteuse a fait (son issue), jusqu'ou est-elle allee (le parcours),
 * et d'ou venait-elle (la source). Ces regles vivent hors du composant pour etre
 * verifiees (tests/analytics/session-view.test.ts) et ne pas diverger de l'ecran.
 */

export type Issue = 'livree' | 'commandee' | 'annulee' | 'panier' | 'parcours' | 'rebond' | 'automatise'

export type SessionVue = {
  automatise: boolean
  actions: number
  fiches: number
  paniers: number
  checkouts: number
  commande: { statut: string } | null
}

/** Couleurs en dur (memes teintes que la palette Viz) : ce fichier ne depend d'aucun composant. */
export const ISSUES: Record<Issue, { label: string; couleur: string; fond: string }> = {
  livree: { label: 'Livrée', couleur: '#0a7a0a', fond: '#e7f5e7' },
  commandee: { label: 'Commandée', couleur: '#2a78d6', fond: '#e8f0fb' },
  annulee: { label: 'Annulée', couleur: '#d03b3b', fond: '#fbeaea' },
  panier: { label: 'Panier abandonné', couleur: '#a16207', fond: '#fdf3dc' },
  parcours: { label: 'A parcouru', couleur: '#52514e', fond: '#efeee9' },
  rebond: { label: 'Rebond', couleur: '#898781', fond: '#f3f2ee' },
  automatise: { label: 'Automatisé', couleur: '#898781', fond: '#f3f2ee' },
}

/** L'issue de la session, de la plus decisive a la moins : commande, panier, parcours, rebond. */
export function issueSession(s: SessionVue): Issue {
  if (s.automatise) return 'automatise'
  if (s.commande) {
    if (s.commande.statut === 'DELIVERED') return 'livree'
    if (s.commande.statut === 'CANCELLED') return 'annulee'
    return 'commandee'
  }
  if (s.paniers > 0) return 'panier'
  if (s.fiches > 0 || s.actions > 1) return 'parcours'
  return 'rebond'
}

/** Les quatre marches du tunnel, atteintes ou non. Une commande implique les marches d'avant. */
export function etapesAtteintes(s: SessionVue) {
  const commande = Boolean(s.commande)
  const checkout = commande || s.checkouts > 0
  const panier = checkout || s.paniers > 0
  const fiche = panier || s.fiches > 0
  return { fiche, panier, checkout, commande }
}

export const ETAPES = [
  { cle: 'fiche', label: 'Fiche produit vue' },
  { cle: 'panier', label: 'Ajout au panier' },
  { cle: 'checkout', label: 'Paiement ouvert' },
  { cle: 'commande', label: 'Commande passée' },
] as const

/** « AAAA-MM-JJ » de l'instant `iso` a l'heure du Maroc. */
export function jourClef(iso: string, tz = 'Africa/Casablanca'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso))
}

const JOURS_FR = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

/** « Aujourd'hui », « Hier », sinon « mer. 28 oct. ». `clef` et `aujourdhui` sont des AAAA-MM-JJ. */
export function libelleJour(clef: string, aujourdhui: string): string {
  const jour = (c: string) => Date.parse(`${c}T00:00:00Z`)
  const ecart = Math.round((jour(aujourdhui) - jour(clef)) / 86_400_000)
  if (ecart === 0) return "Aujourd'hui"
  if (ecart === 1) return 'Hier'
  return JOURS_FR.format(new Date(jour(clef)))
}

/** Regroupe des sessions DEJA triees (plus recentes d'abord) par jour, en gardant l'ordre. */
export function regrouperParJour<T extends { derniere: string }>(sessions: T[], aujourdhui: string) {
  const groupes: { clef: string; libelle: string; sessions: T[] }[] = []
  for (const s of sessions) {
    const clef = jourClef(s.derniere)
    const dernier = groupes[groupes.length - 1]
    if (dernier && dernier.clef === clef) dernier.sessions.push(s)
    else groupes.push({ clef, libelle: libelleJour(clef, aujourdhui), sessions: [s] })
  }
  return groupes
}

export function dureeCourte(s: number): string {
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.round(s / 60)} min`
  return `${(s / 3600).toFixed(1).replace('.', ',')} h`
}

export type Famille = 'google' | 'meta' | 'organique' | 'direct' | 'autre'

const META: Record<string, string> = { ig: 'Instagram', fb: 'Facebook', an: 'Audience Network', th: 'Threads', msg: 'Messenger' }

/**
 * La source telle qu'on la lit. Les emplacements Meta (ig, fb, an, th) restent
 * SEPARES — on veut savoir lequel rapporte. « instagram » / « facebook » avec un
 * lien de renvoi sont des visites organiques, pas des annonces : on les distingue.
 */
export function libelleSource(source: string, medium: string | null): { label: string; code: string; famille: Famille } {
  const s = (source || 'direct').toLowerCase()
  const m = (medium || '').toLowerCase()
  if (s === 'direct' || s === '') return { label: 'Direct', code: 'direct', famille: 'direct' }
  if (META[s]) return { label: META[s], code: s, famille: 'meta' }
  if (s === 'google' && /^(cpc|ppc|paid)/.test(m)) return { label: 'Google Ads', code: 'google', famille: 'google' }
  if (s === 'google') return { label: 'Google', code: 'google', famille: 'organique' }
  if (s === 'instagram') return { label: 'Instagram (lien)', code: s, famille: 'organique' }
  if (s === 'facebook') return { label: 'Facebook (lien)', code: s, famille: 'organique' }
  if (s === 'search') return { label: 'Recherche', code: s, famille: 'organique' }
  return { label: s, code: s, famille: 'autre' }
}
