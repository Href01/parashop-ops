import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'
import { revalidateWebsite } from '@/lib/revalidate-website'

/**
 * POST /api/ops/partners/:id/products
 * Cree un produit en depot-vente pour ce partenaire, avec son stock initial.
 *
 * Body : { name*, brand, price*, costPrice?, category?, quantity? }
 *  - price     = prix de vente boutique (DH)
 *  - costPrice = prix d'achat du PARTENAIRE (DH) — son argent, pas celui de Shine
 *  - quantity  = stock initial confie par le partenaire (defaut 0)
 *
 * Le stock initial est trace comme un mouvement 'Purchase' SANS totalCost :
 * ce n'est jamais une depense de Shine (le tableau de bord et les Achats ne
 * comptent que les mouvements avec un totalCost). Voir migration 042.
 */
export const dynamic = 'force-dynamic'

async function guard() {
  const s = await getServerSession(authOptions)
  return s?.user?.email || null
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const email = await guard()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const partnerId = Number((await params).id)
  if (!Number.isInteger(partnerId)) return NextResponse.json({ error: 'id invalide' }, { status: 400 })

  const partner = await pool.query(`SELECT id, name FROM "Partner" WHERE id = $1`, [partnerId])
  if (partner.rowCount === 0) return NextResponse.json({ error: 'Partenaire introuvable' }, { status: 404 })

  const b = await req.json().catch(() => ({}))
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'Le nom du produit est requis' }, { status: 400 })
  const brand = typeof b.brand === 'string' && b.brand.trim() ? b.brand.trim() : partner.rows[0].name
  const price = Number(b.price)
  if (!Number.isFinite(price) || price < 0) return NextResponse.json({ error: 'Prix de vente invalide' }, { status: 400 })
  const costPrice = b.costPrice == null || b.costPrice === '' ? null : Number(b.costPrice)
  if (costPrice != null && (!Number.isFinite(costPrice) || costPrice < 0))
    return NextResponse.json({ error: "Prix d'achat invalide" }, { status: 400 })
  const category = typeof b.category === 'string' && b.category.trim() ? b.category.trim() : 'Visage'
  const quantity = b.quantity == null || b.quantity === '' ? 0 : Math.trunc(Number(b.quantity))
  if (!Number.isInteger(quantity) || quantity < 0)
    return NextResponse.json({ error: 'Quantité initiale invalide' }, { status: 400 })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const ins = await client.query(
      `INSERT INTO "Product" (name, brand, price, "costPrice", category, stock, "partnerId", "stockStatus")
       VALUES ($1, $2, $3, $4, $5, 0, $6, $7)
       RETURNING id, name, brand, price, "costPrice", stock, category, "partnerId"`,
      [name, brand, price, costPrice, category, partnerId, quantity > 0 ? 'In stock' : 'Out of stock'],
    )
    const product = ins.rows[0]
    if (quantity > 0) {
      // totalCost volontairement NULL : le partenaire a paye ce stock, pas Shine.
      await client.query(
        `INSERT INTO "InventoryMovement"
           ("productId", type, quantity, "stockBefore", "stockAfter", reason, "costPerUnit", "totalCost", "performedBy", notes)
         VALUES ($1, 'Purchase', $2, 0, $2, 'Stock initial — dépôt partenaire', $3, NULL, $4, $5)`,
        [product.id, quantity, costPrice, email, `Partenaire : ${partner.rows[0].name}`],
      )
      await client.query(
        `UPDATE "Product" SET stock = $1, "lastRestockDate" = NOW() WHERE id = $2`,
        [quantity, product.id],
      )
      product.stock = quantity
    }
    await client.query('COMMIT')
    revalidateWebsite(['products']).catch(() => {})
    return NextResponse.json({ ok: true, product }, { status: 201 })
  } catch (e: unknown) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('POST partner product error:', e)
    return NextResponse.json({ error: 'Création impossible' }, { status: 500 })
  } finally {
    client.release()
  }
}
