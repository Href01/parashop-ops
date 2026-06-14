import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'

async function guard() {
  const session = await getServerSession(authOptions)
  return !!session?.user?.email && isFounder(session.user.email)
}

/** Parse "Milk shake oil x3 + spray conditioner x2" → [{rawName, qty}]. */
function parseProductsText(text: string | null): Array<{ rawName: string; qty: number }> {
  if (!text) return []
  return text
    .split(/[+\n;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/(?:x|\*|×)\s*(\d+)|^\s*(\d+)\s*(?:x|\*|×)\s+/i)
      let qty = 1
      let name = part
      if (m) {
        qty = parseInt(m[1] || m[2], 10) || 1
        name = part.replace(m[0], ' ').trim()
      }
      return { rawName: name.replace(/\s{2,}/g, ' ').trim(), qty }
    })
    .filter((x) => x.rawName.length > 0)
}

/** GET — staging row + product suggestions (from the Sendit text) + catalog. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = Number((await params).id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const rowRes = await pool.query(`SELECT * FROM "SenditStaging" WHERE id = $1`, [id])
  if (rowRes.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const row = rowRes.rows[0]

  // Suggest catalog products per parsed line (fuzzy by longest token)
  const parsed = parseProductsText(row.productsText)
  const suggestions: Array<{ rawName: string; qty: number; candidates: any[] }> = []
  for (const line of parsed) {
    const tokens = line.rawName.split(/\s+/).filter((t) => t.length >= 3).sort((a, b) => b.length - a.length).slice(0, 3)
    let candidates: any[] = []
    if (tokens.length > 0) {
      const conds = tokens.map((_, i) => `(p.name ILIKE $${i + 1} OR p.brand ILIKE $${i + 1})`).join(' OR ')
      const vals = tokens.map((t) => `%${t}%`)
      const r = await pool.query(
        `SELECT p.id, p.name, p.brand, p.price::float AS price FROM "Product" p WHERE ${conds} LIMIT 4`,
        vals
      )
      candidates = r.rows
    }
    suggestions.push({ rawName: line.rawName, qty: line.qty, candidates })
  }

  const catalog = await pool.query(`SELECT id, name, brand, price::float AS price FROM "Product" WHERE active = true ORDER BY name LIMIT 500`)

  return NextResponse.json({ row, suggestions, catalog: catalog.rows })
}

/** PATCH { assignedProducts } — save the product assignment on the staging row. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = Number((await params).id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const b = await req.json().catch(() => ({}))
  if (!Array.isArray(b.assignedProducts)) return NextResponse.json({ error: 'assignedProducts requis' }, { status: 400 })
  const clean = b.assignedProducts
    .filter((x: any) => Number.isInteger(x.productId) && Number(x.quantity) > 0)
    .map((x: any) => ({ productId: x.productId, quantity: Math.round(Number(x.quantity)), price: Number(x.price) || 0 }))

  const r = await pool.query(
    `UPDATE "SenditStaging" SET "assignedProducts" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2 AND promoted = false RETURNING id`,
    [JSON.stringify(clean), id]
  )
  if (r.rows.length === 0) return NextResponse.json({ error: 'introuvable ou déjà promu' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
