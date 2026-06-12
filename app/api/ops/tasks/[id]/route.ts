import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'
import { STATUSES, PRIORITIES } from '../route'

/**
 * PATCH /api/ops/tasks/[id]  — partial update (status, priority, owner, title, dueDate, notes)
 * DELETE /api/ops/tasks/[id]
 */

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

    const body = await req.json().catch(() => ({}))
    const sets: string[] = []
    const values: unknown[] = []
    const add = (col: string, val: unknown) => { values.push(val); sets.push(`"${col}" = $${values.length}`) }

    if (typeof body.title === 'string' && body.title.trim()) add('title', body.title.trim())
    if ('owner' in body) add('owner', typeof body.owner === 'string' && body.owner.trim() ? body.owner.trim().slice(0, 60) : null)
    if (typeof body.status === 'string') {
      const s = body.status.trim().toUpperCase().replace(/[\s-]+/g, '_')
      if (!(STATUSES as readonly string[]).includes(s)) return NextResponse.json({ error: 'invalid status' }, { status: 400 })
      add('status', s)
    }
    if (typeof body.priority === 'string') {
      const p = body.priority.trim().toUpperCase().replace(/[\s-]+/g, '_')
      if (!(PRIORITIES as readonly string[]).includes(p)) return NextResponse.json({ error: 'invalid priority' }, { status: 400 })
      add('priority', p)
    }
    if ('dueDate' in body) add('dueDate', typeof body.dueDate === 'string' && body.dueDate ? body.dueDate : null)
    if ('notes' in body) add('notes', typeof body.notes === 'string' ? body.notes.slice(0, 2000) : null)

    if (sets.length === 0) return NextResponse.json({ error: 'no fields to update' }, { status: 400 })

    values.push(id)
    const result = await pool.query(
      `UPDATE "Task" SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $${values.length}
       RETURNING id, title, owner, status, priority, "dueDate", "linkedType", "linkedId", notes, "createdAt", "updatedAt"`,
      values
    )
    if (result.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ task: result.rows[0] })
  } catch (error) {
    console.error('[Tasks] PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await guard()
    if (!g.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: g.status })

    const id = Number((await params).id)
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

    const result = await pool.query(`DELETE FROM "Task" WHERE id = $1 RETURNING id`, [id])
    if (result.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Tasks] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
