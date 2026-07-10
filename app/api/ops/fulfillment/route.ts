import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * GET /api/ops/fulfillment
 *
 * Two operational views built by linking Orders ↔ OrderItems ↔ Products:
 *  - toShip:      open orders (PENDING/CONFIRMED) not yet handed to Sendit
 *                 (no senditTrackingId) — what still needs to physically go out.
 *  - stockDemand: per product, units committed in OPEN (undelivered) orders vs
 *                 on-hand stock. Stock is NOT auto-decremented in this system, so
 *                 `available = stock - committed` is the true "will I run out"
 *                 signal. Negative = shortage → reorder from the supplier.
 *
 * "Shipped" = senditTrackingId IS NOT NULL. Open = status IN (PENDING, CONFIRMED).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [toShipRes, demandRes] = await Promise.all([
      // Orders that still need to leave the warehouse.
      pool.query(`
        SELECT o.id,
               COALESCE(NULLIF(TRIM(o."deliveryName"), ''), '—') AS customer,
               o."deliveryCity" AS city,
               o."deliveryPhone" AS phone,
               o.status::text AS status,
               o."createdAt" AS created,
               COALESCE(SUM(oi.quantity), 0)::int AS units,
               bool_and(p.stock >= oi.quantity) AS can_fulfill,
               json_agg(json_build_object(
                 'productId', p.id, 'name', p.name, 'brand', p.brand,
                 'qty', oi.quantity, 'stock', p.stock
               ) ORDER BY p.name) AS items
        FROM "Order" o
        JOIN "OrderItem" oi ON oi."orderId" = o.id
        JOIN "Product" p ON p.id = oi."productId"
        WHERE o.status IN ('PENDING', 'CONFIRMED') AND o."senditTrackingId" IS NULL
        GROUP BY o.id, o."deliveryName", o."deliveryCity", o."deliveryPhone", o.status, o."createdAt"
        ORDER BY o."createdAt" ASC
      `),
      // Per-product stock vs open demand, with the exact orders driving it.
      pool.query(`
        WITH open_items AS (
          SELECT oi."productId" AS pid, oi.quantity AS qty,
                 o.id AS oid, o.status::text AS status,
                 (o."senditTrackingId" IS NOT NULL) AS shipped,
                 COALESCE(NULLIF(TRIM(o."deliveryName"), ''), '—') AS customer,
                 o."createdAt" AS created
          FROM "OrderItem" oi
          JOIN "Order" o ON o.id = oi."orderId"
          WHERE o.status IN ('PENDING', 'CONFIRMED')
        )
        SELECT p.id, p.name, p.brand, p.stock, p."reorderPoint" AS reorder_point,
               p."reorderQuantity" AS reorder_qty, p.supplier,
               COALESCE(SUM(oi.qty), 0)::int AS committed,
               COALESCE(SUM(oi.qty) FILTER (WHERE NOT oi.shipped), 0)::int AS to_ship,
               COALESCE(SUM(oi.qty) FILTER (WHERE oi.shipped), 0)::int AS in_transit,
               (p.stock - COALESCE(SUM(oi.qty), 0))::int AS available,
               json_agg(json_build_object(
                 'orderId', oi.oid, 'qty', oi.qty, 'status', oi.status,
                 'shipped', oi.shipped, 'customer', oi.customer, 'created', oi.created
               ) ORDER BY oi.shipped ASC, oi.created DESC) AS orders
        FROM "Product" p
        JOIN open_items oi ON oi.pid = p.id
        GROUP BY p.id, p.name, p.brand, p.stock, p."reorderPoint", p."reorderQuantity", p.supplier
        ORDER BY (p.stock - COALESCE(SUM(oi.qty), 0)) ASC, committed DESC
      `),
    ])

    const stockDemand = demandRes.rows.map((r) => ({
      id: r.id,
      name: r.name,
      brand: r.brand,
      stock: Number(r.stock) || 0,
      committed: Number(r.committed) || 0,
      toShip: Number(r.to_ship) || 0,
      inTransit: Number(r.in_transit) || 0,
      available: Number(r.available) || 0,
      reorderPoint: Number(r.reorder_point) || 0,
      reorderQty: Number(r.reorder_qty) || 0,
      supplier: r.supplier || null,
      orders: r.orders || [],
    }))

    const toShip = toShipRes.rows.map((r) => ({
      id: r.id,
      customer: r.customer,
      city: r.city || '—',
      phone: r.phone || null,
      status: r.status,
      created: r.created,
      units: Number(r.units) || 0,
      canFulfill: !!r.can_fulfill,
      items: r.items || [],
    }))

    const summary = {
      toShipOrders: toShip.length,
      toShipUnits: toShip.reduce((s, o) => s + o.units, 0),
      shortages: stockDemand.filter((p) => p.available < 0).length,
      atRisk: stockDemand.filter((p) => p.available >= 0 && (p.stock <= p.reorderPoint || p.available <= p.reorderPoint)).length,
    }

    return NextResponse.json({ summary, toShip, stockDemand })
  } catch (error) {
    console.error('[Fulfillment] Error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 })
  }
}
