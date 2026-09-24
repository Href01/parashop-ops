import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * POST   /api/ops/partners/:id/payments { date, amount, method?, note? } — un versement fait au partenaire.
 * DELETE /api/ops/partners/:id/payments?paymentId=N
 */
export const dynamic = 'force-dynamic'

async function guard() {
  const s = await getServerSession(authOptions)
  return s?.user?.email || null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const email = await guard()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const partnerId = Number((await params).id)
  const b = await req.json().catch(() => ({}))
  const amount = Number(b.amount)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ''))) return NextResponse.json({ error: 'Date invalide' }, { status: 400 })
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Montant invalide' }, { status: 400 })
  const r = await pool.query(
    `INSERT INTO "PartnerPayment" ("partnerId", date, amount, method, note, "createdBy")
     VALUES ($1, $2::date, $3, $4, $5, $6) RETURNING id`,
    [partnerId, b.date, amount, String(b.method || '').trim() || null, String(b.note || '').trim() || null, email],
  )
  return NextResponse.json({ id: r.rows[0].id })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const partnerId = Number((await params).id)
  const paymentId = Number(req.nextUrl.searchParams.get('paymentId'))
  await pool.query(`DELETE FROM "PartnerPayment" WHERE id = $1 AND "partnerId" = $2`, [paymentId, partnerId])
  return NextResponse.json({ ok: true })
}
