import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * Page version history (safety net / "break glass" recovery).
 * A version = a byte-for-byte copy of the Yjs doc state (WorkspaceDoc.data) at a moment.
 * GET  ?pageId=  → list versions (metadata, newest first)
 * POST { pageId, label? } → snapshot the current doc state
 * We keep the last 40 versions per page (auto-prune).
 */
export const dynamic = 'force-dynamic'
const MAX_KEEP = 40

async function me() {
  const s = await getServerSession(authOptions)
  return s?.user?.email || null
}

export async function GET(req: NextRequest) {
  if (!(await me())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const pageId = Number(req.nextUrl.searchParams.get('pageId'))
  if (!Number.isInteger(pageId)) return NextResponse.json({ versions: [] })
  const name = `page:${pageId}`
  const r = await pool.query(
    `SELECT id, label, "createdBy", "createdAt", octet_length(data) AS bytes
     FROM "WorkspaceDocVersion" WHERE name = $1 ORDER BY "createdAt" DESC LIMIT ${MAX_KEEP}`,
    [name]
  )
  return NextResponse.json({ versions: r.rows }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const email = await me()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const pageId = Number(b.pageId)
  if (!Number.isInteger(pageId)) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  const name = `page:${pageId}`
  const label = (typeof b.label === 'string' && b.label.trim().slice(0, 120)) || null
  // Copy the current live doc state into a version row.
  const cur = await pool.query(`SELECT data FROM "WorkspaceDoc" WHERE name = $1`, [name])
  if (cur.rows.length === 0 || !cur.rows[0].data) return NextResponse.json({ error: 'empty', message: 'Rien à enregistrer (page vide ou pas encore synchronisée).' }, { status: 400 })
  await pool.query(
    `INSERT INTO "WorkspaceDocVersion" (name, data, label, "createdBy") VALUES ($1, $2, $3, $4)`,
    [name, cur.rows[0].data, label, email]
  )
  // Prune older versions beyond MAX_KEEP.
  await pool.query(
    `DELETE FROM "WorkspaceDocVersion" WHERE name = $1 AND id NOT IN (
       SELECT id FROM "WorkspaceDocVersion" WHERE name = $1 ORDER BY "createdAt" DESC LIMIT ${MAX_KEEP}
     )`,
    [name]
  )
  return NextResponse.json({ ok: true })
}
