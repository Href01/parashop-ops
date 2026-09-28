import 'server-only'
import pool from '@/lib/db'
import type { EtapeSite, Packs } from './direction-model'
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
