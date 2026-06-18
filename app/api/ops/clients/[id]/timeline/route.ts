import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

/**
 * GET /api/ops/clients/[id]/timeline
 *
 * Client 360° view: unified timeline of orders, messages, reviews, points transactions.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const clientId = parseInt(params.id)
  if (isNaN(clientId)) {
    return NextResponse.json({ error: 'Invalid client ID' }, { status: 400 })
  }

  try {
    // Fetch client data
    const clientRes = await pool.query(
      `SELECT
        u.id,
        u.name,
        u.phone,
        u.email,
        u.points,
        u."createdAt",
        (SELECT COUNT(*) FROM "Order" WHERE "userId" = u.id) as "orderCount",
        (SELECT COALESCE(SUM(revenue), 0) FROM "Order" WHERE "userId" = u.id AND status = 'DELIVERED') as "totalRevenue",
        (SELECT COUNT(*) FROM "Review" WHERE "userId" = u.id) as "reviewCount",
        (SELECT COUNT(*) FROM "MessageLog" WHERE "userId" = u.id) as "messageCount"
      FROM "User" u
      WHERE u.id = $1`,
      [clientId]
    )

    if (clientRes.rows.length === 0) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const client = clientRes.rows[0]
    const clientData = {
      ...client,
      pointsDh: Math.floor(client.points / 10),
    }

    // Build unified timeline
    const timeline: any[] = []

    // 1. Orders
    const orders = await pool.query(
      `SELECT
        id,
        status,
        revenue,
        "createdAt",
        "deliveryName"
      FROM "Order"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 50`,
      [clientId]
    )

    orders.rows.forEach(o => {
      const statusLabel =
        o.status === 'DELIVERED' ? '✓ Livrée' :
        o.status === 'CANCELLED' ? '✗ Annulée' :
        o.status === 'PENDING' ? '⏳ En attente' :
        o.status

      timeline.push({
        id: `order-${o.id}`,
        type: 'order',
        date: o.createdAt,
        icon: 'ShoppingBag',
        title: `Commande #${o.id} — ${statusLabel}`,
        description: `Montant: ${Math.round(o.revenue)} MAD`,
        link: `/orders/${o.id}`,
      })
    })

    // 2. Messages
    const messages = await pool.query(
      `SELECT
        id,
        direction,
        type,
        body,
        status,
        "createdAt",
        "orderId"
      FROM "MessageLog"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 50`,
      [clientId]
    )

    messages.rows.forEach(m => {
      const label =
        m.type === 'otp' ? '🔐 Code OTP' :
        m.type === 'review' ? '⭐ Demande d\'avis' :
        m.direction === 'in' ? '💬 Réponse cliente' :
        m.type

      const desc = m.body || `[${m.type}]`

      timeline.push({
        id: `message-${m.id}`,
        type: 'message',
        date: m.createdAt,
        icon: 'MessageCircle',
        title: label,
        description: desc.length > 80 ? desc.slice(0, 80) + '...' : desc,
        status: m.direction === 'out' ? m.status : undefined,
      })
    })

    // 3. Reviews
    const reviews = await pool.query(
      `SELECT
        id,
        rating,
        comment,
        approved,
        "createdAt",
        "productId"
      FROM "Review"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 20`,
      [clientId]
    )

    reviews.rows.forEach(r => {
      timeline.push({
        id: `review-${r.id}`,
        type: 'review',
        date: r.createdAt,
        icon: 'Star',
        title: `Avis ${r.rating}⭐ ${r.approved ? '(publié)' : '(en attente)'}`,
        description: r.comment || 'Pas de commentaire',
      })
    })

    // 4. Points transactions (if PointsTransaction table exists)
    try {
      const points = await pool.query(
        `SELECT
          id,
          amount,
          reason,
          "createdAt"
        FROM "PointsTransaction"
        WHERE "userId" = $1
        ORDER BY "createdAt" DESC
        LIMIT 30`,
        [clientId]
      )

      points.rows.forEach(p => {
        timeline.push({
          id: `points-${p.id}`,
          type: 'points',
          date: p.createdAt,
          icon: 'Gift',
          title: p.amount > 0 ? 'Points gagnés' : 'Points utilisés',
          description: p.reason || 'Transaction de points',
          amount: p.amount,
        })
      })
    } catch {
      // PointsTransaction table may not exist yet
    }

    // Sort timeline by date desc
    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return NextResponse.json({
      client: clientData,
      timeline: timeline.slice(0, 100), // Limit to 100 most recent events
    })
  } catch (error) {
    console.error('[client timeline] Query failed:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
