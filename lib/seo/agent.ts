import 'server-only'
import pool from '@/lib/db'
import { PROPERTY } from './google'
import { domaine, motsPorteurs, norm } from './agent-model'

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

export type GscRequete = {
  derniereJournee: string | null
  exact28j: Agregat
  variantes28j: Agregat
  variantes7j: Agregat
  variantes7jAvant: Agregat
  topVariantes: { requete: string; impressions: number; position: number | null }[]
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
  actions?: { priorite?: number; action: string; page?: string; levier?: string; effort?: string; signal?: string; effet?: string }[]
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
        `INSERT INTO "SeoAgentAction" (rapport_id, priorite, action, page, levier, effort, signal, effet) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, Number.isInteger(a.priorite) ? a.priorite : 2, texte(a.action, 1000), texte(a.page, 400) || null, texte(a.levier, 200) || null,
         effort, texte(a.signal, 600) || null, texte(a.effet, 600) || null])
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
    pool.query(`SELECT a.id, a.priorite, a.action, a.page, a.levier, a.effort, a.signal, a.effet, a.statut, a.maj_le,
                       r.id AS rapport_id, r.cible, r.cree_le
                FROM "SeoAgentAction" a JOIN "SeoAgentReport" r ON r.id = a.rapport_id
                WHERE a.statut = 'a_faire' OR a.maj_le > now() - interval '7 days'
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
    actions: actions.rows,
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
  const r = await pool.query(`UPDATE "SeoAgentAction" SET statut = $2, maj_le = now() WHERE id = $1 RETURNING id, statut`, [id, statut])
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
