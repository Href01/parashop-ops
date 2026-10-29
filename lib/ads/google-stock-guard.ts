import pool from '@/lib/db'
import { googleAdsConfigured, googleAdsMutate, googleAdsSearch } from '@/lib/google-ads'
import { envoyer, h } from '@/lib/telegram'

/**
 * LA GARDE DE STOCK — une pub ne doit jamais envoyer une cliente vers un produit
 * epuise : le clic est paye, la vente impossible.
 *
 * Chaque groupe d'annonces dit ce qu'il vend dans son NOM :
 *   « Olaplex N°3 [p15] »            → le produit 15 (ou « [p15,16] » : plusieurs)
 *   « Olaplex — marque [marque:Olaplex] » → toute la marque
 * Quand AUCUN des produits d'un groupe n'est vendable (stock + stock virtuel,
 * actif, pas « indisponible a l'import » — la meme regle que la boutique), le
 * groupe est mis en PAUSE et l'alerte part sur Telegram.
 *
 * REGLE ABSOLUE : cette garde ne fait que PAUSER. Elle ne reactive jamais rien :
 * relancer de la depense reste une decision d'Achraf. Une erreur (Google, base)
 * ne met rien en pause : dans le doute, on ne touche a rien.
 */

const TAG_PRODUITS = /\[p(\d+(?:\s*,\s*\d+)*)\]/i
const TAG_MARQUE = /\[marque:([^\]]+)\]/i

export type Cible = { ids: number[] } | { marque: string } | null

export function cibleDuGroupe(nom: string): Cible {
  const m = nom.match(TAG_MARQUE)
  if (m) return { marque: m[1].trim() }
  const p = nom.match(TAG_PRODUITS)
  if (p) return { ids: p[1].split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0) }
  return null
}

type Groupe = { adGroup?: { id?: string; name?: string }; campaign?: { name?: string } }

const VENDABLE = `COALESCE(p.stock, 0) + COALESCE(p."virtualStock", 0) > 0 AND p.active AND NOT COALESCE(p."importUnavailable", false)`

async function vendable(cible: NonNullable<Cible>): Promise<boolean | null> {
  if ('ids' in cible) {
    if (cible.ids.length === 0) return null
    const r = await pool.query(`SELECT count(*)::int AS trouves, count(*) FILTER (WHERE ${VENDABLE})::int AS ok FROM "Product" p WHERE p.id = ANY($1::int[])`, [cible.ids])
    const { trouves, ok } = r.rows[0] ?? { trouves: 0, ok: 0 }
    return trouves === 0 ? null : ok > 0 // produit introuvable : on ne touche pas au groupe
  }
  const r = await pool.query(`SELECT count(*)::int AS trouves, count(*) FILTER (WHERE ${VENDABLE})::int AS ok FROM "Product" p WHERE p.brand ILIKE $1`, [cible.marque])
  const { trouves, ok } = r.rows[0] ?? { trouves: 0, ok: 0 }
  return trouves === 0 ? null : ok > 0
}

export async function gardeStockGoogle(opts: { dry?: boolean } = {}) {
  if (!googleAdsConfigured()) return { configured: false as const }

  const groupes = await googleAdsSearch<Groupe>(
    `SELECT ad_group.id, ad_group.name, campaign.name
       FROM ad_group
      WHERE ad_group.status = 'ENABLED' AND campaign.status = 'ENABLED'`,
  )

  const aPauser: { id: string; nom: string }[] = []
  let surveilles = 0
  for (const g of groupes) {
    const id = g.adGroup?.id, nom = g.adGroup?.name ?? ''
    const cible = cibleDuGroupe(nom)
    if (!id || !cible) continue
    surveilles++
    if ((await vendable(cible)) === false) aPauser.push({ id: String(id), nom })
  }

  if (aPauser.length > 0 && !opts.dry) {
    const customer = String(process.env.GOOGLE_ADS_CUSTOMER_ID).replace(/\D/g, '')
    await googleAdsMutate(aPauser.map((g) => ({
      adGroupOperation: { update: { resourceName: `customers/${customer}/adGroups/${g.id}`, status: 'PAUSED' }, updateMask: 'status' },
    })))
    for (const g of aPauser) {
      await envoyer('alertes', `⏸ <b>Pub Google en pause</b> — stock épuisé\n${h(g.nom)}\nLe groupe est arrêté pour ne pas payer des clics vers un produit indisponible. À toi de le relancer quand il y a du stock.`)
        .catch(() => false)
    }
  }
  return { configured: true as const, dry: Boolean(opts.dry), surveilles, mis_en_pause: aPauser.map((g) => g.nom) }
}
