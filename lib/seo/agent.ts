import 'server-only'
import pool from '@/lib/db'
import { PROPERTY } from './google'
import { cibleDeAction, domaine, fenetresImpact, motsPorteurs, norm, pageCorrespond, validerChangement, type Changement } from './agent-model'
import { revalidateWebsite } from '@/lib/revalidate-website'

/**
 * L'AGENT SEO CONCURRENCE, COTE BOS : sa file de demandes, sa memoire, et ce
 * que l'ecran /analytics/seo/concurrence affiche.
 *
 * L'agent lui-meme est un Claude qui tourne dans le cloud d'Anthropic (routines
 * planifiees, voir docs/seo-agent.md). Il ne touche jamais la base : il demande
 * son contexte et publie ses rapports par /api/ops/seo/agent/machine/*, avec un
 * jeton. Ses conclusions restent des recommandations : rien ici ne modifie le
 * site.
 *
 * Les positions REELLES de Shine viennent de Search Console ("SeoSearchDaily",
 * pays « mar »), lues ici et transmises a l'agent. L'ordre des concurrents vient
 * du moteur de recherche de l'agent — ce n'est pas l'ordre exact de google.ma.
 */

export type Genre = 'requete' | 'grappe' | 'tout'
export { domaine, motsPorteurs }

type GscLigne = { query: string; day: string; clicks: number; impressions: number; position: number }
type Agregat = { impressions: number; clics: number; position: number | null }
const agreger = (lignes: GscLigne[]): Agregat => {
  const impressions = lignes.reduce((s, l) => s + l.impressions, 0)
  const clics = lignes.reduce((s, l) => s + l.clicks, 0)
  const pond = lignes.reduce((s, l) => s + l.position * l.impressions, 0)
  return { impressions: Math.round(impressions), clics: Math.round(clics), position: impressions > 0 ? Math.round((pond / impressions) * 10) / 10 : null }
}

/** Semaines de 7 jours finissant a la derniere journee connue (la plus recente peut etre complete ou non). */
function parSemaine(lignes: GscLigne[], derniere: string | null) {
  if (!derniere) return []
  const fin = Date.parse(`${derniere}T00:00:00Z`)
  const semaines = []
  for (let k = 7; k >= 0; k--) {
    const de = new Date(fin - (k * 7 + 6) * 864e5).toISOString().slice(0, 10)
    const a = new Date(fin - k * 7 * 864e5).toISOString().slice(0, 10)
    const dans = lignes.filter((l) => l.day >= de && l.day <= a)
    const ag = agreger(dans)
    semaines.push({ debut: de, impressions: ag.impressions, clics: ag.clics, position: ag.position, jours: new Set(dans.map((l) => l.day)).size })
  }
  return semaines
}

export type GscRequete = {
  derniereJournee: string | null
  exact28j: Agregat
  variantes28j: Agregat
  variantes7j: Agregat
  variantes7jAvant: Agregat
  topVariantes: { requete: string; impressions: number; position: number | null }[]
  /**
   * Les 8 dernieres semaines (variantes comprises), de la plus ancienne a la
   * plus recente. Deux fenetres de 7 jours sur 50 impressions ne disent rien :
   * « masque salerm » oscille entre la 6e et la 17e place une semaine sur deux
   * depuis deux mois, et l'agent y avait vu une chute. La serie montre si un
   * mouvement dure.
   */
  semaines: { debut: string; impressions: number; clics: number; position: number | null; jours: number }[]
}

/**
 * Search Console pour une liste de requetes suivies, au Maroc : la requete
 * exacte ET ses variantes reelles (toutes les recherches qui contiennent ses
 * mots porteurs). Une requete exacte a souvent 4 impressions par mois ; ses
 * variantes disent la vraie demande.
 */
export async function gscPourRequetes(requetes: string[]): Promise<Record<string, GscRequete>> {
  const r = await pool.query<GscLigne & { day: string }>(
    `SELECT query, day::text AS day, clicks, impressions, position FROM "SeoSearchDaily"
     WHERE property = $1 AND dataset = 'query' AND country = 'mar'
       AND day > (SELECT max(day) FROM "SeoSearchDaily" WHERE property = $1) - 56`,
    [PROPERTY],
  )
  const jours = [...new Set(r.rows.map((l) => l.day))].sort()
  const derniere = jours[jours.length - 1] ?? null
  const decale = (n: number) => (derniere ? new Date(Date.parse(`${derniere}T00:00:00Z`) - n * 864e5).toISOString().slice(0, 10) : '')
  const d7 = decale(7), d14 = decale(14), d28 = decale(28)
  const lignes = r.rows.map((l) => ({ ...l, clicks: Number(l.clicks), impressions: Number(l.impressions), position: Number(l.position), mots: motsPorteurs(l.query) }))

  const res: Record<string, GscRequete> = {}
  for (const requete of requetes) {
    const mots = motsPorteurs(requete)
    const cible = norm(requete).replace(/\s+/g, ' ').trim()
    const variantes = mots.length ? lignes.filter((l) => mots.every((m) => l.mots.includes(m))) : []
    const sur28 = variantes.filter((l) => l.day > d28)
    const parRequete = new Map<string, GscLigne[]>()
    for (const l of sur28) parRequete.set(l.query, [...(parRequete.get(l.query) || []), l])
    res[requete] = {
      derniereJournee: derniere,
      exact28j: agreger(lignes.filter((l) => l.day > d28 && norm(l.query).replace(/\s+/g, ' ').trim() === cible)),
      variantes28j: agreger(sur28),
      variantes7j: agreger(variantes.filter((l) => l.day > d7)),
      variantes7jAvant: agreger(variantes.filter((l) => l.day > d14 && l.day <= d7)),
      semaines: parSemaine(variantes, derniere),
      topVariantes: [...parRequete.entries()]
        .map(([q, ls]) => ({ requete: q, ...agreger(ls) }))
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 5)
        .map(({ requete: q, impressions, position }) => ({ requete: q, impressions, position })),
    }
  }
  return res
}

/** Une demande « en cours » depuis plus de deux heures a perdu son agent : on la clot en erreur. */
async function liberer() {
  await pool.query(
    `UPDATE "SeoAgentRequest" SET statut = 'erreur', termine_le = now(), erreur = 'Aucun rapport recu dans les deux heures'
     WHERE statut = 'en_cours' AND commence_le < now() - interval '2 hours'`,
  )
}

export async function creerDemande(cible: string, genre: Genre, par: string | null) {
  const c = cible.trim()
  if (genre === 'requete' && (c.length < 2 || c.length > 120)) throw new Error('Requête : entre 2 et 120 caractères.')
  if (genre === 'grappe') {
    const g = await pool.query(`SELECT 1 FROM "SeoAgentGroup" WHERE nom = $1`, [c])
    if (!g.rowCount) throw new Error('Grappe inconnue.')
  }
  const enAttente = await pool.query<{ n: number; meme: number }>(
    `SELECT count(*)::int AS n, count(*) FILTER (WHERE lower(cible) = lower($1))::int AS meme
     FROM "SeoAgentRequest" WHERE statut IN ('en_attente', 'en_cours')`, [genre === 'tout' ? 'tout' : c])
  if (enAttente.rows[0].meme) throw new Error('Cette analyse est déjà dans la file.')
  if (enAttente.rows[0].n >= 5) throw new Error('Cinq analyses attendent déjà : patiente jusqu’au prochain passage de l’agent.')
  const r = await pool.query(
    `INSERT INTO "SeoAgentRequest" (cible, genre, demande_par) VALUES ($1, $2, $3) RETURNING id, cible, genre, statut, demande_le`,
    [genre === 'tout' ? 'tout' : c, genre, par])
  return r.rows[0]
}

/** La plus ancienne demande en attente, reservee atomiquement pour l'agent qui la reclame. */
export async function reclamerDemande() {
  await liberer()
  const r = await pool.query(
    `UPDATE "SeoAgentRequest" SET statut = 'en_cours', commence_le = now()
     WHERE id = (SELECT id FROM "SeoAgentRequest" WHERE statut = 'en_attente' ORDER BY demande_le LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING id, cible, genre, demande_le`)
  return r.rows[0] ?? null
}

export async function echecDemande(id: number, erreur: string) {
  await pool.query(
    `UPDATE "SeoAgentRequest" SET statut = 'erreur', termine_le = now(), erreur = left($2, 500) WHERE id = $1 AND statut = 'en_cours'`,
    [id, erreur])
}

/**
 * LES OPPORTUNITES QUE PERSONNE NE SUIT : les recherches ou Shine est deja
 * entre la 4e et la 20e place au Maroc, avec du volume, et qui ne sont pas dans
 * le suivi. Passer de la 11e a la 3e place multiplie les clics ; c'est le gain
 * le plus rapide du SEO. Sans cette liste, l'agent avait classe Salerm « suivi
 * seulement » alors que la marque faisait un tiers du trafic.
 */
export async function opportunites(limite = 15) {
  const suivies = await pool.query<{ requete: string }>(`SELECT requete FROM "SeoAgentQuery"`)
  const deja = new Set(suivies.rows.map((x) => norm(x.requete).replace(/\s+/g, ' ').trim()))
  const r = await pool.query<{ query: string; imp: number; clics: number; pos: number }>(
    `SELECT query, sum(impressions)::float AS imp, sum(clicks)::float AS clics,
            sum(position * impressions) / nullif(sum(impressions), 0) AS pos
     FROM "SeoSearchDaily"
     WHERE property = $1 AND dataset = 'query' AND country = 'mar'
       AND day > (SELECT max(day) FROM "SeoSearchDaily" WHERE property = $1) - 28
     GROUP BY query
     HAVING sum(impressions) >= 15
        AND sum(position * impressions) / nullif(sum(impressions), 0) BETWEEN 4 AND 20
     ORDER BY sum(impressions) DESC
     LIMIT 60`, [PROPERTY])
  return r.rows
    .filter((x) => !deja.has(norm(x.query).replace(/\s+/g, ' ').trim()))
    .slice(0, limite)
    .map((x) => ({ requete: x.query, impressions: Math.round(x.imp), clics: Math.round(x.clics), position: Math.round(x.pos * 10) / 10 }))
}

/** Ce que l'agent recoit avant de travailler : le suivi, les positions reelles, le releve precedent. */
export async function contexte(filtre?: { genre: Genre; cible: string }) {
  const g = await pool.query(`SELECT nom, priorite, pourquoi, analyse_le FROM "SeoAgentGroup" ORDER BY priorite, nom`)
  const q = await pool.query<{ requete: string; grappe: string }>(`SELECT requete, grappe FROM "SeoAgentQuery" WHERE actif ORDER BY grappe, requete`)
  let requetes = q.rows
  if (filtre?.genre === 'grappe') requetes = requetes.filter((x) => x.grappe === filtre.cible)
  if (filtre?.genre === 'requete') requetes = [{ requete: filtre.cible, grappe: q.rows.find((x) => x.requete === filtre.cible)?.grappe ?? '(hors suivi)' }]
  const gsc = await gscPourRequetes(requetes.map((x) => x.requete))
  const releves = await pool.query(
    `SELECT DISTINCT ON (requete) requete, jour::text AS jour, domaines, shine_rang FROM "SeoSerpSnapshot"
     WHERE requete = ANY($1) ORDER BY requete, jour DESC`, [requetes.map((x) => x.requete)])
  const dernier = new Map(releves.rows.map((x) => [x.requete, x]))
  // Les actions deja proposees et encore ouvertes : l'agent ne les repropose pas, il les complete.
  const ouvertes = await pool.query(
    `SELECT a.id, a.action, a.page, r.cible FROM "SeoAgentAction" a JOIN "SeoAgentReport" r ON r.id = a.rapport_id
     WHERE a.statut = 'a_faire' ORDER BY a.priorite, a.id LIMIT 60`)
  // Rotation de l'analyse approfondie quotidienne : priorite d'abord, puis la plus anciennement analysee.
  const prochaine = [...g.rows].filter((x) => x.priorite < 3)
    .sort((a, b) => a.priorite - b.priorite || (a.analyse_le ? Date.parse(a.analyse_le) : 0) - (b.analyse_le ? Date.parse(b.analyse_le) : 0))[0]?.nom ?? null
  return {
    genereLe: new Date().toISOString(),
    grappes: g.rows,
    grappeDuJour: prochaine,
    requetes: requetes.map((x) => ({ ...x, gsc: gsc[x.requete], dernierReleve: dernier.get(x.requete) ?? null })),
    actionsOuvertes: ouvertes.rows,
    // Ce qui a ete fait, et ce que Search Console en dit : l'agent apprend ce qui rapporte.
    actionsFaites: await actionsFaitesAvecImpact(),
    opportunites: await opportunites(),
    rappel: 'Positions Search Console : Maroc, moyenne ponderee par les impressions. Ordre des concurrents : moteur de l’agent, pas google.ma.',
  }
}

export type Publication = {
  demandeId?: number | null
  source: 'quotidien' | 'demande'
  cible: string
  modele?: string
  enBref: string
  concurrent?: string | null
  contenu: string
  requetes?: unknown[]
  actions?: { priorite?: number; action: string; page?: string; levier?: string; effort?: string; signal?: string; effet?: string; changement?: unknown }[]
  releves?: { requete: string; urls: string[] }[]
}

const texte = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export async function publierRapport(p: Publication) {
  if (p.source !== 'quotidien' && p.source !== 'demande') throw new Error('source invalide')
  const enBref = texte(p.enBref, 4000)
  const contenu = texte(p.contenu, 200_000)
  const cible = texte(p.cible, 160)
  if (!enBref || !contenu || !cible) throw new Error('enBref, contenu et cible sont requis')
  const actions = (Array.isArray(p.actions) ? p.actions : []).slice(0, 40).filter((a) => texte(a?.action, 1000))
  const releves = (Array.isArray(p.releves) ? p.releves : []).slice(0, 80)
    .map((r) => ({ requete: texte(r?.requete, 160), urls: (Array.isArray(r?.urls) ? r.urls : []).filter((u) => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 10) }))
    .filter((r) => r.requete && r.urls.length)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const rap = await client.query<{ id: number }>(
      `INSERT INTO "SeoAgentReport" (demande_id, source, cible, modele, en_bref, concurrent, contenu, requetes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) RETURNING id`,
      [p.demandeId ?? null, p.source, cible, texte(p.modele, 60) || null, enBref, texte(p.concurrent, 120) || null, contenu,
       JSON.stringify(Array.isArray(p.requetes) ? p.requetes.slice(0, 80) : [])])
    const id = rap.rows[0].id
    for (const a of actions) {
      const effort = ['S', 'M', 'L'].includes(String(a.effort)) ? String(a.effort) : null
      await client.query(
        `INSERT INTO "SeoAgentAction" (rapport_id, priorite, action, page, levier, effort, signal, effet, changement) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
        [id, Number.isInteger(a.priorite) ? a.priorite : 2, texte(a.action, 1000), texte(a.page, 400) || null, texte(a.levier, 200) || null,
         // Un changement mal forme n'est pas rejete avec le rapport : l'action reste, sans bouton « Appliquer ».
         effort, texte(a.signal, 600) || null, texte(a.effet, 600) || null, JSON.stringify(validerChangement(a.changement))])
    }
    for (const r of releves) {
      const domaines = r.urls.map(domaine)
      const rang = domaines.findIndex((d) => d.includes('shinecosmetics'))
      await client.query(
        `INSERT INTO "SeoSerpSnapshot" (jour, requete, source, domaines, urls, shine_rang)
         VALUES ((now() AT TIME ZONE 'Africa/Casablanca')::date, $1, 'websearch', $2::jsonb, $3::jsonb, $4)
         ON CONFLICT (jour, requete, source) DO UPDATE SET domaines = EXCLUDED.domaines, urls = EXCLUDED.urls,
           shine_rang = EXCLUDED.shine_rang, releve_le = now()`,
        [r.requete, JSON.stringify(domaines), JSON.stringify(r.urls), rang >= 0 ? rang + 1 : null])
    }
    await client.query(`UPDATE "SeoAgentGroup" SET analyse_le = now() WHERE nom = $1`, [cible])
    if (p.demandeId) {
      await client.query(
        `UPDATE "SeoAgentRequest" SET statut = 'termine', termine_le = now(), rapport_id = $2, erreur = NULL WHERE id = $1`,
        [p.demandeId, id])
    }
    await client.query('COMMIT')
    return { id, actions: actions.length, releves: releves.length }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/** Tout ce que l'ecran affiche, en une lecture. */
export async function ecran() {
  const [ctx, demandes, rapports, actions, series] = await Promise.all([
    contexte(),
    pool.query(`SELECT id, cible, genre, statut, demande_par, demande_le, commence_le, termine_le, erreur, rapport_id
                FROM "SeoAgentRequest" ORDER BY demande_le DESC LIMIT 15`),
    pool.query(`SELECT id, source, cible, cree_le, modele, en_bref, concurrent FROM "SeoAgentReport" ORDER BY cree_le DESC LIMIT 30`),
    // Les actions faites restent 90 jours : c'est apres 7 jours que leur impact devient mesurable.
    pool.query(`SELECT a.id, a.priorite, a.action, a.page, a.levier, a.effort, a.signal, a.effet, a.statut, a.maj_le,
                       a.changement, a.applique_le, a.fait_le, r.id AS rapport_id, r.cible, r.cree_le
                FROM "SeoAgentAction" a JOIN "SeoAgentReport" r ON r.id = a.rapport_id
                WHERE a.statut = 'a_faire' OR a.maj_le > now() - interval '7 days'
                   OR (a.statut = 'fait' AND a.fait_le > now() - interval '90 days')
                ORDER BY (a.statut = 'a_faire') DESC, a.priorite, r.cree_le DESC LIMIT 60`),
    pool.query(`SELECT requete, jour::text AS jour, shine_rang, domaines->>0 AS premier FROM "SeoSerpSnapshot"
                WHERE jour > (now() AT TIME ZONE 'Africa/Casablanca')::date - 30 ORDER BY jour`),
  ])
  const parRequete: Record<string, { jour: string; shineRang: number | null; premier: string | null }[]> = {}
  for (const s of series.rows) (parRequete[s.requete] ||= []).push({ jour: s.jour, shineRang: s.shine_rang, premier: s.premier })
  return {
    ...ctx,
    series: parRequete,
    demandes: demandes.rows,
    rapports: rapports.rows,
    actions: await avecImpact(actions.rows),
    dernierPassage: rapports.rows[0]?.cree_le ?? null,
  }
}

export async function rapport(id: number) {
  const r = await pool.query(`SELECT * FROM "SeoAgentReport" WHERE id = $1`, [id])
  if (!r.rowCount) return null
  const a = await pool.query(`SELECT * FROM "SeoAgentAction" WHERE rapport_id = $1 ORDER BY priorite, id`, [id])
  return { ...r.rows[0], actions: a.rows }
}

export async function majAction(id: number, statut: 'a_faire' | 'fait' | 'ecarte') {
  // fait_le est le point zero de la mesure d'impact : pose au « Fait », efface si l'action est rouverte.
  const r = await pool.query(
    `UPDATE "SeoAgentAction" SET statut = $2, maj_le = now(),
       fait_le = CASE WHEN $2 = 'fait' THEN coalesce(fait_le, now()) ELSE NULL END
     WHERE id = $1 RETURNING id, statut`, [id, statut])
  return r.rows[0] ?? null
}

export async function suivreRequete(requete: string, grappe: string, actif: boolean) {
  const q = requete.trim().toLowerCase()
  if (q.length < 2 || q.length > 120) throw new Error('Requête : entre 2 et 120 caractères.')
  const g = await pool.query(`SELECT 1 FROM "SeoAgentGroup" WHERE nom = $1`, [grappe])
  if (!g.rowCount) throw new Error('Grappe inconnue.')
  await pool.query(
    `INSERT INTO "SeoAgentQuery" (requete, grappe, actif) VALUES ($1, $2, $3)
     ON CONFLICT (requete) DO UPDATE SET grappe = EXCLUDED.grappe, actif = EXCLUDED.actif`, [q, grappe, actif])
  return { requete: q, grappe, actif }
}

/* ------------------------------------------------------------------ */
/* IMPACT : Search Console avant / apres le « Fait »                  */
/* ------------------------------------------------------------------ */

type LignePage = { page: string; day: string; clicks: number; impressions: number; position: number }
export type Impact =
  | { tropTot: true; joursDispo: number; page: string | null }
  | { tropTot: false; jours: number; page: string | null; avant: Agregat; apres: Agregat }

/** Les lignes « page » de Search Console (Maroc) depuis une date, lues une fois pour toutes les actions. */
async function lignesPages(depuis: string): Promise<{ lignes: LignePage[]; derniere: string | null }> {
  const r = await pool.query<LignePage>(
    `SELECT page, day::text AS day, clicks, impressions, position FROM "SeoSearchDaily"
     WHERE property = $1 AND dataset = 'page' AND country = 'mar' AND day >= $2::date`, [PROPERTY, depuis])
  const d = await pool.query<{ d: string | null }>(`SELECT max(day)::text AS d FROM "SeoSearchDaily" WHERE property = $1`, [PROPERTY])
  return {
    lignes: r.rows.map((l) => ({ ...l, clicks: Number(l.clicks), impressions: Number(l.impressions), position: Number(l.position) })),
    derniere: d.rows[0]?.d ?? null,
  }
}

type ActionMesurable = { statut: string; page: string | null; changement: unknown; fait_le: string | Date | null }

function impactDe(a: ActionMesurable & { fait_le: string | Date }, lignes: LignePage[], derniere: string | null): Impact | null {
  const cible = cibleDeAction(a.page, validerChangement(a.changement) as Changement | null)
  if (!cible) return null
  const f = fenetresImpact(new Date(a.fait_le).toISOString(), derniere)
  const page = 'produitId' in cible ? `/products/${cible.produitId}` : cible.chemin
  if (f.tropTot) return { tropTot: true, joursDispo: f.joursDispo, page }
  const siennes = lignes.filter((l) => pageCorrespond(l.page, cible))
  const dans = ([de, jusqua]: readonly [string, string]) =>
    siennes.filter((l) => l.day >= de && l.day <= jusqua).map((l) => ({ query: l.page, day: l.day, clicks: l.clicks, impressions: l.impressions, position: l.position }))
  return { tropTot: false, jours: f.jours, page, avant: agreger(dans(f.avant)), apres: agreger(dans(f.apres)) }
}

async function avecImpact<T extends ActionMesurable>(actions: T[]): Promise<(T & { impact: Impact | null })[]> {
  const faites = actions.filter((a) => a.statut === 'fait' && a.fait_le)
  if (!faites.length) return actions.map((a) => ({ ...a, impact: null }))
  const plusAncien = faites.reduce((m, a) => Math.min(m, new Date(a.fait_le as string | Date).getTime()), Date.now())
  const { lignes, derniere } = await lignesPages(new Date(plusAncien - 30 * 864e5).toISOString().slice(0, 10))
  return actions.map((a) => ({
    ...a,
    impact: a.statut === 'fait' && a.fait_le ? impactDe(a as T & { fait_le: string | Date }, lignes, derniere) : null,
  }))
}

async function actionsFaitesAvecImpact() {
  const r = await pool.query(
    `SELECT a.id, a.action, a.page, a.changement, a.fait_le, a.applique_le, a.statut, r.cible
     FROM "SeoAgentAction" a JOIN "SeoAgentReport" r ON r.id = a.rapport_id
     WHERE a.statut = 'fait' AND a.fait_le IS NOT NULL ORDER BY a.fait_le DESC LIMIT 20`)
  return avecImpact(r.rows)
}

/* ------------------------------------------------------------------ */
/* APPLIQUER / ANNULER un changement prepare par l'agent             */
/* ------------------------------------------------------------------ */

type Faq = { questionFR?: string; questionAR?: string; answerFR?: string; answerAR?: string }

/**
 * Ecrit le changement sur la fiche, garde l'ancienne valeur, marque l'action
 * faite, puis rafraichit le site. Une seule transaction : ou tout, ou rien.
 */
export async function appliquerAction(id: number) {
  const client = await pool.connect()
  let produitId: number
  try {
    await client.query('BEGIN')
    const r = await client.query(`SELECT id, changement, applique_le FROM "SeoAgentAction" WHERE id = $1 FOR UPDATE`, [id])
    const a = r.rows[0]
    if (!a) throw new Error('Action introuvable.')
    const c = validerChangement(a.changement)
    if (!c) throw new Error('Cette action n’a pas de changement prêt à appliquer.')
    if (a.applique_le) throw new Error('Déjà appliqué.')
    produitId = c.produitId
    const p = await client.query(`SELECT id, "metaTitle", faqs FROM "Product" WHERE id = $1 FOR UPDATE`, [c.produitId])
    if (!p.rowCount) throw new Error(`Produit #${c.produitId} introuvable.`)
    let avant: Record<string, unknown>
    if (c.type === 'metaTitle') {
      avant = { metaTitle: p.rows[0].metaTitle }
      await client.query(`UPDATE "Product" SET "metaTitle" = $2, "updatedAt" = NOW() WHERE id = $1`, [c.produitId, c.valeur])
    } else {
      const faqs: Faq[] = Array.isArray(p.rows[0].faqs) ? p.rows[0].faqs : []
      if (faqs.some((f) => norm(f.questionFR || '') === norm(c.questionFR))) throw new Error('Cette question existe déjà dans la FAQ de la fiche.')
      avant = { faqAjoutee: c.questionFR }
      const nouvelles = [...faqs, { questionFR: c.questionFR, answerFR: c.reponseFR, questionAR: c.questionAR, answerAR: c.reponseAR }]
      await client.query(`UPDATE "Product" SET faqs = $2::jsonb, "updatedAt" = NOW() WHERE id = $1`, [c.produitId, JSON.stringify(nouvelles)])
    }
    await client.query(
      `UPDATE "SeoAgentAction" SET avant = $2::jsonb, applique_le = now(), statut = 'fait', fait_le = now(), maj_le = now() WHERE id = $1`,
      [id, JSON.stringify(avant)])
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
  await revalidateWebsite(['products'])
  return { id, produitId }
}

/**
 * Defait exactement ce que « Appliquer » a fait — et refuse si quelqu'un a
 * modifie le champ entre-temps : on ne remplace pas une correction faite a la
 * main par une valeur perimee.
 */
export async function annulerAction(id: number) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const r = await client.query(`SELECT id, changement, avant, applique_le FROM "SeoAgentAction" WHERE id = $1 FOR UPDATE`, [id])
    const a = r.rows[0]
    const c = validerChangement(a?.changement)
    if (!a || !c || !a.applique_le) throw new Error('Rien à annuler.')
    const p = await client.query(`SELECT "metaTitle", faqs FROM "Product" WHERE id = $1 FOR UPDATE`, [c.produitId])
    if (c.type === 'metaTitle') {
      if ((p.rows[0]?.metaTitle ?? '') !== c.valeur) throw new Error('Le titre a été modifié depuis : annulation refusée pour ne pas écraser ce changement.')
      await client.query(`UPDATE "Product" SET "metaTitle" = $2, "updatedAt" = NOW() WHERE id = $1`, [c.produitId, a.avant?.metaTitle ?? null])
    } else {
      const faqs: Faq[] = Array.isArray(p.rows[0]?.faqs) ? p.rows[0].faqs : []
      const restantes = faqs.filter((f) => norm(f.questionFR || '') !== norm(c.questionFR))
      await client.query(`UPDATE "Product" SET faqs = $2::jsonb, "updatedAt" = NOW() WHERE id = $1`, [c.produitId, JSON.stringify(restantes)])
    }
    await client.query(
      `UPDATE "SeoAgentAction" SET avant = NULL, applique_le = NULL, statut = 'a_faire', fait_le = NULL, maj_le = now() WHERE id = $1`, [id])
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
  await revalidateWebsite(['products'])
  return { id }
}
