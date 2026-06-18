import { NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

/**
 * GET /api/ops/messages/conversations
 *
 * Returns WhatsApp conversations grouped by phone number, with last message,
 * unread count (incoming messages), and total message count.
 */
export async function GET() {
  try {
    // Group messages by phone, get last message + counts
    const result = await pool.query(`
      WITH ranked AS (
        SELECT
          m.*,
          u.name as "userName",
          ROW_NUMBER() OVER (PARTITION BY m.phone ORDER BY m."createdAt" DESC) as rn
        FROM "MessageLog" m
        LEFT JOIN "User" u ON u.id = m."userId"
      ),
      stats AS (
        SELECT
          phone,
          COUNT(*) as total,
          SUM(CASE WHEN direction = 'in' AND status IS NULL THEN 1 ELSE 0 END) as unread
        FROM "MessageLog"
        GROUP BY phone
      )
      SELECT
        r.phone,
        r."userId",
        r."userName",
        r.id as "lastMessageId",
        r.direction as "lastDirection",
        r.type as "lastType",
        r.category as "lastCategory",
        r."templateName" as "lastTemplateName",
        r.body as "lastBody",
        r.status as "lastStatus",
        r."waMessageId" as "lastWaMessageId",
        r."orderId" as "lastOrderId",
        r."createdAt" as "lastCreatedAt",
        s.total as "messageCount",
        s.unread as "unreadCount"
      FROM ranked r
      JOIN stats s ON s.phone = r.phone
      WHERE r.rn = 1
      ORDER BY r."createdAt" DESC
    `)

    const conversations = result.rows.map(row => ({
      phone: row.phone,
      userId: row.userId,
      userName: row.userName,
      lastMessage: {
        id: row.lastMessageId,
        userId: row.userId,
        userName: row.userName,
        phone: row.phone,
        direction: row.lastDirection,
        type: row.lastType,
        category: row.lastCategory,
        templateName: row.lastTemplateName,
        body: row.lastBody,
        status: row.lastStatus,
        waMessageId: row.lastWaMessageId,
        orderId: row.lastOrderId,
        createdAt: row.lastCreatedAt,
      },
      unreadCount: parseInt(row.unreadCount) || 0,
      messageCount: parseInt(row.messageCount) || 0,
    }))

    return NextResponse.json({ conversations })
  } catch (error) {
    console.error('[conversations] Query failed:', error)
    return NextResponse.json({ error: 'Database error', conversations: [] }, { status: 500 })
  }
}
