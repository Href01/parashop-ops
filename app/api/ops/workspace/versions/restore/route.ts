import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * Restore a page to a saved version.
 * We first snapshot the CURRENT state (safety, label "avant restauration"), then write the
 * chosen version's bytes back into WorkspaceDoc so the realtime server re-hydrates from it.
 *
 * ⚠️ The Hocuspocus server keeps a doc in memory while ≥1 client is connected and only
 * re-reads WorkspaceDoc when the room is empty and re-opened. So for a restore to stick,
 * everyone must CLOSE the page, then reopen it. The UI tells the user this.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const s = await getServerSession(authOptions)
  const email = s?.user?.email
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const pageId = Number(b.pageId)
  const versionId = Number(b.versionId)
  if (!Number.isInteger(pageId) || !Number.isInteger(versionId)) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  const name = `page:${pageId}`

  const v = await pool.query(`SELECT data FROM "WorkspaceDocVersion" WHERE id = $1 AND name = $2`, [versionId, name])
  if (v.rows.length === 0) return NextResponse.json({ error: 'introuvable' }, { status: 404 })

  // Back up the current state before overwriting it.
  const cur = await pool.query(`SELECT data FROM "WorkspaceDoc" WHERE name = $1`, [name])
  if (cur.rows.length > 0 && cur.rows[0].data) {
    await pool.query(
      `INSERT INTO "WorkspaceDocVersion" (name, data, label, "createdBy") VALUES ($1, $2, $3, $4)`,
      [name, cur.rows[0].data, 'Avant restauration', email]
    )
  }

  await pool.query(
    `INSERT INTO "WorkspaceDoc" (name, data, "updatedAt") VALUES ($1, $2, now())
     ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, "updatedAt" = now()`,
    [name, v.rows[0].data]
  )
  return NextResponse.json({ ok: true })
}
