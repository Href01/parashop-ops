require('dotenv/config')
const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// Inline copy of creditOrderPoints logic (so the script is standalone)
async function creditOrderPoints(db, orderId, opts = {}) {
  const ord = await db.query('SELECT id, "userId", "pointsEarned" FROM "Order" WHERE id = $1', [orderId])
  const order = ord.rows[0]
  if (!order) return { credited: 0, userId: null, skipped: true, reason: 'order-not-found' }
  if (!order.userId) return { credited: 0, userId: null, skipped: true, reason: 'no-user' }
  const existing = await db.query(`SELECT id FROM "LoyaltyTransaction" WHERE "orderId" = $1 AND type = 'EARNED' AND pending = false LIMIT 1`, [orderId])
  if (existing.rows.length > 0) return { credited: 0, userId: order.userId, skipped: true, reason: 'already-credited' }
  const pendingTx = await db.query(`SELECT id, points FROM "LoyaltyTransaction" WHERE "orderId" = $1 AND type = 'EARNED' AND pending = true ORDER BY id DESC LIMIT 1`, [orderId])
  if (pendingTx.rows.length > 0) {
    const pts = Number(pendingTx.rows[0].points) || Number(order.pointsEarned) || 0
    if (pts <= 0) return { credited: 0, userId: order.userId, skipped: true, reason: 'pending-zero' }
    if (!opts.dryRun) {
      await db.query(`UPDATE "LoyaltyTransaction" SET pending = false WHERE id = $1`, [pendingTx.rows[0].id])
      await db.query(`UPDATE "User" SET points = points + $1, "pendingPoints" = GREATEST("pendingPoints" - $1, 0) WHERE id = $2`, [pts, order.userId])
    }
    return { credited: pts, userId: order.userId, skipped: false, reason: 'confirmed-pending' }
  }
  const calc = await db.query(`SELECT COALESCE(SUM(CASE WHEN p."pointsFixed" IS NOT NULL THEN p."pointsFixed" * oi.quantity ELSE ROUND(oi.price * oi.quantity / 10 * COALESCE(p."pointsMultiplier", 1)) END), 0)::int AS pts FROM "OrderItem" oi JOIN "Product" p ON p.id = oi."productId" WHERE oi."orderId" = $1`, [orderId])
  const pts = Number(calc.rows[0]?.pts) || 0
  if (pts <= 0) return { credited: 0, userId: order.userId, skipped: true, reason: 'no-items-or-zero' }
  if (!opts.dryRun) {
    await db.query(`UPDATE "User" SET points = points + $1 WHERE id = $2`, [pts, order.userId])
    await db.query(`INSERT INTO "LoyaltyTransaction" ("userId", points, type, reason, "orderId", pending, "expiresAt", "createdAt") VALUES ($1, $2, 'EARNED', $3, $4, false, NOW() + INTERVAL '1 year', NOW())`, [order.userId, pts, `Commande #${orderId}`, orderId])
    await db.query(`UPDATE "Order" SET "pointsEarned" = $1 WHERE id = $2 AND COALESCE("pointsEarned", 0) = 0`, [pts, orderId])
  }
  return { credited: pts, userId: order.userId, skipped: false, reason: 'computed-from-items' }
}

async function run() {
  const DRY = process.argv[2] !== '--apply'
  console.log(DRY ? '🔍 DRY RUN (aucune écriture)\n' : '✍️  APPLY (écriture réelle)\n')
  const delivered = await pool.query(`SELECT id FROM "Order" WHERE status = 'DELIVERED' AND "userId" IS NOT NULL ORDER BY id`)
  let totalCredited = 0, credited = 0, skipped = 0
  for (const row of delivered.rows) {
    const r = await creditOrderPoints(pool, row.id, { dryRun: DRY })
    if (!r.skipped) { credited++; totalCredited += r.credited; console.log(`  #${row.id} → +${r.credited} pts (user ${r.userId}) [${r.reason}]`) }
    else skipped++
  }
  console.log(`\n=== ${credited} commandes créditées (${totalCredited} pts au total) · ${skipped} sautées ===`)
  if (DRY) console.log('\n👉 Pour appliquer : node scripts/backfill-points.js --apply')
  await pool.end()
}
run()
