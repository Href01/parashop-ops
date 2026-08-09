import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

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
        m."errorCode",
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

    // Commandes de la cliente, pour repondre sans quitter la conversation.
    //
    // On rattache par userId ET par telephone : une bonne partie des commandes
    // sont passees en invite (userId NULL), et le numero n'est normalise ni
    // dans "MessageLog" ni dans "Order" (+212, 0..., espaces). Les 9 derniers
    // chiffres sont le seul denominateur commun fiable — meme jointure que
    // celle deja utilisee pour /leads.
    const digits = phone.replace(/\D/g, '').slice(-9)
    const orders = await pool.query(
      `SELECT o.id, o."orderNumber", o.status, o."deliveryStatus", o.total::float AS total,
              o."senditTrackingNumber", o."createdAt"
       FROM "Order" o
       WHERE ($1::int IS NOT NULL AND o."userId" = $1)
          OR ($2 <> '' AND RIGHT(regexp_replace(o."deliveryPhone", '\\D', '', 'g'), 9) = $2)
       ORDER BY o."createdAt" DESC
       LIMIT 6`,
      [userId, digits]
    ).catch(() => ({ rows: [] as Record<string, unknown>[] }))

    return NextResponse.json({
      phone,
      userId,
      userName,
      messages,
      context,
      orders: orders.rows,
    })
  } catch (error) {
    console.error('[thread] Query failed:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
