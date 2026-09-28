import 'server-only'
import pool from '@/lib/db'
import { RECETTES, type EtapeSite, type Idee, type Packs } from './direction-model'
import type { Cible } from './reel-model'

/**
 * CE QUE LE DIRECTEUR ARTISTIQUE SAIT DE LA BOUTIQUE ET D'ACHRAF (migration 050) :
 *   - les packs et leurs produits (un pack se montre produit par produit) ;
 *   - les vraies captures du tunnel d'achat (plan « site ») ;
 *   - les charpentes des derniers Reels (pour ne pas refaire le meme) ;
 *   - les retours d'Achraf, relus avant chaque direction.
 * Tant que la migration 050 n'est pas passee, les tables manquent : on rend du vide
 * plutot qu'une erreur, et le reste du BOS continue de marcher.
 */

type Json = Record<string, unknown>
const tableManque = (e: unknown) => (e as { code?: string })?.code === '42P01'
async function ouVide<T>(f: () => Promise<T>, vide: T): Promise<T> {
  try { return await f() } catch (e) { if (tableManque(e)) return vide; throw e }
}

/** Les packs actifs parmi ces produits (tous si `ids` est absent) et leurs produits, dans l'ordre du pack. */
export async function packsDe(ids?: number[]): Promise<Packs> {
  const r = await pool.query(
    `SELECT b."productId" AS pack, array_agg(bi."productId" ORDER BY bi.position NULLS LAST, bi.id) AS comps
     FROM "Bundle" b JOIN "BundleItem" bi ON bi."bundleId" = b.id
     WHERE b.active AND ($1::int[] IS NULL OR b."productId" = ANY($1::int[])) GROUP BY b."productId"`, [ids ?? null])
  return Object.fromEntries(r.rows.map((x) => [x.pack, x.comps as number[]]))
}

export type CaptureSite = { url: string; cible: Cible; bouton: string | null; prix: number | null; captureLe: string }
export type CapturesProduit = Partial<Record<EtapeSite, CaptureSite>>

/** Les captures du site, par produit. */
export async function capturesSite(ids?: number[]): Promise<Record<number, CapturesProduit>> {
  return ouVide(async () => {
    const r = await pool.query(
      `SELECT product_id, etape, url, cible, bouton, prix::float AS prix, capture_le FROM "AdsSiteCapture"
       WHERE $1::int[] IS NULL OR product_id = ANY($1::int[])`, [ids ?? null])
    const out: Record<number, CapturesProduit> = {}
    for (const x of r.rows) (out[x.product_id] ??= {})[x.etape as EtapeSite] = { url: x.url, cible: x.cible, bouton: x.bouton, prix: x.prix, captureLe: x.capture_le }
    return out
  }, {})
}

/** Les suites de mouvements des derniers Reels (une par serie livree), la plus recente d'abord. */
export async function charpentesRecentes(limite = 5): Promise<{ creatifId: number; serie: number; suite: string[]; accroche: string | null }[]> {
  const r = await pool.query(
    `SELECT o.creatif_id, o.serie, array_agg(o.mouvement ORDER BY o.carte, o.id) AS suite, max(o.cree_le) AS le,
            (array_agg(o.texte->>'fr' ORDER BY o.carte, o.id))[1] AS accroche
     FROM "AdsCreativeOption" o WHERE o.mouvement IS NOT NULL
     GROUP BY o.creatif_id, o.serie ORDER BY le DESC LIMIT $1`, [limite])
  return r.rows.map((x) => ({ creatifId: x.creatif_id, serie: x.serie, suite: x.suite, accroche: x.accroche }))
}

export type Lecon = { id: number; texte: string; creatif_id: number | null; par: string | null; active: boolean; cree_le: string }

/** Les retours d'Achraf encore actifs, les plus recents d'abord. */
export async function lecons(toutes = false): Promise<Lecon[]> {
  return ouVide(async () => (await pool.query(
    `SELECT id, texte, creatif_id, par, active, cree_le FROM "AdsDirectionLecon" WHERE $1 OR active ORDER BY cree_le DESC LIMIT 60`, [toutes])).rows as Lecon[], [])
}

export async function ajouterLecon(entree: Json, par: string | null): Promise<Lecon> {
  const texte = String(entree.texte ?? '').trim()
  if (texte.length < 5) throw new Error('Dis en une phrase ce que le directeur artistique doit retenir.')
  if (texte.length > 600) throw new Error('600 caractères au plus : une leçon par retour.')
  const creatifId = Number(entree.creatifId) || null
  const r = await pool.query(`INSERT INTO "AdsDirectionLecon" (texte, creatif_id, par) VALUES ($1, $2, $3) RETURNING *`, [texte, creatifId, par])
  return r.rows[0]
}

export async function basculerLecon(id: number, active: boolean) {
  const r = await pool.query(`UPDATE "AdsDirectionLecon" SET active = $2 WHERE id = $1 RETURNING *`, [id, active])
  if (!r.rowCount) throw new Error('Leçon introuvable.')
  return r.rows[0]
}

/**
 * Les regles de la boutique, telles que le site les applique (reglees dans /admin/livraison) :
 * frais et seuils de livraison, code de bienvenue actif. Une pub n'annonce que ce qui existe.
 */
export async function reglesBoutique() {
  const [l, o] = await Promise.all([
    pool.query(`SELECT value FROM "AppSetting" WHERE key = 'delivery_rates'`),
    pool.query(`SELECT code, discount::float AS remise, "isPercent" AS "enPourcentage", "minOrder"::float AS minimum, "firstOrderOnly" AS "premiereCommande"
                FROM "Promo" WHERE upper(code) = 'BIENVENUE10' AND ("expiresAt" IS NULL OR "expiresAt" > now()) AND ("maxUses" IS NULL OR "usedCount" < "maxUses") LIMIT 1`),
  ])
  let livraison: unknown = null
  try { livraison = l.rows[0] ? JSON.parse(l.rows[0].value) : null } catch { livraison = null }
  return { livraison, offreAccueil: o.rows[0] ?? null, paiement: 'à la livraison (cash)', delai: '24-48 h' }
}

/** Le catalogue enrichi : les produits d'un pack, et ses captures du site. */
export async function enrichirCatalogue<T extends { id: number }>(produits: T[]): Promise<(T & { composants?: number[]; captures?: CapturesProduit })[]> {
  const [packs, captures] = await Promise.all([packsDe(), capturesSite()])
  return produits.map((p) => ({ ...p, ...(packs[p.id] ? { composants: packs[p.id] } : {}), ...(captures[p.id] ? { captures: captures[p.id] } : {}) }))
}

/**
 * DES PROPOSITIONS FAITES POUR SHINE, tirees de ses donnees : ce qui se vend (les soins
 * cheveux), ce qu'on cherche sur le site, les vrais avis, le stock ; et la recette qui
 * convient a chaque produit. Un clic remplit le brief (recette, produits, objectif).
 */
export async function propositions(): Promise<Idee[]> {
  const [cheveux, packs, recherches, recents] = await Promise.all([
    pool.query(`SELECT p.id, p.brand, split_part(p.name, ' – ', 1) AS nom, p.price::float AS prix, (coalesce(p.stock, 0) + coalesce(p."virtualStock", 0))::int AS stock,
        (SELECT count(DISTINCT o.id)::int FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId" WHERE oi."productId" = p.id AND o.status = 'DELIVERED') AS commandes,
        (SELECT trim(r.comment) FROM "Review" r WHERE r."productId" = p.id AND r.approved AND length(trim(coalesce(r.comment, ''))) >= 4 ORDER BY r.rating DESC, r."createdAt" DESC LIMIT 1) AS avis,
        (SELECT r.rating FROM "Review" r WHERE r."productId" = p.id AND r.approved AND length(trim(coalesce(r.comment, ''))) >= 4 ORDER BY r.rating DESC, r."createdAt" DESC LIMIT 1) AS note
      FROM "Product" p WHERE p.active AND p.category = 'Cheveux' AND NOT coalesce(p."importUnavailable", false) AND (coalesce(p.stock, 0) + coalesce(p."virtualStock", 0)) > 0
      ORDER BY commandes DESC LIMIT 12`),
    pool.query(`SELECT p.id, p.brand, p.name AS nom, p.price::float AS prix, (coalesce(p.stock, 0) + coalesce(p."virtualStock", 0))::int AS stock, p.category AS categorie
      FROM "Bundle" b JOIN "Product" p ON p.id = b."productId" WHERE b.active AND p.active AND (coalesce(p.stock, 0) + coalesce(p."virtualStock", 0)) > 0 ORDER BY p.id`),
    pool.query(`SELECT lower(props->>'query') AS q, count(*)::int AS n FROM "AnalyticsEvent" WHERE name IN ('SEARCH', 'SEARCH_QUERY', 'search') AND "createdAt" > now() - interval '90 days' AND props->>'query' IS NOT NULL GROUP BY 1`),
    pool.query(`SELECT DISTINCT unnest(produit_ids) AS id FROM "AdsCreative" WHERE cree_le > now() - interval '3 days'`),
  ])
  const dejaFaits = new Set(recents.rows.map((x) => x.id as number))
  const cherche = (marque: string) => recherches.rows.filter((x) => String(x.q).includes(marque.toLowerCase().slice(0, 5))).reduce((n, x) => n + x.n, 0)
  const out: Idee[] = []
  const base = { type: 'reel' as const, format: 'story' as const, styles: [], qualite: 'high' as const, objectif: 'site' as const, fondShine: true }

  // 1. Le soin cheveux qui se vend le plus, avec un vrai avis : « Tu te reconnais ? ».
  const cheveu = cheveux.rows.find((x) => x.avis && !dejaFaits.has(x.id)) ?? cheveux.rows.find((x) => x.avis)
  if (cheveu) out.push({
    ...base, id: `prop-reconnais-${cheveu.id}`, recette: 'reconnais', nombre: RECETTES.reconnais.plans.length, produitIds: [cheveu.id], montrer: ['cod', 'prix'], offre: 'aucune',
    titre: `« Tu te reconnais ? » — ${cheveu.brand} ${cheveu.nom}`,
    pourquoi: `Les soins cheveux sont ce que tes clientes achètent le plus : ${cheveu.commandes} commandes livrées pour celui-ci, ${cheveu.stock} en stock, et un vrai avis ${cheveu.note}★ « ${cheveu.avis} ».`,
    brief: `Le problème des cheveux montré dès la première seconde (fin d’été : soleil, sel, chlore).\nLe soin ${cheveu.brand} caché, puis dévoilé.\nLa réponse montrée sur la mèche.\nCe qu’il fait vraiment (sa fiche).\nLe vrai avis client.\nL’offre réelle : prix, produit authentique, paiement à la livraison.`,
  })
  // 2. La marque qu'on cherche sur le site (Olaplex…) si un de ses packs est en stock.
  const recherchee = packs.rows.filter((x) => x.categorie === 'Cheveux' && !dejaFaits.has(x.id)).map((x) => ({ ...x, recherches: cherche(x.brand) })).sort((a, b) => b.recherches - a.recherches)[0]
  if (recherchee && recherchee.recherches > 0) out.push({
    ...base, id: `prop-reconnais-${recherchee.id}`, recette: 'reconnais', nombre: RECETTES.reconnais.plans.length, produitIds: [recherchee.id], montrer: ['cod', 'prix', 'pack'], offre: 'pack',
    titre: `« Tu te reconnais ? » — ${recherchee.brand} ${recherchee.nom}`,
    pourquoi: `« ${recherchee.brand.toLowerCase()} » a été cherché ${recherchee.recherches} fois sur ton site en 90 jours : la demande existe. Ce pack est en stock (${recherchee.stock}), ${Math.round(recherchee.prix)} DH.`,
    brief: `Le cheveu abîmé montré dès la première seconde.\nLe soin caché, puis dévoilé.\nLa réponse montrée sur la mèche.\nCe que fait chaque produit du pack.\nUn vrai avis s’il en existe un, sinon la preuve produit.\nL’offre réelle du pack : prix, paiement à la livraison.`,
  })
  // 3. Le pack anti-taches : « Ce que personne ne te dit » (les taches, premier souci de peau au Maroc).
  const taches = packs.rows.find((x) => /tache|éclat|eclat/i.test(x.nom) && !dejaFaits.has(x.id)) ?? packs.rows.find((x) => /tache|éclat|eclat/i.test(x.nom))
  if (taches) out.push({
    ...base, id: `prop-secret-${taches.id}`, recette: 'secret', nombre: RECETTES.secret.plans.length, produitIds: [taches.id], montrer: ['cod', 'pack'], offre: 'bienvenue',
    titre: `« Ce que personne ne te dit » — ${taches.nom}`,
    pourquoi: `Les taches sont le premier souci de peau au Maroc (le soleil toute l’année) et le citron y est un remède courant : le mythe à démonter. En stock (${taches.stock}), ${Math.round(taches.prix)} DH.`,
    brief: `Ce que personne ne te dit sur les taches.\nMontre le problème : le soleil.\nDémonte l’idée reçue : le citron.\nMontre le mécanisme des actifs et la protection solaire.\nLa routine, chaque produit et sa solution.\nL’offre réelle.`,
  })
  // 4. Trois routines de peau en stock : le piège A, B ou C (portée + conseil en DM).
  const trio = ['tache', 'pore', 'âge|age|ride'].map((m) => packs.rows.find((x) => x.categorie !== 'Cheveux' && new RegExp(m, 'i').test(x.nom))).filter(Boolean)
  if (trio.length === 3) out.push({
    ...base, id: 'prop-piege', recette: 'piege', nombre: RECETTES.piege.plans.length, produitIds: trio.map((x) => x!.id), objectif: 'portee', montrer: ['cod'], offre: 'aucune',
    titre: '« Le piège A, B ou C » — trois routines coréennes',
    pourquoi: `Trois routines en stock pour trois problèmes (${trio.map((x) => x!.nom.replace(/^Routine /, '')).join(', ')}) : le jeu fait commenter, et chaque commentaire est une cliente à conseiller en DM.`,
    brief: `Ta peau change… tu prends lequel ?\nA, B ou C, sans donner la réponse : on commente.\nLe piège : ça dépend de ta peau (taches → A, pores → B, rides → C).\nLe vrai site.\nL’offre réelle, conseil gratuit en DM.`,
  })
  return out
}
