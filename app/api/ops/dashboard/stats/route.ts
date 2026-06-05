import type { QueryResultRow } from 'pg'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'

const DAILY_REVENUE_GOAL = 6000
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// In-memory cache for dashboard stats
let statsCache: {
  data: any
  timestamp: number
} | null = null

// Cache for table columns introspection (rarely changes)
let tableColumnsCache: Map<string, { columns: Set<string>; timestamp: number }> = new Map()

type Tone = 'rose' | 'green' | 'amber' | 'blue' | 'violet' | 'red'

interface SummaryRow {
  revenueToday: number | string | null
  revenueWeek: number | string | null
  previousRevenueWeek: number | string | null
  estimatedProfitWeek: number | string | null
  previousProfitWeek: number | string | null
  ordersToday: number | string | null
  ordersWeek: number | string | null
  previousOrdersWeek: number | string | null
  delivered30d: number | string | null
  completedDelivery30d: number | string | null
}

interface SeriesRow {
  day: string | Date
  revenue: number | string | null
  profit: number | string | null
}

interface PipelineRow {
  pending: number | string | null
  confirmed: number | string | null
  shipped: number | string | null
  delivered: number | string | null
  returned: number | string | null
}

interface ProductRow {
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

interface ColumnRow {
  column_name: string
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
  if (previous <= 0) {
    return current > 0 ? 100 : null
  }

  return ((current - previous) / previous) * 100
}

function buildStreak(series: Array<{ revenue: number }>): number {
  let streak = 0

  for (let index = series.length - 1; index >= 0; index -= 1) {
    if (series[index].revenue > 0) {
      streak += 1
      continue
    }

    break
  }

  return streak
}

function humanizeStatus(status: string | null): string {
  switch (status) {
    case 'PENDING':
      return 'Pending'
    case 'CONFIRMED':
      return 'Confirmed'
    case 'DELIVERED':
      return 'Delivered'
    case 'RETURNED':
      return 'Returned'
    case 'FAILED':
      return 'Failed'
    case 'CANCELLED':
      return 'Cancelled'
    default:
      return 'Updated'
  }
}

function toneFromStatus(status: string | null): Tone {
  switch (status) {
    case 'DELIVERED':
      return 'green'
    case 'CONFIRMED':
      return 'blue'
    case 'RETURNED':
    case 'FAILED':
      return 'red'
    case 'PENDING':
      return 'amber'
    default:
      return 'violet'
  }
}

async function safeQuery<T extends QueryResultRow>(label: string, query: string): Promise<T[]> {
  try {
    const result = await pool.query<T>(query)
    return result.rows
  } catch (error) {
    console.warn(`Optional dashboard query failed (${label}):`, error)
    return []
  }
}

async function getTableColumns(tableName: string): Promise<Set<string>> {
  // Check cache first (schema rarely changes)
  const cached = tableColumnsCache.get(tableName)
  const now = Date.now()

  if (cached && now - cached.timestamp < 60 * 60 * 1000) { // 1 hour cache
    return cached.columns
  }

  const result = await pool.query<ColumnRow>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
    `,
    [tableName]
  )

  const columns = new Set(result.rows.map((row) => row.column_name))
  tableColumnsCache.set(tableName, { columns, timestamp: now })

  return columns
}

function buildNumericExpression(alias: string, columns: Set<string>, candidates: string[]): string {
  const availableCandidates = candidates.filter((candidate) => columns.has(candidate))

  if (availableCandidates.length === 0) {
    return '0'
  }

  return `COALESCE(${availableCandidates.map((candidate) => `${alias}."${candidate}"`).join(', ')}, 0)`
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isFounder(session.user.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Check cache first (5-minute TTL)
    const now = Date.now()
    if (statsCache && now - statsCache.timestamp < CACHE_TTL_MS) {
      console.log('✅ Dashboard stats served from cache')
      return NextResponse.json(statsCache.data)
    }

    console.log('🔄 Generating fresh dashboard stats...')

    const orderColumns = await getTableColumns('Order')
    const revenueExpression = buildNumericExpression('o', orderColumns, ['revenue', 'total'])
    const estimatedProfitExpression = buildNumericExpression('o', orderColumns, ['estimatedProfit'])
    const hasConfirmationStatus = orderColumns.has('confirmationStatus')
    const hasDeliveryStatus = orderColumns.has('deliveryStatus')
    const hasDeliveryCity = orderColumns.has('deliveryCity')
    const missingOrderColumns = [
      'revenue',
      'total',
      'estimatedProfit',
      'confirmationStatus',
      'deliveryStatus',
      'deliveryCity',
    ].filter((column) => !orderColumns.has(column))

    if (missingOrderColumns.length > 0) {
      console.warn('Dashboard stats using schema fallbacks for missing Order columns:', missingOrderColumns)
    }

    const deliveryCityExpression = hasDeliveryCity
      ? `COALESCE(NULLIF(TRIM(o."deliveryCity"), ''), 'Unknown')`
      : `'Unknown'`

    const [
      summaryRows,
      seriesRows,
      pipelineRows,
      topProductRows,
      topCityRows,
      alertRows,
      lowStockRows,
      roasRows,
      activityHistoryRows,
      recentOrdersRows,
    ] = await Promise.all([
      safeQuery<SummaryRow>('summary', `
        SELECT
          COALESCE(SUM(CASE WHEN o."createdAt" >= CURRENT_DATE THEN ${revenueExpression} ELSE 0 END), 0)::double precision AS "revenueToday",
          COALESCE(SUM(CASE WHEN o."createdAt" >= CURRENT_DATE - INTERVAL '6 days' THEN ${revenueExpression} ELSE 0 END), 0)::double precision AS "revenueWeek",
          COALESCE(SUM(CASE WHEN o."createdAt" >= CURRENT_DATE - INTERVAL '13 days' AND o."createdAt" < CURRENT_DATE - INTERVAL '6 days' THEN ${revenueExpression} ELSE 0 END), 0)::double precision AS "previousRevenueWeek",
          COALESCE(SUM(CASE WHEN o."createdAt" >= CURRENT_DATE - INTERVAL '6 days' THEN ${estimatedProfitExpression} ELSE 0 END), 0)::double precision AS "estimatedProfitWeek",
          COALESCE(SUM(CASE WHEN o."createdAt" >= CURRENT_DATE - INTERVAL '13 days' AND o."createdAt" < CURRENT_DATE - INTERVAL '6 days' THEN ${estimatedProfitExpression} ELSE 0 END), 0)::double precision AS "previousProfitWeek",
          COUNT(*) FILTER (WHERE o."createdAt" >= CURRENT_DATE)::int AS "ordersToday",
          COUNT(*) FILTER (WHERE o."createdAt" >= CURRENT_DATE - INTERVAL '6 days')::int AS "ordersWeek",
          COUNT(*) FILTER (WHERE o."createdAt" >= CURRENT_DATE - INTERVAL '13 days' AND o."createdAt" < CURRENT_DATE - INTERVAL '6 days')::int AS "previousOrdersWeek",
          COUNT(*) FILTER (WHERE o."createdAt" >= CURRENT_DATE - INTERVAL '29 days' AND o.status = 'DELIVERED')::int AS "delivered30d",
          COUNT(*) FILTER (WHERE o."createdAt" >= CURRENT_DATE - INTERVAL '29 days' AND o.status IN ('DELIVERED', 'FAILED', 'RETURNED'))::int AS "completedDelivery30d"
        FROM "Order" o
      `),
      safeQuery<SeriesRow>('series', `
        SELECT
          day_bucket::date AS "day",
          COALESCE(SUM(${revenueExpression}), 0)::double precision AS "revenue",
          COALESCE(SUM(${estimatedProfitExpression}), 0)::double precision AS "profit"
        FROM generate_series(
          CURRENT_DATE - INTERVAL '29 days',
          CURRENT_DATE,
          INTERVAL '1 day'
        ) AS day_bucket
        LEFT JOIN "Order" o
          ON o."createdAt" >= day_bucket
         AND o."createdAt" < day_bucket + INTERVAL '1 day'
        GROUP BY day_bucket
        ORDER BY day_bucket ASC
      `),
      safeQuery<PipelineRow>('pipeline', `
        SELECT
          COUNT(*) FILTER (WHERE o."createdAt" >= CURRENT_DATE - INTERVAL '29 days' AND o.status = 'PENDING')::int AS pending,
          COUNT(*) FILTER (WHERE o."createdAt" >= CURRENT_DATE - INTERVAL '29 days' AND o.status = 'CONFIRMED')::int AS confirmed,
          ${hasDeliveryStatus
            ? `COUNT(*) FILTER (WHERE o."createdAt" >= CURRENT_DATE - INTERVAL '29 days' AND COALESCE(o."deliveryStatus", 'NOT_CREATED') IN ('SENDIT_CREATED', 'IN_DELIVERY'))::int`
            : '0::int'} AS shipped,
          COUNT(*) FILTER (WHERE o."createdAt" >= CURRENT_DATE - INTERVAL '29 days' AND o.status = 'DELIVERED')::int AS delivered,
          COUNT(*) FILTER (WHERE o."createdAt" >= CURRENT_DATE - INTERVAL '29 days' AND o.status = 'RETURNED')::int AS returned
        FROM "Order" o
      `),
      safeQuery<ProductRow>('top-products', `
        SELECT
          COALESCE(NULLIF(TRIM(p.name), ''), CONCAT('Product #', COALESCE(oi."productId"::text, '—'))) AS "name",
          COALESCE(SUM(oi.quantity), 0)::int AS "units",
          COALESCE(SUM(COALESCE(oi.price, 0) * COALESCE(oi.quantity, 0)), 0)::double precision AS "revenue"
        FROM "OrderItem" oi
        INNER JOIN "Order" o ON o.id = oi."orderId"
        LEFT JOIN "Product" p ON p.id = oi."productId"
        WHERE o."createdAt" >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY COALESCE(NULLIF(TRIM(p.name), ''), CONCAT('Product #', COALESCE(oi."productId"::text, '—')))
        ORDER BY "units" DESC, "revenue" DESC
        LIMIT 4
      `),
      safeQuery<CityRow>('top-cities', `
        SELECT
          ${deliveryCityExpression} AS "name",
          COUNT(*)::int AS "orders"
        FROM "Order" o
        WHERE o."createdAt" >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY ${deliveryCityExpression}
        ORDER BY "orders" DESC, "name" ASC
        LIMIT 5
      `),
      safeQuery<AlertCountsRow>('alerts', `
        SELECT
          ${hasConfirmationStatus ? `COUNT(*) FILTER (WHERE o."confirmationStatus" = 'NEEDS_CONFIRMATION')::int` : '0::int'} AS "needsConfirmation",
          ${hasDeliveryStatus
            ? `COUNT(*) FILTER (WHERE o.status = 'CONFIRMED' AND COALESCE(o."deliveryStatus", 'NOT_CREATED') = 'NOT_CREATED')::int`
            : '0::int'} AS "unshippedConfirmed",
          COUNT(*) FILTER (WHERE o."createdAt" >= CURRENT_DATE - INTERVAL '29 days' AND o.status IN ('FAILED', 'RETURNED'))::int AS "deliveryIssues"
        FROM "Order" o
      `),
      safeQuery<LowStockRow>(
        'low-stock',
        `
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
        `
      ),
      safeQuery<RoasRow>(
        'roas',
        `
          SELECT
            COALESCE(SUM(a.spend), 0)::double precision AS spend,
            COALESCE(SUM(a.revenue), 0)::double precision AS revenue
          FROM "AdCampaign" a
          WHERE COALESCE(a."endDate", CURRENT_DATE) >= CURRENT_DATE - INTERVAL '29 days'
        `
      ),
      safeQuery<ActivityHistoryRow>(
        'activity-history',
        `
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
        `
      ),
      safeQuery<RecentOrderRow>(
        'recent-orders',
        `
          SELECT
            o.status,
            o."createdAt" AS "createdAt",
            o."orderNumber" AS "orderNumber",
            o."deliveryName" AS "deliveryName",
            o."sourceChannel" AS "sourceChannel"
          FROM "Order" o
          ORDER BY o."createdAt" DESC
          LIMIT 6
        `
      ),
    ])

    const summary = summaryRows[0]
    const pipeline = pipelineRows[0]
    const alertCounts = alertRows[0]

    const revenueToday = toNumber(summary?.revenueToday)
    const revenueWeek = toNumber(summary?.revenueWeek)
    const previousRevenueWeek = toNumber(summary?.previousRevenueWeek)
    const estimatedProfitWeek = toNumber(summary?.estimatedProfitWeek)
    const previousProfitWeek = toNumber(summary?.previousProfitWeek)
    const ordersToday = toNumber(summary?.ordersToday)
    const ordersWeek = toNumber(summary?.ordersWeek)
    const previousOrdersWeek = toNumber(summary?.previousOrdersWeek)
    const delivered30d = toNumber(summary?.delivered30d)
    const completedDelivery30d = toNumber(summary?.completedDelivery30d)
    const deliveryRate = completedDelivery30d > 0 ? (delivered30d / completedDelivery30d) * 100 : 0
    const marginPercent = revenueWeek > 0 ? (estimatedProfitWeek / revenueWeek) * 100 : 0
    const revenueDelta = percentageChange(revenueWeek, previousRevenueWeek)
    const profitDelta = percentageChange(estimatedProfitWeek, previousProfitWeek)
    const ordersDelta = percentageChange(ordersWeek, previousOrdersWeek)
    const averageOrderValue = ordersWeek > 0 ? revenueWeek / ordersWeek : 0

    const revenueSeries = seriesRows.map((row) => {
      const date = new Date(row.day)

      return {
        date: date.toISOString(),
        label: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date),
        revenue: toNumber(row.revenue),
        profit: toNumber(row.profit),
      }
    })

    const streakDays = buildStreak(revenueSeries)
    const goalProgress = revenueToday > 0 ? Math.min((revenueToday / DAILY_REVENUE_GOAL) * 100, 100) : 0

    const topProducts = topProductRows.map((row) => ({
      name: row.name || 'Unknown product',
      units: toNumber(row.units),
      revenue: toNumber(row.revenue),
    }))

    const topCities = topCityRows.map((row) => ({
      name: row.name || 'Unknown',
      orders: toNumber(row.orders),
    }))

    const pipelineItems = [
      { label: 'Pending', value: toNumber(pipeline?.pending), tone: 'amber' as Tone },
      { label: 'Confirmed', value: toNumber(pipeline?.confirmed), tone: 'blue' as Tone },
      { label: 'Shipped', value: toNumber(pipeline?.shipped), tone: 'violet' as Tone },
      { label: 'Delivered', value: toNumber(pipeline?.delivered), tone: 'green' as Tone },
      { label: 'Returned', value: toNumber(pipeline?.returned), tone: 'red' as Tone },
    ]

    const needsConfirmation = toNumber(alertCounts?.needsConfirmation)
    const unshippedConfirmed = toNumber(alertCounts?.unshippedConfirmed)
    const deliveryIssues = toNumber(alertCounts?.deliveryIssues)
    const lowStockTotal = toNumber(lowStockRows[0]?.total)

    const attentionItems = [
      needsConfirmation > 0
        ? {
            tone: 'amber' as Tone,
            title: `${needsConfirmation} orders need confirmation`,
            subtitle: 'Pending WhatsApp, Instagram, or manual follow-up',
            href: '/orders',
          }
        : null,
      unshippedConfirmed > 0
        ? {
            tone: 'violet' as Tone,
            title: `${unshippedConfirmed} confirmed orders are not shipped`,
            subtitle: 'Shipment creation is still pending',
            href: '/orders',
          }
        : null,
      lowStockTotal > 0
        ? {
            tone: 'red' as Tone,
            title: `${lowStockTotal} products are low on stock`,
            subtitle: lowStockRows
              .map((item) => `${item.name || 'Unknown'} (${toNumber(item.stock)} left)`)
              .join(' · '),
            href: '/products',
          }
        : null,
      deliveryIssues > 0
        ? {
            tone: 'rose' as Tone,
            title: `${deliveryIssues} failed or returned deliveries in the last 30 days`,
            subtitle: 'Review support or courier follow-up opportunities',
            href: '/orders',
          }
        : null,
    ].filter(Boolean)

    const activity = activityHistoryRows.length > 0
      ? activityHistoryRows.map((row) => ({
          tone: toneFromStatus(row.status),
          title: row.orderNumber
            ? `${row.orderNumber} moved to ${humanizeStatus(row.status)}`
            : `Order moved to ${humanizeStatus(row.status)}`,
          subtitle: row.note || row.deliveryName || 'Status change recorded',
          timestamp: new Date(row.createdAt).toISOString(),
        }))
      : recentOrdersRows.map((row) => ({
          tone: 'rose' as Tone,
          title: row.orderNumber ? `New order ${row.orderNumber}` : 'New order created',
          subtitle: [row.deliveryName, row.sourceChannel].filter(Boolean).join(' · ') || 'Recent order activity',
          timestamp: new Date(row.createdAt).toISOString(),
        }))

    const spend30d = toNumber(roasRows[0]?.spend)
    const adRevenue30d = toNumber(roasRows[0]?.revenue)
    const roas = spend30d > 0 ? adRevenue30d / spend30d : 0

    const responseData = {
      generatedAt: new Date().toISOString(),
      dailyGoal: DAILY_REVENUE_GOAL,
      revenueToday,
      revenueWeek,
      revenueDelta,
      estimatedProfit: estimatedProfitWeek,
      profitDelta,
      marginPercent,
      ordersToday,
      ordersWeek,
      ordersDelta,
      averageOrderValue,
      deliveryRate,
      completedDeliveryCount: completedDelivery30d,
      roas,
      adSpend: spend30d,
      streakDays,
      goalProgress,
      revenueSeries,
      pipeline: pipelineItems,
      topProducts,
      topCities,
      alerts: {
        total: needsConfirmation + unshippedConfirmed + lowStockTotal + deliveryIssues,
        items: attentionItems.length > 0
          ? attentionItems
          : [
              {
                tone: 'green' as Tone,
                title: 'No urgent blockers right now',
                subtitle: 'Orders, stock, and delivery queues look healthy',
                href: '/orders',
              },
            ],
      },
      activity,
    }

    // Store in cache
    statsCache = {
      data: responseData,
      timestamp: Date.now(),
    }

    console.log('✅ Dashboard stats cached for 5 minutes')

    return NextResponse.json(responseData)
  } catch (error) {
    console.error('Dashboard stats error:', error)

    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    )
  }
}
