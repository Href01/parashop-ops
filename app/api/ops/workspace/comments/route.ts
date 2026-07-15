import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * Page comments — a thread per workspace page (Postgres, not in the Yjs doc → safe).
 * GET ?pageId=  → comments (oldest first)
 * POST { pageId, body } → add
 * DELETE ?id=   → remove (author only)
 */
export const dynamic = 'force-dynamic'

async function me() {
  const s = await getServerSession(authOptions)
  return s?.user?.email || null
}

export async function GET(req: NextRequest) {
  const email = await me()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const pageId = Number(req.nextUrl.searchParams.get('pageId'))
  if (!Number.isInteger(pageId)) return NextResponse.json({ comments: [] })
  const r = await pool.query(
    `SELECT id, "authorEmail", "authorName", body, "createdAt" FROM "WorkspaceComment"
     WHERE "pageId" = $1 ORDER BY "createdAt" ASC LIMIT 300`,
    [pageId]
  )
  return NextResponse.json(
    { comments: r.rows.map((c) => ({ ...c, self: c.authorEmail === email })) },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function POST(req: NextRequest) {
  const email = await me()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const s = await getServerSession(authOptions)
  const name = (s?.user?.name || email.split('@')[0] || 'Fondateur').trim()
  const b = await req.json().catch(() => ({}))
  const pageId = Number(b.pageId)
  const body = String(b.body || '').trim().slice(0, 4000)
  if (!Number.isInteger(pageId) || !body) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  const r = await pool.query(
    `INSERT INTO "WorkspaceComment" ("pageId", "authorEmail", "authorName", body) VALUES ($1, $2, $3, $4)
     RETURNING id, "authorEmail", "authorName", body, "createdAt"`,
    [pageId, email, name, body]
  )
  return NextResponse.json({ comment: { ...r.rows[0], self: true } })
}

export async function DELETE(req: NextRequest) {
  const email = await me()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  await pool.query(`DELETE FROM "WorkspaceComment" WHERE id = $1 AND "authorEmail" = $2`, [id, email])
  return NextResponse.json({ ok: true })
}
