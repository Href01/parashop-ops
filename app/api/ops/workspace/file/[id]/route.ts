import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * GET /api/ops/workspace/file/[id] → the stored attachment, served inline so the
 * browser previews it (image, PDF…). Founder-gated (same-origin <img>/link requests
 * carry the session cookie). Immutable content → long cache.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await getServerSession(authOptions)
  if (!s?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const pid = Number(id)
  if (!Number.isInteger(pid)) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  const r = await pool.query('SELECT name, mime, data FROM "WorkspaceFile" WHERE id = $1', [pid])
  if (r.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const { name, mime, data } = r.rows[0]
  const safeName = String(name || 'fichier').replace(/["\\\r\n]/g, '')
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': mime || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}
