import type { QueryResultRow } from 'pg'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'

/**
 * Intelligence / Focus — "where do we win, lose, and focus".
 *
 * Built to be HONEST about data readiness: margin/channel analytics only
 * unlock once cost prices and order channels are filled. Until then we show
 * what is genuinely knowable (COD economics, product velocity) and surface
 * the missing inputs as an actionable checklist rather than faking numbers.
 *
 * GET /api/ops/intelligence?days=30|90
 */

const TZ = 'Africa/Casablanca'
// OrderStatus enum (verified): PENDING, CONFIRMED, DELIVERED, CANCELLED
const LOST = ['CANCELLED']
const FULFILLING = ['CONFIRMED', 'DELIVERED']

function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : 0 }
  return 0
}

async function safeRows<T extends QueryResultRow>(label: string, q: Promise<{ rows: T[] }>): Promise<T[]> {
  try { return (await q).rows } catch (e) { console.error(`[Intelligence] "${label}" failed:`, e); return [] }
}

function resolveRange(searchParams: URLSearchParams) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '90', 10) || 90, 1), 365)
  const startD = new Date(today); startD.setDate(startD.getDate() - (days - 1))
  return { start: startD.toISOString().split('T')[0], end: today, days }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!isFounder(session.user.email)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    const { start, end, days } = resolveRange(req.nextUrl.searchParams)
    const oDate = `(o."createdAt" AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date`

    const [statusRows, velocityRows, deadStockRows, costRows, channelRows, marginRows, channelPnlRows] = await Promise.all([
      // COD / order economics — status breakdown
      safeRows('status', pool.query(
        `SELECT status, COUNT(*)::int AS orders, COALESCE(SUM(total),0)::float AS revenue
         FROM "Order" o WHERE ${oDate} GROUP BY status`,
        [start, end]
      )),

      // Velocity — what is selling (non-lost orders). No cost needed.
      safeRows('velocity', pool.query(
        `SELECT p.id, p.name, p.brand,
                SUM(oi.quantity)::int AS units,
                COALESCE(SUM(oi.quantity * oi.price),0)::float AS revenue
         FROM "OrderItem" oi
         JOIN "Order" o ON o.id = oi."orderId"
         JOIN "Product" p ON p.id = oi."productId"
         WHERE o.status::text <> ALL($3) AND ${oDate}
         GROUP BY p.id, p.name, p.brand
         ORDER BY units DESC, revenue DESC LIMIT 12`,
        [start, end, LOST]
      )),

      // Dead stock — active products with no sales in the window
      safeRows('deadStock', pool.query(
        `SELECT p.id, p.name, p.brand, p.stock::int AS stock
         FROM "Product" p
         WHERE p.active = true
           AND NOT EXISTS (
             SELECT 1 FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
             WHERE oi."productId" = p.id AND o.status::text <> ALL($3) AND ${oDate}
           )
         ORDER BY p.stock DESC LIMIT 15`,
        [start, end, LOST]
      )),

      // Readiness — cost-price coverage (unlocks margin)
      safeRows('cost', pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE "costPrice" IS NOT NULL AND "costPrice" > 0)::int AS withcost
         FROM "Product" WHERE active = true`
      )),

      // Readiness — channel coverage (unlocks channel P&L)
      safeRows('channel', pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE "sourceChannel" IS NOT NULL AND "sourceChannel" <> '')::int AS tagged
         FROM "Order" o WHERE ${oDate}`,
        [start, end]
      )),

      // Margin — products with a cost, joined to velocity (units sold in window).
      // ROUND needs ::numeric (no ROUND(double precision, int) in PG).
      safeRows('margin', pool.query(
        `SELECT p.id, p.name, p.brand, p.price::float AS price, p."costPrice"::float AS cost,
                ROUND(((p.price - p."costPrice") / NULLIF(p.price, 0) * 100)::numeric, 1) AS margin,
                COALESCE(v.units, 0)::int AS units,
                COALESCE(v.units, 0)::float * (p.price - p."costPrice") AS profit
         FROM "Product" p
         LEFT JOIN (
           SELECT oi."productId" AS pid, SUM(oi.quantity)::int AS units
           FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
           WHERE o.status::text <> ALL($3) AND ${oDate}
           GROUP BY 1
         ) v ON v.pid = p.id
         WHERE p.active = true AND p."costPrice" IS NOT NULL AND p."costPrice" > 0
         ORDER BY margin ASC`,
        [start, end, LOST]
      )),

      // Channel P&L — orders, delivered revenue, cancellation per source channel
      safeRows('channelPnl', pool.query(
        `SELECT COALESCE(NULLIF(o."sourceChannel",''),'Non taggé') AS channel,
                COUNT(*)::int AS orders,
                COUNT(*) FILTER (WHERE o.status = 'DELIVERED')::int AS delivered,
                COUNT(*) FILTER (WHERE o.status = 'CANCELLED')::int AS cancelled,
                COALESCE(SUM(o.total) FILTER (WHERE o.status = 'DELIVERED'),0)::float AS revenue
         FROM "Order" o WHERE ${oDate}
         GROUP BY 1 ORDER BY revenue DESC, orders DESC`,
        [start, end]
      )),
    ])

    // ---- COD economics ----
    const byStatus: Record<string, { orders: number; revenue: number }> = {}
    for (const r of statusRows) byStatus[r.status] = { orders: num(r.orders), revenue: num(r.revenue) }
    const get = (s: string) => byStatus[s] || { orders: 0, revenue: 0 }

    const totalOrders = statusRows.reduce((s, r) => s + num(r.orders), 0)
    const lostOrders = LOST.reduce((s, st) => s + get(st).orders, 0)
    const fulfillingOrders = FULFILLING.reduce((s, st) => s + get(st).orders, 0)
    const resolved = get('DELIVERED').orders + lostOrders

    const cod = {
      totalOrders,
      byStatus: statusRows
        .map((r) => ({ status: r.status, orders: num(r.orders), revenue: num(r.revenue) }))
        .sort((a, b) => b.orders - a.orders),
      confirmationRate: totalOrders > 0 ? (fulfillingOrders / totalOrders) * 100 : 0,
      cancellationRate: totalOrders > 0 ? (lostOrders / totalOrders) * 100 : 0,
      deliveryRate: resolved > 0 ? (get('DELIVERED').orders / resolved) * 100 : 0,
      revenue: {
        delivered: get('DELIVERED').revenue,
        inTransit: get('CONFIRMED').revenue,
        pending: get('PENDING').revenue,
        lost: LOST.reduce((s, st) => s + get(st).revenue, 0),
      },
    }

    // ---- Readiness ----
    const cost = costRows[0] || { total: 0, withcost: 0 }
    const channel = channelRows[0] || { total: 0, tagged: 0 }
    const readiness = {
      cost: { total: num(cost.total), filled: num(cost.withcost) },
      channel: { total: num(channel.total), filled: num(channel.tagged) },
      marginUnlocked: num(cost.withcost) > 0,
      channelUnlocked: num(channel.tagged) > 0,
    }

    // ---- Margin / winners & losers ----
    const marginProducts = marginRows.map((r) => ({
      id: r.id, name: r.name, brand: r.brand,
      price: num(r.price), cost: num(r.cost), margin: num(r.margin),
      units: num(r.units), profit: num(r.profit),
    }))
    const avgMargin = marginProducts.length
      ? marginProducts.reduce((s, p) => s + p.margin, 0) / marginProducts.length
      : 0
    const margin = {
      productsCount: marginProducts.length,
      avgMargin,
      // Winners: healthy margin AND actually selling
      winners: marginProducts.filter((p) => p.margin >= 35 && p.units > 0).sort((a, b) => b.profit - a.profit).slice(0, 8),
      // Losers: selling but thin/negative margin (money left on the table)
      losers: marginProducts.filter((p) => p.units > 0 && p.margin < 25).sort((a, b) => a.margin - b.margin).slice(0, 8),
      // Negative margin = selling at a loss (urgent)
      negative: marginProducts.filter((p) => p.margin < 0),
    }

    return NextResponse.json({
      period: { start, end, days },
      cod,
      velocity: {
        topSellers: velocityRows.map((r) => ({ id: r.id, name: r.name, brand: r.brand, units: num(r.units), revenue: num(r.revenue) })),
        deadStock: deadStockRows.map((r) => ({ id: r.id, name: r.name, brand: r.brand, stock: num(r.stock) })),
      },
      margin,
      channels: channelPnlRows
        .map((r) => ({
          channel: r.channel,
          orders: num(r.orders),
          delivered: num(r.delivered),
          cancelled: num(r.cancelled),
          revenue: num(r.revenue),
          cancelRate: num(r.orders) > 0 ? (num(r.cancelled) / num(r.orders)) * 100 : 0,
        }))
        .filter((c) => c.channel !== 'Non taggé' || c.orders > 0),
      readiness,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[Intelligence] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
