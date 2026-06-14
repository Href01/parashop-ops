import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'

const DEFAULT_WEEKLY_GOAL = 42000

async function guard() {
  const session = await getServerSession(authOptions)
  return !!session?.user?.email && isFounder(session.user.email)
}

export async function getWeeklyGoal(): Promise<number> {
  try {
    const r = await pool.query(`SELECT value FROM "AppSetting" WHERE key = 'weeklyGoal'`)
    const v = Number(r.rows[0]?.value)
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_WEEKLY_GOAL
  } catch {
    return DEFAULT_WEEKLY_GOAL
  }
}

/** GET — current weekly revenue goal. */
export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ weeklyGoal: await getWeeklyGoal() })
}

/** PUT { weeklyGoal } — set the weekly revenue goal manually. */
export async function PUT(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const goal = Math.round(Number(b.weeklyGoal))
  if (!Number.isFinite(goal) || goal < 0) return NextResponse.json({ error: 'Objectif invalide' }, { status: 400 })
  await pool.query(
    `INSERT INTO "AppSetting" (key, value, "updatedAt") VALUES ('weeklyGoal', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
    [String(goal)]
  )
  return NextResponse.json({ ok: true, weeklyGoal: goal })
}
