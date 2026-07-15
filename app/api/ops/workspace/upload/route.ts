import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * POST /api/ops/workspace/upload  (multipart, field "file")  →  { url }
 *
 * Stores a workspace attachment in Postgres (WorkspaceFile) and returns a URL that
 * BlockNote uses for the image/file block. Founder-gated. 100% free (no external storage).
 */
export const dynamic = 'force-dynamic'
const MAX_BYTES = 15 * 1024 * 1024 // 15 MB

export async function POST(req: NextRequest) {
  const s = await getServerSession(authOptions)
  if (!s?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Aucun fichier' }, { status: 400 })
    const buf = Buffer.from(await file.arrayBuffer())
    if (buf.length === 0) return NextResponse.json({ error: 'Fichier vide' }, { status: 400 })
    if (buf.length > MAX_BYTES) return NextResponse.json({ error: 'Fichier trop lourd (max 15 Mo)' }, { status: 413 })
    const r = await pool.query(
      `INSERT INTO "WorkspaceFile" (name, mime, size, data, "createdBy") VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [file.name || 'fichier', file.type || 'application/octet-stream', buf.length, buf, s.user.email]
    )
    return NextResponse.json({ url: `/api/ops/workspace/file/${r.rows[0].id}` })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error'
    return NextResponse.json({ error: 'Échec upload', details: message }, { status: 500 })
  }
}
