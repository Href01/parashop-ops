/**
 * LA VUE GOOGLE ADS — ce que chaque campagne, groupe et mot-cle a coute, et ce qu'il a rapporte.
 *
 * Meme principe que les emplacements Meta (lib/analytics/placements.ts) :
 *  · la VERITE du resultat vient de la boutique : visites, paniers et commandes rattachees aux
 *    annonces Google, et ce que ces commandes ont rapporte une fois LIVREES ;
 *  · la DEPENSE, les clics et les impressions viennent de l'API Google Ads, en dirhams.
 *
 *   profit = marge des commandes livrees (apres emballage) − depense Google
 *
 * LA CLE DE JOINTURE. Les annonces posent dans l'URL (suffixe de campagne) :
 *   utm_campaign = {campaignid}   utm_content = {adgroupid}   utm_term = {keyword}
 * Donc une visite se rattache a la campagne par son IDENTIFIANT, au groupe par le sien, et au mot-cle
 * par (groupe, texte du mot-cle). Avant le 29/10/2026 16 h UTC le suffixe portait un NOM litteral
 * (« olaplex-search ») : ces visites-la ne se rattachent a rien et sont montrees a part, sous
 * « Non rattaché », plutot que devinees — le total reste juste, et on voit ce qui manque.
 *
 * Fichier pur : ni base ni reseau.
 */

const r2 = (n: number) => Math.round(n * 100) / 100

export type NiveauVue = 'campagne' | 'groupe' | 'motcle'

/** Une ligne telle que Google la rend, deja en dirhams. */
export type LigneGoogle = {
  campagneId: string
  campagne: string
  groupeId?: string
  groupe?: string
  motCle?: string
  typeCorrespondance?: string
  impressions: number
  clics: number
  depense: number
}

export type GoogleDonnees = {
  campagnes: LigneGoogle[]
  groupes: LigneGoogle[]
  motsCles: LigneGoogle[]
}

/** Visites de la boutique issues de Google Ads, groupees par ce que l'URL portait. */
export type LigneSite = { campagne: string | null; groupe: string | null; motCle: string | null; sessions: number; paniers: number }
export type LigneCmd = {
  campagne: string | null; groupe: string | null; motCle: string | null
  passees: number; livrees: number; annulees: number; enCours: number
  caLivre: number
  /** Marge des commandes livrees, AVANT emballage et pub (finalProfit, sinon estimatedProfit). */
  margeLivree: number
}

// ── Lecture de l'API ─────────────────────────────────────────────────────────

const n = (v: unknown) => Number(v) || 0
const micros = (v: unknown) => n(v) / 1_000_000

type Brut = { campaign?: { id?: string; name?: string }; adGroup?: { id?: string; name?: string }; adGroupCriterion?: { keyword?: { text?: string; matchType?: string } }; metrics?: Record<string, unknown> }

const metriques = (m?: Record<string, unknown>) => ({ impressions: n(m?.impressions), clics: n(m?.clicks), depense: r2(micros(m?.costMicros)) })

export function parserCampagnes(res: unknown[]): LigneGoogle[] {
  return (res as Brut[]).filter((x) => x.campaign?.id).map((x) => ({
    campagneId: String(x.campaign!.id), campagne: String(x.campaign!.name ?? ''), ...metriques(x.metrics),
  }))
}

export function parserGroupes(res: unknown[]): LigneGoogle[] {
  return (res as Brut[]).filter((x) => x.adGroup?.id).map((x) => ({
    campagneId: String(x.campaign?.id ?? ''), campagne: String(x.campaign?.name ?? ''),
    groupeId: String(x.adGroup!.id), groupe: String(x.adGroup!.name ?? ''), ...metriques(x.metrics),
  }))
}

export function parserMotsCles(res: unknown[]): LigneGoogle[] {
  return (res as Brut[]).filter((x) => x.adGroup?.id && x.adGroupCriterion?.keyword?.text).map((x) => ({
    campagneId: String(x.campaign?.id ?? ''), campagne: String(x.campaign?.name ?? ''),
    groupeId: String(x.adGroup!.id), groupe: String(x.adGroup!.name ?? ''),
    motCle: String(x.adGroupCriterion!.keyword!.text), typeCorrespondance: String(x.adGroupCriterion!.keyword!.matchType ?? ''),
    ...metriques(x.metrics),
  }))
}

// ── Cles de jointure ─────────────────────────────────────────────────────────

/** Un identifiant Google est numerique et long ; « olaplex-search » n'en est pas un. */
export const idNumerique = (v: string | null | undefined): string | null => {
  const s = String(v ?? '').trim()
  return /^\d{5,}$/.test(s) ? s : null
}

/** Le texte d'un mot-cle, compare sans casse ni espaces multiples. */
export const normaliserMotCle = (v: string | null | undefined) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

export const NON_RATTACHE = '__non_rattache__'
export const SANS_MOT_CLE = ''

function cleSite(niveau: NiveauVue, x: { campagne: string | null; groupe: string | null; motCle: string | null }): string | null {
  if (niveau === 'campagne') return idNumerique(x.campagne)
  const g = idNumerique(x.groupe)
  if (niveau === 'groupe') return g
  return g ? `${g}|${normaliserMotCle(x.motCle)}` : null
}

function cleGoogle(niveau: NiveauVue, x: LigneGoogle): string | null {
  if (niveau === 'campagne') return x.campagneId || null
  if (niveau === 'groupe') return x.groupeId ?? null
  return x.groupeId ? `${x.groupeId}|${normaliserMotCle(x.motCle)}` : null
}

// ── La vue ───────────────────────────────────────────────────────────────────

export type LigneVue = {
  cle: string
  libelle: string
  /** Le parent, pour s'y retrouver (groupe → campagne, mot-cle → groupe). */
  contexte: string
  /** Faux pour la ligne « Non rattaché » : des visites sans identifiant de campagne. */
  rattache: boolean
  impressions: number | null
  clics: number | null
  /** `null` quand Google n'a pas repondu — jamais 0, qui voudrait dire « gratuit ». */
  depense: number | null
  sessions: number
  paniers: number
  commandes: number
  livrees: number
  annulees: number
  enCours: number
  caLivre: number
  /** Marge des livrees moins l'emballage. */
  marge: number
  profit: number | null
  cpc: number | null
  ctr: number | null
  /** Commandes / visites, en %. */
  tauxConversion: number | null
}

type Acc = Omit<LigneVue, 'cpc' | 'ctr' | 'tauxConversion' | 'profit' | 'marge'> & { margeBrute: number }

const vide = (cle: string, libelle: string, contexte: string, rattache: boolean, googleDispo: boolean): Acc => ({
  cle, libelle, contexte, rattache,
  impressions: googleDispo ? 0 : null, clics: googleDispo ? 0 : null, depense: googleDispo ? 0 : null,
  sessions: 0, paniers: 0, commandes: 0, livrees: 0, annulees: 0, enCours: 0, caLivre: 0, margeBrute: 0,
})

export function construireVueGoogle(args: {
  niveau: NiveauVue
  google: GoogleDonnees | null
  trafic: LigneSite[]
  commandes: LigneCmd[]
  emballageParColis: number
}) {
  const { niveau, google, trafic, commandes, emballageParColis } = args
  const dispo = google !== null
  const acc = new Map<string, Acc>()

  const ligneGoogle = niveau === 'campagne' ? google?.campagnes : niveau === 'groupe' ? google?.groupes : google?.motsCles
  for (const g of ligneGoogle ?? []) {
    const cle = cleGoogle(niveau, g)
    if (!cle) continue
    // Ni affichage, ni clic, ni dirham : une ligne qui n'a rien fait sur la periode (groupe en pause, mot-cle
    // dormant) n'apprend rien. Si le site lui a quand meme envoye des visites, elle est recreee plus bas.
    if (g.impressions === 0 && g.clics === 0 && g.depense === 0) continue
    const libelle = niveau === 'campagne' ? g.campagne : niveau === 'groupe' ? (g.groupe ?? cle) : (g.motCle ?? cle)
    const contexte = niveau === 'campagne' ? '' : niveau === 'groupe' ? g.campagne : `${g.groupe ?? ''}`
    const a = acc.get(cle) ?? vide(cle, libelle, contexte, true, dispo)
    // Un meme mot-cle peut exister en exact ET en expression : l'URL ne dit pas lequel a repondu, on additionne.
    a.impressions = (a.impressions ?? 0) + g.impressions
    a.clics = (a.clics ?? 0) + g.clics
    a.depense = r2((a.depense ?? 0) + g.depense)
    acc.set(cle, a)
  }

  const cible = (cle: string | null, x: { campagne: string | null; groupe: string | null; motCle: string | null }): Acc => {
    if (cle === null) {
      return acc.get(NON_RATTACHE) ?? (acc.set(NON_RATTACHE, vide(NON_RATTACHE, 'Non rattaché', 'visites sans identifiant de campagne (avant le 29/10) ou sans mot-clé transmis', false, false)), acc.get(NON_RATTACHE)!)
    }
    const existant = acc.get(cle)
    if (existant) return existant
    // Visites dont la cle n'existe pas cote Google sur la periode (pas de depense) : on les garde, avec un libelle honnete.
    const libelle = niveau === 'campagne' ? `Campagne n° ${cle}` : niveau === 'groupe' ? `Groupe n° ${cle}`
      : (x.motCle ? normaliserMotCle(x.motCle) : '(mot-clé non transmis)')
    const a = vide(cle, libelle, '', true, dispo)
    acc.set(cle, a)
    return a
  }

  for (const t of trafic) {
    const a = cible(cleSite(niveau, t), t)
    a.sessions += t.sessions; a.paniers += t.paniers
  }
  for (const c of commandes) {
    const a = cible(cleSite(niveau, c), c)
    a.commandes += c.passees; a.livrees += c.livrees; a.annulees += c.annulees; a.enCours += c.enCours
    a.caLivre += c.caLivre; a.margeBrute += c.margeLivree
  }

  const lignes: LigneVue[] = [...acc.values()].map((a) => {
    const marge = r2(a.margeBrute - emballageParColis * a.livrees)
    const depense = a.rattache ? a.depense : null
    return {
      ...a, caLivre: r2(a.caLivre), marge,
      profit: depense == null ? null : r2(marge - depense),
      cpc: a.clics && a.clics > 0 && a.depense != null ? r2(a.depense / a.clics) : null,
      ctr: a.impressions && a.impressions > 0 && a.clics != null ? r2((a.clics / a.impressions) * 100) : null,
      tauxConversion: a.sessions > 0 ? r2((a.commandes / a.sessions) * 100) : null,
    }
  })

  // La depense en premier (c'est l'argent qui part), puis les visites ; « Non rattaché » toujours en dernier.
  lignes.sort((a, b) => {
    if (a.rattache !== b.rattache) return a.rattache ? -1 : 1
    return (b.depense ?? -1) - (a.depense ?? -1) || b.sessions - a.sessions || a.libelle.localeCompare(b.libelle, 'fr')
  })

  // LES TOTAUX NE DEPENDENT PAS DU NIVEAU : toute la depense Google (toutes campagnes) face a toutes les visites
  // et commandes issues de Google — meme si certaines ne se rattachent a aucune ligne.
  const depenseTotale = dispo ? r2(google!.campagnes.reduce((s, x) => s + x.depense, 0)) : null
  const clicsTotal = dispo ? google!.campagnes.reduce((s, x) => s + x.clics, 0) : null
  const impressionsTotal = dispo ? google!.campagnes.reduce((s, x) => s + x.impressions, 0) : null
  const sessions = trafic.reduce((s, x) => s + x.sessions, 0)
  const paniers = trafic.reduce((s, x) => s + x.paniers, 0)
  const commandesTotal = commandes.reduce((s, x) => s + x.passees, 0)
  const livrees = commandes.reduce((s, x) => s + x.livrees, 0)
  const marge = r2(commandes.reduce((s, x) => s + x.margeLivree, 0) - emballageParColis * livrees)
  const totaux = {
    depense: depenseTotale, clics: clicsTotal, impressions: impressionsTotal,
    sessions, paniers, commandes: commandesTotal, livrees,
    caLivre: r2(commandes.reduce((s, x) => s + x.caLivre, 0)), marge,
    profit: depenseTotale == null ? null : r2(marge - depenseTotale),
    cpc: clicsTotal && clicsTotal > 0 && depenseTotale != null ? r2(depenseTotale / clicsTotal) : null,
    ctr: impressionsTotal && impressionsTotal > 0 && clicsTotal != null ? r2((clicsTotal / impressionsTotal) * 100) : null,
    tauxConversion: sessions > 0 ? r2((commandesTotal / sessions) * 100) : null,
    /** Part des clics Google qui ont ouvert une session sur le site : l'ecart est du trafic perdu avant la page. */
    visitesParClic: clicsTotal && clicsTotal > 0 ? r2((sessions / clicsTotal) * 100) : null,
    nonRattachees: lignes.find((l) => !l.rattache)?.sessions ?? 0,
  }
  return { lignes, totaux, googleDisponible: dispo }
}
