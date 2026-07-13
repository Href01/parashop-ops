import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/** PATCH /api/ops/leads/[id] — mark a lead contacted. DELETE — remove it. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    const leadId = parseInt(id)
    if (!Number.isFinite(leadId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    const body = await req.json().catch(() => ({}))
    await pool.query(`UPDATE "AbandonedCheckout" SET contacted = $1, "updatedAt" = NOW() WHERE id = $2`, [body.contacted !== false, leadId])
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error'
    return NextResponse.json({ error: 'Failed', details: message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    const leadId = parseInt(id)
    if (!Number.isFinite(leadId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    await pool.query(`DELETE FROM "AbandonedCheckout" WHERE id = $1`, [leadId])
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error'
    return NextResponse.json({ error: 'Failed', details: message }, { status: 500 })
  }
}
