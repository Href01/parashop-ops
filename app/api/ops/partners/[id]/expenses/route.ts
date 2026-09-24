import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'
import { EXPENSE_CATEGORIES } from '@/lib/partner-ledger'

/**
 * POST   /api/ops/partners/:id/expenses { date, category, label?, amount, paidBy }
 * DELETE /api/ops/partners/:id/expenses?expenseId=N
 *
 * `paidBy` est obligatoire : une depense payee par le partenaire lui est
 * remboursee en plus de sa part, payee par Shine elle reduit les deux parts.
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
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(b.category)) return NextResponse.json({ error: 'Catégorie inconnue' }, { status: 400 })
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Montant invalide' }, { status: 400 })
  if (b.paidBy !== 'shine' && b.paidBy !== 'partner') return NextResponse.json({ error: 'Qui a payé ?' }, { status: 400 })
  const r = await pool.query(
    `INSERT INTO "PartnerExpense" ("partnerId", date, category, label, amount, "paidBy", "createdBy")
     VALUES ($1, $2::date, $3, $4, $5, $6, $7) RETURNING id`,
    [partnerId, b.date, b.category, String(b.label || '').trim() || null, amount, b.paidBy, email],
  )
  return NextResponse.json({ id: r.rows[0].id })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const partnerId = Number((await params).id)
  const expenseId = Number(req.nextUrl.searchParams.get('expenseId'))
  await pool.query(`DELETE FROM "PartnerExpense" WHERE id = $1 AND "partnerId" = $2`, [expenseId, partnerId])
  return NextResponse.json({ ok: true })
}
