import type { QueryResultRow } from 'pg'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'
import { getWeeklyGoal, getMonthlyGoal } from '@/app/api/ops/settings/goal/route'

const DAILY_REVENUE_GOAL = 6000
const BUSINESS_TIMEZONE = 'Africa/Casablanca'

type Tone = 'rose' | 'green' | 'amber' | 'blue' | 'violet' | 'red'

interface SummaryRow {
  revenueToday: number | string | null
  revenue7d: number | string | null
  revenue30d: number | string | null
  revenueWeek: number | string | null
  revenueWeekTotal: number | string | null
  revenueDelivered: number | string | null
  revenueDeliveredTotal: number | string | null
  profitDelivered: number | string | null
  cashReceivedDelivered: number | string | null
  deliveryCostDelivered: number | string | null
  previousRevenueDelivered: number | string | null
  previousRevenueWeek: number | string | null
  estimatedProfitWeek: number | string | null
  previousProfitWeek: number | string | null
  ordersToday: number | string | null
  ordersWeek: number | string | null
  ordersDelivered: number | string | null
  previousOrdersWeek: number | string | null
  bookedOrdersWeek: number | string | null
  delivered30d: number | string | null
  cancelled30d: number | string | null
}

interface SeriesRow {
  day: string
  label: string
  revenue: number | string | null
  profit: number | string | null
  orders: number | string | null
  delivered: number | string | null
  cancelled: number | string | null
}

interface PipelineRow {
  pending: number | string | null
  confirmed: number | string | null
  sendit: number | string | null
  delivered: number | string | null
  cancelled: number | string | null
}

interface ProductRow {
  productId: number | null
  name: string | null
  units: number | string | null
  revenue: number | string | null
}

interface CityRow {
  name: string | null
  orders: number | string | null
}

interface AlertCountsRow {
  needsConfirmation: number | string | null
  unshippedConfirmed: number | string | null
  deliveryIssues: number | string | null
  missingCosts: number | string | null
}

interface LowStockRow {
  name: string | null
  stock: number | string | null
  threshold: number | string | null
  total: number | string | null
}

interface RoasRow {
  spend: number | string | null
  revenue: number | string | null
}

interface ChannelRow {
  name: string | null
  orders: number | string | null
  revenue: number | string | null
}

interface ActivityHistoryRow {
  status: string | null
  note: string | null
  createdAt: string | Date
  orderNumber: string | null
  deliveryName: string | null
}

interface RecentOrderRow {
  status: string | null
  createdAt: string | Date
  orderNumber: string | null
  deliveryName: string | null
  sourceChannel: string | null
}

// Period-aware financial CTE. The selected range is [range_start, range_end);
// the comparison range is [compare_start, compare_end) (previous month/week, or
// same period last year). All dates are validated YYYY-MM-DD (no injection).
function financialCte(from: string, to: string, cFrom: string, cTo: string) {
  return `
  WITH bounds AS (
    SELECT
      ((now() AT TIME ZONE '${BUSINESS_TIMEZONE}')::date)::timestamp AS today_start,
      '${from}'::timestamp AS range_start,
      ('${to}'::date + INTERVAL '1 day')::timestamp AS range_end,
      '${cFrom}'::timestamp AS compare_start,
      ('${cTo}'::date + INTERVAL '1 day')::timestamp AS compare_end
  ),
  item_costs AS (
    SELECT
      oi."orderId",
      COUNT(*)::int AS item_count,
      COUNT(*) FILTER (
        WHERE COALESCE(oi."totalCost", oi."unitCost" * oi.quantity, p."costPrice" * oi.quantity) IS NULL
           OR COALESCE(oi."totalCost", oi."unitCost" * oi.quantity, p."costPrice" * oi.quantity) = 0
      )::int AS missing_cost_items,
      COALESCE(SUM(COALESCE(oi."totalCost", oi."unitCost" * oi.quantity, p."costPrice" * oi.quantity, 0)), 0)::numeric AS cogs
    FROM "OrderItem" oi
    LEFT JOIN "Product" p ON p.id = oi."productId"
    GROUP BY oi."orderId"
  ),
  order_financials AS (
    SELECT
      o.id,
      o.status::text AS status,
      o."createdAt",
      COALESCE(o."orderNumber", CONCAT('Order #', o.id)) AS "orderNumber",
      o."deliveryName",
      o."deliveryCity",
      o."sourceChannel",
      o."confirmationStatus",
      o."deliveryStatus",
      o."senditTrackingId",
      o."senditStatus",
      COALESCE(o."revenue", o."productsTotal", o.total::numeric, 0)::numeric AS revenue,
      COALESCE(o.total::numeric, o."revenue", o."productsTotal", 0)::numeric AS order_total,
      -- What Sendit actually bills you for delivery (deducted from the COD before payout).
      COALESCE(NULLIF(o."actualDeliveryCost", 0), NULLIF(o."estimatedDeliveryCost", 0), o."deliveryFeeCharged", 0)::numeric AS delivery_cost,
      COALESCE(
        o."finalProfit",
        o."estimatedProfit",
        CASE
          WHEN COALESCE(ic.item_count, 0) > 0 AND COALESCE(ic.missing_cost_items, 0) = 0 THEN
            COALESCE(o."revenue", o."productsTotal", o.total::numeric, 0)
            - COALESCE(ic.cogs, 0)
            - CASE
                WHEN o.status::text = 'DELIVERED' THEN COALESCE(o."actualDeliveryCost", o."estimatedDeliveryCost", 0)
                ELSE COALESCE(o."estimatedDeliveryCost", o."actualDeliveryCost", 0)
              END
            - COALESCE(o."returnOrFailedFees", 0)
          ELSE 0
        END
      )::numeric AS profit,
      COALESCE(ic.item_count, 0)::int AS item_count,
      COALESCE(ic.missing_cost_items, 0)::int AS missing_cost_items
    FROM "Order" o
    LEFT JOIN item_costs ic ON ic."orderId" = o.id
  )
`
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

function percentageChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null
  return ((current - previous) / previous) * 100
}

function humanizeStatus(status: string | null): string {
  switch (status) {
    case 'PENDING':
      return 'En attente'
    case 'CONFIRMED':
      return 'Confirmée'
    case 'DELIVERED':
      return 'Livrée'
    case 'CANCELLED':
      return 'Annulée'
    default:
      return 'Mise à jour'
  }
}

function toneFromStatus(status: string | null): Tone {
  switch (status) {
    case 'DELIVERED':
      return 'green'
    case 'CONFIRMED':
      return 'blue'
    case 'CANCELLED':
      return 'red'
    case 'PENDING':
      return 'amber'
    default:
      return 'violet'
  }
}

function channelColor(name: string): string {
  const normalized = name.toLowerCase()

  if (normalized.includes('instagram')) return 'var(--c-instagram)'
  if (normalized.includes('whatsapp')) return 'var(--c-whatsapp)'
  if (normalized.includes('tiktok')) return 'var(--c-tiktok)'
  if (normalized.includes('manual')) return 'var(--c-manual)'

  return 'var(--c-website)'
}

async function safeQuery<T extends QueryResultRow>(label: string, query: string): Promise<T[]> {
  try {
    const result = await pool.query<T>(query)
    return result.rows
  } catch (error) {
    console.error(`Dashboard query failed (${label}):`, error)
    throw error
  }
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isFounder(session.user.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Date range: explicit ?from&to (a month, an ISO week, …) or rolling ?days=.
    // Comparison range: ?compareFrom&compareTo (prev month/week, last year) or
    // the previous same-length window by default.
    const sp = new URL(req.url).searchParams
    const reDate = /^\d{4}-\d{2}-\d{2}$/
    const v = (s: string | null) => (s && reDate.test(s) ? s : null)
    const isoDay = (dt: Date) => dt.toISOString().slice(0, 10)

    let from = v(sp.get('from'))
    let to = v(sp.get('to'))
    let compareFrom = v(sp.get('compareFrom'))
    let compareTo = v(sp.get('compareTo'))

    if (!from || !to) {
      const dp = parseInt(sp.get('days') || '30', 10)
      const days = Number.isFinite(dp) && dp > 0 ? Math.min(dp, 3650) : 30
      const today = new Date()
      to = isoDay(today)
      const start = new Date(today)
      start.setDate(start.getDate() - (days - 1))
      from = isoDay(start)
    }
    const periodDays = Math.max(1, Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000) + 1)
    if (!compareFrom || !compareTo) {
      const f = new Date(from + 'T00:00:00Z')
      const cTo = new Date(f); cTo.setUTCDate(cTo.getUTCDate() - 1)
      const cFrom = new Date(cTo); cFrom.setUTCDate(cFrom.getUTCDate() - (periodDays - 1))
      compareFrom = isoDay(cFrom)
      compareTo = isoDay(cTo)
    }
    const FINANCIAL_CTE = financialCte(from, to, compareFrom, compareTo)

    const [
      summaryRows,
      seriesRows,
      pipelineRows,
      topProductRows,
      topCityRows,
      alertRows,
      lowStockRows,
      roasRows,
      channelRows,
      activityHistoryRows,
      recentOrdersRows,
    ] = await Promise.all([
      safeQuery<SummaryRow>('summary', `
        ${FINANCIAL_CTE}
        SELECT
          COALESCE(SUM(revenue) FILTER (WHERE "createdAt" >= (SELECT today_start FROM bounds) AND status IN ('CONFIRMED', 'DELIVERED')), 0)::double precision AS "revenueToday",
          COALESCE(SUM(revenue) FILTER (WHERE "createdAt" >= ((now() AT TIME ZONE '${BUSINESS_TIMEZONE}')::date - INTERVAL '6 days')::timestamp AND status IN ('CONFIRMED', 'DELIVERED')), 0)::double precision AS "revenue7d",
          COALESCE(SUM(revenue) FILTER (WHERE "createdAt" >= ((now() AT TIME ZONE '${BUSINESS_TIMEZONE}')::date - INTERVAL '29 days')::timestamp AND status IN ('CONFIRMED', 'DELIVERED')), 0)::double precision AS "revenue30d",
          COALESCE(SUM(revenue) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status IN ('CONFIRMED', 'DELIVERED')), 0)::double precision AS "revenueWeek",
          COALESCE(SUM(order_total) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status IN ('CONFIRMED', 'DELIVERED')), 0)::double precision AS "revenueWeekTotal",
          COALESCE(SUM(revenue) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status = 'DELIVERED'), 0)::double precision AS "revenueDelivered",
          COALESCE(SUM(order_total) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status = 'DELIVERED'), 0)::double precision AS "revenueDeliveredTotal",
          COALESCE(SUM(profit) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status = 'DELIVERED'), 0)::double precision AS "profitDelivered",
          COALESCE(SUM(order_total - delivery_cost) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status = 'DELIVERED'), 0)::double precision AS "cashReceivedDelivered",
          COALESCE(SUM(delivery_cost) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status = 'DELIVERED'), 0)::double precision AS "deliveryCostDelivered",
          COALESCE(SUM(revenue) FILTER (
            WHERE "createdAt" >= (SELECT compare_start FROM bounds)
              AND "createdAt" < (SELECT compare_end FROM bounds)
              AND status = 'DELIVERED'
          ), 0)::double precision AS "previousRevenueDelivered",
          COALESCE(SUM(revenue) FILTER (
            WHERE "createdAt" >= (SELECT compare_start FROM bounds)
              AND "createdAt" < (SELECT compare_end FROM bounds)
              AND status IN ('CONFIRMED', 'DELIVERED')
          ), 0)::double precision AS "previousRevenueWeek",
          COALESCE(SUM(profit) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status IN ('CONFIRMED', 'DELIVERED')), 0)::double precision AS "estimatedProfitWeek",
          COALESCE(SUM(profit) FILTER (
            WHERE "createdAt" >= (SELECT compare_start FROM bounds)
              AND "createdAt" < (SELECT compare_end FROM bounds)
              AND status IN ('CONFIRMED', 'DELIVERED')
          ), 0)::double precision AS "previousProfitWeek",
          COUNT(*) FILTER (WHERE "createdAt" >= (SELECT today_start FROM bounds) AND status <> 'CANCELLED')::int AS "ordersToday",
          COUNT(*) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status <> 'CANCELLED')::int AS "ordersWeek",
          COUNT(*) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status = 'DELIVERED')::int AS "ordersDelivered",
          COUNT(*) FILTER (
            WHERE "createdAt" >= (SELECT compare_start FROM bounds)
              AND "createdAt" < (SELECT compare_end FROM bounds)
              AND status <> 'CANCELLED'
          )::int AS "previousOrdersWeek",
          COUNT(*) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status IN ('CONFIRMED', 'DELIVERED'))::int AS "bookedOrdersWeek",
          COUNT(*) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status = 'DELIVERED')::int AS "delivered30d",
          COUNT(*) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status = 'CANCELLED')::int AS "cancelled30d"
        FROM order_financials
      `),
      safeQuery<SeriesRow>('series', `
        ${FINANCIAL_CTE},
        days AS (
          SELECT generate_series(
            GREATEST((SELECT range_start FROM bounds), (SELECT range_end FROM bounds) - INTERVAL '181 days'),
            (SELECT range_end FROM bounds) - INTERVAL '1 day',
            INTERVAL '1 day'
          ) AS day_bucket
        )
        SELECT
          to_char(d.day_bucket, 'YYYY-MM-DD') AS day,
          to_char(d.day_bucket, 'Mon DD') AS label,
          COALESCE(SUM(ofn.revenue) FILTER (WHERE ofn.status IN ('CONFIRMED', 'DELIVERED')), 0)::double precision AS revenue,
          COALESCE(SUM(ofn.profit) FILTER (WHERE ofn.status IN ('CONFIRMED', 'DELIVERED')), 0)::double precision AS profit,
          COUNT(ofn.id) FILTER (WHERE ofn.status <> 'CANCELLED')::int AS orders,
          COUNT(ofn.id) FILTER (WHERE ofn.status = 'DELIVERED')::int AS delivered,
          COUNT(ofn.id) FILTER (WHERE ofn.status = 'CANCELLED')::int AS cancelled
        FROM days d
        LEFT JOIN order_financials ofn
          ON ofn."createdAt" >= d.day_bucket
         AND ofn."createdAt" < d.day_bucket + INTERVAL '1 day'
        GROUP BY d.day_bucket
        ORDER BY d.day_bucket ASC
      `),
      safeQuery<PipelineRow>('pipeline', `
        ${FINANCIAL_CTE}
        SELECT
          COUNT(*) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status = 'PENDING')::int AS pending,
          COUNT(*) FILTER (
            WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds)
              AND status = 'CONFIRMED'
              AND "senditTrackingId" IS NULL
          )::int AS confirmed,
          COUNT(*) FILTER (
            WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds)
              AND "senditTrackingId" IS NOT NULL
              AND status = 'CONFIRMED'
          )::int AS sendit,
          COUNT(*) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status = 'DELIVERED')::int AS delivered,
          COUNT(*) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status = 'CANCELLED')::int AS cancelled
        FROM order_financials
      `),
      safeQuery<ProductRow>('top-products', `
        ${FINANCIAL_CTE}
        SELECT
          oi."productId" AS "productId",
          COALESCE(NULLIF(TRIM(p.name), ''), CONCAT('Product #', COALESCE(oi."productId"::text, '-'))) AS name,
          COALESCE(SUM(oi.quantity), 0)::int AS units,
          COALESCE(SUM(COALESCE(oi.price, 0) * COALESCE(oi.quantity, 0)), 0)::double precision AS revenue
        FROM "OrderItem" oi
        INNER JOIN order_financials ofn ON ofn.id = oi."orderId"
        LEFT JOIN "Product" p ON p.id = oi."productId"
        WHERE ofn."createdAt" >= (SELECT range_start FROM bounds) AND ofn."createdAt" < (SELECT range_end FROM bounds)
          AND ofn.status IN ('CONFIRMED', 'DELIVERED')
        GROUP BY oi."productId", p.name
        ORDER BY units DESC, revenue DESC
        LIMIT 5
      `),
      safeQuery<CityRow>('top-cities', `
        ${FINANCIAL_CTE}
        SELECT
          COALESCE(NULLIF(TRIM("deliveryCity"), ''), 'Unknown') AS name,
          COUNT(*)::int AS orders
        FROM order_financials
        WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds)
          AND status IN ('CONFIRMED', 'DELIVERED')
        GROUP BY COALESCE(NULLIF(TRIM("deliveryCity"), ''), 'Unknown')
        ORDER BY orders DESC, name ASC
        LIMIT 5
      `),
      safeQuery<AlertCountsRow>('alerts', `
        ${FINANCIAL_CTE}
        SELECT
          COUNT(*) FILTER (WHERE status = 'PENDING')::int AS "needsConfirmation",
          COUNT(*) FILTER (WHERE status = 'CONFIRMED' AND "senditTrackingId" IS NULL)::int AS "unshippedConfirmed",
          COUNT(*) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status = 'CANCELLED')::int AS "deliveryIssues",
          COUNT(*) FILTER (WHERE status IN ('CONFIRMED', 'DELIVERED') AND missing_cost_items > 0)::int AS "missingCosts"
        FROM order_financials
      `),
      safeQuery<LowStockRow>('low-stock', `
        SELECT
          p.name,
          COALESCE(p.stock, 0)::int AS stock,
          COALESCE(p."lowStockThreshold", 5)::int AS threshold,
          COUNT(*) OVER()::int AS total
        FROM "Product" p
        WHERE COALESCE(p.stock, 0) > 0
          AND COALESCE(p.stock, 0) <= COALESCE(p."lowStockThreshold", 5)
        ORDER BY p.stock ASC, p.name ASC
        LIMIT 3
      `),
      safeQuery<RoasRow>('roas', `
        SELECT
          COALESCE(SUM(a.spend), 0)::double precision AS spend,
          COALESCE(SUM(a.revenue), 0)::double precision AS revenue
        FROM "AdCampaign" a
        WHERE COALESCE(a."endDate", CURRENT_DATE) >= CURRENT_DATE - INTERVAL '${periodDays - 1} days'
      `),
      safeQuery<ChannelRow>('channels', `
        ${FINANCIAL_CTE}
        SELECT
          CASE
            WHEN LOWER(COALESCE("sourceChannel", '')) LIKE '%whatsapp%' THEN 'WhatsApp'
            WHEN LOWER(COALESCE("sourceChannel", '')) LIKE '%instagram%' THEN 'Instagram'
            WHEN LOWER(COALESCE("sourceChannel", '')) LIKE '%tiktok%' THEN 'TikTok'
            WHEN LOWER(COALESCE("sourceChannel", '')) LIKE '%manual%' THEN 'Manual'
            WHEN LOWER(COALESCE("sourceChannel", '')) LIKE '%web%' THEN 'Website'
            WHEN NULLIF(TRIM(COALESCE("sourceChannel", '')), '') IS NULL THEN 'Website'
            ELSE "sourceChannel"
          END AS name,
          COUNT(*)::int AS orders,
          COALESCE(SUM(revenue), 0)::double precision AS revenue
        FROM order_financials
        WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds)
          AND status IN ('CONFIRMED', 'DELIVERED')
        GROUP BY 1
        ORDER BY orders DESC, revenue DESC
      `),
      safeQuery<ActivityHistoryRow>('activity-history', `
        SELECT
          h."newStatus" AS status,
          h.note,
          h."createdAt" AS "createdAt",
          o."orderNumber" AS "orderNumber",
          o."deliveryName" AS "deliveryName"
        FROM "OrderStatusHistory" h
        LEFT JOIN "Order" o ON o.id = h."orderId"
        ORDER BY h."createdAt" DESC
        LIMIT 6
      `),
      safeQuery<RecentOrderRow>('recent-orders', `
        SELECT
          o.status::text AS status,
          o."createdAt" AS "createdAt",
          o."orderNumber" AS "orderNumber",
          o."deliveryName" AS "deliveryName",
          o."sourceChannel" AS "sourceChannel"
        FROM "Order" o
        ORDER BY o."createdAt" DESC
        LIMIT 6
      `),
    ])

    const summary = summaryRows[0]
    const pipeline = pipelineRows[0]
    const alertCounts = alertRows[0]

    const revenueToday = toNumber(summary?.revenueToday)
    const revenue7d = toNumber(summary?.revenue7d)
    const revenue30d = toNumber(summary?.revenue30d)
    const [weeklyGoal, monthlyGoal] = await Promise.all([getWeeklyGoal(), getMonthlyGoal()])
    const revenueWeek = toNumber(summary?.revenueWeek)
    const revenueWeekTotal = toNumber(summary?.revenueWeekTotal)
    // Delivered-only = realized cash. revenueWeek (CONFIRMED+DELIVERED) is "expected".
    const revenueDelivered = toNumber(summary?.revenueDelivered)
    const revenueDeliveredTotal = toNumber(summary?.revenueDeliveredTotal)
    const profitDelivered = toNumber(summary?.profitDelivered)
    // Real cash you pocket: COD collected minus what Sendit keeps for delivery.
    const cashReceivedDelivered = toNumber(summary?.cashReceivedDelivered)
    const deliveryCostDelivered = toNumber(summary?.deliveryCostDelivered)
    const previousRevenueDelivered = toNumber(summary?.previousRevenueDelivered)
    const marginDelivered = revenueDelivered > 0 ? (profitDelivered / revenueDelivered) * 100 : 0
    const revenueDeliveredDelta = percentageChange(revenueDelivered, previousRevenueDelivered)
    const previousRevenueWeek = toNumber(summary?.previousRevenueWeek)
    const estimatedProfitWeek = toNumber(summary?.estimatedProfitWeek)
    const previousProfitWeek = toNumber(summary?.previousProfitWeek)
    const ordersWeek = toNumber(summary?.ordersWeek)
    const ordersDelivered = toNumber(summary?.ordersDelivered)
    const previousOrdersWeek = toNumber(summary?.previousOrdersWeek)
    const bookedOrdersWeek = toNumber(summary?.bookedOrdersWeek)
    const delivered30d = toNumber(summary?.delivered30d)
    const cancelled30d = toNumber(summary?.cancelled30d)
    const completedDelivery30d = delivered30d + cancelled30d
    const deliveryRate = completedDelivery30d > 0 ? (delivered30d / completedDelivery30d) * 100 : 0
    const marginPercent = revenueWeek > 0 ? (estimatedProfitWeek / revenueWeek) * 100 : 0
    const revenueDelta = percentageChange(revenueWeek, previousRevenueWeek)
    const profitDelta = percentageChange(estimatedProfitWeek, previousProfitWeek)
    const ordersDelta = percentageChange(ordersWeek, previousOrdersWeek)
    const averageOrderValue = bookedOrdersWeek > 0 ? revenueWeek / bookedOrdersWeek : 0

    const revenueSeries = seriesRows.map((row) => ({
      date: row.day,
      label: row.label,
      revenue: toNumber(row.revenue),
      profit: toNumber(row.profit),
      orders: toNumber(row.orders),
    }))

    const topProducts = topProductRows.map((row) => ({
      productId: row.productId ?? null,
      name: row.name || 'Unknown product',
      units: toNumber(row.units),
      revenue: toNumber(row.revenue),
    }))

    const topCities = topCityRows.map((row) => ({
      name: row.name || 'Unknown',
      orders: toNumber(row.orders),
    }))

    const pipelineItems = [
      { label: 'En attente', value: toNumber(pipeline?.pending), tone: 'amber' as Tone },
      { label: 'Confirmées', value: toNumber(pipeline?.confirmed), tone: 'blue' as Tone },
      { label: 'Chez Sendit', value: toNumber(pipeline?.sendit), tone: 'violet' as Tone },
      { label: 'Livrées', value: toNumber(pipeline?.delivered), tone: 'green' as Tone },
      { label: 'Annulées', value: toNumber(pipeline?.cancelled), tone: 'red' as Tone },
    ]

    const needsConfirmation = toNumber(alertCounts?.needsConfirmation)
    const unshippedConfirmed = toNumber(alertCounts?.unshippedConfirmed)
    const deliveryIssues = toNumber(alertCounts?.deliveryIssues)
    const missingCosts = toNumber(alertCounts?.missingCosts)
    const lowStockTotal = toNumber(lowStockRows[0]?.total)

    const attentionItems = [
      needsConfirmation > 0
        ? {
            tone: 'amber' as Tone,
            title: `${needsConfirmation} commande${needsConfirmation > 1 ? 's' : ''} à confirmer`,
            subtitle: 'Les commandes en attente ne comptent pas encore dans le CA',
            href: '/orders',
          }
        : null,
      unshippedConfirmed > 0
        ? {
            tone: 'violet' as Tone,
            title: `${unshippedConfirmed} commande${unshippedConfirmed > 1 ? 's' : ''} confirmée${unshippedConfirmed > 1 ? 's' : ''} non expédiée${unshippedConfirmed > 1 ? 's' : ''}`,
            subtitle: 'Créer les expéditions Sendit pour les commandes confirmées',
            href: '/orders',
          }
        : null,
      missingCosts > 0
        ? {
            tone: 'amber' as Tone,
            title: `${missingCosts} commande${missingCosts > 1 ? 's' : ''} avec coûts incomplets`,
            subtitle: 'Le profit reste prudent tant que les coûts produits ne sont pas renseignés',
            href: '/products',
          }
        : null,
      lowStockTotal > 0
        ? {
            tone: 'red' as Tone,
            title: `${lowStockTotal} produit${lowStockTotal > 1 ? 's' : ''} en stock faible`,
            subtitle: lowStockRows
              .map((item) => `${item.name || 'Inconnu'} (${toNumber(item.stock)} restant${toNumber(item.stock) > 1 ? 's' : ''})`)
              .join(' · '),
            href: '/products',
          }
        : null,
      deliveryIssues > 0
        ? {
            tone: 'rose' as Tone,
            title: `${deliveryIssues} commande${deliveryIssues > 1 ? 's' : ''} annulée${deliveryIssues > 1 ? 's' : ''} (30 derniers jours)`,
            subtitle: 'Analyser les raisons d\'annulation et le suivi client',
            href: '/orders',
          }
        : null,
    ].filter(Boolean)

    const activity = activityHistoryRows.length > 0
      ? activityHistoryRows.map((row) => ({
          tone: toneFromStatus(row.status),
          title: row.orderNumber
            ? `${row.orderNumber} → ${humanizeStatus(row.status)}`
            : `Commande → ${humanizeStatus(row.status)}`,
          subtitle: row.note || row.deliveryName || 'Changement de statut',
          timestamp: new Date(row.createdAt).toISOString(),
        }))
      : recentOrdersRows.map((row) => ({
          tone: toneFromStatus(row.status),
          title: row.orderNumber ? `Nouvelle commande ${row.orderNumber}` : 'Nouvelle commande',
          subtitle: [row.deliveryName, row.sourceChannel].filter(Boolean).join(' · ') || 'Activité récente',
          timestamp: new Date(row.createdAt).toISOString(),
        }))

    const spend30d = toNumber(roasRows[0]?.spend)
    const adRevenue30d = toNumber(roasRows[0]?.revenue)
    const roas = spend30d > 0 ? adRevenue30d / spend30d : 0
    const channelOrderTotal = channelRows.reduce((sum, row) => sum + toNumber(row.orders), 0)
    const channels = channelRows.map((row) => {
      const name = row.name || 'Unknown'
      const orders = toNumber(row.orders)

      return {
        name,
        orders,
        revenue: toNumber(row.revenue),
        value: channelOrderTotal > 0 ? Math.round((orders / channelOrderTotal) * 100) : 0,
        color: channelColor(name),
      }
    })

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      periodDays,
      range: { from, to, compareFrom, compareTo },
      dailyGoal: DAILY_REVENUE_GOAL,
      weeklyGoal,
      monthlyGoal,
      revenue7d,
      revenue30d,
      revenueToday,
      revenueWeek,
      revenueWeekTotal,
      revenueDelivered,
      revenueDeliveredTotal,
      revenueDeliveredDelta,
      profitDelivered,
      marginDelivered,
      cashReceivedDelivered,
      deliveryCostDelivered,
      revenueDelta,
      estimatedProfit: estimatedProfitWeek,
      profitDelta,
      marginPercent,
      ordersWeek,
      ordersDelivered,
      ordersDelta,
      averageOrderValue,
      deliveryRate,
      completedDeliveryCount: completedDelivery30d,
      roas,
      adSpend: spend30d,
      revenueSeries,
      pipeline: pipelineItems,
      topProducts,
      topCities,
      channels,
      alerts: {
        total: needsConfirmation + unshippedConfirmed + missingCosts + lowStockTotal + deliveryIssues,
        items: attentionItems.length > 0
          ? attentionItems
          : [
              {
                tone: 'green' as Tone,
                title: 'Aucun blocage urgent',
                subtitle: 'Commandes, stock et livraisons sont sains',
                href: '/orders',
              },
            ],
      },
      activity,
    })
  } catch (error) {
    console.error('Dashboard stats error:', error)

    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    )
  }
}
