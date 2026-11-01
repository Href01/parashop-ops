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
  promoCode: string | null
  discountTotal: number | string | null
  deliveryFeeCharged: number | string | null
  paidAmount: number | string | null
  codAmount: number | string | null
  paymentStatus: string | null
  senditTrackingId: string | null
}

export async function lockOrder(client: PoolClient, orderId: number) {
  const result = await client.query<LockedOrder>(
    `SELECT id, status, "paymentMethod", "promoCode", "discountTotal", "deliveryFeeCharged",
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
 * LA REMISE D'UNE COMMANDE QUI PORTE UN CODE SUIT SES ARTICLES.
 *
 * La boutique ne renseigne jamais `discountTotal` pour un code promo : la remise
 * vit seulement dans `revenue` et `total`. Recalculer à partir de `discountTotal`
 * (0) effaçait donc la remise à la première modification d'un article — la cliente
 * se retrouvait à payer plein tarif. Quand la commande porte un code, on recalcule la
 * remise depuis la définition du code ; sinon on garde la remise saisie à la main.
 */
export async function remiseDeLaCommande(client: PoolClient, order: LockedOrder, lignes: Awaited<ReturnType<typeof lignesCommande>>) {
  const manuelle = Number(order.discountTotal) || 0
  if (!order.promoCode) return manuelle
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

export async function recomputeOrderEconomics(client: PoolClient, order: LockedOrder) {
  const lignes = await lignesCommande(client, order.id)
  const productsTotal = lignes.reduce((s, l) => s + l.price * l.quantity, 0)
  const economics = calculateEditedOrderEconomics({
    productsTotal,
    discountTotal: await remiseDeLaCommande(client, order, lignes),
    deliveryFeeCharged: Number(order.deliveryFeeCharged) || 0,
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
         "deliveryStatus" = "deliveryStatus"
     WHERE id = $1
     RETURNING "productsTotal", "discountTotal", revenue, total, "codAmount",
               "estimatedProfit", "finalProfit", "marginPercent", "paymentStatus"`,
    [
      order.id,
      economics.productsTotal,
      economics.discountTotal,
      economics.revenue,
      economics.total,
      economics.codAmount,
      economics.paymentStatus,
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
