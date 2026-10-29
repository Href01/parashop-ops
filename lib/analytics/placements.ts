/**
 * LA RENTABILITE PAR EMPLACEMENT — quel emplacement rapporte de l'argent, lequel en coute.
 *
 * Deux sources, jamais melangees sans le dire :
 *
 *  · la VERITE vient de la boutique : les commandes rattachees a `utm_source`
 *    (ig, fb, an, th, msg — la valeur que Meta met dans le lien de l'annonce) et
 *    ce qu'elles ont reellement rapporte une fois LIVREES (marge de la commande,
 *    moins l'emballage). C'est la meme marge que le tableau de bord ;
 *  · la DEPENSE vient de l'API Marketing de Meta, ventilee par plateforme
 *    (`publisher_platform`). Elle est convertie en dirhams.
 *
 *   profit d'un emplacement = marge des commandes livrees − depense Meta
 *
 * La ventilation PAR POSITION (fil, stories, reels…) n'existe que cote Meta : les
 * liens des annonces ne portent pas la position. On l'affiche, etiquetee
 * « declare par Meta », sans en tirer de profit — ce serait inventer un
 * rattachement que la boutique n'a pas.
 *
 * Fichier pur : ni base ni reseau, donc teste (tests/analytics/placements.test.ts).
 */

/** Libelle des valeurs de `utm_source` posees par les annonces Meta. */
export const EMPLACEMENTS: Record<string, string> = {
  ig: 'Instagram',
  fb: 'Facebook',
  an: 'Audience Network',
  th: 'Threads',
  msg: 'Messenger',
}

/** Valeur de `publisher_platform` (API Meta) → valeur de `utm_source` (lien de l'annonce). */
export const PUBLISHER_VERS_SOURCE: Record<string, string> = {
  instagram: 'ig',
  facebook: 'fb',
  audience_network: 'an',
  threads: 'th',
  messenger: 'msg',
}

export const SANS_SOURCE = 'direct'

export type LigneMeta = {
  publisher: string
  source: string
  position: string
  depense: number
  impressions: number
  clics: number
  achats: number
  valeur: number
}

type Action = { action_type?: string; value?: string | number }
const TYPES_ACHAT = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']

/** Meme precedence que la synchro des campagnes : le premier type present l'emporte. */
function premiereValeur(actions: Action[] | undefined): number {
  if (!Array.isArray(actions)) return 0
  for (const t of TYPES_ACHAT) {
    const hit = actions.find((a) => a.action_type === t)
    if (hit) return Number(hit.value) || 0
  }
  return 0
}

/** Reponse de `/insights?breakdowns=publisher_platform,platform_position` → lignes en dirhams. */
export function parserInsightsMeta(json: unknown, fx: number): LigneMeta[] {
  const data = (json as { data?: unknown })?.data
  if (!Array.isArray(data)) return []
  const out: LigneMeta[] = []
  for (const x of data as Record<string, unknown>[]) {
    const publisher = String(x.publisher_platform ?? '').toLowerCase()
    if (!publisher) continue
    out.push({
      publisher,
      source: PUBLISHER_VERS_SOURCE[publisher] ?? publisher,
      position: String(x.platform_position ?? '—'),
      depense: (Number(x.spend) || 0) * fx,
      impressions: Number(x.impressions) || 0,
      clics: Number(x.clicks) || 0,
      achats: premiereValeur(x.actions as Action[]),
      valeur: premiereValeur(x.action_values as Action[]) * fx,
    })
  }
  return out
}

export type LigneTrafic = { source: string; sessions: number; paniers: number }
export type LigneCommandes = {
  source: string
  passees: number
  livrees: number
  annulees: number
  enCours: number
  caLivre: number
  /** Marge des commandes livrees, AVANT emballage et pub (finalProfit, sinon estimatedProfit). */
  margeLivree: number
}

export type LignePlacement = {
  source: string
  libelle: string
  /** Vrai pour les emplacements ou Meta depense : la rentabilite y a un sens. */
  payant: boolean
  sessions: number
  paniers: number
  commandes: number
  livrees: number
  annulees: number
  enCours: number
  caLivre: number
  /** Marge des livrees moins l'emballage. */
  marge: number
  /** Depense Meta ; `null` quand Meta n'a pas repondu (jamais 0, qui voudrait dire « gratuit »). */
  depense: number | null
  /** marge − depense ; `null` quand la depense est inconnue. */
  profit: number | null
  roas: number | null
  coutParLivree: number | null
  tauxCommande: number | null
}

const r2 = (n: number) => Math.round(n * 100) / 100
const libelle = (source: string) =>
  source === SANS_SOURCE ? 'Sans source (direct, commandes manuelles)' : EMPLACEMENTS[source] ?? source

export function construirePlacements(args: {
  trafic: LigneTrafic[]
  commandes: LigneCommandes[]
  meta: LigneMeta[] | null
  emballageParColis: number
}) {
  const { trafic, commandes, meta, emballageParColis } = args
  const metaDispo = meta !== null
  const sources = new Set<string>([...trafic.map((x) => x.source), ...commandes.map((x) => x.source), ...(meta ?? []).map((x) => x.source)])

  const lignes: LignePlacement[] = [...sources].map((source) => {
    const t = trafic.find((x) => x.source === source)
    const c = commandes.find((x) => x.source === source)
    const m = (meta ?? []).filter((x) => x.source === source)
    const payant = m.length > 0 || Object.prototype.hasOwnProperty.call(EMPLACEMENTS, source)
    const depense = metaDispo && payant ? r2(m.reduce((s, x) => s + x.depense, 0)) : null
    const livrees = c?.livrees ?? 0
    const marge = r2((c?.margeLivree ?? 0) - emballageParColis * livrees)
    const sessions = t?.sessions ?? 0
    return {
      source, libelle: libelle(source), payant,
      sessions, paniers: t?.paniers ?? 0,
      commandes: c?.passees ?? 0, livrees, annulees: c?.annulees ?? 0, enCours: c?.enCours ?? 0,
      caLivre: r2(c?.caLivre ?? 0), marge, depense,
      profit: depense == null ? null : r2(marge - depense),
      roas: depense != null && depense > 0 ? r2((c?.caLivre ?? 0) / depense) : null,
      coutParLivree: depense != null && livrees > 0 ? r2(depense / livrees) : null,
      tauxCommande: sessions > 0 ? (c?.passees ?? 0) / sessions : null,
    }
  })

  // Les emplacements payants d'abord, du plus rentable au moins rentable ; le reste ensuite, par marge.
  lignes.sort((a, b) => {
    if (a.payant !== b.payant) return a.payant ? -1 : 1
    if (a.payant) return (b.profit ?? -Infinity) - (a.profit ?? -Infinity) || b.sessions - a.sessions
    return b.marge - a.marge
  })

  const payants = lignes.filter((l) => l.payant)
  const total = {
    depense: metaDispo ? r2(payants.reduce((s, l) => s + (l.depense ?? 0), 0)) : null,
    marge: r2(payants.reduce((s, l) => s + l.marge, 0)),
    profit: metaDispo ? r2(payants.reduce((s, l) => s + (l.profit ?? 0), 0)) : null,
    livrees: payants.reduce((s, l) => s + l.livrees, 0),
    commandes: payants.reduce((s, l) => s + l.commandes, 0),
    sessions: payants.reduce((s, l) => s + l.sessions, 0),
  }
  return { lignes, total, metaDisponible: metaDispo }
}
