import 'server-only'
import pool from '@/lib/db'
import { StrategieSchema, manquesStrategie, strategieParDefaut, type Strategie } from './strategie-model'
import { estBoost, fatigue, indicateurs, type Cumul } from './meta-model'
import { economieProduits, verite } from './verite'
import { conseils, verdicts } from './conseils'
import { commandesEnRoute, moisEnCours, serie as serieDe } from './series'
import { imagesDesCreations, optionsDesCreations } from './images'
import { fautesFrancais, idees } from './direction-model'

/**
 * L'AGENT META ADS, COTE BOS : sa strategie, sa file de demandes, sa memoire,
 * et ce que l'ecran /ads/agent affiche.
 *
 * L'agent est un Claude (routines cloud d'Anthropic) : consultant, analyste et
 * createur. Il lit son contexte et publie ses rapports par
 * /api/ops/ads/agent/machine/*, avec un jeton. Il ne modifie RIEN dans Meta :
 * il recommande (couper, augmenter, tester, lancer) et propose des creations ;
 * Achraf decide et agit dans le gestionnaire de publicites.
 */

export type GenreAds = 'analyse' | 'creatifs' | 'audit' | 'question'
const GENRES: GenreAds[] = ['analyse', 'creatifs', 'audit', 'question']
const TYPES_ACTION = ['couper', 'reduire', 'augmenter', 'tester', 'lancer', 'corriger_suivi', 'offre', 'autre'] as const
const FORMATS = ['image', 'carrousel', 'video', 'reel', 'story'] as const
const texte = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/* ------------------------------------------------------------------ */
/* STRATEGIE                                                           */
/* ------------------------------------------------------------------ */

export async function strategie(): Promise<{ config: Strategie; modifie_le: string | null; modifie_par: string | null }> {
  const r = await pool.query(`SELECT config, modifie_le, modifie_par FROM "AdsStrategy" ORDER BY id DESC LIMIT 1`)
  if (!r.rowCount) return { config: strategieParDefaut(), modifie_le: null, modifie_par: null }
  const p = StrategieSchema.safeParse(r.rows[0].config)
  return { config: p.success ? p.data : strategieParDefaut(), modifie_le: r.rows[0].modifie_le, modifie_par: r.rows[0].modifie_par }
}

/** Chaque enregistrement est une nouvelle version : on garde l'historique de ce qu'on a demande a l'agent. */
export async function enregistrerStrategie(config: unknown, par: string | null) {
  const p = StrategieSchema.safeParse(config)
  if (!p.success) throw new Error(p.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`).join(' · '))
  const { budgetJourMax: jour, budgetMensuel: mois } = p.data
  if (jour != null && mois != null && jour > 0 && jour * 31 < mois)
    throw new Error(`Avec ${jour} DH par jour au plus, on ne peut pas dépenser ${mois} DH dans le mois : ajuste l’un des deux.`)
  const r = await pool.query(`INSERT INTO "AdsStrategy" (config, modifie_par) VALUES ($1::jsonb, $2) RETURNING id, modifie_le`, [JSON.stringify(p.data), par])
  return { id: r.rows[0].id, modifie_le: r.rows[0].modifie_le, config: p.data }
}

export async function historiqueStrategie() {
  const r = await pool.query(`SELECT id, modifie_le, modifie_par FROM "AdsStrategy" ORDER BY id DESC LIMIT 10`)
  return r.rows
}

/* ------------------------------------------------------------------ */
/* DEMANDES                                                            */
/* ------------------------------------------------------------------ */

async function liberer() {
  await pool.query(`UPDATE "AdsAgentRequest" SET statut = 'erreur', termine_le = now(), erreur = 'Aucun rapport reçu dans les deux heures'
                    WHERE statut = 'en_cours' AND commence_le < now() - interval '2 hours'`)
}

export async function creerDemande(genre: GenreAds, sujet: string, par: string | null) {
  if (!GENRES.includes(genre)) throw new Error('Type de demande invalide.')
  const s = sujet.trim()
  if (s.length < 3 || s.length > 1500) throw new Error('Sujet : entre 3 et 1 500 caractères.')
  const n = await pool.query<{ n: number }>(`SELECT count(*)::int n FROM "AdsAgentRequest" WHERE statut IN ('en_attente', 'en_cours')`)
  if (n.rows[0].n >= 5) throw new Error('Cinq demandes attendent déjà : patiente jusqu’au prochain passage de l’agent.')
  const r = await pool.query(`INSERT INTO "AdsAgentRequest" (genre, sujet, demande_par) VALUES ($1, $2, $3) RETURNING id, genre, sujet, statut, demande_le`, [genre, s, par])
  return r.rows[0]
}

/**
 * Reserve la plus ancienne demande en attente. Le directeur artistique (routine
 * a part, reveillee a la demande) ne prend que les « direction » ; la routine
 * horaire prend tout le reste.
 */
export async function reclamerDemande(direction = false) {
  await liberer()
  const r = await pool.query(
    `UPDATE "AdsAgentRequest" SET statut = 'en_cours', commence_le = now()
     WHERE id = (SELECT id FROM "AdsAgentRequest" WHERE statut = 'en_attente' AND (genre = 'direction') = $1 ORDER BY demande_le LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING id, genre, sujet, demande_le, to_jsonb("AdsAgentRequest") -> 'creatif_id' AS creatif_id, to_jsonb("AdsAgentRequest") -> 'parametres' AS parametres`, [direction])
  return r.rows[0] ?? null
}

export async function echecDemande(id: number, erreur: string) {
  await pool.query(`UPDATE "AdsAgentRequest" SET statut = 'erreur', termine_le = now(), erreur = left($2, 500) WHERE id = $1 AND statut = 'en_cours'`, [id, erreur])
}

/* ------------------------------------------------------------------ */
/* PERFORMANCE DES PUBS                                                */
/* ------------------------------------------------------------------ */

const SOMMES = `coalesce(sum(d.depense),0)::float depense, coalesce(sum(d.impressions),0)::int impressions, coalesce(sum(d.clics_lien),0)::int clics_lien,
  coalesce(sum(d.vues_page),0)::int vues_page, coalesce(sum(d.achats),0)::int achats, coalesce(sum(d.valeur_achats),0)::float valeur_achats,
  coalesce(sum(d.messages),0)::int messages, coalesce(sum(d.vues_video_3s),0)::int vues_video_3s, coalesce(sum(d.thruplays),0)::int thruplays`

const cumul = (r: Record<string, number>): Cumul => ({
  depense: Number(r.depense), impressions: Number(r.impressions), clicsLien: Number(r.clics_lien), vuesPage: Number(r.vues_page),
  achats: Number(r.achats), valeurAchats: Number(r.valeur_achats), messages: Number(r.messages), vuesVideo3s: Number(r.vues_video_3s), thruplays: Number(r.thruplays),
})

/** Chaque pub active ou ayant depense sur 30 jours : 7 j contre 30 j, creation, fatigue, boost. */
export async function performancePubs(frequenceMax = 3) {
  const [trente, sept] = await Promise.all([
    pool.query(`SELECT a.*, ${SOMMES} FROM "MetaAd" a JOIN "MetaAdDaily" d ON d.ad_id = a.ad_id AND d.jour > current_date - 30 GROUP BY a.ad_id ORDER BY depense DESC LIMIT 60`),
    pool.query(`SELECT d.ad_id, ${SOMMES} FROM "MetaAdDaily" d WHERE d.jour > current_date - 7 GROUP BY d.ad_id`),
  ])
  const parAd = new Map(sept.rows.map((r) => [r.ad_id, cumul(r)]))
  return trente.rows.map((a) => {
    const c30 = cumul(a), c7 = parAd.get(a.ad_id) ?? cumul({} as Record<string, number>)
    const i30 = indicateurs(c30), i7 = indicateurs(c7)
    return {
      adId: a.ad_id, nom: a.nom, statut: a.statut, campagne: a.campagne, objectif: a.objectif, optimisation: a.optimisation,
      budgetJour: a.budget_jour == null ? null : Number(a.budget_jour), format: a.format,
      texte: (a.texte || '').slice(0, 280), titre: a.titre, cta: a.cta, vignette: a.vignette, permalien: a.permalien, creeLe: a.cree_le,
      frequence7j: a.frequence_7j == null ? null : Number(a.frequence_7j),
      boost: estBoost(a.objectif, a.optimisation),
      fatigue: fatigue(a.frequence_7j == null ? null : Number(a.frequence_7j), i7.ctr, i30.ctr, frequenceMax),
      j30: { ...c30, ...i30 }, j7: { ...c7, ...i7 },
    }
  })
}

async function derniereSynchro() {
  const r = await pool.query(`SELECT max(maj_le) AS d, max(jour)::text AS jour FROM "MetaAdDaily"`).catch(() => ({ rows: [{ d: null, jour: null }] }))
  return { le: r.rows[0].d, jusquAu: r.rows[0].jour }
}

type LigneRepartition = { dimension: string; valeur: string; depense: number; impressions: number; clics_lien: number; achats: number; messages: number }
async function repartitions(): Promise<Record<string, LigneRepartition[]>> {
  const r = await pool.query<LigneRepartition>(`SELECT dimension, valeur, depense::float AS depense, impressions, clics_lien, achats, messages FROM "MetaBreakdown"
                              WHERE (fin, jours) = (SELECT fin, jours FROM "MetaBreakdown" ORDER BY fin DESC LIMIT 1) ORDER BY dimension, depense DESC`)
  const out: Record<string, LigneRepartition[]> = {}
  for (const x of r.rows) (out[x.dimension] ||= []).push(x)
  return out
}

/* ------------------------------------------------------------------ */
/* CONTEXTE (pour l'agent)                                             */
/* ------------------------------------------------------------------ */

export async function contexte() {
  const s = await strategie()
  const [v7, v30, v90, v365, pubs, produits, reparts, synchro, ouvertes, faites, creatifs] = await Promise.all([
    verite(7), verite(30), verite(90), verite(365), performancePubs(s.config.regles.frequenceMax), economieProduits(60), repartitions(), derniereSynchro(),
    pool.query(`SELECT a.id, a.priorite, a.type, a.action, a.cible, a.signal, r.cree_le FROM "AdsAgentAction" a JOIN "AdsAgentReport" r ON r.id = a.rapport_id WHERE a.statut = 'a_faire' ORDER BY a.priorite, r.cree_le DESC LIMIT 30`),
    pool.query(`SELECT id, type, action, cible, fait_le FROM "AdsAgentAction" WHERE statut = 'fait' AND fait_le > now() - interval '60 days' ORDER BY fait_le DESC LIMIT 30`),
    pool.query(`SELECT id, angle, format, accroche, produit_ids, statut, ad_id, cree_le FROM "AdsCreative" ORDER BY cree_le DESC LIMIT 25`),
  ])
  const manques: string[] = []
  if (!synchro.le) manques.push('Aucune donnée Meta au niveau publicité : lancer la synchro (bos.mjs synchro).')
  const sansSuivi = v90.parCanal.filter((c) => ['Instagram', 'WhatsApp'].includes(c.canal)).reduce((n, c) => n + c.commandes, 0)
  if (sansSuivi) manques.push(`${sansSuivi} commandes livrées en 90 j viennent d’Instagram ou WhatsApp sans lien avec une pub : Meta ne les voit pas.`)
  return {
    genereLe: new Date().toISOString(),
    strategie: { ...s, manques: manquesStrategie(s.config) },
    verite: { j7: v7, j30: v30, j90: v90, j365: v365 },
    pubs, produits, repartitions: reparts, synchro,
    actionsOuvertes: ouvertes.rows, actionsFaites: faites.rows, creatifsRecents: creatifs.rows,
    donneesManquantes: manques,
    rappel: 'Meta ne voit que le pixel. Juge chaque pub à ce qu’elle rapporte en commandes LIVRÉES et en marge, pas au ROAS de Meta.',
  }
}

/* ------------------------------------------------------------------ */
/* RAPPORTS                                                            */
/* ------------------------------------------------------------------ */

export type PublicationAds = {
  demandeId?: number; source: 'quotidien' | 'hebdo' | 'demande'; titre: string; modele?: string
  enBref: string; contenu: string; chiffres?: Record<string, unknown>
  actions?: { priorite?: number; type: string; action: string; cible?: string; signal?: string; effet?: string; effort?: string }[]
  creatifs?: { produitIds?: number[]; angle: string; format: string; public?: string; accroche: string; script?: string; texteFr?: string; texteDarija?: string; texteAr?: string; titre?: string; cta?: string; visuel?: string }[]
}

export async function publierRapport(p: PublicationAds) {
  if (!['quotidien', 'hebdo', 'demande'].includes(p.source)) throw new Error('source : quotidien, hebdo ou demande.')
  const titre = texte(p.titre, 200), enBref = texte(p.enBref, 3000), contenu = texte(p.contenu, 100_000)
  if (titre.length < 3 || enBref.length < 20 || contenu.length < 50) throw new Error('titre, enBref (20+) et contenu (50+) requis.')
  const actions = (p.actions || []).slice(0, 20)
  for (const a of actions) {
    if (!TYPES_ACTION.includes(a.type as (typeof TYPES_ACTION)[number])) throw new Error(`type d’action inconnu : ${a.type} (${TYPES_ACTION.join(', ')}).`)
    if (texte(a.action, 1500).length < 10) throw new Error('chaque action a un texte de 10 caractères au moins.')
  }
  const creatifs = (p.creatifs || []).slice(0, 12)
  for (const c of creatifs) {
    if (!FORMATS.includes(c.format as (typeof FORMATS)[number])) throw new Error(`format inconnu : ${c.format} (${FORMATS.join(', ')}).`)
    if (texte(c.angle, 300).length < 3 || texte(c.accroche, 500).length < 5) throw new Error('chaque créatif a un angle et une accroche.')
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (p.demandeId != null) {
      const d = await client.query(`SELECT statut FROM "AdsAgentRequest" WHERE id = $1 FOR UPDATE`, [p.demandeId])
      if (!d.rowCount) throw new Error('Demande inconnue.')
      if (d.rows[0].statut !== 'en_cours') throw new Error('Cette demande n’est pas en cours : réclame-la d’abord.')
    }
    const r = await client.query(
      `INSERT INTO "AdsAgentReport" (demande_id, source, titre, modele, en_bref, contenu, chiffres) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING id`,
      [p.demandeId ?? null, p.source, titre, texte(p.modele, 100) || null, enBref, contenu, JSON.stringify(p.chiffres || {})])
    const id = r.rows[0].id
    for (const a of actions) {
      await client.query(
        `INSERT INTO "AdsAgentAction" (rapport_id, priorite, type, action, cible, signal, effet, effort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, Math.min(3, Math.max(1, Math.round(Number(a.priorite) || 2))), a.type, texte(a.action, 1500), texte(a.cible, 300) || null,
          texte(a.signal, 1500) || null, texte(a.effet, 800) || null, ['S', 'M', 'L'].includes(String(a.effort)) ? a.effort : null])
    }
    const creatifIds: number[] = []
    for (const c of creatifs) {
      const ids = (c.produitIds || []).map(Number).filter((x) => Number.isInteger(x) && x > 0).slice(0, 10)
      const ins = await client.query(
        `INSERT INTO "AdsCreative" (rapport_id, produit_ids, angle, format, public, accroche, script, texte_fr, texte_darija, texte_ar, titre, cta, visuel)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [id, ids, texte(c.angle, 300), c.format, texte(c.public, 500) || null, texte(c.accroche, 500), texte(c.script, 5000) || null,
          texte(c.texteFr, 2200) || null, texte(c.texteDarija, 2200) || null, texte(c.texteAr, 2200) || null, texte(c.titre, 120) || null,
          texte(c.cta, 60) || null, texte(c.visuel, 3000) || null])
      creatifIds.push(ins.rows[0].id)
    }
    if (p.demandeId != null) await client.query(`UPDATE "AdsAgentRequest" SET statut = 'termine', termine_le = now(), rapport_id = $2 WHERE id = $1`, [p.demandeId, id])
    await client.query('COMMIT')
    return { id, actions: actions.length, creatifs: creatifs.length, creatifIds }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/* ------------------------------------------------------------------ */
/* ECRAN ET GESTES                                                     */
/* ------------------------------------------------------------------ */

/** Les periodes de l'ecran : 7 et 30 jours, puis 3, 6, 9 et 12 mois. */
export const PERIODES = [7, 30, 90, 180, 270, 365] as const

export async function ecran(jours = 30) {
  const s = await strategie()
  const [v, precedent, serie, mois, enRoute, historique, pubs, produits, demandes, rapports, actions, creatifs, synchro, reparts] = await Promise.all([
    verite(jours), verite(jours, jours), serieDe(jours), moisEnCours(), commandesEnRoute(),
    historiqueStrategie(), performancePubs(s.config.regles.frequenceMax), economieProduits(60),
    // SELECT * : creatif_id, parametres et resultat n'existent qu'apres la migration 049.
    pool.query(`SELECT * FROM "AdsAgentRequest" ORDER BY demande_le DESC LIMIT 15`),
    pool.query(`SELECT id, source, titre, cree_le, modele, en_bref FROM "AdsAgentReport" ORDER BY cree_le DESC LIMIT 20`),
    pool.query(`SELECT a.*, r.titre AS rapport_titre, r.cree_le AS rapport_le FROM "AdsAgentAction" a JOIN "AdsAgentReport" r ON r.id = a.rapport_id
                WHERE a.statut = 'a_faire' OR a.maj_le > now() - interval '7 days' ORDER BY (a.statut = 'a_faire') DESC, a.priorite, r.cree_le DESC LIMIT 40`),
    pool.query(`SELECT * FROM "AdsCreative" WHERE statut <> 'ecartee' OR maj_le > now() - interval '7 days' ORDER BY cree_le DESC LIMIT 30`),
    derniereSynchro(), repartitions(),
  ])
  const catalogue = await pool.query(
    `SELECT id, name AS nom, brand AS marque, category AS categorie, image, (coalesce(stock, 0) + coalesce("virtualStock", 0))::int AS stock_vendable,
            coalesce("importUnavailable", false) AS import_bloque
     FROM "Product" WHERE active = true AND coalesce(discontinued, false) = false ORDER BY brand, name`)
  const manques = manquesStrategie(s.config)
  const cfg = s.config
  const ids = creatifs.rows.map((c) => c.id)
  const [images, options] = await Promise.all([imagesDesCreations(ids), optionsDesCreations(ids)])
  const verd = verdicts(pubs, cfg.regles.depenseMinAvantVerdict)
  return {
    strategie: { ...s, manques, historique }, verite: v, precedent, serie: serie.points, pas: serie.pas, mois, enRoute, pubs, produits,
    verdicts: verd,
    conseils: conseils({
      // Une periode d'avant tronquee (avant l'ouverture) ne sert pas de reference.
      v, precedent: precedent.partiel ? null : precedent, pubs, produits, enAttente: enRoute, repartitions: reparts, ...mois,
      strategie: { budgetMensuel: cfg.budgetMensuel, coutParCommandeMax: cfg.cibles.coutParCommandeMax, frequenceMax: cfg.regles.frequenceMax,
        depenseMinAvantVerdict: cfg.regles.depenseMinAvantVerdict, boostsAutorises: cfg.regles.boostsAutorises, manques, produitsExclus: cfg.produitsExclus },
    }),
    demandes: demandes.rows, rapports: rapports.rows, actions: actions.rows,
    creatifs: creatifs.rows.map((c) => ({ ...c, images: images[c.id] ?? [], options: options[c.id] ?? [] })), synchro, repartitions: reparts,
    catalogue: catalogue.rows.map((p) => ({ id: p.id, nom: p.nom, marque: p.marque, categorie: p.categorie, image: p.image, stockVendable: p.stock_vendable, importBloque: p.import_bloque })),
    idees: idees({
      produits, exclus: cfg.produitsExclus, mois: new Date().getMonth(),
      pubsGagnantes: pubs.filter((x) => verd[x.adId]?.verdict === 'gagnante').map((x) => ({ nom: x.nom, texte: x.texte, raison: verd[x.adId].raison })),
    }),
  }
}

export async function rapport(id: number) {
  const r = await pool.query(`SELECT * FROM "AdsAgentReport" WHERE id = $1`, [id])
  if (!r.rowCount) return null
  const [a, c] = await Promise.all([
    pool.query(`SELECT * FROM "AdsAgentAction" WHERE rapport_id = $1 ORDER BY priorite, id`, [id]),
    pool.query(`SELECT * FROM "AdsCreative" WHERE rapport_id = $1 ORDER BY id`, [id]),
  ])
  return { ...r.rows[0], actions: a.rows, creatifs: c.rows }
}

export async function majAction(id: number, statut: 'a_faire' | 'fait' | 'ecarte') {
  const r = await pool.query(
    `UPDATE "AdsAgentAction" SET statut = $2, maj_le = now(), fait_le = CASE WHEN $2 = 'fait' THEN coalesce(fait_le, now()) ELSE NULL END
     WHERE id = $1 RETURNING id, statut`, [id, statut])
  return r.rows[0] ?? null
}

export async function majCreatif(id: number, statut: 'idee' | 'validee' | 'produite' | 'en_ligne' | 'ecartee', adId?: string | null) {
  const r = await pool.query(
    `UPDATE "AdsCreative" SET statut = $2, ad_id = coalesce($3, ad_id), maj_le = now() WHERE id = $1 RETURNING id, statut, ad_id`,
    [id, statut, adId && /^\d{5,30}$/.test(adId) ? adId : null])
  return r.rows[0] ?? null
}

/* ------------------------------------------------------------------ */
/* LE STUDIO CREATIF (/ads/studio)                                     */
/* ------------------------------------------------------------------ */

/**
 * Tout ce que le studio affiche, sans l'analyse du compte (verite, series,
 * rapports) : les creations et leurs visuels, options, plans ; le catalogue
 * avec ses prix (pour le sticker de prix d'un Reel) ; les idees de brief ; et
 * les resultats des pubs deja en ligne, pour apprendre de ce qui marche.
 */
export async function ecranStudio() {
  const s = await strategie()
  const cfg = s.config
  const [pubs, produits, demandes, creatifs, catalogue] = await Promise.all([
    performancePubs(cfg.regles.frequenceMax), economieProduits(60),
    pool.query(`SELECT * FROM "AdsAgentRequest" WHERE genre = 'direction' ORDER BY demande_le DESC LIMIT 15`),
    pool.query(`SELECT * FROM "AdsCreative" WHERE statut <> 'ecartee' OR maj_le > now() - interval '30 days' ORDER BY cree_le DESC LIMIT 60`),
    pool.query(`SELECT id, name AS nom, brand AS marque, category AS categorie, image, price::float AS prix, (coalesce(stock, 0) + coalesce("virtualStock", 0))::int AS stock_vendable,
                       coalesce("importUnavailable", false) AS import_bloque
                FROM "Product" WHERE active = true AND coalesce(discontinued, false) = false ORDER BY brand, name`),
  ])
  const ids = creatifs.rows.map((c) => c.id)
  const [images, options] = await Promise.all([imagesDesCreations(ids), optionsDesCreations(ids)])
  const verd = verdicts(pubs, cfg.regles.depenseMinAvantVerdict)
  const parAd = new Map(pubs.map((p) => [p.adId, p]))
  return {
    strategie: { langues: cfg.langues, ton: cfg.ton, public: cfg.public },
    creatifs: creatifs.rows.map((c) => {
      const p = c.ad_id ? parAd.get(c.ad_id) : undefined
      return {
        ...c, images: images[c.id] ?? [], options: options[c.id] ?? [],
        resultat: p ? { depense: p.j30.depense, messages: p.j30.messages, achats: p.j30.achats, coutParResultat: p.j30.coutParResultat, ctr: p.j30.ctr, verdict: verd[p.adId]?.verdict ?? null, statut: p.statut } : null,
      }
    }),
    demandes: demandes.rows,
    catalogue: catalogue.rows.map((p) => ({ id: p.id, nom: p.nom, marque: p.marque, categorie: p.categorie, image: p.image, prix: Number(p.prix), stockVendable: p.stock_vendable, importBloque: p.import_bloque })),
    produits,
    idees: idees({
      produits, exclus: cfg.produitsExclus, mois: new Date().getMonth(),
      pubsGagnantes: pubs.filter((x) => verd[x.adId]?.verdict === 'gagnante').map((x) => ({ nom: x.nom, texte: x.texte, raison: verd[x.adId].raison })),
    }),
    pubsEnLigne: pubs.filter((p) => p.statut === 'ACTIVE').map((p) => ({ adId: p.adId, nom: p.nom, vignette: p.vignette })),
  }
}

/** Les textes de la pub (legende, accroche, titre, bouton) : le francais passe le meme controle d'accents que les images. */
export async function majTextesCreatif(id: number, patch: Record<string, unknown>) {
  const champs: [string, string, number][] = [['accroche', 'accroche', 500], ['texteFr', 'texte_fr', 2200], ['texteDarija', 'texte_darija', 2200], ['texteAr', 'texte_ar', 2200], ['titre', 'titre', 120], ['cta', 'cta', 60]]
  const sets: string[] = [], vals: unknown[] = [id]
  for (const [cle, colonne, max] of champs) {
    if (typeof patch[cle] !== 'string') continue
    const v = String(patch[cle]).trim().slice(0, max)
    if (['accroche', 'texteFr', 'titre', 'cta'].includes(cle)) {
      const fautes = fautesFrancais(v)
      if (fautes.length) throw new Error(`${cle === 'texteFr' ? 'Texte français' : cle} : français sans accents (${fautes.map((f) => `« ${f} »`).join(', ')}).`)
    }
    if (cle === 'accroche' && v.length < 5) throw new Error('L’accroche fait au moins 5 caractères.')
    vals.push(v || null); sets.push(`${colonne} = $${vals.length}`)
  }
  if (!sets.length) throw new Error('Rien à enregistrer.')
  const r = await pool.query(`UPDATE "AdsCreative" SET ${sets.join(', ')}, maj_le = now() WHERE id = $1 RETURNING *`, vals)
  if (!r.rowCount) throw new Error('Création introuvable.')
  return r.rows[0]
}
