import { NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

/**
 * GET /api/ops/avis
 *
 * Returns all reviews with user and product details for moderation.
 */
export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        r.id,
        r."userId",
        r."productId",
        r.rating,
        r.comment,
        r.images,
        r.approved,
        r."pointsAwarded",
        r."orderId",
        r."createdAt",
        u.name as "userName",
        u.phone as "userPhone",
        p.name as "productName"
      FROM "Review" r
      LEFT JOIN "User" u ON u.id = r."userId"
      LEFT JOIN "Product" p ON p.id = r."productId"
      ORDER BY
        CASE
          WHEN r.approved IS NULL THEN 1
          WHEN r.approved = true THEN 2
          ELSE 3
        END,
        r."createdAt" DESC
    `)

    const reviews = result.rows.map(row => ({
      ...row,
      images: row.images || [],
    }))

    return NextResponse.json({ reviews })
  } catch (error) {
    console.error('[avis] Query failed:', error)
    return NextResponse.json({ error: 'Database error', reviews: [] }, { status: 500 })
  }
}
