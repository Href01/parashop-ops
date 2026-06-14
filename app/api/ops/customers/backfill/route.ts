import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'
import { findOrCreateCustomer } from '@/lib/customer'

/**
 * POST /api/ops/customers/backfill
 * Links every guest order (userId null with a phone) to a customer — finding an
 * existing one by phone or creating a guest record — so all real customers show
 * up in /customers (no more "ghost" customers from imported/guest orders).
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || !isFounder(session.user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const orders = await pool.query(
      `SELECT id, "deliveryName", "deliveryPhone" FROM "Order" WHERE "userId" IS NULL AND "deliveryPhone" IS NOT NULL`
    )
    let linked = 0
    for (const o of orders.rows) {
      const id = await findOrCreateCustomer(pool, o.deliveryName, o.deliveryPhone)
      if (id) { await pool.query(`UPDATE "Order" SET "userId" = $1 WHERE id = $2`, [id, o.id]); linked++ }
    }
    return NextResponse.json({ ok: true, linked })
  } catch (e) {
    console.error('[Customers] backfill', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}
