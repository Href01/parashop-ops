import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { bustCache } from '@/lib/ops-cache'
import { getOpsSession } from '@/lib/auth'
import { buildSenditProductsDescription, calculateCodAmount } from '@/lib/order-utils'
import { getShipmentTracking, senditParcelIsEditable, senditParcelState, updateSenditShipment } from '@/lib/sendit'

/**
 * METTRE À JOUR LE COLIS SENDIT D'UNE COMMANDE DONT LES ARTICLES ONT CHANGÉ.
 *
 * Modifier les lignes d'une commande recalcule la commande, jamais le colis : le
 * livreur encaissait l'ancien montant. Cette route renvoie à Sendit le montant à
 * encaisser et la liste des produits calculés comme à la création (PUT
 * /deliveries/{code}, même corps que le POST).
 *
 * Garde-fous, dans l'ordre :
 *  · le colis doit exister chez Sendit (404 franc → « Recréer » ; panne → on refuse) ;
 *  · il ne doit pas être ramassé : à partir de « Ramassage en cours » le montant que
 *    le livreur encaisse ne bouge plus sous ses pieds ;
 *  · après l'envoi on relit le colis et on compare : un 200 ne prouve pas que Sendit
 *    a pris la modification.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getOpsSession()
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: orderId } = await params
    const body = await request.json().catch(() => ({}))
    const { notes } = body as { notes?: string }

    const orderResult = await pool.query(
      `SELECT o.*,
        json_agg(json_build_object(
          'productId', oi."productId", 'productName', p.name,
          'quantity', oi.quantity, 'price', oi.price
        )) AS items
       FROM "Order" o
       LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
       LEFT JOIN "Product" p ON p.id = oi."productId"
       WHERE o.id = $1
       GROUP BY o.id`,
      [orderId],
    )
    if (orderResult.rows.length === 0) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }
    const order = orderResult.rows[0]
    const trackingId = order.senditTrackingId as string | null

    if (!trackingId) {
      return NextResponse.json({
        error: "Cette commande n'a pas de colis Sendit",
        details: 'Utilise « Créer le colis Sendit » : il se crée avec les articles actuels.',
      }, { status: 400 })
    }
    if (['DELIVERED', 'CANCELLED'].includes(order.status)) {
      return NextResponse.json({ error: 'Commande terminée : le colis ne se modifie plus' }, { status: 409 })
    }
    if (!order.deliveryName || !order.deliveryPhone || !order.deliveryCity) {
      return NextResponse.json({ error: 'Informations de livraison incomplètes' }, { status: 400 })
    }
    const districtId = Number(order.senditDistrictId)
    if (!Number.isInteger(districtId) || districtId <= 0) {
      return NextResponse.json({
        error: 'Zone Sendit requise',
        details: 'Choisis la zone Sendit exacte dans le panneau « Livraison Sendit » avant de mettre le colis à jour.',
      }, { status: 400 })
    }

    const etat = await senditParcelState(trackingId)
    if (etat.state === 'gone') {
      return NextResponse.json({
        error: "Le colis n'existe plus sur Sendit",
        details: `Le colis ${trackingId} est introuvable : utilise « Recréer le colis Sendit ».`,
      }, { status: 409 })
    }
    if (etat.state === 'unknown') {
      return NextResponse.json({
        error: 'Sendit ne répond pas — impossible de vérifier le colis',
        details: `Réessaie dans un moment. (${etat.detail})`,
      }, { status: 503 })
    }
    if (!senditParcelIsEditable(etat.status)) {
      return NextResponse.json({
        error: 'Le colis est déjà pris en charge par Sendit',
        details: `Statut ${etat.status || 'inconnu'} : le livreur a le colis, son montant ne se modifie plus d'ici. Préviens Sendit directement si le montant à encaisser doit changer.`,
        senditStatus: etat.status,
      }, { status: 409 })
    }

    const avant = await getShipmentTracking(trackingId)
    const codAmount = calculateCodAmount(order.paymentMethod, order.total)
    const produits = buildSenditProductsDescription(order.items, `Order ${order.orderNumber || order.id}`)

    await updateSenditShipment(trackingId, {
      reference: order.orderNumber || `ORD-${order.id}`,
      recipient_name: order.deliveryName,
      recipient_phone: order.deliveryPhone,
      recipient_city: order.deliveryCity,
      recipient_address: order.deliveryAddress || '',
      district_id: districtId,
      cod_amount: codAmount,
      package_description: produits,
      notes: notes || order.notes || '',
    })

    // Un 200 ne prouve rien : on relit le colis.
    const apres = await getShipmentTracking(trackingId)
    const attendu = Math.round(Number(codAmount) || 0)
    if (Math.round(apres.amount) !== attendu) {
      return NextResponse.json({
        error: "Sendit n'a pas pris le nouveau montant",
        details: `Montant attendu ${attendu} MAD, Sendit affiche ${apres.amount} MAD. Corrige-le sur le tableau de bord Sendit.`,
      }, { status: 502 })
    }

    await pool.query(
      `UPDATE "Order"
       SET "senditStatus" = $2,
           "actualDeliveryCost" = COALESCE(NULLIF($3::numeric, 0), "actualDeliveryCost")
       WHERE id = $1`,
      [orderId, apres.status || order.senditStatus, apres.fee],
    )
    await pool.query(
      `INSERT INTO "OrderStatusHistory" ("orderId","oldStatus","newStatus",source,note,"createdAt")
       VALUES ($1,$2,$2,'manual',$3,NOW())`,
      [
        orderId,
        order.status,
        `Colis Sendit ${trackingId} mis à jour : montant à encaisser ${Math.round(avant.amount)} → ${Math.round(apres.amount)} MAD, produits renvoyés (${session.user.email})`,
      ],
    )
    bustCache('orders:'); bustCache('dashboard-stats:')

    return NextResponse.json({
      success: true,
      trackingId,
      amountBefore: Math.round(avant.amount),
      amountAfter: Math.round(apres.amount),
      status: apres.status,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Update Sendit shipment error:', error)
    return NextResponse.json({ error: 'Échec de la mise à jour du colis', details: message }, { status: 500 })
  }
}
