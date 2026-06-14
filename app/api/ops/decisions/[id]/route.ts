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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await guard()
    if (!g.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: g.status })
    const id = Number((await params).id)
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

    const b = await req.json().catch(() => ({}))
    const sets: string[] = []
    const values: unknown[] = []
    const add = (col: string, val: unknown) => { values.push(val); sets.push(`"${col}" = $${values.length}`) }

    if (typeof b.title === 'string' && b.title.trim()) add('title', b.title.trim())
    if ('decision' in b) add('decision', typeof b.decision === 'string' ? b.decision.slice(0, 2000) : '') // column is NOT NULL
    if ('context' in b) add('context', typeof b.context === 'string' ? b.context.slice(0, 2000) : null)
    if ('owner' in b) add('owner', typeof b.owner === 'string' && b.owner.trim() ? b.owner.trim().slice(0, 60) : null)
    if ('decisionDate' in b) add('decisionDate', typeof b.decisionDate === 'string' && b.decisionDate ? b.decisionDate : null)
    if ('linkedType' in b) add('linkedType', typeof b.linkedType === 'string' && b.linkedType.trim() ? b.linkedType.trim().slice(0, 40) : null)
    if ('linkedId' in b) add('linkedId', Number.isInteger(b.linkedId) ? b.linkedId : null)

    if (sets.length === 0) return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
    values.push(id)
    const r = await pool.query(
      `UPDATE "DecisionLog" SET ${sets.join(', ')} WHERE id = $${values.length}
       RETURNING id, title, context, decision, owner, to_char("decisionDate", 'YYYY-MM-DD') AS "decisionDate", "linkedType", "linkedId", "createdAt"`,
      values
    )
    if (r.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ decision: r.rows[0] })
  } catch (e) {
    console.error('[Decisions] PATCH', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
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
