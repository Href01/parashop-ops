import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'

async function guard() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return { ok: false as const, status: 401 }
  if (!isFounder(session.user.email)) return { ok: false as const, status: 403 }
  return { ok: true as const }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await guard()
    if (!g.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: g.status })
    const id = Number((await params).id)
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    const r = await pool.query(`DELETE FROM "DecisionLog" WHERE id = $1 RETURNING id`, [id])
    if (r.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[Decisions] DELETE', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
