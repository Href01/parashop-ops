import type { Pool, PoolClient } from 'pg'

type Db = Pick<Pool | PoolClient, 'query'>

/**
 * Credit a delivered order's loyalty points to the customer — ONCE.
 *
 * Handles every channel:
 *  - Site orders already created a *pending* EARNED transaction → confirm it
 *    and move pendingPoints → points.
 *  - Manual / Sendit / WhatsApp / Insta orders have no transaction and
 *    pointsEarned = 0 → compute points from the order items and credit them.
 *
 * Idempotent: if the order already has a confirmed EARNED transaction it does
 * nothing, so it's safe to call on every DELIVERED transition and in backfills.
 *
 * Points formula (matches the storefront): per item,
 *   pointsFixed × qty   (if the product has a fixed value), otherwise
 *   round(price × qty / 10 × pointsMultiplier).
 */
export async function creditOrderPoints(
  db: Db,
  orderId: number,
  opts: { dryRun?: boolean } = {}
): Promise<{ credited: number; userId: number | null; skipped: boolean; reason?: string }> {
  const ord = await db.query('SELECT id, "userId", "pointsEarned" FROM "Order" WHERE id = $1', [orderId])
  const order = ord.rows[0]
  if (!order) return { credited: 0, userId: null, skipped: true, reason: 'order-not-found' }
  if (!order.userId) return { credited: 0, userId: null, skipped: true, reason: 'no-user' }

  // Already credited?
  const existing = await db.query(
    `SELECT id FROM "LoyaltyTransaction" WHERE "orderId" = $1 AND type = 'EARNED' AND pending = false LIMIT 1`,
    [orderId]
  )
  if (existing.rows.length > 0) return { credited: 0, userId: order.userId, skipped: true, reason: 'already-credited' }

  // Pending transaction (site order) → confirm it.
  const pendingTx = await db.query(
    `SELECT id, points FROM "LoyaltyTransaction" WHERE "orderId" = $1 AND type = 'EARNED' AND pending = true ORDER BY id DESC LIMIT 1`,
    [orderId]
  )
  if (pendingTx.rows.length > 0) {
    const pts = Number(pendingTx.rows[0].points) || Number(order.pointsEarned) || 0
    if (pts <= 0) return { credited: 0, userId: order.userId, skipped: true, reason: 'pending-zero' }
    if (!opts.dryRun) {
      await db.query(`UPDATE "LoyaltyTransaction" SET pending = false WHERE id = $1`, [pendingTx.rows[0].id])
      await db.query(`UPDATE "User" SET points = points + $1, "pendingPoints" = GREATEST("pendingPoints" - $1, 0) WHERE id = $2`, [pts, order.userId])
    }
    return { credited: pts, userId: order.userId, skipped: false, reason: 'confirmed-pending' }
  }

  // No transaction → compute from items (manual / Sendit / social order).
  const calc = await db.query(
    `SELECT COALESCE(SUM(
        CASE WHEN p."pointsFixed" IS NOT NULL
             THEN p."pointsFixed" * oi.quantity
             ELSE ROUND(oi.price * oi.quantity / 10 * COALESCE(p."pointsMultiplier", 1)) END
     ), 0)::int AS pts
     FROM "OrderItem" oi JOIN "Product" p ON p.id = oi."productId"
     WHERE oi."orderId" = $1`,
    [orderId]
  )
  const pts = Number(calc.rows[0]?.pts) || 0
  if (pts <= 0) return { credited: 0, userId: order.userId, skipped: true, reason: 'no-items-or-zero' }

  if (!opts.dryRun) {
    await db.query(`UPDATE "User" SET points = points + $1 WHERE id = $2`, [pts, order.userId])
    await db.query(
      `INSERT INTO "LoyaltyTransaction" ("userId", points, type, reason, "orderId", pending, "expiresAt", "createdAt")
       VALUES ($1, $2, 'EARNED', $3, $4, false, NOW() + INTERVAL '1 year', NOW())`,
      [order.userId, pts, `Commande #${orderId}`, orderId]
    )
    await db.query(`UPDATE "Order" SET "pointsEarned" = $1 WHERE id = $2 AND COALESCE("pointsEarned", 0) = 0`, [pts, orderId])
  }
  return { credited: pts, userId: order.userId, skipped: false, reason: 'computed-from-items' }
}
