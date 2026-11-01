import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { bustCache } from '@/lib/ops-cache'
import { getOpsSession } from '@/lib/auth'
import { bustAnalyticsCache } from '@/lib/analytics-cache'
import { addAuditNote, lignesCommande, lockOrder, marquesDuCode, recomputeOrderEconomics, shipmentWarning } from '@/lib/order-edit'
import { calculerRemisePromo, messageHorsMarque } from '@/lib/order-promo'

/**
 * CODE PROMO D'UNE COMMANDE, DEPUIS LE BOS.
 *
 * POST   { code }  applique (ou remplace) le code : remise recalculée comme à la
 *                  boutique, prix, total et marge mis à jour, compteur d'usage du code
 *                  ajusté.
 * DELETE           retire le code et sa remise.
 *
 * Les règles sont celles du paiement en ligne — existence, expiration, plafond
 * d'utilisations, minimum de commande, marques couvertes, « première commande
 * seulement » — pour qu'un code refusé au client le soit aussi ici. Une remise
 * choisie librement reste possible via le champ « remise » de la commande.
 */

type Refus = { error: string; status: number }

async function finish() {
  bustCache('orders:')
  bustCache('dashboard-stats:')
  await bustAnalyticsCache()
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOpsSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const orderId = Number(id)
  const body = await request.json().catch(() => ({}))
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  if (!Number.isInteger(orderId) || orderId <= 0) return NextResponse.json({ error: 'Commande requise' }, { status: 400 })
  if (!code) return NextResponse.json({ error: 'Saisis un code promo' }, { status: 400 })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const order = await lockOrder(client, orderId)
    const refuser = async ({ error, status }: Refus) => {
      await client.query('ROLLBACK')
      return NextResponse.json({ error }, { status })
    }
    if (!order) return refuser({ error: 'Commande introuvable', status: 404 })
    if (['DELIVERED', 'CANCELLED'].includes(order.status)) {
      return refuser({ error: 'Commande terminée : le code ne peut plus être modifié', status: 409 })
    }

    const promoRes = await client.query(
      `SELECT * FROM "Promo" WHERE UPPER(TRIM(code)) = $1 FOR UPDATE`,
      [code],
    )
    const promo = promoRes.rows[0]
    if (!promo) return refuser({ error: 'Code promo invalide', status: 404 })

    const memeCode = (order.promoCode || '').trim().toUpperCase() === String(promo.code).trim().toUpperCase()
    if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) return refuser({ error: 'Code promo expiré', status: 409 })
    if (!memeCode && promo.maxUses && promo.usedCount >= promo.maxUses) return refuser({ error: 'Code promo épuisé', status: 409 })

    const lignes = await lignesCommande(client, orderId)
    const productsTotal = lignes.reduce((s, l) => s + l.price * l.quantity, 0)
    if (promo.minOrder && productsTotal < Number(promo.minOrder)) {
      return refuser({ error: `Commande minimum de ${promo.minOrder} MAD requise pour ce code (produits : ${Math.round(productsTotal)} MAD)`, status: 409 })
    }

    if (promo.firstOrderOnly) {
      // Rapprochement sur les 9 derniers chiffres du téléphone : les numéros ne sont pas normalisés.
      const autres = await client.query(
        `SELECT COUNT(*)::int AS n
         FROM "Order" o, "Order" cur
         WHERE cur.id = $1 AND o.id <> cur.id AND o.status <> 'CANCELLED'
           AND (
             (cur."userId" IS NOT NULL AND o."userId" = cur."userId")
             OR RIGHT(regexp_replace(o."deliveryPhone", '\\D', '', 'g'), 9)
              = RIGHT(regexp_replace(cur."deliveryPhone", '\\D', '', 'g'), 9)
           )`,
        [orderId],
      )
      if (autres.rows[0].n > 0) return refuser({ error: 'Ce code est réservé aux nouveaux clients : cette cliente a déjà commandé', status: 409 })
    }

    const marques = await marquesDuCode(client, promo.code)
    const { remise } = calculerRemisePromo(
      { discount: Number(promo.discount), isPercent: Boolean(promo.isPercent), marques },
      lignes,
    )
    if (remise <= 0) {
      return refuser({ error: marques ? messageHorsMarque(marques) : 'Ce code ne donne aucune remise sur cette commande', status: 409 })
    }

    // Compteur d'usage : le remplacement libère l'ancien code, le même code ne compte pas deux fois.
    if (order.promoCode && !memeCode) {
      await client.query(
        `UPDATE "Promo" SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE UPPER(TRIM(code)) = UPPER(TRIM($1))`,
        [order.promoCode],
      )
    }
    if (!memeCode) await client.query(`UPDATE "Promo" SET "usedCount" = "usedCount" + 1 WHERE id = $1`, [promo.id])

    await client.query(`UPDATE "Order" SET "promoCode" = $2 WHERE id = $1`, [orderId, promo.code])
    const appliquee = { ...order, promoCode: promo.code as string }
    // Application explicite : la remise est accordée même si la commande ne la recevait pas encore.
    const economics = await recomputeOrderEconomics(client, appliquee, { forcerCode: true })
    await addAuditNote(
      client,
      order,
      `Code ${promo.code} ${memeCode ? 'recalculé' : order.promoCode ? `appliqué (remplace ${order.promoCode})` : 'appliqué'} : remise ${remise} MAD, total ${Math.round(Number(economics.total))} MAD (${session.user.email})`,
    )
    await client.query('COMMIT')
    await finish()
    return NextResponse.json({ ok: true, code: promo.code, discount: remise, economics, warning: shipmentWarning(order) })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Order promo apply failed:', error)
    return NextResponse.json({ error: "Impossible d'appliquer le code", details: (error as Error).message }, { status: 500 })
  } finally {
    client.release()
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOpsSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const orderId = Number(id)
  if (!Number.isInteger(orderId) || orderId <= 0) return NextResponse.json({ error: 'Commande requise' }, { status: 400 })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const order = await lockOrder(client, orderId)
    if (!order) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }
    if (['DELIVERED', 'CANCELLED'].includes(order.status)) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Commande terminée : le code ne peut plus être modifié' }, { status: 409 })
    }
    if (!order.promoCode) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: "Cette commande n'a pas de code promo" }, { status: 409 })
    }

    await client.query(
      `UPDATE "Promo" SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE UPPER(TRIM(code)) = UPPER(TRIM($1))`,
      [order.promoCode],
    )
    await client.query(`UPDATE "Order" SET "promoCode" = NULL, "discountTotal" = 0 WHERE id = $1`, [orderId])
    const economics = await recomputeOrderEconomics(client, { ...order, promoCode: null, discountTotal: 0 })
    await addAuditNote(
      client,
      order,
      `Code ${order.promoCode} retiré : total ${Math.round(Number(economics.total))} MAD (${session.user.email})`,
    )
    await client.query('COMMIT')
    await finish()
    return NextResponse.json({ ok: true, economics, warning: shipmentWarning(order) })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Order promo remove failed:', error)
    return NextResponse.json({ error: 'Impossible de retirer le code', details: (error as Error).message }, { status: 500 })
  } finally {
    client.release()
  }
}
