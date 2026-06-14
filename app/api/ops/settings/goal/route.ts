import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'

const DEFAULTS: Record<string, number> = { weeklyGoal: 42000, monthlyGoal: 180000 }

async function guard() {
  const session = await getServerSession(authOptions)
  return !!session?.user?.email && isFounder(session.user.email)
}

async function getGoal(key: string): Promise<number> {
  try {
    const r = await pool.query(`SELECT value FROM "AppSetting" WHERE key = $1`, [key])
    const v = Number(r.rows[0]?.value)
    return Number.isFinite(v) && v > 0 ? v : DEFAULTS[key]
  } catch {
    return DEFAULTS[key]
  }
}

export const getWeeklyGoal = () => getGoal('weeklyGoal')
export const getMonthlyGoal = () => getGoal('monthlyGoal')

async function setGoal(key: string, value: number) {
  await pool.query(
    `INSERT INTO "AppSetting" (key, value, "updatedAt") VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
    [key, String(value)]
  )
}

/** GET — current weekly + monthly revenue goals. */
export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ weeklyGoal: await getWeeklyGoal(), monthlyGoal: await getMonthlyGoal() })
}

/** PUT { weeklyGoal?, monthlyGoal? } — set either goal manually. */
export async function PUT(req: NextRequest) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  for (const key of ['weeklyGoal', 'monthlyGoal'] as const) {
    if (key in b) {
      const v = Math.round(Number(b[key]))
      if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: 'Objectif invalide' }, { status: 400 })
      await setGoal(key, v)
    }
  }
  return NextResponse.json({ ok: true, weeklyGoal: await getWeeklyGoal(), monthlyGoal: await getMonthlyGoal() })
}
