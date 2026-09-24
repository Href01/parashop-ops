import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'
import { computeLedger, partnerSettlement, partnerStock, todayCasablanca } from '@/lib/partner-ledger'

/**
 * GET   /api/ops/partners/:id?from=YYYY-MM-DD&to=YYYY-MM-DD
 *       → le releve de la periode (ventes ligne a ligne, frais, publicite,
 *         depenses, partage), l'etat du stock, et le solde a reverser — ce
 *         dernier toujours calcule depuis le debut du partenariat.
 * PATCH /api/ops/partners/:id { name?, shinePct?, startDate?, notes?, active? }
 */
export const dynamic = 'force-dynamic'

async function guard() {
  const s = await getServerSession(authOptions)
  return s?.user?.email || null
}
const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = Number((await params).id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id invalide' }, { status: 400 })

  const today = todayCasablanca()
  const head = await pool.query(`SELECT "startDate"::text AS "startDate" FROM "Partner" WHERE id = $1`, [id])
  if (head.rowCount === 0) return NextResponse.json({ error: 'Partenaire introuvable' }, { status: 404 })
  const raw = head.rows[0].startDate
  const start = String(raw instanceof Date ? raw.toISOString() : raw).slice(0, 10)

  const sp = req.nextUrl.searchParams
  const from = DATE.test(sp.get('from') || '') ? String(sp.get('from')) : start
  const to = DATE.test(sp.get('to') || '') ? String(sp.get('to')) : today

  const [ledger, stock, settlement] = await Promise.all([
    computeLedger(id, { from, to }),
    partnerStock(id, start),
    partnerSettlement(id, start, today),
  ])
  return NextResponse.json({ ledger, stock, settlement, today }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = Number((await params).id)
  const b = await req.json().catch(() => ({}))
  const sets: string[] = []
  const vals: unknown[] = []
  if (typeof b.name === 'string' && b.name.trim()) { vals.push(b.name.trim()); sets.push(`name = $${vals.length}`) }
  if (b.shinePct != null) {
    const pct = Number(b.shinePct)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return NextResponse.json({ error: 'Part entre 0 et 100' }, { status: 400 })
    vals.push(pct); sets.push(`"shinePct" = $${vals.length}`)
  }
  if (typeof b.startDate === 'string' && DATE.test(b.startDate)) { vals.push(b.startDate); sets.push(`"startDate" = $${vals.length}::date`) }
  if (typeof b.notes === 'string') { vals.push(b.notes); sets.push(`notes = $${vals.length}`) }
  if (typeof b.active === 'boolean') { vals.push(b.active); sets.push(`active = $${vals.length}`) }
  if (sets.length === 0) return NextResponse.json({ error: 'Rien a modifier' }, { status: 400 })
  vals.push(id)
  await pool.query(`UPDATE "Partner" SET ${sets.join(', ')}, "updatedAt" = now() WHERE id = $${vals.length}`, vals)
  return NextResponse.json({ ok: true })
}
