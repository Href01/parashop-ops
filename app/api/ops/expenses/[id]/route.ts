import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/** DELETE /api/ops/expenses/[id] — remove a logged operating expense. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    const expenseId = parseInt(id)
    if (!Number.isFinite(expenseId)) return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
    await pool.query('DELETE FROM "OperatingExpense" WHERE id = $1', [expenseId])
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur'
    console.error('DELETE expense error:', error)
    return NextResponse.json({ error: 'Échec de la suppression', details: message }, { status: 500 })
  }
}
