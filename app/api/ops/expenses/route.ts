import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * Operating expenses (packaging, cartons, external ads, misc) + the packaging
 * per-parcel rate. These feed the dashboard "Résultat de la période":
 *  - the logged expenses are the real cash-out on the Trésorerie side,
 *  - the packaging rate is the accrual emballage line on the Rentabilité side.
 *
 * GET  ?from=YYYY-MM-DD&to=YYYY-MM-DD (or ?days=30) → { expenses, summary, packagingRate }
 * POST { date, category, label, amount }            → add an expense
 * PUT  { packagingRate }                            → set the per-parcel rate
 */
const CATEGORIES = ['Emballage', 'Pub', 'Livraison', 'Salaire', 'Loyer', 'Divers']
const reDate = /^\d{4}-\d{2}-\d{2}$/

async function requireUser() {
  const session = await getServerSession(authOptions)
  return session?.user?.email || null
}

export async function GET(request: NextRequest) {
  try {
    if (!(await requireUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const sp = new URL(request.url).searchParams
    const from = reDate.test(sp.get('from') || '') ? sp.get('from')! : null
    const to = reDate.test(sp.get('to') || '') ? sp.get('to')! : null

    const where = from && to ? `"date" >= $1::date AND "date" <= $2::date` : `"date" >= (CURRENT_DATE - ($1 || ' days')::interval)`
    const params = from && to ? [from, to] : [String(Math.min(3650, Math.max(1, parseInt(sp.get('days') || '30'))))]

    const [rows, sum, rate] = await Promise.all([
      pool.query(
        `SELECT id, to_char("date",'YYYY-MM-DD') AS date, category, label, amount::float AS amount, "performedBy", "createdAt"
         FROM "OperatingExpense" WHERE ${where} ORDER BY "date" DESC, id DESC LIMIT 100`,
        params
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount),0)::float AS total, category, COUNT(*)::int AS n
         FROM "OperatingExpense" WHERE ${where} GROUP BY category`,
        params
      ),
      pool.query(`SELECT value FROM "AppSetting" WHERE key = 'packaging_cost_per_parcel'`),
    ])

    const total = sum.rows.reduce((s, r) => s + Number(r.total), 0)
    return NextResponse.json({
      expenses: rows.rows,
      summary: { total, byCategory: sum.rows.map((r) => ({ category: r.category, total: Number(r.total), n: r.n })) },
      packagingRate: Number(rate.rows[0]?.value || 0),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur'
    console.error('GET expenses error:', error)
    return NextResponse.json({ error: 'Failed to fetch expenses', details: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const email = await requireUser()
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json()
    const amount = parseFloat(body.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Montant invalide' }, { status: 400 })
    }
    const date = reDate.test(body.date || '') ? body.date : new Date().toISOString().slice(0, 10)
    const category = CATEGORIES.includes(body.category) ? body.category : 'Divers'
    const result = await pool.query(
      `INSERT INTO "OperatingExpense" ("date", category, label, amount, "performedBy")
       VALUES ($1::date, $2, $3, $4, $5) RETURNING id`,
      [date, category, (body.label || '').trim() || null, amount, email]
    )
    return NextResponse.json({ success: true, id: result.rows[0].id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur'
    console.error('POST expense error:', error)
    return NextResponse.json({ error: 'Failed to add expense', details: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!(await requireUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json()
    const rate = parseFloat(body.packagingRate)
    if (!Number.isFinite(rate) || rate < 0) {
      return NextResponse.json({ error: 'Taux invalide' }, { status: 400 })
    }
    await pool.query(
      `INSERT INTO "AppSetting" (key, value) VALUES ('packaging_cost_per_parcel', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [String(rate)]
    )
    return NextResponse.json({ success: true, packagingRate: rate })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur'
    console.error('PUT packaging rate error:', error)
    return NextResponse.json({ error: 'Failed to set rate', details: message }, { status: 500 })
  }
}
