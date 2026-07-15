import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * Workspace pages (Notion-style tree).
 * GET  → all non-archived pages (id, title, icon, parentId, updatedAt).
 * POST → create a page { title?, icon?, parentId? } → the new page.
 */
export const dynamic = 'force-dynamic'

async function guard() {
  const s = await getServerSession(authOptions)
  return s?.user?.email || null
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const r = await pool.query(
    `SELECT id, title, icon, "parentId", "updatedAt" FROM "WorkspacePage"
     WHERE archived = false ORDER BY "createdAt" ASC`
  )
  return NextResponse.json({ pages: r.rows }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const email = await guard()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const title = (typeof b.title === 'string' && b.title.trim()) || 'Sans titre'
  const icon = (typeof b.icon === 'string' && b.icon) || '📄'
  const parentId = Number.isInteger(b.parentId) ? b.parentId : null
  const r = await pool.query(
    `INSERT INTO "WorkspacePage" (title, icon, "parentId", "createdBy") VALUES ($1, $2, $3, $4)
     RETURNING id, title, icon, "parentId", "updatedAt"`,
    [title, icon, parentId, email]
  )
  return NextResponse.json({ page: r.rows[0] })
}
