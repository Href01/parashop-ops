import type { PoolClient } from 'pg'
import { calculateEditedOrderEconomics } from '@/lib/order-economics'
import { calculerRemisePromo, lireMarquesPromo } from '@/lib/order-promo'

/**
 * ÉDITION D'UNE COMMANDE : verrou, recalcul, trace. Partagé par l'éditeur de lignes
 * (api/ops/orders/[id]/items) et le code promo (api/ops/orders/[id]/promo).
 */

export type LockedOrder = {
  id: number
  status: string
  paymentMethod: string | null
  deliveryCity: string | null
  promoCode: string | null
  pointsUsed: number | null
  productsTotal: number | string | null
  revenue: number | string | null
  discountTotal: number | string | null
  deliveryFeeCharged: number | string | null
  paidAmount: number | string | null
  codAmount: number | string | null
  paymentStatus: string | null
  senditTrackingId: string | null
}

export async function lockOrder(client: PoolClient, orderId: number) {
  const result = await client.query<LockedOrder>(
    `SELECT id, status, "paymentMethod", "deliveryCity", "promoCode", "pointsUsed", "productsTotal", revenue, "discountTotal", "deliveryFeeCharged",
            "paidAmount", "codAmount", "paymentStatus", "senditTrackingId"
     FROM "Order" WHERE id = $1 FOR UPDATE`,
    [orderId],
  )
  return result.rows[0] || null
}

/** Les lignes de la commande telles que facturées, avec la marque de chaque produit. */
export async function lignesCommande(client: PoolClient, orderId: number) {
  const r = await client.query<{ brand: string | null; price: string; quantity: number }>(
    `SELECT p.brand, oi.price, oi.quantity
     FROM "OrderItem" oi LEFT JOIN "Product" p ON p.id = oi."productId"
     WHERE oi."orderId" = $1`,
    [orderId],
  )
  return r.rows.map((l) => ({ brand: l.brand, price: Number(l.price) || 0, quantity: Number(l.quantity) || 0 }))
}

export async function marquesDuCode(client: PoolClient, code: string): Promise<string[] | null> {
  const r = await client.query<{ value: string }>(`SELECT value FROM "AppSetting" WHERE key = 'promo_restrictions'`)
  if (!r.rows[0]) return null
  try { return lireMarquesPromo(JSON.parse(r.rows[0].value), code) } catch { return null }
}

/**
 * UNE REMISE EST-ELLE DÉJÀ ACCORDÉE À CETTE COMMANDE ?
 *
 * Soit saisie à la main (discountTotal), soit enfouie dans le total comme le fait la
 * boutique pour un code (productsTotal − revenue). Sans cette lecture, une ancienne
 * commande qui porte un code mais n'a JAMAIS reçu la remise (ex. #6 : 180 MAD, total
 * 192) se la verrait retirer… ou ajouter, à la première modification d'un article.
 */
export function remiseDejaAccordee(order: Pick<LockedOrder, 'discountTotal' | 'productsTotal' | 'revenue'>): boolean {
  const saisie = Number(order.discountTotal) || 0
  const enfouie = (Number(order.productsTotal) || 0) - (Number(order.revenue) || 0)
  return Math.max(saisie, enfouie) > 0.01
}

/**
 * LA REMISE D'UNE COMMANDE QUI PORTE UN CODE SUIT SES ARTICLES.
 *
 * La boutique ne renseigne jamais `discountTotal` pour un code promo : la remise
 * vit seulement dans `revenue` et `total`. Recalculer à partir de `discountTotal`
 * (0) effaçait donc la remise à la première modification d'un article — la cliente
 * se retrouvait à payer plein tarif.
 *
 * Quand la commande porte un code ET reçoit déjà sa remise, on la recalcule depuis la
 * définition du code pour qu'elle suive les articles. Si la commande porte un code
 * sans l'avoir jamais reçue, une modification d'article ne l'invente pas : c'est
 * l'application explicite du code (`forcerCode`) qui l'accorde. Sans code, la remise
 * saisie à la main est gardée.
 */
export async function remiseDeLaCommande(
  client: PoolClient,
  order: LockedOrder,
  lignes: Awaited<ReturnType<typeof lignesCommande>>,
  forcerCode = false,
) {
  const manuelle = Number(order.discountTotal) || 0
  if (!order.promoCode) return manuelle
  if (!forcerCode && !remiseDejaAccordee(order)) return manuelle
  // Des points fidélité ont aussi réduit le total (pointsUsed), mélangés à la remise du code :
  // on ne sait pas les séparer, donc la remise existante est gardée telle quelle.
  if (!forcerCode && Number(order.pointsUsed) > 0) {
    return Math.max(manuelle, (Number(order.productsTotal) || 0) - (Number(order.revenue) || 0))
  }
  const promo = await client.query<{ discount: string; isPercent: boolean }>(
    `SELECT discount, "isPercent" FROM "Promo" WHERE UPPER(TRIM(code)) = UPPER(TRIM($1))`,
    [order.promoCode],
  )
  if (!promo.rows[0]) return manuelle
  const marques = await marquesDuCode(client, order.promoCode)
  return calculerRemisePromo(
    { discount: Number(promo.rows[0].discount), isPercent: promo.rows[0].isPercent, marques },
    lignes,
  ).remise
}

/**
 * Recalcule produits, remise, livraison, total, COD et marge d'une commande.
 *
 * LA LIVRAISON NE BOUGE JAMAIS TOUTE SEULE : un frais peut être offert à la main, négocié
 * ou hérité d'une ancienne grille. Seul un geste explicite (`fraisLivraison`, bouton
 * « Offrir la livraison ») le change.
 */
export async function recomputeOrderEconomics(
  client: PoolClient,
  order: LockedOrder,
  options: { forcerCode?: boolean; fraisLivraison?: number } = {},
) {
  const lignes = await lignesCommande(client, order.id)
  const productsTotal = lignes.reduce((s, l) => s + l.price * l.quantity, 0)
  const fraisActuels = Number(order.deliveryFeeCharged) || 0
  const fraisLivraison = options.fraisLivraison ?? fraisActuels
  const economics = calculateEditedOrderEconomics({
    productsTotal,
    discountTotal: await remiseDeLaCommande(client, order, lignes, options.forcerCode),
    deliveryFeeCharged: fraisLivraison,
    paymentMethod: order.paymentMethod,
    paidAmount: order.paidAmount == null ? null : Number(order.paidAmount),
    currentCodAmount: order.codAmount == null ? null : Number(order.codAmount),
    hasSenditShipment: Boolean(order.senditTrackingId),
    currentPaymentStatus: order.paymentStatus,
  })

  const result = await client.query(
    `UPDATE "Order"
     SET "productsTotal" = $2,
         "discountTotal" = $3,
         revenue = $4,
         total = $5,
         "codAmount" = $6,
         "paymentStatus" = $7,
         "deliveryFeeCharged" = $8,
         "deliveryStatus" = "deliveryStatus"
     WHERE id = $1
     RETURNING "productsTotal", "discountTotal", "deliveryFeeCharged", revenue, total, "codAmount",
               "estimatedProfit", "finalProfit", "marginPercent", "paymentStatus"`,
    [
      order.id,
      economics.productsTotal,
      economics.discountTotal,
      economics.revenue,
      economics.total,
      economics.codAmount,
      economics.paymentStatus,
      fraisLivraison,
    ],
  )

  return { ...result.rows[0], overpaidAmount: economics.overpaidAmount }
}

export async function addAuditNote(client: PoolClient, order: LockedOrder, note: string) {
  await client.query(
    `INSERT INTO "OrderStatusHistory"
      ("orderId", "oldStatus", "newStatus", source, note, "createdAt")
     VALUES ($1, $2, $2, 'manual', $3, NOW())`,
    [order.id, order.status, note],
  )
}

export function shipmentWarning(order: Pick<LockedOrder, 'status' | 'senditTrackingId'>) {
  if (!order.senditTrackingId || ['DELIVERED', 'CANCELLED'].includes(order.status)) return null
  return 'Le colis Sendit existe déjà : clique « Mettre à jour le colis Sendit » pour que le livreur encaisse le bon montant.'
}
