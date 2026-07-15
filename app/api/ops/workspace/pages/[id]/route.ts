import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * PATCH → update a page { title?, icon?, parentId?, archived? }.
 * DELETE → remove the page + its collaborative doc (WorkspaceDoc name = page:<id>);
 *          children cascade via the parentId FK.
 */
export const dynamic = 'force-dynamic'

async function guard() {
  const s = await getServerSession(authOptions)
  return !!s?.user?.email
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const pid = Number(id)
  if (!Number.isInteger(pid)) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  const b = await req.json().catch(() => ({}))
  const sets: string[] = []
  const vals: unknown[] = []
  let i = 1
  if (typeof b.title === 'string') { sets.push(`title = $${i++}`); vals.push(b.title.trim() || 'Sans titre') }
  if (typeof b.icon === 'string') { sets.push(`icon = $${i++}`); vals.push(b.icon) }
  if (b.parentId === null || Number.isInteger(b.parentId)) { sets.push(`"parentId" = $${i++}`); vals.push(b.parentId ?? null) }
  if (typeof b.archived === 'boolean') { sets.push(`archived = $${i++}`); vals.push(b.archived) }
  if (sets.length === 0) return NextResponse.json({ error: 'rien à modifier' }, { status: 400 })
  sets.push(`"updatedAt" = now()`)
  vals.push(pid)
  const r = await pool.query(
    `UPDATE "WorkspacePage" SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, title, icon, "parentId", "updatedAt"`,
    vals
  )
  if (r.rows.length === 0) return NextResponse.json({ error: 'introuvable' }, { status: 404 })
  return NextResponse.json({ page: r.rows[0] })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const pid = Number(id)
  if (!Number.isInteger(pid)) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  // Collect this page + all descendants so we can drop their collaborative docs too.
  const ids = await pool.query(
    `WITH RECURSIVE tree AS (
       SELECT id FROM "WorkspacePage" WHERE id = $1
       UNION ALL SELECT p.id FROM "WorkspacePage" p JOIN tree t ON p."parentId" = t.id
     ) SELECT id FROM tree`,
    [pid]
  )
  const allIds: number[] = ids.rows.map((x) => x.id)
  await pool.query(`DELETE FROM "WorkspaceDoc" WHERE name = ANY($1)`, [allIds.map((x) => `page:${x}`)])
  await pool.query(`DELETE FROM "WorkspacePage" WHERE id = $1`, [pid]) // children cascade
  return NextResponse.json({ ok: true, deleted: allIds.length })
}
