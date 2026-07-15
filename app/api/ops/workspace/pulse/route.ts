import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * Workspace "pulse" — a few cheap live operational counters for the KPI strip at the top
 * of the collaborative workspace. Money (CA du jour) comes from the authoritative
 * /api/ops/dashboard/stats; here we only add fast operational counts.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const s = await getServerSession(authOptions)
  if (!s?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const one = (sql: string) => pool.query(sql).then((r) => Number(r.rows[0]?.n || 0)).catch(() => 0)

  const [pending, lowStock, leadsToday, waitlist] = await Promise.all([
    one(`SELECT COUNT(*) n FROM "Order" WHERE status = 'PENDING'`),
    one(`SELECT COUNT(*) n FROM "Product" WHERE COALESCE(stock,0) + COALESCE("virtualStock",0) <= 3 AND COALESCE("importUnavailable",false) = false`),
    one(`SELECT COUNT(*) n FROM "AbandonedCheckout" WHERE "createdAt" >= date_trunc('day', now())`),
    one(`SELECT COUNT(*) n FROM "RestockNotify" WHERE "notifiedAt" IS NULL`),
  ])

  return NextResponse.json({ pending, lowStock, leadsToday, waitlist }, { headers: { 'Cache-Control': 'no-store' } })
}
