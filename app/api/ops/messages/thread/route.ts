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
        m."createdAt",
        u.name as "userName"
      FROM "MessageLog" m
      LEFT JOIN "User" u ON u.id = m."userId"
      WHERE m.phone = $1
      ORDER BY m."createdAt" ASC`,
      [phone]
    )

    const messages = result.rows
    const userId = messages[0]?.userId || null
    const userName = messages[0]?.userName || null

    return NextResponse.json({
      phone,
      userId,
      userName,
      messages,
    })
  } catch (error) {
    console.error('[thread] Query failed:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
