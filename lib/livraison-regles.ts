import type { PoolClient } from 'pg'

/**
 * GRILLE DE LIVRAISON : frais et seuil de gratuité, par zone.
 *
 * Reprise de la boutique (lib/livraison.ts) : la cliente paie les frais de sa zone
 * tant que le SOUS-TOTAL des produits (avant code promo) n'atteint pas le seuil.
 * Les chiffres se règlent dans /admin/livraison (AppSetting `delivery_rates`) ; ceux
 * d'ici ne servent que de repli si la lecture échoue.
 */

export type TarifZone = { frais: number; gratuitDes: number }
export type TarifsLivraison = { casa: TarifZone; autres: TarifZone }

export const TARIFS_PAR_DEFAUT: TarifsLivraison = {
  casa: { frais: 19, gratuitDes: 300 },
  autres: { frais: 35, gratuitDes: 600 },
}

function montant(v: unknown): number | null {
  if (typeof v !== 'number' && typeof v !== 'string') return null
  if (typeof v === 'string' && !v.trim()) return null
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) && n >= 0 && n <= 100_000 ? Math.round(n) : null
}

/** Un champ illisible reprend sa valeur par défaut : la livraison ne devient jamais gratuite par accident. */
export function normaliserTarifs(brut: unknown): TarifsLivraison {
  const o = (brut && typeof brut === 'object' ? brut : {}) as Record<string, Record<string, unknown> | undefined>
  const zone = (cle: 'casa' | 'autres'): TarifZone => ({
    frais: montant(o[cle]?.frais) ?? TARIFS_PAR_DEFAUT[cle].frais,
    gratuitDes: montant(o[cle]?.gratuitDes) ?? TARIFS_PAR_DEFAUT[cle].gratuitDes,
  })
  return { casa: zone('casa'), autres: zone('autres') }
}

export async function lireTarifsLivraison(client: PoolClient): Promise<TarifsLivraison> {
  const r = await client.query<{ value: string }>(`SELECT value FROM "AppSetting" WHERE key = 'delivery_rates'`)
  if (!r.rows[0]) return TARIFS_PAR_DEFAUT
  try { return normaliserTarifs(JSON.parse(r.rows[0].value)) } catch { return TARIFS_PAR_DEFAUT }
}

/** La ville du formulaire (« Casablanca », « casablanca - Maarif »…) ramenée à sa zone tarifaire. */
export function zoneDeVille(ville: string | null | undefined): 'casa' | 'autres' {
  return String(ville || '').toLowerCase().includes('casablanca') ? 'casa' : 'autres'
}

/**
 * LA GRILLE OFFRIRAIT-ELLE LA LIVRAISON À CETTE COMMANDE ?
 *
 * Modifier les lignes ne recalcule pas la livraison : une commande qui franchit le seuil
 * de gratuité continue de la facturer (362 : panier passé de 450 à 615 MAD, seuil 499,
 * 35 MAD encore comptés). On le PROPOSE, on ne l'applique jamais seul. Vrai seulement
 * quand la cliente paie encore les frais standard de sa zone alors que le sous-total des
 * produits (avant code promo, comme à la boutique) atteint le seuil : une livraison déjà
 * offerte, négociée ou héritée d'une ancienne grille n'est pas concernée.
 */
export function livraisonOfferteEligible(input: {
  ville: string | null | undefined
  sousTotal: number
  fraisActuels: number
  tarifs: TarifsLivraison
}): boolean {
  const zone = input.tarifs[zoneDeVille(input.ville)]
  return zone.frais > 0 && Math.round(input.fraisActuels) === zone.frais && input.sousTotal >= zone.gratuitDes
}
