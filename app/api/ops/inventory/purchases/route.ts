import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * GET /api/ops/inventory/purchases?days=30
 *
 * Supplier purchase tracking: spend per product over a period, plus a total,
 * built from InventoryMovement rows of type 'Purchase' (logged by the réappro
 * flow with costPerUnit). Sales/returns (auto-decrement) are excluded by type.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const daysParam = parseInt(searchParams.get('days') || '30')
    const days = [7, 30, 90, 365, 3650].includes(daysParam) ? daysParam : 30

    const [byProductRes, recentRes, summaryRes] = await Promise.all([
      pool.query(
        `SELECT
           im."productId" AS id,
           p.name, p.brand, p.supplier, p.stock,
           SUM(im.quantity)::int AS units,
           COALESCE(SUM(im."totalCost"), 0)::float AS spent,
           MAX(im."createdAt") AS "lastPurchase",
           COUNT(*)::int AS purchases
         FROM "InventoryMovement" im
         LEFT JOIN "Product" p ON p.id = im."productId"
         WHERE im.type = 'Purchase' AND im."createdAt" >= NOW() - ($1 || ' days')::interval
         GROUP BY im."productId", p.name, p.brand, p.supplier, p.stock
         ORDER BY spent DESC, units DESC`,
        [String(days)]
      ),
      pool.query(
        `SELECT im.id, im."productId" AS "productId", p.name, p.brand,
                im.quantity, im."costPerUnit"::float AS "costPerUnit",
                im."totalCost"::float AS "totalCost", im.reason, im.notes,
                im."performedBy", im."createdAt"
         FROM "InventoryMovement" im
         LEFT JOIN "Product" p ON p.id = im."productId"
         WHERE im.type = 'Purchase' AND im."createdAt" >= NOW() - ($1 || ' days')::interval
         ORDER BY im."createdAt" DESC
         LIMIT 50`,
        [String(days)]
      ),
      pool.query(
        `SELECT
           COALESCE(SUM("totalCost"), 0)::float AS "totalSpent",
           COALESCE(SUM(quantity), 0)::int AS "unitsPurchased",
           COUNT(*)::int AS "purchaseCount",
           COUNT(DISTINCT "productId")::int AS "productsRestocked"
         FROM "InventoryMovement"
         WHERE type = 'Purchase' AND "createdAt" >= NOW() - ($1 || ' days')::interval`,
        [String(days)]
      ),
    ])

    const byProduct = byProductRes.rows.map((r) => ({
      id: r.id,
      name: r.name,
      brand: r.brand,
      supplier: r.supplier || null,
      stock: Number(r.stock) || 0,
      units: Number(r.units) || 0,
      spent: Number(r.spent) || 0,
      avgCost: Number(r.units) > 0 && Number(r.spent) > 0 ? Number(r.spent) / Number(r.units) : null,
      purchases: Number(r.purchases) || 0,
      lastPurchase: r.lastPurchase,
    }))

    const recent = recentRes.rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      name: r.name,
      brand: r.brand,
      quantity: Number(r.quantity) || 0,
      costPerUnit: r.costPerUnit != null ? Number(r.costPerUnit) : null,
      totalCost: r.totalCost != null ? Number(r.totalCost) : null,
      reason: r.reason,
      notes: r.notes,
      performedBy: r.performedBy,
      createdAt: r.createdAt,
    }))

    // Spend by supplier (for the period), derived from the per-product rows.
    const bySupplierMap = new Map<string, { supplier: string; spent: number; units: number }>()
    for (const p of byProduct) {
      const key = p.supplier || '—'
      const cur = bySupplierMap.get(key) || { supplier: key, spent: 0, units: 0 }
      cur.spent += p.spent
      cur.units += p.units
      bySupplierMap.set(key, cur)
    }
    const bySupplier = [...bySupplierMap.values()].sort((a, b) => b.spent - a.spent)

    return NextResponse.json({
      days,
      summary: summaryRes.rows[0],
      byProduct,
      bySupplier,
      recent,
    })
  } catch (error: any) {
    console.error('GET purchases error:', error)
    return NextResponse.json({ error: 'Failed to fetch purchases', details: error.message }, { status: 500 })
  }
}
