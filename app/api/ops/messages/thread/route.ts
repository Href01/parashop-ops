import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

/**
 * GET /api/ops/messages/thread?phone=+212...
 *
 * Returns all messages for a given phone number, ordered chronologically.
 */
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone')
  if (!phone) {
    return NextResponse.json({ error: 'phone parameter required' }, { status: 400 })
  }

  try {
    const result = await pool.query(
      `SELECT
        m.id,
        m."userId",
        m.phone,
        m.direction,
        m.type,
        m.category,
        m."templateName",
        m.body,
        m.status,
        m."waMessageId",
        m."orderId",
        m."mediaId",
        m."createdAt",
        u.name as "userName"
      FROM "MessageLog" m
      LEFT JOIN "User" u ON u.id = m."userId"
      WHERE m.phone = $1
      ORDER BY m."createdAt" ASC`,
      [phone]
    )

    const messages = result.rows
    const userId = messages.find((m) => m.userId)?.userId || null
    const userName = messages.find((m) => m.userName)?.userName || null

    // Customer context for the right-hand panel
    let context: Record<string, unknown> | null = null
    if (userId) {
      const ctx = await pool.query(
        `SELECT
          u.points,
          u.email,
          u.city,
          (SELECT COUNT(*) FROM "Order" WHERE "userId" = u.id)::int AS "orderCount",
          (SELECT COALESCE(SUM(total),0) FROM "Order" WHERE "userId" = u.id AND status IN ('CONFIRMED','DELIVERED'))::float AS "totalSpent",
          (SELECT COUNT(*) FROM "Review" WHERE "userId" = u.id)::int AS "reviewCount",
          (SELECT status FROM "Order" WHERE "userId" = u.id ORDER BY "createdAt" DESC LIMIT 1) AS "lastOrderStatus"
        FROM "User" u WHERE u.id = $1`,
        [userId]
      ).catch(() => ({ rows: [] as any[] }))
      const c = ctx.rows[0]
      if (c) {
        context = {
          points: c.points || 0,
          pointsDh: Math.floor((c.points || 0) / 10),
          email: c.email,
          city: c.city,
          orderCount: c.orderCount || 0,
          totalSpent: c.totalSpent || 0,
          reviewCount: c.reviewCount || 0,
          lastOrderStatus: c.lastOrderStatus || null,
        }
      }
    }

    return NextResponse.json({
      phone,
      userId,
      userName,
      messages,
      context,
    })
  } catch (error) {
    console.error('[thread] Query failed:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
