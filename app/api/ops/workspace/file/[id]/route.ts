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
  const bytes = new Uint8Array(data)
  // Stream the bytes (1 MB chunks) instead of returning one buffer — a buffered response
  // is capped at ~4.5 MB on Vercel, which would break big catalogue PDFs. Streaming isn't.
  const CHUNK = 1024 * 1024
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += CHUNK) controller.enqueue(bytes.subarray(i, i + CHUNK))
      controller.close()
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': mime || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}
