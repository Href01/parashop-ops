import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'
import { EXP_STATUSES } from '../route'

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

    if (typeof b.status === 'string') {
      const s = b.status.trim().toUpperCase().replace(/[\s-]+/g, '_')
      if (!(EXP_STATUSES as readonly string[]).includes(s)) return NextResponse.json({ error: 'invalid status' }, { status: 400 })
      add('status', s)
    }
    if ('result' in b) add('result', typeof b.result === 'string' ? b.result.slice(0, 2000) : null)
    if ('learnings' in b) add('learnings', typeof b.learnings === 'string' ? b.learnings.slice(0, 2000) : null)
    if (typeof b.name === 'string' && b.name.trim()) add('name', b.name.trim())
    if ('hypothesis' in b) add('hypothesis', typeof b.hypothesis === 'string' ? b.hypothesis.slice(0, 2000) : null)
    if ('channel' in b) add('channel', typeof b.channel === 'string' && b.channel.trim() ? b.channel.trim().slice(0, 60) : null)
    if ('successMetric' in b) add('successMetric', typeof b.successMetric === 'string' ? b.successMetric.slice(0, 200) : null)
    if ('budget' in b) {
      const n = Number(b.budget)
      add('budget', Number.isFinite(n) && n > 0 ? n : null)
    }
    if ('startDate' in b) add('startDate', typeof b.startDate === 'string' && b.startDate ? b.startDate : null)
    if ('endDate' in b) add('endDate', typeof b.endDate === 'string' && b.endDate ? b.endDate : null)

    if (sets.length === 0) return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
    values.push(id)
    const r = await pool.query(
      `UPDATE "GrowthExperiment" SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $${values.length}
       RETURNING id, name, hypothesis, channel, "successMetric", result, status, learnings,
                 to_char("startDate", 'YYYY-MM-DD') AS "startDate",
                 to_char("endDate", 'YYYY-MM-DD') AS "endDate",
                 budget, "createdAt", "updatedAt"`,
      values
    )
    if (r.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ experiment: r.rows[0] })
  } catch (e) {
    console.error('[Experiments] PATCH', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await guard()
    if (!g.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: g.status })
    const id = Number((await params).id)
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    const r = await pool.query(`DELETE FROM "GrowthExperiment" WHERE id = $1 RETURNING id`, [id])
    if (r.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[Experiments] DELETE', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
