import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * GET /api/ops/inventory
 *
 * The single source of truth for stock, now DEMAND-AWARE. For every product it
 * returns both the supply side (stock, reorder point, forecast) and the real
 * demand from open orders:
 *   - committed  = units in OPEN orders (PENDING/CONFIRMED), shipped or not
 *   - toShip     = committed units not yet handed to Sendit (no tracking)
 *   - available  = stock - committed  ← the true "will I run out?" signal
 *   - openOrders = the exact orders driving that demand (for the drill-down)
 *
 * It also returns `toShip` (order-centric fulfillment queue) and a `summary`
 * so one call powers the whole page. Stock is NOT auto-decremented in this
 * system (no sale movements), so `available` is what catches acute shortages.
 *
 * Query params: status, search, supplier (optional server-side filters).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const supplier = searchParams.get('supplier')

    const conditions: string[] = ['p."trackInventory" = true']
    const params: any[] = []
    let paramIndex = 1

    if (status) {
      conditions.push(`p."stockStatus" = $${paramIndex}`)
      params.push(status)
      paramIndex++
    }
    if (search) {
      conditions.push(`(
        LOWER(p.name) LIKE LOWER($${paramIndex})
        OR LOWER(p.brand) LIKE LOWER($${paramIndex})
        OR p."supplierSKU" LIKE $${paramIndex}
      )`)
      params.push(`%${search}%`)
      paramIndex++
    }
    if (supplier) {
      conditions.push(`p.supplier = $${paramIndex}`)
      params.push(supplier)
      paramIndex++
    }
    const whereClause = `WHERE ${conditions.join(' AND ')}`

    const [productsRes, toShipRes] = await Promise.all([
      pool.query(
        `
        WITH demand AS (
          SELECT oi."productId" AS pid,
                 COALESCE(SUM(oi.quantity), 0)::int AS committed,
                 COALESCE(SUM(oi.quantity) FILTER (WHERE o."senditTrackingId" IS NULL), 0)::int AS to_ship,
                 COALESCE(SUM(oi.quantity) FILTER (WHERE o."senditTrackingId" IS NOT NULL), 0)::int AS in_transit,
                 COUNT(DISTINCT o.id) FILTER (WHERE o."senditTrackingId" IS NULL)::int AS to_ship_orders,
                 COUNT(DISTINCT o.id)::int AS open_orders_count
          FROM "OrderItem" oi
          JOIN "Order" o ON o.id = oi."orderId"
          WHERE o.status IN ('PENDING', 'CONFIRMED')
          GROUP BY oi."productId"
        ),
        -- Real velocity across ALL channels (Instagram, WhatsApp, Sendit, Website…),
        -- 30-day window so low-volume products don't read as 0 like the old 7-day did.
        sales AS (
          SELECT oi."productId" AS pid, COALESCE(SUM(oi.quantity), 0)::int AS sold30
          FROM "OrderItem" oi
          JOIN "Order" o ON o.id = oi."orderId"
          WHERE o.status IN ('CONFIRMED', 'DELIVERED')
            AND o."createdAt" >= NOW() - INTERVAL '30 days'
          GROUP BY oi."productId"
        )
        SELECT
          p.id, p.name, p.brand, p.price, p.image, p.stock,
          p."reorderPoint", p."reorderQuantity", p."stockStatus",
          p.supplier, p."supplierSKU", p."lastRestockDate", p."costPrice",
          p."weeklySales", p."monthlyRevenue", p."profitMargin",
          COALESCE(d.committed, 0) AS committed,
          COALESCE(d.to_ship, 0) AS "toShip",
          COALESCE(d.in_transit, 0) AS "inTransit",
          COALESCE(d.to_ship_orders, 0) AS "toShipOrders",
          COALESCE(d.open_orders_count, 0) AS "openOrdersCount",
          COALESCE(s.sold30, 0) AS sold30d,
          -- Available = physical stock minus what still has to be shipped. Already
          -- shipped orders have LEFT the warehouse, so they must NOT reduce it again.
          (p.stock - COALESCE(d.to_ship, 0))::int AS available,
          COALESCE((
            SELECT json_agg(json_build_object(
              'orderId', o.id,
              'qty', oi.quantity,
              'customer', COALESCE(NULLIF(TRIM(o."deliveryName"), ''), '—'),
              'city', o."deliveryCity",
              'shipped', (o."senditTrackingId" IS NOT NULL),
              'status', o.status::text,
              'created', o."createdAt"
            ) ORDER BY (o."senditTrackingId" IS NOT NULL) ASC, o."createdAt" DESC)
            FROM "OrderItem" oi
            JOIN "Order" o ON o.id = oi."orderId"
            WHERE oi."productId" = p.id AND o.status IN ('PENDING', 'CONFIRMED')
          ), '[]'::json) AS "openOrders",
          COALESCE((
            SELECT json_agg(json_build_object('channel', ch, 'units', u) ORDER BY u DESC)
            FROM (
              SELECT COALESCE(NULLIF(TRIM(o."sourceChannel"), ''), 'Autre') AS ch, SUM(oi.quantity)::int AS u
              FROM "OrderItem" oi
              JOIN "Order" o ON o.id = oi."orderId"
              WHERE oi."productId" = p.id
                AND o.status IN ('CONFIRMED', 'DELIVERED')
                AND o."createdAt" >= NOW() - INTERVAL '30 days'
              GROUP BY 1
            ) t
          ), '[]'::json) AS "salesByChannel",
          (
            SELECT COUNT(*) FROM "StockAlert" sa
            WHERE sa."productId" = p.id AND sa.acknowledged = false
          ) AS "activeAlerts"
        FROM "Product" p
        LEFT JOIN demand d ON d.pid = p.id
        LEFT JOIN sales s ON s.pid = p.id
        ${whereClause}
        ORDER BY (p.stock - COALESCE(d.to_ship, 0)) ASC, COALESCE(s.sold30, 0) DESC, p.stock ASC
        LIMIT 300
        `,
        params
      ),
      // Order-centric fulfillment queue: open orders not yet handed to Sendit.
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
    ])

    const products = productsRes.rows.map((r) => {
      const stock = Number(r.stock) || 0
      const committed = Number(r.committed) || 0
      const toShip = Number(r.toShip) || 0
      const available = Number(r.available) // = stock - toShip (shipped already left)
      const reorderPoint = Number(r.reorderPoint) || 0
      const reorderQuantity = Number(r.reorderQuantity) || 0
      const sold30d = Number(r.sold30d) || 0
      // Live velocity from real 30-day multi-channel sales.
      const dailyVelocity = sold30d / 30
      const daysLeft = dailyVelocity > 0 && stock > 0 ? Math.round(available / dailyVelocity) : null
      // Suggested reorder, velocity-driven so it stays consistent with "Vendu 30j":
      //  - if we can't even ship what's owed → cover that gap first
      //  - else top up to ~30 days of sales
      //  - if no velocity but under the reorder point → fall back to the threshold
      const owedGap = Math.max(0, toShip - stock)
      const target30 = Math.ceil(dailyVelocity * 30)
      let suggestedReorder = owedGap
      if (sold30d > 0) suggestedReorder = Math.max(owedGap, target30 - available)
      else if (stock <= reorderPoint) suggestedReorder = Math.max(owedGap, reorderQuantity, reorderPoint - stock)
      suggestedReorder = Math.max(0, suggestedReorder)
      return {
        ...r,
        stock,
        committed,
        available,
        reorderPoint,
        reorderQuantity,
        toShip,
        inTransit: Number(r.inTransit) || 0,
        toShipOrders: Number(r.toShipOrders) || 0,
        openOrdersCount: Number(r.openOrdersCount) || 0,
        sold30d,
        daysLeft,
        costPrice: r.costPrice != null ? Number(r.costPrice) : 0,
        weeklySales: Number(r.weeklySales) || 0,
        activeAlerts: Number(r.activeAlerts) || 0,
        openOrders: r.openOrders || [],
        salesByChannel: r.salesByChannel || [],
        suggestedReorder,
      }
    })

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
      totalProducts: products.length,
      stockValue: products.reduce((s, p) => s + p.stock * (p.costPrice || 0), 0),
      shortages: products.filter((p) => p.available < 0).length,
      lowStock: products.filter((p) => p.available >= 0 && (p.stock <= p.reorderPoint || p.stockStatus === 'Low stock')).length,
      outOfStock: products.filter((p) => p.stock === 0).length,
      toShipOrders: toShip.length,
      toShipUnits: toShip.reduce((s, o) => s + o.units, 0),
      reorderProducts: products.filter((p) => p.suggestedReorder > 0).length,
      reorderValue: products.reduce((s, p) => s + p.suggestedReorder * (p.costPrice || 0), 0),
    }

    return NextResponse.json({ products, toShip, summary })
  } catch (error: any) {
    console.error('GET inventory error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch inventory', details: error.message },
      { status: 500 }
    )
  }
}
