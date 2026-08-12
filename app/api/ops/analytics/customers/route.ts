import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import pool from '@/lib/db'

const TZ = 'Africa/Casablanca'
const REVENUE_STATUSES = ['DELIVERED', 'CONFIRMED']

const num = (v: unknown) => (v == null ? 0 : Number(v))

function casablancaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function resolveRange(searchParams: URLSearchParams) {
  const preset = searchParams.get('preset')
  const today = casablancaToday()

  if (preset === 'today') return { start: today, end: today, days: 1 }
  if (preset === 'yesterday') {
    const y = new Date()
    y.setDate(y.getDate() - 1)
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(y)
    return { start: d, end: d, days: 1 }
  }

  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10), 1), 365)
  const endDate = new Date(today)
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - (days - 1))
  return { start: startDate.toISOString().split('T')[0], end: today, days }
}

function mapCustomer(row: any) {
  return {
    id: num(row.id),
    name: row.name || 'Cliente',
    email: row.email || '',
    phone: row.phone || '',
    orders: num(row.total_orders),
    ltv: num(row.ltv),
    aov: num(row.aov),
    firstOrderAt: row.first_order_at,
    lastOrderAt: row.last_order_at,
    daysSinceLastOrder: num(row.days_since_last_order),
    segment: row.segment || 'unknown',
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token || token.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { start, end, days } = resolveRange(req.nextUrl.searchParams)
    const orderDate = `(o."createdAt" AT TIME ZONE '${TZ}')::date`

    const rollupCte = `
      WITH revenue_orders AS (
        SELECT id, "userId", total, "createdAt"
        FROM "Order"
        WHERE status = ANY($1)
          AND "userId" IS NOT NULL
      ),
      customer_rollup AS (
        SELECT
          u.id,
          u.name,
          u.email,
          u.phone,
          COUNT(ro.id)::int AS total_orders,
          COALESCE(SUM(ro.total), 0)::float AS ltv,
          COALESCE(AVG(ro.total), 0)::float AS aov,
          MIN(ro."createdAt") AS first_order_at,
          MAX(ro."createdAt") AS last_order_at,
          EXTRACT(DAY FROM NOW() - MAX(ro."createdAt"))::int AS days_since_last_order
        FROM "User" u
        JOIN revenue_orders ro ON ro."userId" = u.id
        GROUP BY u.id, u.name, u.email, u.phone
      ),
      segmented AS (
        SELECT *,
          CASE
            WHEN days_since_last_order > 180 THEN 'churned'
            WHEN days_since_last_order > 90 THEN 'at_risk'
            WHEN first_order_at >= NOW() - INTERVAL '30 days' AND total_orders = 1 THEN 'new'
            WHEN total_orders >= 4 OR ltv >= 2000 THEN 'vip'
            WHEN total_orders >= 2 THEN 'repeat'
            ELSE 'one_time'
          END AS segment
        FROM customer_rollup
      )
    `

    const [
      summaryRes,
      segmentsRes,
      topCustomersRes,
      atRiskRes,
      rfmRes,
      periodRes,
    ] = await Promise.all([
      pool.query(
        `${rollupCte}
         SELECT
           COUNT(*)::int AS total_customers,
           COUNT(*) FILTER (WHERE total_orders >= 2)::int AS repeat_customers,
           COUNT(*) FILTER (WHERE segment IN ('at_risk','churned'))::int AS risk_customers,
           COALESCE(SUM(ltv), 0)::float AS total_ltv,
           COALESCE(AVG(ltv), 0)::float AS avg_ltv,
           COALESCE(AVG(aov), 0)::float AS avg_aov,
           COALESCE(AVG(total_orders), 0)::float AS avg_orders
         FROM segmented`,
        [REVENUE_STATUSES]
      ),
      pool.query(
        `${rollupCte}
         SELECT
           segment,
           COUNT(*)::int AS customers,
           COALESCE(SUM(ltv), 0)::float AS revenue,
           COALESCE(AVG(ltv), 0)::float AS avg_ltv,
           COALESCE(AVG(total_orders), 0)::float AS avg_orders
         FROM segmented
         GROUP BY segment
         ORDER BY
           CASE segment
             WHEN 'vip' THEN 1
             WHEN 'repeat' THEN 2
             WHEN 'new' THEN 3
             WHEN 'one_time' THEN 4
             WHEN 'at_risk' THEN 5
             WHEN 'churned' THEN 6
             ELSE 7
           END`,
        [REVENUE_STATUSES]
      ),
      pool.query(
        `${rollupCte}
         SELECT *
         FROM segmented
         ORDER BY ltv DESC, total_orders DESC, last_order_at DESC
         LIMIT 20`,
        [REVENUE_STATUSES]
      ),
      pool.query(
        `${rollupCte}
         SELECT *
         FROM segmented
         WHERE segment IN ('at_risk','churned')
         ORDER BY ltv DESC, days_since_last_order DESC
         LIMIT 20`,
        [REVENUE_STATUSES]
      ),
      pool.query(
        `${rollupCte}
         SELECT *,
           CASE
             WHEN days_since_last_order <= 30 THEN 5
             WHEN days_since_last_order <= 60 THEN 4
             WHEN days_since_last_order <= 90 THEN 3
             WHEN days_since_last_order <= 180 THEN 2
             ELSE 1
           END AS recency_score,
           CASE
             WHEN total_orders >= 10 THEN 5
             WHEN total_orders >= 7 THEN 4
             WHEN total_orders >= 4 THEN 3
             WHEN total_orders >= 2 THEN 2
             ELSE 1
           END AS frequency_score,
           CASE
             WHEN ltv >= 5000 THEN 5
             WHEN ltv >= 3000 THEN 4
             WHEN ltv >= 1500 THEN 3
             WHEN ltv >= 500 THEN 2
             ELSE 1
           END AS monetary_score
         FROM segmented
         ORDER BY ltv DESC
         LIMIT 60`,
        [REVENUE_STATUSES]
      ),
      pool.query(
        `WITH period_orders AS (
           SELECT o.*
           FROM "Order" o
           WHERE o.status = ANY($3)
             AND ${orderDate} BETWEEN $1::date AND $2::date
             AND o."userId" IS NOT NULL
         ),
         first_orders AS (
           SELECT "userId", MIN("createdAt") AS first_order_at
           FROM "Order"
           WHERE status = ANY($3)
             AND "userId" IS NOT NULL
           GROUP BY "userId"
         )
         SELECT
           COUNT(*)::int AS orders,
           COUNT(DISTINCT p."userId")::int AS customers,
           COUNT(DISTINCT p."userId") FILTER (WHERE f.first_order_at = p."createdAt")::int AS new_customers,
           COUNT(DISTINCT p."userId") FILTER (WHERE f.first_order_at < p."createdAt")::int AS returning_customers,
           COALESCE(SUM(p.total), 0)::float AS revenue
         FROM period_orders p
         JOIN first_orders f ON f."userId" = p."userId"`,
        [start, end, REVENUE_STATUSES]
      ),
    ])

    const summary = summaryRes.rows[0] || {}
    const period = periodRes.rows[0] || {}
    const totalCustomers = num(summary.total_customers)
    const repeatCustomers = num(summary.repeat_customers)

    return NextResponse.json({
      period: { start, end, days },
      summary: {
        totalCustomers,
        repeatCustomers,
        repeatRate: totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0,
        riskCustomers: num(summary.risk_customers),
        totalLtv: num(summary.total_ltv),
        avgLtv: num(summary.avg_ltv),
        avgAov: num(summary.avg_aov),
        avgOrders: num(summary.avg_orders),
      },
      recent: {
        orders: num(period.orders),
        customers: num(period.customers),
        newCustomers: num(period.new_customers),
        returningCustomers: num(period.returning_customers),
        revenue: num(period.revenue),
      },
      segments: segmentsRes.rows.map((r: any) => ({
        segment: r.segment,
        customers: num(r.customers),
        revenue: num(r.revenue),
        avgLtv: num(r.avg_ltv),
        avgOrders: num(r.avg_orders),
      })),
      topCustomers: topCustomersRes.rows.map(mapCustomer),
      atRisk: atRiskRes.rows.map(mapCustomer),
      rfm: rfmRes.rows.map((r: any) => ({
        ...mapCustomer(r),
        recencyScore: num(r.recency_score),
        frequencyScore: num(r.frequency_score),
        monetaryScore: num(r.monetary_score),
      })),
    }, { headers: { 'Cache-Control': 'private, max-age=60' } })
  } catch (error) {
    console.error('[Analytics Customers] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
