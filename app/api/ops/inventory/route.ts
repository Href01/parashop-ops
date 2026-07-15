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

    // Reorder policy (editable in Réglages): target coverage (days), a default supplier
    // lead time, and per-supplier lead times. These drive the advanced recommendation.
    const settingsRes = await pool.query(
      `SELECT key, value FROM "AppSetting" WHERE key IN ('reorder_target_days','reorder_lead_time_default','reorder_lead_times','inventory_stock_mode')`
    ).catch(() => ({ rows: [] as Array<{ key: string; value: string }> }))
    const settingsMap = new Map(settingsRes.rows.map((r) => [r.key, r.value]))
    const targetDays = Math.max(1, parseInt(settingsMap.get('reorder_target_days') || '15') || 15)
    const leadDefault = Math.max(1, parseInt(settingsMap.get('reorder_lead_time_default') || '5') || 5)
    let leadMap: Record<string, number> = {}
    try { leadMap = JSON.parse(settingsMap.get('reorder_lead_times') || '{}') } catch { /* ignore */ }
    const leadTimeFor = (supplier: string | null) => {
      const v = supplier ? Number(leadMap[supplier]) : NaN
      return Number.isFinite(v) && v > 0 ? v : leadDefault
    }
    // Per-product stock mode override: 'stock' (I hold real inventory → reorder logic
    // applies) vs 'on_demand' (I source from the supplier per order → no stockout alarms,
    // no pre-buy). Founder-set; falls back to a velocity-based suggestion.
    let modeMap: Record<string, 'stock' | 'on_demand'> = {}
    try { modeMap = JSON.parse(settingsMap.get('inventory_stock_mode') || '{}') } catch { /* ignore */ }

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
          SELECT oi."productId" AS pid,
                 COALESCE(SUM(oi.quantity), 0)::int AS sold30,
                 COALESCE(SUM(oi.quantity) FILTER (WHERE o."createdAt" >= NOW() - INTERVAL '7 days'), 0)::int AS sold7
          FROM "OrderItem" oi
          JOIN "Order" o ON o.id = oi."orderId"
          WHERE o.status IN ('CONFIRMED', 'DELIVERED')
            AND o."createdAt" >= NOW() - INTERVAL '30 days'
          GROUP BY oi."productId"
        )
        SELECT
          p.id, p.name, p.brand, p.price, p.image, p.stock,
          COALESCE(p."virtualStock", 0) AS "virtualStock",
          COALESCE(p."importUnavailable", false) AS "importUnavailable",
          p."reorderPoint", p."reorderQuantity", p."stockStatus",
          p.supplier, p."supplierSKU", p."lastRestockDate", p."costPrice",
          p."weeklySales", p."monthlyRevenue", p."profitMargin",
          COALESCE(d.committed, 0) AS committed,
          COALESCE(d.to_ship, 0) AS "toShip",
          COALESCE(d.in_transit, 0) AS "inTransit",
          COALESCE(d.to_ship_orders, 0) AS "toShipOrders",
          COALESCE(d.open_orders_count, 0) AS "openOrdersCount",
          COALESCE(s.sold30, 0) AS sold30d,
          COALESCE(s.sold7, 0) AS sold7d,
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
      const virtualStock = Number(r.virtualStock) || 0
      // Sellable = physical + supplier-backed virtual buffer (what the storefront lets
      // customers order). Physical may be negative (backorder); the value below clamps.
      const sellable = stock + virtualStock
      const committed = Number(r.committed) || 0
      const toShip = Number(r.toShip) || 0
      const available = Number(r.available) // = stock - toShip (shipped already left)
      const reorderPoint = Number(r.reorderPoint) || 0
      const reorderQuantity = Number(r.reorderQuantity) || 0
      const sold30d = Number(r.sold30d) || 0
      const sold7d = Number(r.sold7d) || 0
      const inTransit = Number(r.inTransit) || 0
      const price = r.price != null ? Number(r.price) : 0
      const costPrice = r.costPrice != null ? Number(r.costPrice) : 0

      // ── Advanced reorder model ──────────────────────────────────────────────
      // Velocity blends the 30-day baseline (stable for low-volume) with the last 7
      // days (reacts to a spike), weighted toward recent. Trend = recent vs baseline.
      const v30 = sold30d / 30
      const v7 = sold7d / 7
      const velocity = sold30d > 0 ? (v7 * 0.5 + v30 * 0.5) : 0 // units/day
      const trend = v30 > 0 ? (v7 - v30) / v30 : 0              // >0 accelerating

      const leadTime = leadTimeFor(r.supplier || null)          // days, per-supplier
      // Safety stock ~ z·σ over the lead time; demand modelled Poisson so σ=√(mean).
      // z=1.65 ≈ 95% service level. Protects against demand variability while waiting.
      const leadDemand = velocity * leadTime
      const safetyStock = velocity > 0 ? Math.ceil(1.65 * Math.sqrt(Math.max(1, leadDemand))) : 0
      // Dynamic reorder point: order when on-hand falls to (lead-time demand + safety).
      const reorderPointDyn = Math.ceil(leadDemand + safetyStock)
      // Days the current available stock lasts at the current pace.
      const daysCover = velocity > 0 ? Math.round(available / velocity) : (available > 0 ? null : 0)
      const daysLeft = daysCover // kept for backward compat

      // Recommended quantity: top up to (target coverage + lead time) of REAL demand,
      // minus free stock. No sales → velocity 0 → targetUnits 0 → we only cover what we
      // actually owe on open orders (owedGap), never a made-up quantity.
      // (Removed the old fallback that pre-bought the static reorderQuantity for 0-sales
      // items, and the `− inTransit` term — inTransit is shipped demand that already left
      // stock, not inbound supply, so subtracting it under-ordered.)
      const owedGap = Math.max(0, toShip - stock)
      const targetUnits = Math.ceil(velocity * (targetDays + leadTime))
      let suggestedReorder = Math.max(0, Math.round(Math.max(owedGap, targetUnits - available)))

      // ── Stock mode ──────────────────────────────────────────────────────────
      // Hybrid business: some SKUs are truly stocked (hold inventory), others are
      // sourced from the supplier per order. Suggest 'stock' for products that move
      // enough to be worth holding (~1.5+/week), 'on_demand' for the long tail. The
      // founder overrides per product. On-demand products are supplier-backed, so a
      // physical 0 is NOT a stockout — we mute their rupture alarms and pre-buy reco.
      const suggestedMode: 'stock' | 'on_demand' = sold30d >= 6 ? 'stock' : 'on_demand'
      const mode: 'stock' | 'on_demand' = modeMap[String(r.id)] === 'stock' ? 'stock' : modeMap[String(r.id)] === 'on_demand' ? 'on_demand' : suggestedMode
      // On-demand = don't pre-buy; you order from the supplier when a customer buys.
      if (mode === 'on_demand') suggestedReorder = 0

      // Stockout risk from days-of-cover vs the lead time (can we restock in time?).
      let stockoutRisk: 'out' | 'high' | 'medium' | 'low' | 'none' | 'on_demand' = 'none'
      if (mode === 'on_demand') stockoutRisk = 'on_demand' // supplier-sourced → no stockout concept
      else if (sellable <= 0) stockoutRisk = 'out'
      else if (velocity > 0) {
        if (available <= 0 || (daysCover != null && daysCover < leadTime)) stockoutRisk = 'high'
        else if (available <= reorderPointDyn) stockoutRisk = 'medium'
        else stockoutRisk = 'low'
      }
      // Margin economics.
      const marginUnit = Math.max(0, price - costPrice)
      const marginPct = price > 0 ? marginUnit / price : 0
      // Revenue you'd lose during the reorder wait if you're already stocking out.
      const revenueAtRisk = (stockoutRisk === 'out' || stockoutRisk === 'high') && velocity > 0
        ? Math.round(velocity * price * leadTime) : 0
      const retailValue = Math.max(0, stock) * price
      const marginValue = Math.max(0, stock) * marginUnit

      const trendTxt = trend > 0.25 ? '↑ accélère' : trend < -0.25 ? '↓ ralentit' : 'stable'
      const explanation = velocity > 0
        ? `Vend ${velocity.toFixed(1)}/j (${trendTxt}) · couvre ${daysCover == null ? '∞' : daysCover + 'j'}. `
          + `Point de commande ${reorderPointDyn} = ${Math.ceil(leadDemand)} (délai ${leadTime}j) + ${safetyStock} sécurité. `
          + `Reco ${suggestedReorder} → ${targetDays}j + délai.`
          + (revenueAtRisk > 0 ? ` CA à risque ~${revenueAtRisk} MAD/délai.` : '')
        : (stock <= reorderPoint ? `Pas de vente 30j · sous le seuil (${reorderPoint}).` : `Pas de vente 30j · stock OK.`)

      return {
        ...r,
        stock, virtualStock, sellable, committed, available,
        reorderPoint, reorderQuantity, toShip, inTransit,
        toShipOrders: Number(r.toShipOrders) || 0,
        openOrdersCount: Number(r.openOrdersCount) || 0,
        sold30d, sold7d, daysLeft, daysCover,
        price, costPrice,
        weeklySales: Number(r.weeklySales) || 0,
        activeAlerts: Number(r.activeAlerts) || 0,
        openOrders: r.openOrders || [],
        salesByChannel: r.salesByChannel || [],
        suggestedReorder,
        // Advanced metrics
        velocity: Math.round(velocity * 100) / 100,
        trend: Math.round(trend * 100) / 100,
        leadTime, safetyStock, reorderPointDyn, stockoutRisk,
        revenueAtRisk, marginUnit, marginPct: Math.round(marginPct * 100) / 100,
        retailValue, marginValue,
        mode, suggestedMode,
        explanation,
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
      // How the catalogue splits: truly stocked vs sourced-on-demand from the supplier.
      stockedProducts: products.filter((p) => p.mode === 'stock').length,
      onDemandProducts: products.filter((p) => p.mode === 'on_demand').length,
      // Value counts PHYSICAL stock only, clamped at 0 — the virtual buffer and any
      // negative backorder never inflate (nor deflate) the real inventory value.
      stockValue: products.reduce((s, p) => s + Math.max(0, p.stock) * (p.costPrice || 0), 0),
      // Shortages only count STOCKED products — an on-demand SKU at 0 is normal, not a shortage.
      shortages: products.filter((p) => p.mode === 'stock' && p.available < 0).length,
      // Low stock only for STOCKED products that actually sell and run short vs lead time.
      lowStock: products.filter((p) => p.mode === 'stock' && p.available >= 0 && p.velocity > 0 && (p.available <= p.reorderPointDyn || (p.daysCover != null && p.daysCover < p.leadTime))).length,
      // Truly out of stock = nothing sellable (physical + virtual ≤ 0).
      outOfStock: products.filter((p) => p.sellable <= 0).length,
      // Sellable only thanks to the supplier-backed buffer (physical ≤ 0, virtual > 0).
      supplierBacked: products.filter((p) => p.stock <= 0 && p.virtualStock > 0).length,
      toShipOrders: toShip.length,
      toShipUnits: toShip.reduce((s, o) => s + o.units, 0),
      reorderProducts: products.filter((p) => p.suggestedReorder > 0).length,
      reorderValue: products.reduce((s, p) => s + p.suggestedReorder * (p.costPrice || 0), 0),
      // Stock value AT SALE price + the margin locked in it (what the user asked for).
      stockRetailValue: products.reduce((s, p) => s + p.retailValue, 0),
      stockMarginValue: products.reduce((s, p) => s + p.marginValue, 0),
      // Revenue you're losing right now on out-of-stock / high-risk sellers (per lead time).
      revenueAtRisk: products.reduce((s, p) => s + p.revenueAtRisk, 0),
      // If you order all the suggestions: cash out (cost) vs sales/margin it unlocks.
      reorderRetail: products.reduce((s, p) => s + p.suggestedReorder * (p.price || 0), 0),
      reorderMargin: products.reduce((s, p) => s + p.suggestedReorder * (p.marginUnit || 0), 0),
    }

    const policy = { targetDays, leadDefault, leadTimes: leadMap }
    return NextResponse.json({ products, toShip, summary, policy })
  } catch (error: any) {
    console.error('GET inventory error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch inventory', details: error.message },
      { status: 500 }
    )
  }
}
