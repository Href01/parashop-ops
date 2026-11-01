/**
 * CODE PROMO D'UNE COMMANDE : CALCUL DE LA REMISE.
 *
 * Reprise de la boutique (app/api/orders/route.ts, lib/promo-scope.ts), pour que
 * « appliquer le code depuis le BOS » donne EXACTEMENT la remise que la cliente
 * aurait eue en le tapant au paiement :
 *  · pourcentage : arrondi au dirham sur la base couverte ;
 *  · montant fixe : jamais plus que la base ;
 *  · code limité à des marques (AppSetting `promo_restrictions`, ex. MILKSHAKE10) :
 *    la remise ne porte que sur les produits de ces marques.
 *
 * La base se calcule sur les lignes TELLES QUE FACTURÉES (OrderItem.price, remise
 * de campagne ou prix modifié à la main compris), jamais sur le prix du catalogue.
 */

export type LigneRemise = { brand: string | null | undefined; price: number; quantity: number }
export type RegleRemise = { discount: number; isPercent: boolean; marques: string[] | null }

/** « Milk Shake », « milk_shake » et « MILK-SHAKE » donnent tous `milkshake`. */
export function cleMarque(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

/** Les marques auxquelles un code est limité, ou null s'il porte sur tout le panier. */
export function lireMarquesPromo(valeur: unknown, code: string): string[] | null {
  const toutes = (valeur && typeof valeur === 'object' ? valeur : {}) as Record<string, { marques?: unknown }>
  const entree = toutes[code.trim().toUpperCase()]
  const marques = Array.isArray(entree?.marques)
    ? entree.marques.filter((m): m is string => typeof m === 'string' && m.trim() !== '')
    : []
  return marques.length ? marques : null
}

function arrondi2(n: number) {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

/** Montant (MAD) sur lequel le code porte : tout le panier, ou les seules marques couvertes. */
export function baseRemise(marques: string[] | null, lignes: LigneRemise[]): number {
  const cles = marques ? new Set(marques.map(cleMarque)) : null
  return arrondi2(
    lignes
      .filter((l) => !cles || cles.has(cleMarque(l.brand || '')))
      .reduce((somme, l) => somme + (Number(l.price) || 0) * (Number(l.quantity) || 0), 0),
  )
}

export function calculerRemisePromo(regle: RegleRemise, lignes: LigneRemise[]): { remise: number; base: number } {
  const base = baseRemise(regle.marques, lignes)
  if (base <= 0) return { remise: 0, base }
  const remise = regle.isPercent
    ? Math.round((base * Number(regle.discount)) / 100)
    : Math.min(arrondi2(Number(regle.discount)), base)
  return { remise: Math.max(0, remise), base }
}

export function messageHorsMarque(marques: string[]): string {
  const liste = marques.length <= 1 ? marques[0] : `${marques.slice(0, -1).join(', ')} et ${marques.at(-1)}`
  return `Ce code s’applique aux produits ${liste} : aucun article de la commande n’en fait partie.`
}
