import type { QueryResultRow } from 'pg'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'
import { cached } from '@/lib/ops-cache'
import { getWeeklyGoal, getMonthlyGoal } from '@/app/api/ops/settings/goal/route'

const DAILY_REVENUE_GOAL = 6000
const BUSINESS_TIMEZONE = 'Africa/Casablanca'
const PREPAID_METHODS_SQL = "'VIREMENT', 'TRANSFER', 'BANK', 'BANK_TRANSFER', 'PREPAID', 'CARD', 'CARTE'"

type Tone = 'rose' | 'green' | 'amber' | 'blue' | 'violet' | 'red'

interface SummaryRow {
  revenueToday: number | string | null
  revenue7d: number | string | null
  revenue30d: number | string | null
  revenueWeek: number | string | null
  revenueWeekTotal: number | string | null
  revenueDelivered: number | string | null
  revenueDeliveredTotal: number | string | null
  codReceivedDelivered: number | string | null
  bankReceivedDelivered: number | string | null
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
  // Realized (attributed by DELIVERY date, not creation date) — reconciles with Sendit cashflow.
  realizedRevenue: number | string | null
  realizedEncaisse: number | string | null
  realizedBank: number | string | null
  realizedCash: number | string | null
  realizedProfit: number | string | null
  realizedDeliveryCost: number | string | null
  realizedOrders: number | string | null
  previousRealizedRevenue: number | string | null
}

interface SeriesRow {
  basis: 'created' | 'delivered'
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
  basis: 'created' | 'delivered'
  productId: number | null
  name: string | null
  units: number | string | null
  revenue: number | string | null
}

interface CityRow {
  basis: 'created' | 'delivered'
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
  throughDate: string | null
}

interface ChannelRow {
  basis: 'created' | 'delivered'
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

interface SenditLedgerRow {
  createdCod: number | string | null
  createdFees: number | string | null
  createdOrders: number | string | null
  createdUnmatchedOrders: number | string | null
  createdUnmatchedCod: number | string | null
  deliveredCod: number | string | null
  deliveredFees: number | string | null
  deliveredOrders: number | string | null
  deliveredUnmatchedOrders: number | string | null
  deliveredUnmatchedCod: number | string | null
  lastPulledAt: string | Date | null
}

interface ReconciliationRow {
  basis: 'created' | 'delivered'
  senditParcels: number | string | null
  senditCod: number | string | null
  senditFees: number | string | null
  matchedParcels: number | string | null
  matchedCod: number | string | null
  matchedFees: number | string | null
  unresolvedParcels: number | string | null
  unresolvedCod: number | string | null
  unresolvedFees: number | string | null
  bosOrders: number | string | null
  bosGross: number | string | null
  bosRevenue: number | string | null
  deliveryCharged: number | string | null
  verifiedBank: number | string | null
  verifiedBankOrders: number | string | null
  unverifiedBank: number | string | null
  unverifiedBankOrders: number | string | null
  ordersWithoutTracking: number | string | null
  amountMismatchOrders: number | string | null
  amountMismatchValue: number | string | null
  feeMismatchOrders: number | string | null
  feeMismatchValue: number | string | null
  statusMismatchOrders: number | string | null
  dateMismatchOrders: number | string | null
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
      -- Keep every business-day boundary in Casablanca. Comparing timestamptz
      -- columns to bare timestamps used the database session timezone (UTC on
      -- Neon), which could move orders created around midnight to the wrong day.
      o."createdAt" AT TIME ZONE '${BUSINESS_TIMEZONE}' AS "createdAt",
      o."deliveredAt" AT TIME ZONE '${BUSINESS_TIMEZONE}' AS "deliveredAt",
      COALESCE(o."orderNumber", CONCAT('Order #', o.id)) AS "orderNumber",
      o."deliveryName",
      o."deliveryCity",
      -- Requis par la requête « canaux » : le TYPE de commande (Site / Manuel) vient
      -- de sessionId, jamais de sourceChannel. Sans cette colonne ici, la requête
      -- échoue et fait tomber TOUT le tableau de bord en 500.
      o."sessionId",
      o."sourceChannel",
      o."confirmationStatus",
      o."deliveryStatus",
      o."senditTrackingId",
      o."senditStatus",
      COALESCE(o."revenue", o."productsTotal", o.total::numeric, 0)::numeric AS revenue,
      COALESCE(o.total::numeric, o."revenue", o."productsTotal", 0)::numeric AS order_total,
      CASE
        WHEN UPPER(COALESCE(o."paymentMethod", 'COD')) IN (${PREPAID_METHODS_SQL}) THEN
          CASE WHEN o."paymentStatus" IN ('PAID', 'PARTIAL') THEN COALESCE(o."paidAmount", 0) ELSE 0 END
        ELSE COALESCE(o."paidAmount", o.total::numeric, 0)
      END::numeric AS cash_collected,
      CASE
        WHEN UPPER(COALESCE(o."paymentMethod", 'COD')) NOT IN (${PREPAID_METHODS_SQL})
          THEN COALESCE(o."paidAmount", o.total::numeric, 0)
        ELSE 0
      END::numeric AS cod_collected,
      CASE
        WHEN UPPER(COALESCE(o."paymentMethod", 'COD')) IN (${PREPAID_METHODS_SQL})
             AND o."paymentStatus" IN ('PAID', 'PARTIAL')
          THEN COALESCE(o."paidAmount", 0)
        ELSE 0
      END::numeric AS bank_collected,
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
    // Cache the heavy aggregate. Current period → 1h (numbers barely move hour-to-hour
    // for a COD store); a fully-past period → 6h (it only changes on late status edits).
    // ?fresh=1 (the "Actualiser" button) forces a live recompute.
    const fresh = sp.get('fresh') === '1'
    const cacheKey = `dashboard-stats:${from}:${to}:${compareFrom}:${compareTo}`
    const ttlMs = to >= isoDay(new Date()) ? 60 * 60 * 1000 : 6 * 60 * 60 * 1000

    const { data: payload, cachedAt, hit } = await cached(cacheKey, ttlMs, async () => {
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
      senditLedgerRows,
      reconciliationRows,
      pnlRows,
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
          COALESCE(SUM(cod_collected) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status = 'DELIVERED'), 0)::double precision AS "codReceivedDelivered",
          COALESCE(SUM(bank_collected) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status = 'DELIVERED'), 0)::double precision AS "bankReceivedDelivered",
          COALESCE(SUM(profit) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status = 'DELIVERED'), 0)::double precision AS "profitDelivered",
          COALESCE(SUM(cash_collected - delivery_cost) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status = 'DELIVERED'), 0)::double precision AS "cashReceivedDelivered",
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
          COUNT(*) FILTER (WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds) AND status = 'CANCELLED')::int AS "cancelled30d",
          -- Realized = attributed by DELIVERY date (deliveredAt), so it matches the
          -- cash Sendit actually collected in the window (a parcel created in June but
          -- delivered in July lands in July here, unlike the createdAt-based fields above).
          COALESCE(SUM(revenue) FILTER (WHERE "deliveredAt" >= (SELECT range_start FROM bounds) AND "deliveredAt" < (SELECT range_end FROM bounds) AND status = 'DELIVERED'), 0)::double precision AS "realizedRevenue",
          COALESCE(SUM(cod_collected) FILTER (WHERE "deliveredAt" >= (SELECT range_start FROM bounds) AND "deliveredAt" < (SELECT range_end FROM bounds) AND status = 'DELIVERED'), 0)::double precision AS "realizedEncaisse",
          COALESCE(SUM(bank_collected) FILTER (WHERE "deliveredAt" >= (SELECT range_start FROM bounds) AND "deliveredAt" < (SELECT range_end FROM bounds) AND status = 'DELIVERED'), 0)::double precision AS "realizedBank",
          COALESCE(SUM(cash_collected - delivery_cost) FILTER (WHERE "deliveredAt" >= (SELECT range_start FROM bounds) AND "deliveredAt" < (SELECT range_end FROM bounds) AND status = 'DELIVERED'), 0)::double precision AS "realizedCash",
          COALESCE(SUM(profit) FILTER (WHERE "deliveredAt" >= (SELECT range_start FROM bounds) AND "deliveredAt" < (SELECT range_end FROM bounds) AND status = 'DELIVERED'), 0)::double precision AS "realizedProfit",
          COALESCE(SUM(delivery_cost) FILTER (WHERE "deliveredAt" >= (SELECT range_start FROM bounds) AND "deliveredAt" < (SELECT range_end FROM bounds) AND status = 'DELIVERED'), 0)::double precision AS "realizedDeliveryCost",
          COUNT(*) FILTER (WHERE "deliveredAt" >= (SELECT range_start FROM bounds) AND "deliveredAt" < (SELECT range_end FROM bounds) AND status = 'DELIVERED')::int AS "realizedOrders",
          COALESCE(SUM(revenue) FILTER (WHERE "deliveredAt" >= (SELECT compare_start FROM bounds) AND "deliveredAt" < (SELECT compare_end FROM bounds) AND status = 'DELIVERED'), 0)::double precision AS "previousRealizedRevenue"
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
        ),
        basis_series AS (
          SELECT
            'created'::text AS basis,
            d.day_bucket,
            COALESCE(SUM(ofn.revenue) FILTER (WHERE ofn.status IN ('CONFIRMED', 'DELIVERED')), 0)::double precision AS revenue,
            COALESCE(SUM(ofn.profit) FILTER (WHERE ofn.status IN ('CONFIRMED', 'DELIVERED')), 0)::double precision AS profit,
            COUNT(ofn.id) FILTER (WHERE ofn.status IN ('CONFIRMED', 'DELIVERED'))::int AS orders,
            COUNT(ofn.id) FILTER (WHERE ofn.status = 'DELIVERED')::int AS delivered,
            COUNT(ofn.id) FILTER (WHERE ofn.status = 'CANCELLED')::int AS cancelled
          FROM days d
          LEFT JOIN order_financials ofn
            ON ofn."createdAt" >= d.day_bucket
           AND ofn."createdAt" < d.day_bucket + INTERVAL '1 day'
          GROUP BY d.day_bucket
          UNION ALL
          SELECT
            'delivered'::text AS basis,
            d.day_bucket,
            COALESCE(SUM(ofn.revenue) FILTER (WHERE ofn.status = 'DELIVERED'), 0)::double precision AS revenue,
            COALESCE(SUM(ofn.profit) FILTER (WHERE ofn.status = 'DELIVERED'), 0)::double precision AS profit,
            COUNT(ofn.id) FILTER (WHERE ofn.status = 'DELIVERED')::int AS orders,
            COUNT(ofn.id) FILTER (WHERE ofn.status = 'DELIVERED')::int AS delivered,
            0::int AS cancelled
          FROM days d
          LEFT JOIN order_financials ofn
            ON ofn."deliveredAt" >= d.day_bucket
           AND ofn."deliveredAt" < d.day_bucket + INTERVAL '1 day'
          GROUP BY d.day_bucket
        )
        SELECT
          basis,
          to_char(day_bucket, 'YYYY-MM-DD') AS day,
          to_char(day_bucket, 'Mon DD') AS label,
          revenue,
          profit,
          orders,
          delivered,
          cancelled
        FROM basis_series
        ORDER BY basis, day_bucket ASC
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
        ${FINANCIAL_CTE},
        product_totals AS (
          SELECT
            'created'::text AS basis,
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
          UNION ALL
          SELECT
            'delivered'::text AS basis,
            oi."productId" AS "productId",
            COALESCE(NULLIF(TRIM(p.name), ''), CONCAT('Product #', COALESCE(oi."productId"::text, '-'))) AS name,
            COALESCE(SUM(oi.quantity), 0)::int AS units,
            COALESCE(SUM(COALESCE(oi.price, 0) * COALESCE(oi.quantity, 0)), 0)::double precision AS revenue
          FROM "OrderItem" oi
          INNER JOIN order_financials ofn ON ofn.id = oi."orderId"
          LEFT JOIN "Product" p ON p.id = oi."productId"
          WHERE ofn."deliveredAt" >= (SELECT range_start FROM bounds) AND ofn."deliveredAt" < (SELECT range_end FROM bounds)
            AND ofn.status = 'DELIVERED'
          GROUP BY oi."productId", p.name
        ),
        ranked AS (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY basis ORDER BY units DESC, revenue DESC) AS rank
          FROM product_totals
        )
        SELECT basis, "productId", name, units, revenue
        FROM ranked
        WHERE rank <= 5
        ORDER BY basis, rank
      `),
      safeQuery<CityRow>('top-cities', `
        ${FINANCIAL_CTE},
        city_totals AS (
          SELECT
            'created'::text AS basis,
            COALESCE(NULLIF(TRIM("deliveryCity"), ''), 'Unknown') AS name,
            COUNT(*)::int AS orders
          FROM order_financials
          WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds)
            AND status IN ('CONFIRMED', 'DELIVERED')
          GROUP BY COALESCE(NULLIF(TRIM("deliveryCity"), ''), 'Unknown')
          UNION ALL
          SELECT
            'delivered'::text AS basis,
            COALESCE(NULLIF(TRIM("deliveryCity"), ''), 'Unknown') AS name,
            COUNT(*)::int AS orders
          FROM order_financials
          WHERE "deliveredAt" >= (SELECT range_start FROM bounds) AND "deliveredAt" < (SELECT range_end FROM bounds)
            AND status = 'DELIVERED'
          GROUP BY COALESCE(NULLIF(TRIM("deliveryCity"), ''), 'Unknown')
        ),
        ranked AS (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY basis ORDER BY orders DESC, name ASC) AS rank
          FROM city_totals
        )
        SELECT basis, name, orders
        FROM ranked
        WHERE rank <= 5
        ORDER BY basis, rank
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
        -- Period-accurate ad spend from the DAILY table. The old query summed
        -- AdCampaign.spend (cumulative all-time) filtered by endDate — but every
        -- campaign has endDate NULL, so it always returned the full lifetime spend
        -- regardless of the selected period ("depuis le début" bug).
        SELECT
          COALESCE(SUM(spend), 0)::double precision AS spend,
          COALESCE(SUM(revenue), 0)::double precision AS revenue,
          MAX(date)::text AS "throughDate"
        FROM "AdSpendDaily"
        WHERE date >= '${from}'::date AND date <= '${to}'::date
      `),
      safeQuery<ChannelRow>('channels', `
        ${FINANCIAL_CTE},
        classified AS (
          SELECT
            order_financials.*,
          -- Le TYPE vient de sessionId (présent = passée sur le site), jamais de
          -- sourceChannel. Avant, une commande manuelle sans canal devenait « Website »
          -- et « Sendit » (un transporteur) s'affichait comme une source de trafic.
          CASE
            WHEN "sessionId" IS NOT NULL THEN 'Site'
            WHEN LOWER(COALESCE("sourceChannel", '')) LIKE '%whatsapp%' THEN 'WhatsApp (manuel)'
            WHEN LOWER(COALESCE("sourceChannel", '')) LIKE '%instagram%' THEN 'Instagram (manuel)'
            WHEN LOWER(COALESCE("sourceChannel", '')) LIKE '%tiktok%' THEN 'TikTok (manuel)'
            WHEN LOWER(COALESCE("sourceChannel", '')) LIKE '%sendit%'
              OR NULLIF(TRIM(COALESCE("sourceChannel", '')), '') IS NULL
              OR LOWER(COALESCE("sourceChannel", '')) LIKE '%manual%' THEN 'Manuel (origine non renseignée)'
            ELSE "sourceChannel" || ' (manuel)'
          END AS channel_name
          FROM order_financials
        ),
        channel_totals AS (
          SELECT
            'created'::text AS basis,
            channel_name AS name,
            COUNT(*)::int AS orders,
            COALESCE(SUM(revenue), 0)::double precision AS revenue
          FROM classified
          WHERE "createdAt" >= (SELECT range_start FROM bounds) AND "createdAt" < (SELECT range_end FROM bounds)
            AND status IN ('CONFIRMED', 'DELIVERED')
          GROUP BY channel_name
          UNION ALL
          SELECT
            'delivered'::text AS basis,
            channel_name AS name,
            COUNT(*)::int AS orders,
            COALESCE(SUM(revenue), 0)::double precision AS revenue
          FROM classified
          WHERE "deliveredAt" >= (SELECT range_start FROM bounds) AND "deliveredAt" < (SELECT range_end FROM bounds)
            AND status = 'DELIVERED'
          GROUP BY channel_name
        )
        SELECT basis, name, orders, revenue
        FROM channel_totals
        ORDER BY basis, orders DESC, revenue DESC
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
      safeQuery<SenditLedgerRow>('sendit-ledger', `
        SELECT
          COALESCE(SUM(amount) FILTER (
            WHERE UPPER("senditStatus") = 'DELIVERED'
              AND ("senditCreatedAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') >= '${from}'::timestamp
              AND ("senditCreatedAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') < ('${to}'::date + INTERVAL '1 day')
          ), 0)::double precision AS "createdCod",
          COALESCE(SUM(fee) FILTER (
            WHERE UPPER("senditStatus") = 'DELIVERED'
              AND ("senditCreatedAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') >= '${from}'::timestamp
              AND ("senditCreatedAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') < ('${to}'::date + INTERVAL '1 day')
          ), 0)::double precision AS "createdFees",
          COUNT(*) FILTER (
            WHERE UPPER("senditStatus") = 'DELIVERED'
              AND ("senditCreatedAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') >= '${from}'::timestamp
              AND ("senditCreatedAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') < ('${to}'::date + INTERVAL '1 day')
          )::int AS "createdOrders",
          COUNT(*) FILTER (
            WHERE UPPER("senditStatus") = 'DELIVERED' AND ("matchedOrderId" IS NULL OR state = 'mismatch')
              AND ("senditCreatedAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') >= '${from}'::timestamp
              AND ("senditCreatedAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') < ('${to}'::date + INTERVAL '1 day')
          )::int AS "createdUnmatchedOrders",
          COALESCE(SUM(amount) FILTER (
            WHERE UPPER("senditStatus") = 'DELIVERED' AND ("matchedOrderId" IS NULL OR state = 'mismatch')
              AND ("senditCreatedAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') >= '${from}'::timestamp
              AND ("senditCreatedAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') < ('${to}'::date + INTERVAL '1 day')
          ), 0)::double precision AS "createdUnmatchedCod",
          COALESCE(SUM(amount) FILTER (
            WHERE UPPER("senditStatus") = 'DELIVERED'
              AND "lastActionAt" >= ('${from}'::timestamp AT TIME ZONE '${BUSINESS_TIMEZONE}')
              AND "lastActionAt" < (('${to}'::date + INTERVAL '1 day')::timestamp AT TIME ZONE '${BUSINESS_TIMEZONE}')
          ), 0)::double precision AS "deliveredCod",
          COALESCE(SUM(fee) FILTER (
            WHERE UPPER("senditStatus") = 'DELIVERED'
              AND "lastActionAt" >= ('${from}'::timestamp AT TIME ZONE '${BUSINESS_TIMEZONE}')
              AND "lastActionAt" < (('${to}'::date + INTERVAL '1 day')::timestamp AT TIME ZONE '${BUSINESS_TIMEZONE}')
          ), 0)::double precision AS "deliveredFees",
          COUNT(*) FILTER (
            WHERE UPPER("senditStatus") = 'DELIVERED'
              AND "lastActionAt" >= ('${from}'::timestamp AT TIME ZONE '${BUSINESS_TIMEZONE}')
              AND "lastActionAt" < (('${to}'::date + INTERVAL '1 day')::timestamp AT TIME ZONE '${BUSINESS_TIMEZONE}')
          )::int AS "deliveredOrders",
          COUNT(*) FILTER (
            WHERE UPPER("senditStatus") = 'DELIVERED' AND ("matchedOrderId" IS NULL OR state = 'mismatch')
              AND "lastActionAt" >= ('${from}'::timestamp AT TIME ZONE '${BUSINESS_TIMEZONE}')
              AND "lastActionAt" < (('${to}'::date + INTERVAL '1 day')::timestamp AT TIME ZONE '${BUSINESS_TIMEZONE}')
          )::int AS "deliveredUnmatchedOrders",
          COALESCE(SUM(amount) FILTER (
            WHERE UPPER("senditStatus") = 'DELIVERED' AND ("matchedOrderId" IS NULL OR state = 'mismatch')
              AND "lastActionAt" >= ('${from}'::timestamp AT TIME ZONE '${BUSINESS_TIMEZONE}')
              AND "lastActionAt" < (('${to}'::date + INTERVAL '1 day')::timestamp AT TIME ZONE '${BUSINESS_TIMEZONE}')
          ), 0)::double precision AS "deliveredUnmatchedCod",
          MAX("pulledAt") AS "lastPulledAt"
        FROM "SenditStaging"
        -- Rows explicitly ignored belong to another activity sharing the Sendit
        -- account. Including them inflated parcel count, courier fees and packaging.
        WHERE state IS DISTINCT FROM 'ignored'
      `),
      safeQuery<ReconciliationRow>('reconciliation', `
        WITH staging_period AS (
          SELECT 'created'::text AS basis, s.*
          FROM "SenditStaging" s
          WHERE s.state IS DISTINCT FROM 'ignored'
            AND UPPER(COALESCE(s."senditStatus", '')) = 'DELIVERED'
            AND (s."senditCreatedAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') >= '${from}'::timestamp
            AND (s."senditCreatedAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') < ('${to}'::date + INTERVAL '1 day')
          UNION ALL
          SELECT 'delivered'::text AS basis, s.*
          FROM "SenditStaging" s
          WHERE s.state IS DISTINCT FROM 'ignored'
            AND UPPER(COALESCE(s."senditStatus", '')) = 'DELIVERED'
            AND (s."lastActionAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') >= '${from}'::timestamp
            AND (s."lastActionAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') < ('${to}'::date + INTERVAL '1 day')
        ),
        order_period AS (
          SELECT
            'created'::text AS basis,
            o.*,
            COALESCE(o.total::numeric, o."revenue", o."productsTotal", 0)::numeric AS order_total,
            COALESCE(o."revenue", o."productsTotal", o.total::numeric, 0)::numeric AS product_revenue
          FROM "Order" o
          WHERE o.status::text = 'DELIVERED'
            AND (o."createdAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') >= '${from}'::timestamp
            AND (o."createdAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') < ('${to}'::date + INTERVAL '1 day')
          UNION ALL
          SELECT
            'delivered'::text AS basis,
            o.*,
            COALESCE(o.total::numeric, o."revenue", o."productsTotal", 0)::numeric AS order_total,
            COALESCE(o."revenue", o."productsTotal", o.total::numeric, 0)::numeric AS product_revenue
          FROM "Order" o
          WHERE o.status::text = 'DELIVERED'
            AND (o."deliveredAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') >= '${from}'::timestamp
            AND (o."deliveredAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') < ('${to}'::date + INTERVAL '1 day')
        ),
        staging_totals AS (
          SELECT
            basis,
            COUNT(*)::int AS "senditParcels",
            COALESCE(SUM(amount), 0)::double precision AS "senditCod",
            COALESCE(SUM(fee), 0)::double precision AS "senditFees",
            COUNT(*) FILTER (WHERE state = 'matched' AND "matchedOrderId" IS NOT NULL)::int AS "matchedParcels",
            COALESCE(SUM(amount) FILTER (WHERE state = 'matched' AND "matchedOrderId" IS NOT NULL), 0)::double precision AS "matchedCod",
            COALESCE(SUM(fee) FILTER (WHERE state = 'matched' AND "matchedOrderId" IS NOT NULL), 0)::double precision AS "matchedFees",
            COUNT(*) FILTER (WHERE "matchedOrderId" IS NULL OR state = 'mismatch')::int AS "unresolvedParcels",
            COALESCE(SUM(amount) FILTER (WHERE "matchedOrderId" IS NULL OR state = 'mismatch'), 0)::double precision AS "unresolvedCod",
            COALESCE(SUM(fee) FILTER (WHERE "matchedOrderId" IS NULL OR state = 'mismatch'), 0)::double precision AS "unresolvedFees"
          FROM staging_period
          GROUP BY basis
        ),
        order_totals AS (
          SELECT
            basis,
            COUNT(*)::int AS "bosOrders",
            COALESCE(SUM(order_total), 0)::double precision AS "bosGross",
            COALESCE(SUM(product_revenue), 0)::double precision AS "bosRevenue",
            COALESCE(SUM(GREATEST(order_total - product_revenue, 0)), 0)::double precision AS "deliveryCharged",
            COALESCE(SUM(CASE
              WHEN UPPER(COALESCE("paymentMethod", 'COD')) IN (${PREPAID_METHODS_SQL})
                AND "paymentStatus" IN ('PAID', 'PARTIAL') THEN COALESCE("paidAmount", 0)
              ELSE 0 END), 0)::double precision AS "verifiedBank",
            COUNT(*) FILTER (
              WHERE UPPER(COALESCE("paymentMethod", 'COD')) IN (${PREPAID_METHODS_SQL})
                AND "paymentStatus" IN ('PAID', 'PARTIAL')
            )::int AS "verifiedBankOrders",
            COALESCE(SUM(CASE
              WHEN UPPER(COALESCE("paymentMethod", 'COD')) IN (${PREPAID_METHODS_SQL})
                AND "paymentStatus" NOT IN ('PAID', 'PARTIAL') THEN order_total
              ELSE 0 END), 0)::double precision AS "unverifiedBank",
            COUNT(*) FILTER (
              WHERE UPPER(COALESCE("paymentMethod", 'COD')) IN (${PREPAID_METHODS_SQL})
                AND "paymentStatus" NOT IN ('PAID', 'PARTIAL')
            )::int AS "unverifiedBankOrders",
            COUNT(*) FILTER (WHERE "senditTrackingId" IS NULL)::int AS "ordersWithoutTracking"
          FROM order_period
          GROUP BY basis
        ),
        linked_checks AS (
          SELECT
            sp.basis,
            sp.amount AS sendit_amount,
            sp.fee AS sendit_fee,
            sp.state,
            o.id AS order_id,
            o.status::text AS order_status,
            COALESCE(o."actualDeliveryCost", 0)::numeric AS order_fee,
            CASE
              WHEN UPPER(COALESCE(o."paymentMethod", 'COD')) IN (${PREPAID_METHODS_SQL}) THEN 0
              ELSE COALESCE(o."paidAmount", o.total::numeric, 0)
            END::numeric AS expected_cod,
            CASE
              WHEN sp.basis = 'created' THEN
                (o."createdAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') >= '${from}'::timestamp
                AND (o."createdAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') < ('${to}'::date + INTERVAL '1 day')
              ELSE
                (o."deliveredAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') >= '${from}'::timestamp
                AND (o."deliveredAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') < ('${to}'::date + INTERVAL '1 day')
            END AS date_aligned
          FROM staging_period sp
          LEFT JOIN "Order" o ON o.id = sp."matchedOrderId"
        ),
        check_totals AS (
          SELECT
            basis,
            COUNT(*) FILTER (
              WHERE state = 'matched' AND order_id IS NOT NULL
                AND ABS(COALESCE(sendit_amount, 0) - expected_cod) >= 0.01
            )::int AS "amountMismatchOrders",
            COALESCE(SUM(ABS(COALESCE(sendit_amount, 0) - expected_cod)) FILTER (
              WHERE state = 'matched' AND order_id IS NOT NULL
                AND ABS(COALESCE(sendit_amount, 0) - expected_cod) >= 0.01
            ), 0)::double precision AS "amountMismatchValue",
            COUNT(*) FILTER (
              WHERE state = 'matched' AND order_id IS NOT NULL
                AND ABS(COALESCE(sendit_fee, 0) - order_fee) >= 0.01
            )::int AS "feeMismatchOrders",
            COALESCE(SUM(ABS(COALESCE(sendit_fee, 0) - order_fee)) FILTER (
              WHERE state = 'matched' AND order_id IS NOT NULL
                AND ABS(COALESCE(sendit_fee, 0) - order_fee) >= 0.01
            ), 0)::double precision AS "feeMismatchValue",
            COUNT(*) FILTER (
              WHERE order_id IS NOT NULL AND (state = 'mismatch' OR order_status <> 'DELIVERED')
            )::int AS "statusMismatchOrders",
            COUNT(*) FILTER (
              WHERE state = 'matched' AND order_id IS NOT NULL AND NOT date_aligned
            )::int AS "dateMismatchOrders"
          FROM linked_checks
          GROUP BY basis
        ),
        bases AS (SELECT unnest(ARRAY['created'::text, 'delivered'::text]) AS basis)
        SELECT
          b.basis,
          COALESCE(st."senditParcels", 0)::int AS "senditParcels",
          COALESCE(st."senditCod", 0)::double precision AS "senditCod",
          COALESCE(st."senditFees", 0)::double precision AS "senditFees",
          COALESCE(st."matchedParcels", 0)::int AS "matchedParcels",
          COALESCE(st."matchedCod", 0)::double precision AS "matchedCod",
          COALESCE(st."matchedFees", 0)::double precision AS "matchedFees",
          COALESCE(st."unresolvedParcels", 0)::int AS "unresolvedParcels",
          COALESCE(st."unresolvedCod", 0)::double precision AS "unresolvedCod",
          COALESCE(st."unresolvedFees", 0)::double precision AS "unresolvedFees",
          COALESCE(ot."bosOrders", 0)::int AS "bosOrders",
          COALESCE(ot."bosGross", 0)::double precision AS "bosGross",
          COALESCE(ot."bosRevenue", 0)::double precision AS "bosRevenue",
          COALESCE(ot."deliveryCharged", 0)::double precision AS "deliveryCharged",
          COALESCE(ot."verifiedBank", 0)::double precision AS "verifiedBank",
          COALESCE(ot."verifiedBankOrders", 0)::int AS "verifiedBankOrders",
          COALESCE(ot."unverifiedBank", 0)::double precision AS "unverifiedBank",
          COALESCE(ot."unverifiedBankOrders", 0)::int AS "unverifiedBankOrders",
          COALESCE(ot."ordersWithoutTracking", 0)::int AS "ordersWithoutTracking",
          COALESCE(ct."amountMismatchOrders", 0)::int AS "amountMismatchOrders",
          COALESCE(ct."amountMismatchValue", 0)::double precision AS "amountMismatchValue",
          COALESCE(ct."feeMismatchOrders", 0)::int AS "feeMismatchOrders",
          COALESCE(ct."feeMismatchValue", 0)::double precision AS "feeMismatchValue",
          COALESCE(ct."statusMismatchOrders", 0)::int AS "statusMismatchOrders",
          COALESCE(ct."dateMismatchOrders", 0)::int AS "dateMismatchOrders"
        FROM bases b
        LEFT JOIN staging_totals st ON st.basis = b.basis
        LEFT JOIN order_totals ot ON ot.basis = b.basis
        LEFT JOIN check_totals ct ON ct.basis = b.basis
        ORDER BY b.basis
      `),
      // P&L inputs for the period [from, to]: supplier purchase cash-out, ad spend,
      // logged operating expenses, and the packaging per-parcel rate.
      safeQuery<{ purchaseSpend: number; adSpend: number; opex: number; opexPackaging: number; returnFees: number; packagingRate: number }>('pnl', `
        SELECT
          (SELECT COALESCE(SUM("totalCost"),0) FROM "InventoryMovement"
             WHERE type='Purchase' AND "totalCost" IS NOT NULL
               AND ("createdAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') >= '${from}'::date
               AND ("createdAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') < ('${to}'::date + INTERVAL '1 day'))::double precision AS "purchaseSpend",
          (SELECT COALESCE(SUM("returnDeliveryFee"),0) FROM "Order"
             WHERE ("returnedAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') >= '${from}'::date
               AND ("returnedAt" AT TIME ZONE '${BUSINESS_TIMEZONE}') < ('${to}'::date + INTERVAL '1 day'))::double precision AS "returnFees",
          (SELECT COALESCE(SUM(spend),0) FROM "AdSpendDaily"
             WHERE date >= '${from}'::date AND date <= '${to}'::date)::double precision AS "adSpend",
          (SELECT COALESCE(SUM(amount),0) FROM "OperatingExpense"
             WHERE "date" >= '${from}'::date AND "date" <= '${to}'::date)::double precision AS "opex",
          (SELECT COALESCE(SUM(amount),0) FROM "OperatingExpense"
             WHERE category='Emballage' AND "date" >= '${from}'::date AND "date" <= '${to}'::date)::double precision AS "opexPackaging",
          (SELECT COALESCE(value::numeric,0) FROM "AppSetting" WHERE key='packaging_cost_per_parcel')::double precision AS "packagingRate"
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
    const codReceivedDelivered = toNumber(summary?.codReceivedDelivered)
    const bankReceivedDelivered = toNumber(summary?.bankReceivedDelivered)
    const profitDelivered = toNumber(summary?.profitDelivered)
    // Verified cash received (COD + bank) minus what Sendit keeps for delivery.
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

    // Realized cash — same delivered metrics but attributed by DELIVERY date, so the
    // numbers reconcile with what Sendit actually collected in the window.
    const realizedRevenue = toNumber(summary?.realizedRevenue)
    const realizedEncaisse = toNumber(summary?.realizedEncaisse)
    const realizedBank = toNumber(summary?.realizedBank)
    const realizedCash = toNumber(summary?.realizedCash)
    const realizedProfit = toNumber(summary?.realizedProfit)
    const realizedOrders = toNumber(summary?.realizedOrders)
    const previousRealizedRevenue = toNumber(summary?.previousRealizedRevenue)
    const realizedMargin = realizedRevenue > 0 ? (realizedProfit / realizedRevenue) * 100 : 0
    const realizedRevenueDelta = percentageChange(realizedRevenue, previousRealizedRevenue)

    // Sendit owns parcel count, COD and courier fees. Orders own products, profit and bank payments.
    const senditLedgerRow = senditLedgerRows[0]
    const hasSenditLedger = Boolean(senditLedgerRow?.lastPulledAt)
    const senditCreated = {
      cod: toNumber(senditLedgerRow?.createdCod),
      fees: toNumber(senditLedgerRow?.createdFees),
      orders: toNumber(senditLedgerRow?.createdOrders),
      unmatchedOrders: toNumber(senditLedgerRow?.createdUnmatchedOrders),
      unmatchedCod: toNumber(senditLedgerRow?.createdUnmatchedCod),
    }
    const senditDelivered = {
      cod: toNumber(senditLedgerRow?.deliveredCod),
      fees: toNumber(senditLedgerRow?.deliveredFees),
      orders: toNumber(senditLedgerRow?.deliveredOrders),
      unmatchedOrders: toNumber(senditLedgerRow?.deliveredUnmatchedOrders),
      unmatchedCod: toNumber(senditLedgerRow?.deliveredUnmatchedCod),
    }
    const senditCreatedCash = senditCreated.cod + bankReceivedDelivered - senditCreated.fees
    const senditDeliveredCash = senditDelivered.cod + realizedBank - senditDelivered.fees

    const buildReconciliation = (basis: 'created' | 'delivered') => {
      const row = reconciliationRows.find((item) => item.basis === basis)
      const senditCod = toNumber(row?.senditCod)
      const senditFees = toNumber(row?.senditFees)
      const matchedCod = toNumber(row?.matchedCod)
      const matchedFees = toNumber(row?.matchedFees)
      const verifiedBank = toNumber(row?.verifiedBank)
      const unresolvedCod = toNumber(row?.unresolvedCod)
      const unresolvedFees = toNumber(row?.unresolvedFees)
      const checks = {
        unresolvedParcels: toNumber(row?.unresolvedParcels),
        unverifiedBankOrders: toNumber(row?.unverifiedBankOrders),
        amountMismatchOrders: toNumber(row?.amountMismatchOrders),
        amountMismatchValue: toNumber(row?.amountMismatchValue),
        feeMismatchOrders: toNumber(row?.feeMismatchOrders),
        feeMismatchValue: toNumber(row?.feeMismatchValue),
        statusMismatchOrders: toNumber(row?.statusMismatchOrders),
        dateMismatchOrders: toNumber(row?.dateMismatchOrders),
        ordersWithoutTracking: toNumber(row?.ordersWithoutTracking),
      }
      const issueCount = checks.unresolvedParcels
        + checks.unverifiedBankOrders
        + checks.amountMismatchOrders
        + checks.feeMismatchOrders
        + checks.statusMismatchOrders
        + checks.dateMismatchOrders
        + checks.ordersWithoutTracking

      return {
        ok: issueCount === 0,
        senditParcels: toNumber(row?.senditParcels),
        matchedParcels: toNumber(row?.matchedParcels),
        senditCod,
        senditFees,
        matchedCod,
        matchedFees,
        verifiedBank,
        verifiedBankOrders: toNumber(row?.verifiedBankOrders),
        unverifiedBank: toNumber(row?.unverifiedBank),
        cash: senditCod + verifiedBank - senditFees,
        matchedCash: matchedCod + verifiedBank - matchedFees,
        unresolvedCash: unresolvedCod - unresolvedFees,
        bosOrders: toNumber(row?.bosOrders),
        bosGross: toNumber(row?.bosGross),
        bosRevenue: toNumber(row?.bosRevenue),
        deliveryCharged: toNumber(row?.deliveryCharged),
        checks,
      }
    }
    const reconciliation = {
      created: buildReconciliation('created'),
      delivered: buildReconciliation('delivered'),
    }

    // ---- Period P&L: Rentabilité (accrual) + Trésorerie (cash) ----
    const pnlRow = pnlRows[0]
    const purchaseSpend = toNumber(pnlRow?.purchaseSpend)
    const adSpendPnl = toNumber(pnlRow?.adSpend)
    const opex = toNumber(pnlRow?.opex)
    const opexPackaging = toNumber(pnlRow?.opexPackaging)
    const returnFees = toNumber(pnlRow?.returnFees)
    const packagingRate = toNumber(pnlRow?.packagingRate)
    const nonPackagingOpex = Math.max(0, opex - opexPackaging)
    const buildPnl = (revenue: number, grossProfit: number, cash: number, parcels: number) => {
      const packagingAccrued = parcels * packagingRate
      // Logged packaging is a period cash expense. Otherwise estimate it from the
      // parcel population for the selected accounting basis.
      const packagingCash = opexPackaging > 0 ? opexPackaging : packagingAccrued
      const profitNet = grossProfit - packagingAccrued - adSpendPnl - returnFees
      const cashNet = cash - purchaseSpend - adSpendPnl - nonPackagingOpex - packagingCash - returnFees
      const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
      return {
        rentabilite: {
          caLivre: revenue,
          profitLivre: grossProfit,
          margeLivree: grossMargin,
          pub: adSpendPnl,
          emballage: packagingAccrued,
          retours: returnFees,
          net: profitNet,
          marginPct: revenue > 0 ? (profitNet / revenue) * 100 : 0,
        },
        tresorerie: {
          encaisse: cash,
          achats: purchaseSpend,
          pub: adSpendPnl,
          emballage: packagingCash,
          emballageEstime: opexPackaging === 0,
          frais: nonPackagingOpex,
          retours: returnFees,
          net: cashNet,
        },
        packagingRate,
        deliveredParcels: parcels,
      }
    }
    // Sendit owns the physical parcel count for each basis, including rows that
    // still await product reconciliation. Order data owns revenue/profit and bank.
    const createdParcels = hasSenditLedger ? senditCreated.orders : ordersDelivered
    const deliveredParcels = hasSenditLedger ? senditDelivered.orders : realizedOrders
    const createdCash = hasSenditLedger ? senditCreatedCash : cashReceivedDelivered
    const treasuryCash = hasSenditLedger ? senditDeliveredCash : realizedCash
    const pnlByBasis = {
      created: buildPnl(revenueDelivered, profitDelivered, createdCash, createdParcels),
      delivered: buildPnl(realizedRevenue, realizedProfit, treasuryCash, deliveredParcels),
    }
    // Preserve the existing field for older clients; it remains the actual cash basis.
    const pnl = pnlByBasis.delivered
    const marginPercent = revenueWeek > 0 ? (estimatedProfitWeek / revenueWeek) * 100 : 0
    const revenueDelta = percentageChange(revenueWeek, previousRevenueWeek)
    const profitDelta = percentageChange(estimatedProfitWeek, previousProfitWeek)
    const ordersDelta = percentageChange(ordersWeek, previousOrdersWeek)
    const averageOrderValue = bookedOrdersWeek > 0 ? revenueWeek / bookedOrdersWeek : 0

    const mapSeries = (basis: 'created' | 'delivered') => seriesRows
      .filter((row) => row.basis === basis)
      .map((row) => ({
        date: row.day,
        label: row.label,
        revenue: toNumber(row.revenue),
        profit: toNumber(row.profit),
        orders: toNumber(row.orders),
      }))

    const mapProducts = (basis: 'created' | 'delivered') => topProductRows
      .filter((row) => row.basis === basis)
      .map((row) => ({
        productId: row.productId ?? null,
        name: row.name || 'Unknown product',
        units: toNumber(row.units),
        revenue: toNumber(row.revenue),
      }))

    const mapCities = (basis: 'created' | 'delivered') => topCityRows
      .filter((row) => row.basis === basis)
      .map((row) => ({
        name: row.name || 'Unknown',
        orders: toNumber(row.orders),
      }))

    const revenueSeries = mapSeries('created')
    const deliveredRevenueSeries = mapSeries('delivered')
    const topProducts = mapProducts('created')
    const deliveredTopProducts = mapProducts('delivered')
    const topCities = mapCities('created')
    const deliveredTopCities = mapCities('delivered')

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
    // Pixel ROAS is ~0 for boosted posts (Meta attributes no purchase), so the true
    // pixel ROAS is useless here. Show a BLENDED ROAS / MER instead = delivered CA ÷
    // ad spend for the period — a real marketing-efficiency number. null when no spend.
    const roas = spend30d > 0 ? realizedRevenue / spend30d : null
    // Freshness: the last day for which Meta ad spend is synced. Meta finalises with a
    // 1–2 day lag, so the tail of the current period can still be empty.
    const adDataThrough = roasRows[0]?.throughDate || null
    const mapChannels = (basis: 'created' | 'delivered') => {
      const rows = channelRows.filter((row) => row.basis === basis)
      const total = rows.reduce((sum, row) => sum + toNumber(row.orders), 0)
      return rows.map((row) => {
        const name = row.name || 'Unknown'
        const orders = toNumber(row.orders)
        return {
          name,
          orders,
          revenue: toNumber(row.revenue),
          value: total > 0 ? Math.round((orders / total) * 100) : 0,
          color: channelColor(name),
        }
      })
    }
    const channels = mapChannels('created')
    const deliveredChannels = mapChannels('delivered')
    const analytics = {
      created: {
        revenueSeries,
        topProducts,
        topCities,
        channels,
        orders: bookedOrdersWeek,
        averageOrderValue,
      },
      delivered: {
        revenueSeries: deliveredRevenueSeries,
        topProducts: deliveredTopProducts,
        topCities: deliveredTopCities,
        channels: deliveredChannels,
        orders: realizedOrders,
        averageOrderValue: realizedOrders > 0 ? realizedRevenue / realizedOrders : 0,
      },
    }

    return {
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
      codReceivedDelivered,
      bankReceivedDelivered,
      revenueDeliveredDelta,
      profitDelivered,
      marginDelivered,
      cashReceivedDelivered,
      deliveryCostDelivered,
      sendit: {
        lastPulledAt: senditLedgerRow?.lastPulledAt || null,
        created: { ...senditCreated, bank: bankReceivedDelivered, cash: senditCreatedCash },
        delivered: { ...senditDelivered, bank: realizedBank, cash: senditDeliveredCash },
      },
      reconciliation,
      // Realized-by-delivery-date block (reconciles with Sendit cashflow).
      realized: {
        revenue: realizedRevenue,
        encaisse: hasSenditLedger ? senditDelivered.cod : realizedEncaisse,
        bank: realizedBank,
        cash: treasuryCash,
        profit: realizedProfit,
        margin: realizedMargin,
        orders: hasSenditLedger ? senditDelivered.orders : realizedOrders,
        matchedOrders: realizedOrders,
        revenueDelta: realizedRevenueDelta,
      },
      pnl,
      pnlByBasis,
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
      adDataThrough,
      analytics,
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
    }
    }, { fresh })

    return NextResponse.json({ ...payload, _cachedAt: new Date(cachedAt).toISOString(), _cached: hit })
  } catch (error) {
    console.error('Dashboard stats error:', error)

    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    )
  }
}
