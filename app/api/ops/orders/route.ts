import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { buildSenditProductsDescription, calculateCodAmount, generateOrderNumber } from '@/lib/order-utils'
import { createSenditShipment } from '@/lib/sendit'
import { CreateOrderSchema } from '@/lib/validation/order'
import { getOpsSession } from '@/lib/auth'
import { cached, bustCache } from '@/lib/ops-cache'
import { bustAnalyticsCache } from '@/lib/analytics-cache'
import type { PoolClient } from 'pg'

class StockConflictError extends Error {}

async function assertOrderItemsAvailable(
  client: PoolClient,
  items: Array<{ productId: number; quantity: number }>
) {
  const productIds = [...new Set(items.map((item) => item.productId))].sort((a, b) => a - b)
  const selected = await client.query<{
    id: number
    name: string
    active: boolean
    importUnavailable: boolean
  }>(
    `SELECT id, name, active, COALESCE("importUnavailable", false) AS "importUnavailable"
     FROM "Product" WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`,
    [productIds]
  )

  if (selected.rows.length !== productIds.length) {
    throw new StockConflictError('Un produit sélectionné n’existe plus')
  }
  const unavailable = selected.rows.find((product) => !product.active || product.importUnavailable)
  if (unavailable) {
    throw new StockConflictError(`${unavailable.name} n’est plus disponible à la vente`)
  }

  // Lock every physical product required by normal lines and bundle
  // components. A second statement then sees demand committed while waiting
  // for these locks, preventing two founder orders from consuming the same
  // final units.
  const requirements = await client.query<{
    id: number
    name: string
    stock: number
    trackInventory: boolean
    required: number
  }>(
    `WITH requested AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS r("productId" int, quantity int)
     ), expanded AS (
       SELECT r."productId" AS id, r.quantity
       FROM requested r
       WHERE NOT EXISTS (SELECT 1 FROM "Bundle" b WHERE b."productId" = r."productId")
       UNION ALL
       SELECT bi."productId" AS id, r.quantity * bi.quantity
       FROM requested r
       JOIN "Bundle" b ON b."productId" = r."productId"
       JOIN "BundleItem" bi ON bi."bundleId" = b.id
     ), required AS (
       SELECT id, SUM(quantity)::int AS required FROM expanded GROUP BY id
     )
     SELECT p.id, p.name, p.stock, COALESCE(p."trackInventory", true) AS "trackInventory", r.required
     FROM required r JOIN "Product" p ON p.id = r.id
     ORDER BY p.id FOR UPDATE OF p`,
    [JSON.stringify(items)]
  )

  const demand = await client.query<{ id: number; committed: number }>(
    `WITH expanded AS (
       SELECT oi."productId" AS id, oi.quantity
       FROM "OrderItem" oi
       JOIN "Order" o ON o.id = oi."orderId"
       WHERE o.status IN ('PENDING', 'CONFIRMED') AND o."senditTrackingId" IS NULL
         AND NOT EXISTS (SELECT 1 FROM "Bundle" b WHERE b."productId" = oi."productId")
       UNION ALL
       SELECT bi."productId" AS id, oi.quantity * bi.quantity
       FROM "OrderItem" oi
       JOIN "Order" o ON o.id = oi."orderId"
       JOIN "Bundle" b ON b."productId" = oi."productId"
       JOIN "BundleItem" bi ON bi."bundleId" = b.id
       WHERE o.status IN ('PENDING', 'CONFIRMED') AND o."senditTrackingId" IS NULL
     )
     SELECT id, SUM(quantity)::int AS committed FROM expanded GROUP BY id`
  )
  const committedByProduct = new Map(demand.rows.map((row) => [row.id, Number(row.committed) || 0]))

  for (const product of requirements.rows) {
    if (!product.trackInventory) continue
    const available = Number(product.stock) - (committedByProduct.get(product.id) || 0)
    if (product.required > available) {
      throw new StockConflictError(
        `${product.name}: ${product.required} demandé${product.required > 1 ? 's' : ''}, ${Math.max(0, available)} disponible${available > 1 ? 's' : ''}`
      )
    }
  }
}

// GET /api/ops/orders - List all orders
export async function GET(request: NextRequest) {
  try {
    const session = await getOpsSession()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const sourceChannel = searchParams.get('sourceChannel')
    const needsReview = searchParams.get('needsReview')

    // Short 60s cache: this list is opened constantly (and re-opened on every
    // navigation back), but it's an operational queue — so every write below
    // busts it immediately, meaning you never see a stale order after acting.
    const { data, cachedAt } = await cached(
      `orders:${status ?? ''}:${sourceChannel ?? ''}:${needsReview ?? ''}`,
      60 * 1000,
      async () => {
    let query = `
      SELECT
        o.*,
        COUNT(oi.id) as items_count,
        STRING_AGG(DISTINCT p.name, ', ') as product_names
      FROM "Order" o
      LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
      LEFT JOIN "Product" p ON p.id = oi."productId"
      WHERE 1=1
    `
    const params: string[] = []
    let paramIndex = 1

    if (status) {
      query += ` AND o.status = $${paramIndex}`
      params.push(status)
      paramIndex++
    }

    if (sourceChannel) {
      query += ` AND o."sourceChannel" = $${paramIndex}`
      params.push(sourceChannel)
      paramIndex++
    }

    if (needsReview === 'true') {
      query += ` AND o."needsReview" = true`
    }

    // The orders page paginates client-side over the full set, and the status
    // cards count the loaded rows — so a low LIMIT silently truncated the list
    // (showed "86 livrées" while the DB had 101). Load the whole (small) table.
    query += `
      GROUP BY o.id
      ORDER BY o."createdAt" DESC
      LIMIT 5000
    `

    const result = await pool.query(query, params)
    return result.rows
      },
      { fresh: searchParams.get('fresh') === '1' }
    )

    return NextResponse.json(data, { headers: { 'X-Cached-At': new Date(cachedAt).toISOString() } })
  } catch (error) {
    console.error('Orders list error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    )
  }
}

// POST /api/ops/orders - Create new order
export async function POST(request: NextRequest) {
  try {
    const session = await getOpsSession()

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Validate with Zod schema (prevents ALL data quality bugs)
    const validation = CreateOrderSchema.safeParse(body)

    if (!validation.success) {
      console.error('❌ Order validation failed:', validation.error.flatten())
      return NextResponse.json({
        error: 'Validation failed',
        details: validation.error.flatten().fieldErrors,
      }, { status: 400 })
    }

    // All data is now validated and type-safe!
    const {
      sourceChannel,
      handToHand,
      marketplace,
      channelCommission,
      deliveryName,
      deliveryPhone,
      deliveryCity,
      deliveryAddress,
      deliveryNotes,
      senditDistrictId,
      paymentMethod,
      paidAmount,
      paidAt,
      paymentReference,
      items,
      discountTotal,
      deliveryFeeCharged,
      estimatedDeliveryCost,
      promoCode,
      notes,
      confirmImmediately,
      productsTotal,
      revenue,
      total,
    } = validation.data
    const fulfilledWithoutSendit = handToHand || marketplace
    const prepaid = paymentMethod === 'VIREMENT' || paymentMethod === 'CARD'
    const createdStatus = fulfilledWithoutSendit ? 'DELIVERED' : (confirmImmediately ? 'CONFIRMED' : 'PENDING')

    // Generate order number
    const orderNumber = generateOrderNumber()

    // Start transaction
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await assertOrderItemsAvailable(client, items)

      // Total is already calculated and validated by Zod schema
      console.log('💰 Order calculation (validated):', {
        productsTotal,
        discountTotal,
        revenue,
        deliveryFeeCharged,
        total,
        calculation: `${productsTotal} - ${discountTotal} + ${deliveryFeeCharged} = ${total}`
      })

      // Create order
      const orderResult = await client.query(
        `INSERT INTO "Order" (
          "orderNumber",
          "sourceChannel",
          "deliveryName",
          "deliveryPhone",
          "deliveryCity",
          "deliveryAddress",
          "deliveryNotes",
          "senditDistrictId",
          "paymentMethod",
          "productsTotal",
          "discountTotal",
          "revenue",
          "total",
          "deliveryFeeCharged",
          "estimatedDeliveryCost",
          "promoCode",
          "notes",
          "status",
          "confirmationStatus",
          "deliveryStatus",
          "paidAmount",
          "paidAt",
          "paymentReference",
          "paymentStatus",
          "channelCommission",
          "createdAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22::timestamptz, $23, $24, $25, NOW()
        ) RETURNING *`,
        [
          orderNumber,
          sourceChannel,
          deliveryName,
          deliveryPhone,
          deliveryCity,
          deliveryAddress,
          deliveryNotes,
          senditDistrictId || null,
          paymentMethod,
          productsTotal,
          discountTotal,
          revenue,
          total,
          deliveryFeeCharged,
          estimatedDeliveryCost,
          promoCode || null,
          notes || null,
          /* Une remise en main propre est deja consommee : la cliente a le
             produit, l'argent est encaisse. La naître CONFIRMED obligerait a
             repasser la marquer livree, et c'est cet oubli qui ramene aux
             ajustements de stock a la main. DELIVERED laisse les triggers
             faire leur travail : `apply_order_stock_movement` decremente le
             stock, `stamp_delivered_at` pose la date qui fait entrer la vente
             dans le CA realise. */
          createdStatus,
          fulfilledWithoutSendit || confirmImmediately ? 'CONFIRMED' : 'NEEDS_CONFIRMATION',
          'NOT_CREATED',
          prepaid ? paidAmount : null,
          prepaid ? paidAt : null,
          prepaid ? paymentReference || null : null,
          prepaid
            ? Math.abs(Number(paidAmount) - total) <= 0.01 ? 'PAID' : 'PARTIAL'
            : 'PENDING',
          channelCommission,
        ]
      )

      const order = orderResult.rows[0]
      let senditProductsDescription = buildSenditProductsDescription(items, `Order ${orderNumber}`)

      // Create order items (if any)
      if (items && items.length > 0) {
        // Get product cost prices
        const productIds = items.map((item) => item.productId)
        const productsResult = await client.query<{
          id: number
          name: string
          costPrice: number | string | null
        }>(
          `SELECT id, name, "costPrice" FROM "Product" WHERE id = ANY($1)`,
          [productIds]
        )

        const productsById = new Map(
          productsResult.rows.map(p => [p.id, { name: p.name, costPrice: p.costPrice || 0 }])
        )
        senditProductsDescription = buildSenditProductsDescription(
          items.map((item) => ({
            productId: item.productId,
            productName: productsById.get(item.productId)?.name,
            quantity: item.quantity,
          })),
          `Order ${orderNumber}`
        )

        // Create order items
        for (const item of items) {
        const unitCost = Number(productsById.get(item.productId)?.costPrice) || 0
        const totalCost = unitCost * item.quantity

        await client.query(
          `INSERT INTO "OrderItem" (
            "orderId",
            "productId",
            "quantity",
            "price",
            "unitCost",
            "totalCost"
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [order.id, item.productId, item.quantity, item.unitPrice, unitCost, totalCost]
        )
        }
      }

      // Re-run the profit trigger now that OrderItem rows exist.
      await client.query(
        `UPDATE "Order"
         SET "deliveryStatus" = "deliveryStatus"
         WHERE id = $1`,
        [order.id]
      )

      // Add status history
      await client.query(
        `INSERT INTO "OrderStatusHistory" (
          "orderId",
          "oldStatus",
          "newStatus",
          "source",
          "note",
          "createdAt"
        ) VALUES ($1, NULL, $2, 'manual', $3, NOW())`,
        [
          order.id,
          createdStatus,
          `Order created via BOS by ${session.user.email}`,
        ]
      )

      await client.query('COMMIT')

      // Auto-create Sendit shipment if order was confirmed immediately
      let senditWarning = null
      if (confirmImmediately && !fulfilledWithoutSendit) {
        /* Le numero rejoint le district dans la garde, et ce n'est pas pour
           satisfaire le typage : Sendit refuse une expedition sans telephone.
           Une place de marche n'a ni l'un ni l'autre — elle livre elle-meme —
           donc elle passe par ici sans jamais tenter l'appel. */
        if (!senditDistrictId || !deliveryPhone) {
          senditWarning = !deliveryPhone
            ? 'Commande créée sans expédition Sendit : aucun numéro de téléphone (vente sur place de marché).'
            : 'Order created but Sendit shipment was not created: exact Sendit district is required.'
          console.warn(senditWarning)
        } else {
          try {
          console.log(`🚀 Auto-creating Sendit shipment for new order ${order.id}...`)
          console.log(`Order data:`, {
            orderNumber,
            deliveryName,
            deliveryPhone,
            deliveryCity,
            deliveryAddress,
            paymentMethod,
            total,
          })

          // Create shipment with Sendit
          const shipment = await createSenditShipment({
            reference: orderNumber,
            recipient_name: deliveryName,
            recipient_phone: deliveryPhone,
            recipient_city: deliveryCity,
            recipient_address: deliveryAddress || '',
            district_id: senditDistrictId,
            cod_amount: calculateCodAmount(paymentMethod, total),
            package_weight: 0.5,
            package_description: senditProductsDescription,
            notes: notes || deliveryNotes || '',
          })
          const districtMismatch = shipment.destination_district_id != null
            && shipment.destination_district_id !== senditDistrictId

          // Update order with Sendit tracking info (keep status as CONFIRMED)
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
              order.id,
            ]
          )

          // Add status history note (status stays CONFIRMED)
          await pool.query(
            `INSERT INTO "OrderStatusHistory" (
              "orderId", "oldStatus", "newStatus", "source", "note", "createdAt"
            ) VALUES ($1, $2, $3, 'auto', $4, NOW())`,
            [
              order.id,
              'CONFIRMED',
              'CONFIRMED',
              districtMismatch
                ? `Sendit shipment created: ${shipment.tracking_id}; district mismatch requested=${senditDistrictId} received=${shipment.destination_district_id}`
                : `Sendit shipment created: ${shipment.tracking_id}`,
            ]
          )

          if (districtMismatch) {
            senditWarning = `Sendit created the shipment in ${shipment.destination_district_name || `district #${shipment.destination_district_id}`} instead of district #${senditDistrictId}. Verify the destination before pickup.`
          }

          console.log(`✅ Sendit shipment created: ${shipment.tracking_id}`)
          } catch (senditError: unknown) {
          // Log error but don't fail the order creation
          console.error(`❌ Failed to auto-create Sendit shipment for order ${order.id}:`, senditError)
          console.error(`Error details:`, {
            message: senditError instanceof Error ? senditError.message : String(senditError),
            stack: senditError instanceof Error ? senditError.stack : undefined,
          })
          senditWarning = `Commande créée, mais l’expédition Sendit a échoué : ${senditError instanceof Error ? senditError.message : String(senditError)}`
          // Order stays CONFIRMED, user can manually create shipment later
          }
        }
      }

      // Fetch complete order with items
      const completeOrder = await pool.query(
        `SELECT o.*,
          json_agg(
            json_build_object(
              'id', oi.id,
              'productId', oi."productId",
              'quantity', oi.quantity,
              'price', oi.price,
              'unitCost', oi."unitCost"
            )
          ) as items
        FROM "Order" o
        LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
        WHERE o.id = $1
        GROUP BY o.id`,
        [order.id]
      )

      const createdOrder = completeOrder.rows[0]
      console.log('Created order:', {
        id: createdOrder?.id,
        orderNumber: createdOrder?.orderNumber,
        hasItems: createdOrder?.items?.length,
        status: createdOrder?.status,
        senditTrackingId: createdOrder?.senditTrackingId,
        senditWarning,
      })

      // A new order invalidates the order queues AND the money aggregates.
      bustCache('orders:'); bustCache('dashboard-stats:'); await bustAnalyticsCache()

      return NextResponse.json({
        ...createdOrder,
        _warning: senditWarning,
      }, { status: 201 })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error: unknown) {
    console.error('Create order error:', error)
    if (error instanceof StockConflictError) {
      return NextResponse.json(
        { error: 'Stock insuffisant', details: error.message },
        { status: 409 }
      )
    }
    return NextResponse.json(
      {
        error: 'Failed to create order',
        details: error instanceof Error ? error.message : String(error),
        stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}
