/**
 * One-time backfill: credit loyalty points for every DELIVERED order that never
 * got them (manual / Sendit / WhatsApp / Insta / TikTok orders, pointsEarned=0),
 * AND confirm any still-pending site-order points.
 *
 * Idempotent — skips orders that already have a confirmed EARNED transaction.
 *
 *   node scripts/backfill-points.js            → DRY-RUN (shows totals, writes nothing)
 *   node scripts/backfill-points.js --apply    → actually credits
 *
 * Mirrors lib/loyalty.ts creditOrderPoints().
 */
require('dotenv/config')
const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const APPLY = process.argv.includes('--apply')

async function creditOrderPoints(db, orderId, dryRun) {
  const ord = await db.query('SELECT id, "userId", "pointsEarned" FROM "Order" WHERE id = $1', [orderId])
  const order = ord.rows[0]
  if (!order || !order.userId) return { credited: 0, userId: order?.userId ?? null, skipped: true }

  const existing = await db.query(
    `SELECT id FROM "LoyaltyTransaction" WHERE "orderId" = $1 AND type = 'EARNED' AND pending = false LIMIT 1`, [orderId])
  if (existing.rows.length > 0) return { credited: 0, userId: order.userId, skipped: true }

  const pendingTx = await db.query(
    `SELECT id, points FROM "LoyaltyTransaction" WHERE "orderId" = $1 AND type = 'EARNED' AND pending = true ORDER BY id DESC LIMIT 1`, [orderId])
  if (pendingTx.rows.length > 0) {
    const pts = Number(pendingTx.rows[0].points) || Number(order.pointsEarned) || 0
    if (pts <= 0) return { credited: 0, userId: order.userId, skipped: true }
    if (!dryRun) {
      await db.query(`UPDATE "LoyaltyTransaction" SET pending = false WHERE id = $1`, [pendingTx.rows[0].id])
      await db.query(`UPDATE "User" SET points = points + $1, "pendingPoints" = GREATEST("pendingPoints" - $1, 0) WHERE id = $2`, [pts, order.userId])
    }
    return { credited: pts, userId: order.userId, skipped: false }
  }

  const calc = await db.query(
    `SELECT COALESCE(SUM(
        CASE WHEN p."pointsFixed" IS NOT NULL THEN p."pointsFixed" * oi.quantity
             ELSE ROUND(oi.price * oi.quantity / 10 * COALESCE(p."pointsMultiplier", 1)) END
     ), 0)::int AS pts
     FROM "OrderItem" oi JOIN "Product" p ON p.id = oi."productId" WHERE oi."orderId" = $1`, [orderId])
  const pts = Number(calc.rows[0] && calc.rows[0].pts) || 0
  if (pts <= 0) return { credited: 0, userId: order.userId, skipped: true }

  if (!dryRun) {
    await db.query(`UPDATE "User" SET points = points + $1 WHERE id = $2`, [pts, order.userId])
    await db.query(
      `INSERT INTO "LoyaltyTransaction" ("userId", points, type, reason, "orderId", pending, "expiresAt", "createdAt")
       VALUES ($1, $2, 'EARNED', $3, $4, false, NOW() + INTERVAL '1 year', NOW())`,
      [order.userId, pts, `Commande #${orderId}`, orderId])
    await db.query(`UPDATE "Order" SET "pointsEarned" = $1 WHERE id = $2 AND COALESCE("pointsEarned", 0) = 0`, [pts, orderId])
  }
  return { credited: pts, userId: order.userId, skipped: false }
}

async function main() {
  const orders = await pool.query(`SELECT id FROM "Order" WHERE status = 'DELIVERED' ORDER BY id`)
  let totalPts = 0, credited = 0, skipped = 0
  const users = new Set()
  for (const { id } of orders.rows) {
    const r = await creditOrderPoints(pool, id, !APPLY)
    if (r.skipped) { skipped++ } else { totalPts += r.credited; credited++; if (r.userId) users.add(r.userId) }
  }
  console.log(`\n${APPLY ? '✅ APPLIQUÉ' : '🔍 DRY-RUN (rien écrit)'}`)
  console.log(`Commandes livrées examinées : ${orders.rows.length}`)
  console.log(`  → créditées : ${credited}   |   ignorées (déjà ok / vides) : ${skipped}`)
  console.log(`Total à créditer : ${totalPts} points = ${(totalPts / 10).toFixed(0)} DH, répartis sur ${users.size} clients`)
  if (!APPLY) console.log(`\n→ Relance avec  node scripts/backfill-points.js --apply  pour écrire réellement.`)
  await pool.end()
}
main().catch(e => { console.error('❌', e.message); process.exit(1) })
