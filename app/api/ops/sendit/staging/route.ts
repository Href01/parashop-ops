import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'
import { cached, bustCache } from '@/lib/ops-cache'
import { runSenditSync } from '@/lib/sendit-orchestrator'
import { pullSenditStaging, syncMatchedSenditStaging } from '@/lib/sendit-staging-sync'

async function guard() {
  const session = await getServerSession(authOptions)
  return !!session?.user?.email && isFounder(session.user.email)
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await cached('sendit-staging', 60 * 1000, async () => {
  const rows = await pool.query(`
    SELECT id, code, "senditStatus", name, phone, city, amount::float AS amount, fee::float AS fee,
           "productsText", reference, "senditCreatedAt", "matchedOrderId", "matchedUserId",
           "matchedCustomerName", "assignedProducts", "paymentMethod",
           "paidAmount"::float AS "paidAmount", "paidAt", "paymentReference", state, promoted,
           "promotedOrderId", "lastActionAt", "pulledAt"
    FROM "SenditStaging"
    WHERE state IS DISTINCT FROM 'ignored'
    ORDER BY promoted ASC, "senditCreatedAt" DESC NULLS LAST
  `)
  const counts = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE state IS DISTINCT FROM 'ignored')::int AS total,
      COUNT(*) FILTER (WHERE state = 'sendit_only' AND NOT promoted)::int AS sendit_only,
      COUNT(*) FILTER (WHERE state = 'matched')::int AS matched,
      COUNT(*) FILTER (WHERE state = 'mismatch')::int AS mismatch,
      COUNT(*) FILTER (WHERE promoted)::int AS promoted,
      COUNT(*) FILTER (WHERE state = 'ignored')::int AS ignored,
      COUNT(*) FILTER (
        WHERE "assignedProducts" IS NOT NULL
          AND jsonb_array_length("assignedProducts") > 0
          AND NOT promoted
      )::int AS ready
    FROM "SenditStaging"
  `)

  return { rows: rows.rows, counts: counts.rows[0] }
  })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))

  // Ignore / restore parcels that belong to a third party sharing the Sendit account
  // (e.g. the founder's brother's other business). Only allowed on non-promoted rows so
  // official BOS orders are never touched. 'ignored' is preserved across pulls.
  if (body.action === 'ignore' || body.action === 'unignore') {
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : []
    if (ids.length === 0) return NextResponse.json({ error: 'Aucun colis sélectionné' }, { status: 400 })
    if (body.action === 'ignore') {
      const r = await pool.query(
        `UPDATE "SenditStaging" SET state = 'ignored', "updatedAt" = NOW()
         WHERE id = ANY($1) AND promoted = false AND state <> 'ignored'`,
        [ids]
      )
      return NextResponse.json({ ok: true, ignored: r.rowCount })
    }
    // unignore → back to sendit_only (unmatched) so it can be re-processed on next pull
    const r = await pool.query(
      `UPDATE "SenditStaging" SET state = 'sendit_only', "updatedAt" = NOW()
       WHERE id = ANY($1) AND state = 'ignored'`,
      [ids]
    )
    return NextResponse.json({ ok: true, restored: r.rowCount })
  }

  if (body.action === 'run-sync') {
    const result = await runSenditSync({ trigger: 'manual', force: true })
    return NextResponse.json(result, { status: result.ok ? 200 : 500 })
  }

  if (body.action === 'sync-matched') {
    try {
      const result = await syncMatchedSenditStaging()
      bustCache('orders:'); bustCache('dashboard-stats:'); bustCache('sendit-staging')
      return NextResponse.json({ ok: result.failed.length === 0, ...result }, { status: result.failed.length ? 500 : 200 })
    } catch (error) {
      console.error('[Sendit] sync-matched', error)
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 })
    }
  }

  if (body.action !== 'pull') return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })

  try {
    const pulled = await pullSenditStaging()
    bustCache('sendit-staging')
    return NextResponse.json(pulled)
  } catch (error) {
    console.error('[Sendit] staging pull', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 })
  }
}
