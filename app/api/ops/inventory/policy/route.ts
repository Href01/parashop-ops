import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * Reorder policy — the knobs behind the advanced reorder recommendation:
 *  - targetDays: how many days of stock to hold when reordering (coverage target)
 *  - leadDefault: default supplier lead time (order → received), in days
 *  - leadTimes: per-supplier overrides { "Salerm Cosmetics": 3, … }
 *
 * GET returns the policy; PUT updates it. Accepts either a full leadTimes map or a
 * single { supplier, leadTime } to merge (used by the supplier modal).
 */
async function guard() {
  const session = await getServerSession(authOptions)
  return !!session?.user?.email
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const r = await pool.query(`SELECT key, value FROM "AppSetting" WHERE key IN ('reorder_target_days','reorder_lead_time_default','reorder_lead_times')`)
  const m = new Map(r.rows.map((x) => [x.key, x.value]))
  let leadTimes: Record<string, number> = {}
  try { leadTimes = JSON.parse(m.get('reorder_lead_times') || '{}') } catch { /* ignore */ }
  return NextResponse.json({
    targetDays: parseInt(m.get('reorder_target_days') || '15') || 15,
    leadDefault: parseInt(m.get('reorder_lead_time_default') || '5') || 5,
    leadTimes,
  })
}

async function setSetting(key: string, value: string) {
  await pool.query(
    `INSERT INTO "AppSetting" (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
    [key, value]
  )
}

export async function PUT(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const b = await req.json()
    if (b.targetDays !== undefined) {
      const v = Math.max(1, Math.min(365, Math.trunc(Number(b.targetDays)) || 15))
      await setSetting('reorder_target_days', String(v))
    }
    if (b.leadDefault !== undefined) {
      const v = Math.max(1, Math.min(120, Math.trunc(Number(b.leadDefault)) || 5))
      await setSetting('reorder_lead_time_default', String(v))
    }
    // Merge a single supplier lead time, or replace the whole map.
    if (b.supplier || b.leadTimes) {
      const cur = await pool.query(`SELECT value FROM "AppSetting" WHERE key = 'reorder_lead_times'`)
      let map: Record<string, number> = {}
      try { map = JSON.parse(cur.rows[0]?.value || '{}') } catch { /* ignore */ }
      if (b.leadTimes && typeof b.leadTimes === 'object') map = b.leadTimes
      if (b.supplier) {
        const days = Math.trunc(Number(b.leadTime))
        if (Number.isFinite(days) && days > 0) map[b.supplier] = Math.min(120, days)
        else delete map[b.supplier]
      }
      await setSetting('reorder_lead_times', JSON.stringify(map))
    }
    // Recommendations feed availability/urgency the storefront doesn't need, but the
    // supplier-backed buffer might change reorder decisions — no site revalidate here.
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error'
    return NextResponse.json({ error: 'Failed', details: message }, { status: 500 })
  }
}
