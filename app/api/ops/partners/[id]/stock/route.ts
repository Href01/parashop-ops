import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'
import { revalidateWebsite } from '@/lib/revalidate-website'

/**
 * POST /api/ops/partners/:id/stock
 * Entree (ou correction) de stock pour un produit du partenaire.
 *
 * Body : { productId*, quantity*, costPerUnit? }
 *  - quantity > 0 : le partenaire confie du stock (entree)
 *  - quantity < 0 : correction (casse, inventaire…) — jamais sous zero
 *  - costPerUnit  : prix d'achat du lot (met a jour le cout moyen, sans entrer
 *    dans la tresorerie de Shine)
 *
 * totalCost reste toujours NULL : ce stock appartient au partenaire, Shine ne
 * l'a pas paye. Le tableau de bord et les Achats ne comptent que les mouvements
 * avec un totalCost, donc ils ignorent ces entrees (voir migration 042).
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

  const b = await req.json().catch(() => ({}))
  const productId = Number(b.productId)
  const quantity = b.quantity == null ? NaN : Math.trunc(Number(b.quantity))
  if (!Number.isInteger(productId)) return NextResponse.json({ error: 'Produit invalide' }, { status: 400 })
  if (!Number.isInteger(quantity) || quantity === 0)
    return NextResponse.json({ error: 'Quantité invalide (entière, non nulle)' }, { status: 400 })
  const costPerUnit =
    b.costPerUnit == null || b.costPerUnit === '' ? null : Number(b.costPerUnit)
  if (costPerUnit != null && (!Number.isFinite(costPerUnit) || costPerUnit < 0))
    return NextResponse.json({ error: "Coût unitaire invalide" }, { status: 400 })
  if (costPerUnit != null && quantity < 0)
    return NextResponse.json({ error: 'Pas de coût sur une correction' }, { status: 400 })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const pr = await client.query(
      `SELECT p.id, p.name, p.stock, p."costPrice", pa.name AS "partnerName"
         FROM "Product" p JOIN "Partner" pa ON pa.id = p."partnerId"
        WHERE p.id = $1 AND p."partnerId" = $2 FOR UPDATE`,
      [productId, partnerId],
    )
    if (pr.rowCount === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: 'Produit introuvable pour ce partenaire' }, { status: 404 })
    }
    const p = pr.rows[0]
    const stockBefore: number = Number(p.stock) || 0
    const stockAfter = stockBefore + quantity
    if (stockAfter < 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: `Stock insuffisant (reste ${stockBefore})` }, { status: 400 })
    }

    const entree = quantity > 0
    await client.query(
      `INSERT INTO "InventoryMovement"
         ("productId", type, quantity, "stockBefore", "stockAfter", reason, "costPerUnit", "totalCost", "performedBy", notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9)`,
      [
        productId,
        entree ? 'Purchase' : 'Adjustment',
        quantity,
        stockBefore,
        stockAfter,
        entree ? 'Dépôt partenaire — entrée stock' : 'Correction stock partenaire',
        entree ? costPerUnit : null,
        email,
        `Partenaire : ${p.partnerName}`,
      ],
    )

    // Cout moyen pondere (meme regle que la reappro Shine) quand le lot a un prix.
    let newCost: number | null = null
    if (entree && costPerUnit != null) {
      const oldCost = p.costPrice != null ? Number(p.costPrice) : null
      newCost =
        oldCost == null || stockBefore <= 0
          ? costPerUnit
          : (stockBefore * oldCost + quantity * costPerUnit) / (stockBefore + quantity)
      newCost = Math.round(newCost * 100) / 100
    }
    await client.query(
      `UPDATE "Product" SET stock = $1,
        "costPrice" = COALESCE($2, "costPrice"),
        "stockStatus" = CASE WHEN $1 = 0 THEN 'Out of stock' ELSE 'In stock' END,
        "lastRestockDate" = CASE WHEN $3 THEN NOW() ELSE "lastRestockDate" END
       WHERE id = $4`,
      [stockAfter, newCost, entree, productId],
    )
    await client.query('COMMIT')
    revalidateWebsite(['products']).catch(() => {})
    return NextResponse.json({ ok: true, stockBefore, stockAfter })
  } catch (e: unknown) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('POST partner stock error:', e)
    return NextResponse.json({ error: 'Entrée impossible' }, { status: 500 })
  } finally {
    client.release()
  }
}
