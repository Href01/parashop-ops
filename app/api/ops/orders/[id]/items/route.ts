import { NextRequest, NextResponse } from 'next/server'
import type { PoolClient } from 'pg'
import pool from '@/lib/db'
import { bustCache } from '@/lib/ops-cache'
import { getOpsSession } from '@/lib/auth'
import { bustAnalyticsCache } from '@/lib/analytics-cache'
import { calculateEditedOrderEconomics } from '@/lib/order-economics'

type LockedOrder = {
  id: number
  status: string
  paymentMethod: string | null
  discountTotal: number | string | null
  deliveryFeeCharged: number | string | null
  paidAmount: number | string | null
  codAmount: number | string | null
  paymentStatus: string | null
  senditTrackingId: string | null
}

async function lockOrder(client: PoolClient, orderId: number) {
  const result = await client.query<LockedOrder>(
    `SELECT id, status, "paymentMethod", "discountTotal", "deliveryFeeCharged",
            "paidAmount", "codAmount", "paymentStatus", "senditTrackingId"
     FROM "Order" WHERE id = $1 FOR UPDATE`,
    [orderId],
  )
  return result.rows[0] || null
}

async function recomputeOrderEconomics(client: PoolClient, order: LockedOrder) {
  const lineResult = await client.query<{ productsTotal: string }>(
    `SELECT COALESCE(SUM(price * quantity), 0)::numeric AS "productsTotal"
     FROM "OrderItem" WHERE "orderId" = $1`,
    [order.id],
  )
  const economics = calculateEditedOrderEconomics({
    productsTotal: Number(lineResult.rows[0]?.productsTotal) || 0,
    discountTotal: Number(order.discountTotal) || 0,
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

async function addAuditNote(client: PoolClient, order: LockedOrder, note: string) {
  await client.query(
    `INSERT INTO "OrderStatusHistory"
      ("orderId", "oldStatus", "newStatus", source, note, "createdAt")
     VALUES ($1, $2, $2, 'manual', $3, NOW())`,
    [order.id, order.status, note],
  )
}

async function finishMutation() {
  bustCache('orders:')
  bustCache('dashboard-stats:')
  await bustAnalyticsCache()
}

function mutationError(error: unknown) {
  const dbError = error as { code?: string; message?: string }
  if (dbError.code === '23514') {
    return NextResponse.json(
      { error: 'Stock insuffisant pour appliquer cette quantité.' },
      { status: 409 },
    )
  }
  console.error('Order item mutation failed:', error)
  return NextResponse.json(
    { error: 'Impossible de modifier les articles', details: dbError.message },
    { status: 500 },
  )
}

function shipmentWarning(order: LockedOrder) {
  if (!order.senditTrackingId || ['DELIVERED', 'CANCELLED'].includes(order.status)) return null
  return 'Le bordereau Sendit existe déjà. Vérifie son montant COD et sa description avant le ramassage.'
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOpsSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const orderId = Number(id)
  const body = await request.json().catch(() => ({}))
  const productId = Number(body.productId)
  const quantity = Number(body.quantity)
  const priceInput = body.price == null || String(body.price) === '' ? null : Number(body.price)
  if (!Number.isInteger(orderId) || orderId <= 0 || !Number.isInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: 'Commande et produit requis' }, { status: 400 })
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    return NextResponse.json({ error: 'La quantité doit être comprise entre 1 et 999' }, { status: 400 })
  }
  if (priceInput != null && (!Number.isFinite(priceInput) || priceInput < 0)) {
    return NextResponse.json({ error: 'Prix invalide' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const order = await lockOrder(client, orderId)
    if (!order) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }

    const productResult = await client.query<{
      id: number
      name: string
      price: number | string
      cost: number | string
    }>(
      `SELECT id, name, price, COALESCE("costPrice", 0) AS cost
       FROM "Product" WHERE id = $1`,
      [productId],
    )
    const product = productResult.rows[0]
    if (!product) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 })
    }

    const duplicate = await client.query(
      `SELECT id FROM "OrderItem" WHERE "orderId" = $1 AND "productId" = $2 FOR UPDATE`,
      [orderId, productId],
    )
    if (duplicate.rows.length > 0) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { error: 'Ce produit est déjà dans la commande. Modifie directement sa quantité.' },
        { status: 409 },
      )
    }

    const unitPrice = priceInput == null ? Number(product.price) : priceInput
    const unitCost = Number(product.cost) || 0
    await client.query(
      `INSERT INTO "OrderItem"
        ("orderId", "productId", quantity, price, "unitCost", "totalCost", "pointsEarned")
       VALUES ($1, $2, $3, $4, $5, $6, 0)`,
      [orderId, productId, quantity, unitPrice, unitCost, unitCost * quantity],
    )
    const economics = await recomputeOrderEconomics(client, order)
    await addAuditNote(
      client,
      order,
      `${product.name} ajouté (quantité ${quantity}) par ${session.user.email}`,
    )
    await client.query('COMMIT')
    await finishMutation()
    return NextResponse.json({
      ok: true,
      unitCost,
      costMissing: unitCost <= 0,
      economics,
      warning: shipmentWarning(order),
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    return mutationError(error)
  } finally {
    client.release()
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOpsSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const orderId = Number(id)
  const body = await request.json().catch(() => ({}))
  const itemId = Number(body.itemId)
  const quantity = Number(body.quantity)
  const price = Number(body.price)
  if (!Number.isInteger(orderId) || orderId <= 0 || !Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: 'Commande et ligne requises' }, { status: 400 })
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    return NextResponse.json({ error: 'La quantité doit être comprise entre 1 et 999' }, { status: 400 })
  }
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: 'Prix invalide' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const order = await lockOrder(client, orderId)
    if (!order) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }
    const itemResult = await client.query<{
      id: number
      quantity: number
      price: number | string
      unitCost: number | string | null
      productName: string
    }>(
      `SELECT oi.id, oi.quantity, oi.price, oi."unitCost", p.name AS "productName"
       FROM "OrderItem" oi
       LEFT JOIN "Product" p ON p.id = oi."productId"
       WHERE oi.id = $1 AND oi."orderId" = $2
       FOR UPDATE OF oi`,
      [itemId, orderId],
    )
    const item = itemResult.rows[0]
    if (!item) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Ligne introuvable' }, { status: 404 })
    }

    await client.query(
      `UPDATE "OrderItem"
       SET quantity = $3, price = $4, "totalCost" = COALESCE("unitCost", 0) * $3
       WHERE id = $1 AND "orderId" = $2`,
      [itemId, orderId, quantity, price],
    )
    const economics = await recomputeOrderEconomics(client, order)
    const changes = [
      item.quantity !== quantity ? `quantité ${item.quantity} → ${quantity}` : null,
      Number(item.price) !== price ? `prix ${Number(item.price)} → ${price} MAD` : null,
    ].filter(Boolean).join(', ')
    await addAuditNote(
      client,
      order,
      `${item.productName || `Produit #${itemId}`} modifié (${changes || 'aucun changement'}) par ${session.user.email}`,
    )
    await client.query('COMMIT')
    await finishMutation()
    return NextResponse.json({ ok: true, economics, warning: shipmentWarning(order) })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    return mutationError(error)
  } finally {
    client.release()
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOpsSession()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const orderId = Number(id)
  const itemId = Number(request.nextUrl.searchParams.get('itemId'))
  if (!Number.isInteger(orderId) || orderId <= 0 || !Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: 'Commande et ligne requises' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const order = await lockOrder(client, orderId)
    if (!order) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }
    const allItems = await client.query<{ id: number; productName: string }>(
      `SELECT oi.id, p.name AS "productName"
       FROM "OrderItem" oi LEFT JOIN "Product" p ON p.id = oi."productId"
       WHERE oi."orderId" = $1 FOR UPDATE OF oi`,
      [orderId],
    )
    if (allItems.rows.length <= 1) {
      await client.query('ROLLBACK')
      return NextResponse.json(
        { error: 'Une commande doit garder au moins un article. Modifie sa quantité à la place.' },
        { status: 409 },
      )
    }
    const item = allItems.rows.find((row) => row.id === itemId)
    if (!item) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Ligne introuvable' }, { status: 404 })
    }

    await client.query(`DELETE FROM "OrderItem" WHERE id = $1 AND "orderId" = $2`, [itemId, orderId])
    const economics = await recomputeOrderEconomics(client, order)
    await addAuditNote(
      client,
      order,
      `${item.productName || `Produit #${itemId}`} retiré par ${session.user.email}`,
    )
    await client.query('COMMIT')
    await finishMutation()
    return NextResponse.json({ ok: true, economics, warning: shipmentWarning(order) })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    return mutationError(error)
  } finally {
    client.release()
  }
}
