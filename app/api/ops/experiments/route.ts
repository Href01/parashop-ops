import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'

/** Growth experiments — GET (list) / POST (create). Backed by "GrowthExperiment". */

export const EXP_STATUSES = ['PLANNED', 'RUNNING', 'WON', 'LOST', 'PAUSED'] as const

export function normStatus(v: unknown): string {
  const s = typeof v === 'string' ? v.trim().toUpperCase().replace(/[\s-]+/g, '_') : ''
  return (EXP_STATUSES as readonly string[]).includes(s) ? s : 'PLANNED'
}

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
      `SELECT id, name, hypothesis, channel, "successMetric", result, status, learnings,
              to_char("startDate", 'YYYY-MM-DD') AS "startDate",
              to_char("endDate", 'YYYY-MM-DD') AS "endDate",
              budget, "createdAt", "updatedAt"
       FROM "GrowthExperiment"
       ORDER BY CASE status WHEN 'RUNNING' THEN 0 WHEN 'PLANNED' THEN 1 WHEN 'PAUSED' THEN 2 ELSE 3 END, "createdAt" DESC LIMIT 100`
    )
    return NextResponse.json({ experiments: r.rows })
  } catch (e) {
    console.error('[Experiments] GET', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await guard()
    if (!g.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: g.status })
    const b = await req.json().catch(() => ({}))
    const name = typeof b.name === 'string' ? b.name.trim() : ''
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
    const hypothesis = typeof b.hypothesis === 'string' ? b.hypothesis.slice(0, 2000) : null
    const channel = typeof b.channel === 'string' && b.channel.trim() ? b.channel.trim().slice(0, 60) : null
    const successMetric = typeof b.successMetric === 'string' ? b.successMetric.slice(0, 200) : null
    const status = normStatus(b.status)
    const r = await pool.query(
      `INSERT INTO "GrowthExperiment" (name, hypothesis, channel, "successMetric", status, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
       RETURNING id, name, hypothesis, channel, "successMetric", result, status, learnings,
                 to_char("startDate", 'YYYY-MM-DD') AS "startDate",
                 to_char("endDate", 'YYYY-MM-DD') AS "endDate",
                 budget, "createdAt", "updatedAt"`,
      [name, hypothesis, channel, successMetric, status]
    )
    return NextResponse.json({ experiment: r.rows[0] }, { status: 201 })
  } catch (e) {
    console.error('[Experiments] POST', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
