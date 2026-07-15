import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * Workspace presence — "who is on which page, right now". The client sends a heartbeat
 * (its current pageId) every few seconds; we upsert it and return everyone active in the
 * last 20s. Powers the live avatars in the sidebar.
 */
export const dynamic = 'force-dynamic'

const PALETTE = ['#E11D48', '#0C6B52', '#7C3AED', '#D97706', '#2563EB', '#DB2777', '#059669', '#4F46E5']
const colorFor = (k: string) => { let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0; return PALETTE[h % PALETTE.length] }

export async function POST(req: NextRequest) {
  const s = await getServerSession(authOptions)
  if (!s?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const email = s.user.email
  const name = (s.user.name || email.split('@')[0] || 'Fondateur').trim()
  const b = await req.json().catch(() => ({}))
  const pageId = Number.isInteger(b.pageId) ? b.pageId : null

  await pool.query(
    `INSERT INTO "WorkspacePresence" (email, name, color, "pageId", "lastSeen")
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (email) DO UPDATE SET name = $2, color = $3, "pageId" = $4, "lastSeen" = now()`,
    [email, name, colorFor(email), pageId]
  )
  const r = await pool.query(
    `SELECT email, name, color, "pageId" FROM "WorkspacePresence" WHERE "lastSeen" > now() - interval '20 seconds'`
  )
  return NextResponse.json(
    { presence: r.rows.map((x) => ({ ...x, self: x.email === email })) },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
