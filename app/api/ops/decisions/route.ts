import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'

/** Decision log — GET (list) / POST (create). Backed by "DecisionLog". */

async function guard() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return { ok: false as const, status: 401 }
  if (!isFounder(session.user.email)) return { ok: false as const, status: 403 }
  return { ok: true as const }
}

export async function GET() {
  try {
    const g = await guard()
    if (!g.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: g.status })
    const r = await pool.query(
      `SELECT id, title, context, decision, owner, "decisionDate", "createdAt"
       FROM "DecisionLog" ORDER BY "decisionDate" DESC NULLS LAST, "createdAt" DESC LIMIT 100`
    )
    return NextResponse.json({ decisions: r.rows })
  } catch (e) {
    console.error('[Decisions] GET', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await guard()
    if (!g.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: g.status })
    const b = await req.json().catch(() => ({}))
    const title = typeof b.title === 'string' ? b.title.trim() : ''
    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })
    const context = typeof b.context === 'string' ? b.context.slice(0, 2000) : null
    const decision = typeof b.decision === 'string' ? b.decision.slice(0, 2000) : null
    const owner = typeof b.owner === 'string' && b.owner.trim() ? b.owner.trim().slice(0, 60) : null
    const decisionDate = typeof b.decisionDate === 'string' && b.decisionDate ? b.decisionDate : new Date().toISOString().split('T')[0]
    const r = await pool.query(
      `INSERT INTO "DecisionLog" (title, context, decision, owner, "decisionDate", "createdAt")
       VALUES ($1,$2,$3,$4,$5,NOW())
       RETURNING id, title, context, decision, owner, "decisionDate", "createdAt"`,
      [title, context, decision, owner, decisionDate]
    )
    return NextResponse.json({ decision: r.rows[0] }, { status: 201 })
  } catch (e) {
    console.error('[Decisions] POST', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
