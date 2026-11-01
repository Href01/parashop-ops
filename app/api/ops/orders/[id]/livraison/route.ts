import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { bustCache } from '@/lib/ops-cache'
import { getOpsSession } from '@/lib/auth'
import { bustAnalyticsCache } from '@/lib/analytics-cache'
import { addAuditNote, lignesCommande, lockOrder, recomputeOrderEconomics, shipmentWarning } from '@/lib/order-edit'
import { lireTarifsLivraison, livraisonOfferteEligible, zoneDeVille } from '@/lib/livraison-regles'

/**
 * FRAIS DE LIVRAISON D'UNE COMMANDE : LECTURE ET RECTIFICATION.
 *
 * GET  dit si la grille de la boutique offrirait la livraison à cette commande
 *      (sous-total des produits, AVANT code promo, au seuil de sa zone). Ne modifie rien.
 * POST { fee } fixe les frais facturés — 0 pour offrir la livraison — puis recalcule le
 *      total, le montant à encaisser et la marge. Geste volontaire : un frais n'est
 *      jamais changé automatiquement, il peut avoir été offert ou négocié à la main.
 */

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOpsSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const orderId = Number((await params).id)
  if (!Number.isInteger(orderId) || orderId <= 0) return NextResponse.json({ error: 'Commande requise' }, { status: 400 })

  const client = await pool.connect()
  try {
    const r = await client.query<{ deliveryCity: string | null; deliveryFeeCharged: string | null }>(
      `SELECT "deliveryCity", "deliveryFeeCharged" FROM "Order" WHERE id = $1`, [orderId])
    if (!r.rows[0]) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    const lignes = await lignesCommande(client, orderId)
    const sousTotal = lignes.reduce((s, l) => s + l.price * l.quantity, 0)
    const tarifs = await lireTarifsLivraison(client)
    const zone = tarifs[zoneDeVille(r.rows[0].deliveryCity)]
    const frais = Number(r.rows[0].deliveryFeeCharged) || 0
    return NextResponse.json({
      subtotal: Math.round(sousTotal * 100) / 100,
      threshold: zone.gratuitDes,
      standardFee: zone.frais,
      currentFee: frais,
      eligibleFree: livraisonOfferteEligible({ ville: r.rows[0].deliveryCity, sousTotal, fraisActuels: frais, tarifs }),
    })
  } finally {
    client.release()
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOpsSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const orderId = Number((await params).id)
  const body = await request.json().catch(() => ({}))
  const fee = Number(body.fee)
  if (!Number.isInteger(orderId) || orderId <= 0) return NextResponse.json({ error: 'Commande requise' }, { status: 400 })
  if (!Number.isFinite(fee) || fee < 0 || fee > 500) return NextResponse.json({ error: 'Frais de livraison invalides (0 à 500 MAD)' }, { status: 400 })

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
      return NextResponse.json({ error: 'Commande terminée : la livraison ne se modifie plus' }, { status: 409 })
    }
    const avant = Number(order.deliveryFeeCharged) || 0
    if (Math.round(fee) === Math.round(avant)) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: `Les frais de livraison sont déjà de ${avant} MAD` }, { status: 409 })
    }

    const economics = await recomputeOrderEconomics(client, order, { fraisLivraison: Math.round(fee) })
    await addAuditNote(
      client,
      order,
      `${fee === 0 ? 'Livraison offerte' : 'Frais de livraison modifiés'} : ${avant} → ${Math.round(fee)} MAD, total ${Math.round(Number(economics.total))} MAD (${session.user.email})`,
    )
    await client.query('COMMIT')
    bustCache('orders:'); bustCache('dashboard-stats:')
    await bustAnalyticsCache()
    return NextResponse.json({ ok: true, fee: Math.round(fee), economics, warning: shipmentWarning(order) })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Order delivery fee update failed:', error)
    return NextResponse.json({ error: 'Impossible de modifier la livraison', details: (error as Error).message }, { status: 500 })
  } finally {
    client.release()
  }
}
