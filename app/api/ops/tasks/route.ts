import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'

/**
 * BOS Tasks — persistent work items (ClickUp-style).
 * Backed by the existing "Task" table.
 *
 * GET  /api/ops/tasks?status=&owner=
 * POST /api/ops/tasks   { title, owner?, status?, priority?, dueDate?, notes?, linkedType?, linkedId? }
 */

export const STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'] as const
export const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const

function norm(v: unknown, allowed: readonly string[], fallback: string): string {
  const s = typeof v === 'string' ? v.trim().toUpperCase().replace(/[\s-]+/g, '_') : ''
  return allowed.includes(s) ? s : fallback
}

async function guard() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return { ok: false as const, status: 401 }
  if (!isFounder(session.user.email)) return { ok: false as const, status: 403 }
  return { ok: true as const }
}

export async function GET(req: NextRequest) {
  try {
    const g = await guard()
    if (!g.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: g.status })

    const sp = req.nextUrl.searchParams
    const conditions: string[] = []
    const params: unknown[] = []

    const status = sp.get('status')
    if (status && (STATUSES as readonly string[]).includes(status.toUpperCase())) {
      params.push(status.toUpperCase()); conditions.push(`status = $${params.length}`)
    }
    const owner = sp.get('owner')
    if (owner) { params.push(owner); conditions.push(`owner = $${params.length}`) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const result = await pool.query(
      `SELECT id, title, owner, status, priority, to_char("dueDate", 'YYYY-MM-DD') AS "dueDate", "linkedType", "linkedId", notes, "createdAt", "updatedAt"
       FROM "Task" ${where}
       ORDER BY
         CASE priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
         "dueDate" NULLS LAST, "createdAt" DESC`,
      params
    )
    return NextResponse.json({ tasks: result.rows })
  } catch (error) {
    console.error('[Tasks] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await guard()
    if (!g.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: g.status })

    const body = await req.json().catch(() => ({}))
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

    const owner = typeof body.owner === 'string' && body.owner.trim() ? body.owner.trim().slice(0, 60) : null
    const status = norm(body.status, STATUSES, 'TODO')
    const priority = norm(body.priority, PRIORITIES, 'MEDIUM')
    const dueDate = typeof body.dueDate === 'string' && body.dueDate ? body.dueDate : null
    const notes = typeof body.notes === 'string' ? body.notes.slice(0, 2000) : null
    const linkedType = typeof body.linkedType === 'string' ? body.linkedType.slice(0, 40) : null
    const linkedId = Number.isInteger(body.linkedId) ? body.linkedId : null

    const result = await pool.query(
      `INSERT INTO "Task" (title, owner, status, priority, "dueDate", notes, "linkedType", "linkedId", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW(), NOW())
       RETURNING id, title, owner, status, priority, to_char("dueDate", 'YYYY-MM-DD') AS "dueDate", "linkedType", "linkedId", notes, "createdAt", "updatedAt"`,
      [title, owner, status, priority, dueDate, notes, linkedType, linkedId]
    )
    return NextResponse.json({ task: result.rows[0] }, { status: 201 })
  } catch (error) {
    console.error('[Tasks] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
