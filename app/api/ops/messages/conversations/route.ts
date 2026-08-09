import { NextResponse } from 'next/server'
import pool from '@/lib/db'

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
        -- "unread" se calculait sur status IS NULL, or TOUS les messages
        -- entrants arrivent en 'delivered' : le compteur valait donc toujours 0
        -- et le filtre "Non lus" de l'interface ne montrait jamais rien.
        --
        -- La notion utile n'est pas "non lu" mais "EN ATTENTE DE REPONSE" :
        -- le dernier message entrant est plus recent que le dernier sortant.
        -- 5 clientes etaient dans ce cas sans que personne ne le voie, dont
        -- 4 depuis plus d'un mois.
        SELECT
          phone,
          COUNT(*) as total,
          MAX("createdAt") FILTER (WHERE direction = 'in')  AS last_in,
          MAX("createdAt") FILTER (WHERE direction = 'out') AS last_out,
          COUNT(*) FILTER (WHERE direction = 'out' AND status = 'failed')::int AS failed
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
        -- En attente d'une reponse de notre part.
        (s.last_in IS NOT NULL AND (s.last_out IS NULL OR s.last_out < s.last_in)) AS "awaitingReply",
        s.last_in AS "lastInboundAt",
        -- Heures restantes pour repondre GRATUITEMENT (fenetre WhatsApp de 24h).
        -- Negatif = fenetre fermee, il faudra un template payant.
        CASE WHEN s.last_in IS NULL THEN NULL
             ELSE ROUND(24 - EXTRACT(EPOCH FROM (NOW() - s.last_in)) / 3600)
        END AS "windowHoursLeft",
        s.failed AS "failedCount"
      FROM ranked r
      JOIN stats s ON s.phone = r.phone
      WHERE r.rn = 1
      -- Celles qui attendent une reponse remontent en tete, la plus ancienne
      -- demande d'abord : c'est elle dont la fenetre se ferme en premier.
      ORDER BY
        (s.last_in IS NOT NULL AND (s.last_out IS NULL OR s.last_out < s.last_in)) DESC,
        CASE WHEN s.last_in IS NOT NULL AND (s.last_out IS NULL OR s.last_out < s.last_in)
             THEN s.last_in END ASC,
        r."createdAt" DESC
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
      awaitingReply: Boolean(row.awaitingReply),
      lastInboundAt: row.lastInboundAt,
      windowHoursLeft: row.windowHoursLeft == null ? null : Number(row.windowHoursLeft),
      failedCount: Number(row.failedCount) || 0,
      messageCount: parseInt(row.messageCount) || 0,
    }))

    return NextResponse.json({ conversations })
  } catch (error) {
    console.error('[conversations] Query failed:', error)
    return NextResponse.json({ error: 'Database error', conversations: [] }, { status: 500 })
  }
}
