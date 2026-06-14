import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'

async function guard() {
  const session = await getServerSession(authOptions)
  return !!session?.user?.email && isFounder(session.user.email)
}

const STOP = new Set(['ml', 'les', 'des', 'pour', 'avec', 'sans', 'the', 'and', 'spray', 'creme', 'crème'])

/** Lowercase, strip accents, keep alphanumerics. */
function norm(s: string | null | undefined): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}
function tokenize(s: string): string[] {
  return norm(s).split(' ').filter((t) => t.length >= 3 && !STOP.has(t))
}

interface Cat { id: number; name: string; brand: string | null; price: number; costPrice?: number }
/** Rank catalog products against a parsed line by weighted token overlap. */
function rankCandidates(rawName: string, catalog: Cat[]): Cat[] {
  const tokens = tokenize(rawName)
  if (tokens.length === 0) return []
  const scored = catalog.map((p) => {
    const hay = norm(`${p.name} ${p.brand || ''}`)
    const brandHay = norm(p.brand)
    let score = 0
    for (const t of tokens) {
      if (hay.includes(t)) score += t.length        // longer token = more specific
      if (brandHay.includes(t)) score += 2           // brand match bonus
    }
    // tie-break: prefer shorter (more specific) product names
    return { p, score: score > 0 ? score - p.name.length / 200 : 0 }
  }).filter((x) => x.score > 0)
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 4).map((x) => x.p)
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

  // Load the catalog once, then rank candidates per line in JS (scored overlap)
  const catalogRes = await pool.query(`SELECT id, name, brand, price::float AS price, COALESCE("costPrice", 0)::float AS "costPrice" FROM "Product" WHERE active = true ORDER BY name LIMIT 1000`)
  const catalog: Cat[] = catalogRes.rows
  const suggestions = parseProductsText(row.productsText).map((line) => ({
    rawName: line.rawName,
    qty: line.qty,
    candidates: rankCandidates(line.rawName, catalog),
  }))

  return NextResponse.json({ row, suggestions, catalog })
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
