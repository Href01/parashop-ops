import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { bustCache } from '@/lib/ops-cache'
import { createSenditShipment, getShipmentTracking, senditParcelState } from '@/lib/sendit'
import { getOpsSession } from '@/lib/auth'
import { buildSenditProductsDescription, calculateCodAmount, isPrepaidPaymentMethod } from '@/lib/order-utils'
import { creditOrderPoints } from '@/lib/loyalty'
import { fireDeliveredCapi } from '@/lib/meta-capi'

// Create Sendit shipment for an order
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getOpsSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orderId } = await params

    // Get order details
    const orderResult = await pool.query(
      `SELECT
        o.*,
        json_agg(
          json_build_object(
            'productId', oi."productId",
            'productName', p.name,
            'quantity', oi.quantity,
            'price', oi.price
          )
        ) as items
      FROM "Order" o
      LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
      LEFT JOIN "Product" p ON p.id = oi."productId"
      WHERE o.id = $1
      GROUP BY o.id`,
      [orderId]
    )

    if (orderResult.rows.length === 0) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const order = orderResult.rows[0]

    // Check if shipment already exists
    if (order.senditTrackingId) {
      return NextResponse.json({
        error: 'Shipment already created',
        trackingId: order.senditTrackingId,
      }, { status: 400 })
    }

    // Validate order has required delivery info
    if (!order.deliveryName || !order.deliveryPhone || !order.deliveryCity) {
      return NextResponse.json({
        error: 'Order missing required delivery information',
        missing: {
          name: !order.deliveryName,
          phone: !order.deliveryPhone,
          city: !order.deliveryCity,
        }
      }, { status: 400 })
    }

    // Parse request body for optional overrides
    const body = await request.json().catch(() => ({}))
    const { notes, packageWeight, districtId: overrideDistrictId } = body
    const districtId = Number(overrideDistrictId || order.senditDistrictId)

    if (!Number.isInteger(districtId) || districtId <= 0) {
      return NextResponse.json({
        error: 'Sendit district is required',
        details: 'Select the exact Sendit city/district before creating a shipment.',
      }, { status: 400 })
    }

    const codAmount = calculateCodAmount(order.paymentMethod, order.total)
    const productsDescription = buildSenditProductsDescription(order.items, `Order ${order.orderNumber || order.id}`)

    console.log('💰 Payment method check:', {
      paymentMethod: order.paymentMethod,
      orderTotal: order.total,
      codAmount,
    })

    const shipment = await createSenditShipment({
      reference: order.orderNumber || `ORD-${order.id}`,
      recipient_name: order.deliveryName,
      recipient_phone: order.deliveryPhone,
      recipient_city: order.deliveryCity,
      recipient_address: order.deliveryAddress || '',
      district_id: districtId,
      cod_amount: codAmount,  // Use calculated COD amount
      package_weight: packageWeight || 0.5,
      package_description: productsDescription,
      notes: notes || order.notes || '',
    })
    const districtMismatch = shipment.destination_district_id != null
      && shipment.destination_district_id !== districtId

    // Update order with Sendit tracking info
    await pool.query(
      `UPDATE "Order"
       SET "senditTrackingId" = $1,
           "senditBarcode" = $2,
           "senditStatus" = $3,
           "actualDeliveryCost" = $4,
           "deliveryStatus" = 'SENDIT_CREATED'
       WHERE id = $5`,
      [
        shipment.tracking_id,
        shipment.barcode,
        shipment.status,
        shipment.shipping_cost,
        orderId,
      ]
    )

    // Add status history note (status stays CONFIRMED)
    await pool.query(
      `INSERT INTO "OrderStatusHistory" (
        "orderId", "oldStatus", "newStatus", note, "createdAt"
      ) VALUES ($1, $2, $3, $4, NOW())`,
      [
        orderId,
        order.status,
        order.status,
        districtMismatch
          ? `Sendit shipment created: ${shipment.tracking_id}; district mismatch requested=${districtId} received=${shipment.destination_district_id}`
          : `Sendit shipment created: ${shipment.tracking_id}`,
      ]
    )

    console.log(`✅ Sendit shipment created for order ${orderId}: ${shipment.tracking_id}`)

    return NextResponse.json({
      success: true,
      trackingId: shipment.tracking_id,
      barcode: shipment.barcode,
      status: shipment.status,
      shippingCost: shipment.shipping_cost,
      destinationDistrictId: shipment.destination_district_id,
      destinationDistrictName: shipment.destination_district_name,
      districtMismatch,
      estimatedDelivery: shipment.estimated_delivery_date,
    })

  } catch (error: any) {
    console.error('Create Sendit shipment error:', error)
    console.error('Error name:', error?.name)
    console.error('Error message:', error?.message)
    console.error('Error stack:', error?.stack)

    return NextResponse.json(
      {
        error: 'Failed to create shipment',
        details: error?.message || String(error),
      },
      { status: 500 }
    )
  }
}

/**
 * RECRÉER LE TICKET D'UNE COMMANDE DONT LE COLIS A DISPARU DE SENDIT.
 *
 * Le cas : un colis supprimé par erreur sur le site Sendit. La commande garde son
 * `senditTrackingId`, qui ne désigne plus rien — et le POST ci-dessus refuse
 * justement de créer un colis quand ce champ est rempli. La commande se retrouve
 * coincée : plus de bordereau, et aucun bouton pour en refaire un.
 *
 * CE QUI REND CETTE ROUTE SÛRE : elle demande d'abord à Sendit si le colis existe
 * encore, et ne recrée que sur un 404 franc. Sans ce contrôle, un simple clic de
 * trop enverrait deux colis à la même cliente. Si Sendit est injoignable, on
 * refuse — on ne devine pas.
 *
 * Le stock n'est PAS re-décrémenté : le déclencheur de la migration 024 pose au
 * plus un mouvement 'Sale' par commande et vérifie son existence avant d'agir.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getOpsSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: orderId } = await params
    const body = await request.json().catch(() => ({}))
    const { notes, packageWeight, districtId: overrideDistrictId } = body

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
      [orderId]
    )
    if (orderResult.rows.length === 0) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }

    const order = orderResult.rows[0]
    const ancien = order.senditTrackingId as string | null

    if (!ancien) {
      return NextResponse.json({
        error: "Cette commande n'a aucun colis à recréer",
        details: 'Utilise « Créer le colis Sendit » — il n\'y a rien à remplacer.',
      }, { status: 400 })
    }

    if (!order.deliveryName || !order.deliveryPhone || !order.deliveryCity) {
      return NextResponse.json({
        error: 'Informations de livraison incomplètes',
        missing: { name: !order.deliveryName, phone: !order.deliveryPhone, city: !order.deliveryCity },
      }, { status: 400 })
    }

    const districtId = Number(overrideDistrictId || order.senditDistrictId)
    if (!Number.isInteger(districtId) || districtId <= 0) {
      return NextResponse.json({
        error: 'District Sendit requis',
        details: 'Choisis la ville/le district Sendit exact avant de recréer le colis.',
      }, { status: 400 })
    }

    // LE GARDE-FOU. Un colis encore vivant chez Sendit ne se double pas.
    const etat = await senditParcelState(ancien)

    if (etat.state === 'exists') {
      return NextResponse.json({
        error: 'Le colis existe toujours sur Sendit',
        details: `Le colis ${ancien} est bien présent (statut ${etat.status || 'inconnu'}). Le recréer enverrait deux colis à la même cliente. Supprime-le d'abord sur Sendit si c'est bien ce que tu veux.`,
        trackingId: ancien,
        senditStatus: etat.status,
      }, { status: 409 })
    }

    if (etat.state === 'unknown') {
      return NextResponse.json({
        error: 'Sendit ne répond pas — impossible de vérifier',
        details: `On ne peut pas savoir si le colis ${ancien} existe encore. Recréer à l'aveugle risquerait un doublon. Réessaie dans un moment. (${etat.detail})`,
        trackingId: ancien,
      }, { status: 503 })
    }

    // Ici et seulement ici : Sendit confirme que le colis n'existe plus.
    const codAmount = calculateCodAmount(order.paymentMethod, order.total)
    const productsDescription = buildSenditProductsDescription(order.items, `Order ${order.orderNumber || order.id}`)

    const shipment = await createSenditShipment({
      reference: order.orderNumber || `ORD-${order.id}`,
      recipient_name: order.deliveryName,
      recipient_phone: order.deliveryPhone,
      recipient_city: order.deliveryCity,
      recipient_address: order.deliveryAddress || '',
      district_id: districtId,
      cod_amount: codAmount,
      package_weight: packageWeight || 0.5,
      package_description: productsDescription,
      notes: notes || order.notes || '',
    })

    /* L'ancienne ligne de rapprochement est détachée AVANT d'écrire le nouveau
       code : `uq_senditstaging_promoted_order` n'autorise qu'une ligne promue par
       commande, et le prochain « Pull Sendit » ferait autrement réapparaître le
       colis supprimé comme s'il était à traiter. */
    await pool.query(
      `UPDATE "SenditStaging"
       SET promoted = false, "promotedOrderId" = NULL, "matchedOrderId" = NULL,
           state = 'sendit_only', "updatedAt" = NOW()
       WHERE code = $1`,
      [ancien]
    )

    await pool.query(
      `UPDATE "Order"
       SET "senditTrackingId" = $1,
           "senditBarcode" = $2,
           "senditStatus" = $3,
           "actualDeliveryCost" = $4,
           "deliveryStatus" = 'SENDIT_CREATED'
       WHERE id = $5`,
      [shipment.tracking_id, shipment.barcode, shipment.status, shipment.shipping_cost, orderId]
    )

    // La trace nomme les deux codes : sans elle, l'ancien numéro disparaîtrait
    // de l'historique et plus personne ne saurait pourquoi il a changé.
    await pool.query(
      `INSERT INTO "OrderStatusHistory" ("orderId","oldStatus","newStatus",note,"createdAt")
       VALUES ($1,$2,$2,$3,NOW())`,
      [orderId, order.status, `Colis Sendit recréé : ${ancien} (supprimé sur Sendit) → ${shipment.tracking_id}`]
    )

    bustCache('orders:'); bustCache('dashboard-stats:')

    return NextResponse.json({
      success: true,
      previousTrackingId: ancien,
      trackingId: shipment.tracking_id,
      barcode: shipment.barcode,
      status: shipment.status,
      shippingCost: shipment.shipping_cost,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Recreate Sendit shipment error:', error)
    return NextResponse.json({ error: 'Échec de la recréation', details: message }, { status: 500 })
  }
}

// Link an EXISTING Sendit parcel (created directly on Sendit's site) to this order.
// Avoids the duplicate that pull+promote would otherwise create, records the real
// courier fee (so the margin stops being over-optimistic), and — by setting
// senditTrackingId — triggers the forward-only stock decrement.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getOpsSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: orderId } = await params
    const body = await request.json().catch(() => ({}))
    const trackingId = String(body.trackingId || '').trim()
    if (!trackingId) return NextResponse.json({ error: 'Code de suivi requis' }, { status: 400 })

    const orderResult = await pool.query(
      'SELECT id, status, "senditTrackingId" FROM "Order" WHERE id = $1',
      [orderId]
    )
    if (orderResult.rows.length === 0) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    const order = orderResult.rows[0]
    if (order.senditTrackingId) {
      return NextResponse.json({ error: 'Cette commande a déjà un colis lié', trackingId: order.senditTrackingId }, { status: 400 })
    }

    // Don't cross-link a parcel already attached to another order.
    const inUse = await pool.query('SELECT id FROM "Order" WHERE "senditTrackingId" = $1 AND id <> $2', [trackingId, orderId])
    if (inUse.rows.length > 0) {
      return NextResponse.json({ error: `Ce colis est déjà lié à la commande #${inUse.rows[0].id}` }, { status: 409 })
    }

    // Validate against Sendit + read the real fee/status.
    let tracking: any
    try {
      tracking = await getShipmentTracking(trackingId)
    } catch (e: any) {
      return NextResponse.json({ error: 'Colis introuvable sur Sendit — vérifie le code de suivi', details: e?.message }, { status: 404 })
    }
    if (!tracking?.tracking_id) {
      return NextResponse.json({ error: 'Colis introuvable sur Sendit' }, { status: 404 })
    }

    const fee = Number(tracking.fee) || 0
    const senditStatus = tracking.status || 'PENDING'
    const delivered = String(senditStatus).toUpperCase() === 'DELIVERED'

    // Setting senditTrackingId fires the stock-decrement trigger. estimatedDeliveryCost
    // is bumped to the real fee if it was still 0 → the margin becomes honest.
    await pool.query(
      `UPDATE "Order"
       SET "senditTrackingId" = $1,
           "senditStatus" = $2,
           "actualDeliveryCost" = $3,
           "estimatedDeliveryCost" = COALESCE(NULLIF("estimatedDeliveryCost", 0), $3),
           "deliveryStatus" = 'SENDIT_CREATED'
       WHERE id = $4`,
      [tracking.tracking_id, senditStatus, fee, orderId]
    )

    // Link any matching staging row so a later pull doesn't resurface / duplicate it.
    await pool.query(
      `UPDATE "SenditStaging"
       SET promoted = true, "promotedOrderId" = $1, "matchedOrderId" = $1, state = 'matched', "updatedAt" = NOW()
       WHERE code = $2`,
      [orderId, tracking.tracking_id]
    )

    await pool.query(
      `INSERT INTO "OrderStatusHistory" ("orderId","oldStatus","newStatus",note,"createdAt") VALUES ($1,$2,$2,$3,NOW())`,
      [orderId, order.status, `Colis Sendit existant lié: ${tracking.tracking_id} (frais ${fee} MAD)`]
    )

    bustCache('orders:'); bustCache('dashboard-stats:')
    return NextResponse.json({ success: true, trackingId: tracking.tracking_id, fee, status: senditStatus, delivered })
  } catch (error: any) {
    console.error('Link Sendit tracking error:', error)
    return NextResponse.json({ error: 'Échec de la liaison', details: error?.message || String(error) }, { status: 500 })
  }
}

// Get shipment tracking info
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getOpsSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orderId } = await params

    // Get order with tracking ID
    const orderResult = await pool.query(
      'SELECT status, "senditTrackingId", "paymentMethod" FROM "Order" WHERE id = $1',
      [orderId]
    )

    if (orderResult.rows.length === 0) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const trackingId = orderResult.rows[0].senditTrackingId

    if (!trackingId) {
      return NextResponse.json({
        error: 'No shipment created for this order',
      }, { status: 404 })
    }

    // Get tracking info from Sendit
    const tracking = await getShipmentTracking(trackingId)

    // Update order status based on Sendit status
    const statusMap: Record<string, string> = {
      'DELIVERED': 'DELIVERED',
      'CANCELED': 'CANCELLED',
      'CANCELLED': 'CANCELLED',
      'REJECTED': 'CANCELLED',
      'REFUSED': 'CANCELLED',
      'RETURNED': 'CANCELLED',
      'RETURN': 'CANCELLED',
    }

    const newStatus = statusMap[String(tracking.status || '').toUpperCase()]

    const prepaid = isPrepaidPaymentMethod(orderResult.rows[0].paymentMethod)
    const amount = Number(tracking.amount) || 0
    const fee = Number(tracking.fee) || 0
    if (prepaid) {
      await pool.query(
        `UPDATE "Order"
         SET "senditStatus" = $1::text, "deliveryStatus" = $1::varchar,
             status = COALESCE($2::"OrderStatus", status),
             "actualDeliveryCost" = $3, "codAmount" = NULL,
             "deliveredAt" = CASE
               WHEN $2 = 'DELIVERED' AND NULLIF($4::text, '') IS NOT NULL
                 THEN ($4::timestamp AT TIME ZONE 'Africa/Casablanca')
               ELSE "deliveredAt" END
         WHERE id = $5 AND "senditTrackingId" = $6`,
        [tracking.status, newStatus || null, fee, tracking.last_action_at || null, orderId, tracking.tracking_id]
      )
    } else {
      await pool.query(
        `UPDATE "Order"
         SET "senditStatus" = $1::text, "deliveryStatus" = $1::varchar,
             status = COALESCE($2::"OrderStatus", status),
             "actualDeliveryCost" = $3,
             total = CASE WHEN $4 > 0 THEN $4 ELSE total END,
             "codAmount" = CASE WHEN $4 > 0 THEN $4 ELSE "codAmount" END,
             "paidAmount" = CASE WHEN $2 = 'DELIVERED' AND $4 > 0 THEN $4 ELSE "paidAmount" END,
             "paidAt" = CASE WHEN $2 = 'DELIVERED' AND NULLIF($5::text, '') IS NOT NULL
               THEN ($5::timestamp AT TIME ZONE 'Africa/Casablanca') ELSE "paidAt" END,
             "paymentReference" = CASE WHEN $2 = 'DELIVERED' THEN COALESCE("paymentReference", $7) ELSE "paymentReference" END,
             "paymentStatus" = CASE WHEN $2 = 'DELIVERED' AND $4 > 0 THEN 'PAID' ELSE "paymentStatus" END,
             "deliveredAt" = CASE WHEN $2 = 'DELIVERED' AND NULLIF($5::text, '') IS NOT NULL
               THEN ($5::timestamp AT TIME ZONE 'Africa/Casablanca') ELSE "deliveredAt" END
         WHERE id = $6 AND "senditTrackingId" = $7`,
        [tracking.status, newStatus || null, fee, amount, tracking.last_action_at || null, orderId, tracking.tracking_id]
      )
    }

    if (newStatus && newStatus !== orderResult.rows[0].status) {
      // Add status history if status changed
      const changed = await pool.query(
        `SELECT COUNT(*) as count FROM "OrderStatusHistory"
         WHERE "orderId" = $1 AND "newStatus" = $2`,
        [orderId, newStatus]
      )

      if (parseInt(changed.rows[0].count) === 0) {
        await pool.query(
          `INSERT INTO "OrderStatusHistory" (
            "orderId", "oldStatus", "newStatus", note, "createdAt"
          ) VALUES ($1, $2, $3, $4, NOW())`,
          [orderId, orderResult.rows[0].status, newStatus, `Sendit status: ${tracking.status}`]
        )
      }
      if (newStatus === 'DELIVERED') {
        try {
          await creditOrderPoints(pool, Number(orderId))
        } catch (error) {
          console.error('[Sendit] loyalty', orderId, error)
        }
        await fireDeliveredCapi(Number(orderId))
      }
    }

    return NextResponse.json({
      trackingId: tracking.tracking_id,
      status: tracking.status,
      history: tracking.status_history,
      estimatedDelivery: tracking.estimated_delivery,
      actualDelivery: tracking.actual_delivery,
    })

  } catch (error: any) {
    console.error('Get shipment tracking error:', error)
    return NextResponse.json(
      {
        error: 'Failed to get tracking info',
        details: error.message,
      },
      { status: 500 }
    )
  }
}
