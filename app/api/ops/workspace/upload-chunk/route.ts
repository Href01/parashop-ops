import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * Chunked upload — works around Vercel's ~4.5 MB serverless request-body limit so big
 * catalogue PDFs / spreadsheets can be stored (still 100% free, in Postgres BYTEA).
 *
 * The client slices the file into < 4 MB parts and POSTs them in order (multipart):
 *   fields: index, total, name, mime, chunk (Blob), and id (from the first response).
 *   - index 0  → INSERT a WorkspaceFile row with the first chunk → returns { id }.
 *   - index >0 → append: SET data = data || chunk.
 *   - last chunk (index === total-1) → also returns { url }.
 */
export const dynamic = 'force-dynamic'
const MAX_BYTES = 25 * 1024 * 1024 // 25 MB total (assembled)

export async function POST(req: NextRequest) {
  const s = await getServerSession(authOptions)
  if (!s?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const form = await req.formData()
    const chunk = form.get('chunk')
    if (!(chunk instanceof File)) return NextResponse.json({ error: 'Aucun chunk' }, { status: 400 })
    const index = Number(form.get('index'))
    const total = Number(form.get('total'))
    const name = String(form.get('name') || 'fichier')
    const mime = String(form.get('mime') || 'application/octet-stream')
    const idRaw = form.get('id')
    const buf = Buffer.from(await chunk.arrayBuffer())

    if (index === 0) {
      const r = await pool.query(
        `INSERT INTO "WorkspaceFile" (name, mime, size, data, "createdBy") VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [name, mime, buf.length, buf, s.user.email]
      )
      const id = r.rows[0].id
      const url = total <= 1 ? `/api/ops/workspace/file/${id}` : undefined
      return NextResponse.json({ id, url })
    }

    const id = Number(idRaw)
    if (!Number.isInteger(id)) return NextResponse.json({ error: 'id manquant' }, { status: 400 })
    // Append this chunk; guard the assembled size.
    const r = await pool.query(
      `UPDATE "WorkspaceFile" SET data = data || $1, size = size + $2
       WHERE id = $3 AND "createdBy" = $4 AND size + $2 <= $5 RETURNING id, size`,
      [buf, buf.length, id, s.user.email, MAX_BYTES]
    )
    if (r.rows.length === 0) {
      await pool.query(`DELETE FROM "WorkspaceFile" WHERE id = $1 AND "createdBy" = $2`, [id, s.user.email]).catch(() => {})
      return NextResponse.json({ error: 'Fichier trop lourd (max 25 Mo)' }, { status: 413 })
    }
    const url = index >= total - 1 ? `/api/ops/workspace/file/${id}` : undefined
    return NextResponse.json({ id, url })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error'
    return NextResponse.json({ error: 'Échec upload', details: message }, { status: 500 })
  }
}
