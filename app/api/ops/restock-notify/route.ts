import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * Restock waitlist — customers who left their phone on an import-unavailable product
 * (`RestockNotify`), grouped by product so the founder can WhatsApp them when it's back.
 *
 * GET  → products with their pending (+ already-notified count) waitlist.
 * POST → mark entries notified: { ids: number[] }  (sets notifiedAt = now).
 */
async function guard() {
  const s = await getServerSession(authOptions)
  return !!s?.user?.email
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const r = await pool.query(`
      SELECT rn.id, rn."productId", rn.phone, rn.locale, rn."createdAt", rn."notifiedAt",
             p.name, p.brand, p.image, p.stock, COALESCE(p."virtualStock",0) AS "virtualStock",
             COALESCE(p."importUnavailable", false) AS "importUnavailable"
      FROM "RestockNotify" rn
      JOIN "Product" p ON p.id = rn."productId"
      ORDER BY rn."createdAt" DESC
    `)
    // Group by product; keep pending (not yet notified) separate from history.
    const map = new Map<number, any>()
    for (const row of r.rows) {
      let g = map.get(row.productId)
      if (!g) {
        g = {
          productId: row.productId, name: row.name, brand: row.brand, image: row.image,
          stock: Number(row.stock) || 0, virtualStock: Number(row.virtualStock) || 0,
          importUnavailable: row.importUnavailable === true,
          sellable: (Number(row.stock) || 0) + (Number(row.virtualStock) || 0),
          pending: [] as any[], notifiedCount: 0,
        }
        map.set(row.productId, g)
      }
      if (row.notifiedAt) g.notifiedCount++
      else g.pending.push({ id: row.id, phone: row.phone, locale: row.locale, createdAt: row.createdAt })
    }
    // Products with people still waiting first, then by pending count.
    const products = [...map.values()].sort((a, b) => (b.pending.length - a.pending.length))
    const totalPending = products.reduce((s, p) => s + p.pending.length, 0)
    return NextResponse.json({ products, totalPending }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error'
    return NextResponse.json({ error: 'Failed', details: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json().catch(() => ({}))
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : []
    if (ids.length === 0) return NextResponse.json({ error: 'ids requis' }, { status: 400 })
    const r = await pool.query(
      `UPDATE "RestockNotify" SET "notifiedAt" = now() WHERE id = ANY($1) AND "notifiedAt" IS NULL`,
      [ids]
    )
    return NextResponse.json({ updated: r.rowCount })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error'
    return NextResponse.json({ error: 'Failed', details: message }, { status: 500 })
  }
}
