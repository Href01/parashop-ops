import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'
import { partnerSettlement, todayCasablanca } from '@/lib/partner-ledger'

/**
 * GET  /api/ops/partners → les partenaires en depot-vente, avec leur solde.
 * POST /api/ops/partners { name, shinePct?, startDate?, notes? } → le partenaire cree.
 */
export const dynamic = 'force-dynamic'

async function guard() {
  const s = await getServerSession(authOptions)
  return s?.user?.email || null
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const r = await pool.query(
    `SELECT pa.*, pa."startDate"::text AS "startDate", COUNT(p.id)::int AS produits,
            COALESCE(SUM(GREATEST(p.stock, 0)), 0)::int AS unites,
            COALESCE(SUM(GREATEST(p.stock, 0) * COALESCE(p."costPrice", 0)), 0)::double precision AS "valeurStock"
       FROM "Partner" pa LEFT JOIN "Product" p ON p."partnerId" = pa.id
      GROUP BY pa.id ORDER BY pa.active DESC, pa.name`,
  )
  const today = todayCasablanca()
  const partners = await Promise.all(r.rows.map(async (pa) => {
    const start = String(pa.startDate instanceof Date ? pa.startDate.toISOString() : pa.startDate).slice(0, 10)
    const s = await partnerSettlement(pa.id, start, today)
    return {
      id: pa.id, name: pa.name, shinePct: Number(pa.shinePct), startDate: start, active: pa.active,
      produits: pa.produits, unites: pa.unites, valeurStock: Math.round(pa.valeurStock * 100) / 100,
      net: s?.net ?? 0, balance: s?.balance ?? 0,
    }
  }))
  return NextResponse.json({ partners }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const email = await guard()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const name = String(b.name || '').trim()
  if (!name) return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
  const pct = b.shinePct == null ? 50 : Number(b.shinePct)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return NextResponse.json({ error: 'Part entre 0 et 100' }, { status: 400 })
  const r = await pool.query(
    `INSERT INTO "Partner" (name, "shinePct", "startDate", notes)
     VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4) RETURNING id`,
    [name, pct, b.startDate || null, b.notes || null],
  )
  return NextResponse.json({ id: r.rows[0].id })
}
