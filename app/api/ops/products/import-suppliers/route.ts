import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

interface ImportUpdate {
  sku?: string
  name?: string
  supplier: string
}

interface ImportResult {
  sku: string
  name: string
  supplier: string
  status: 'success' | 'error' | 'not_found'
  message?: string
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { updates } = body as { updates: ImportUpdate[] }

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }

    const results: ImportResult[] = []

    for (const update of updates) {
      try {
        let productQuery
        let productResult

        // Try to find product by SKU first (preferred), then by name
        if (update.sku) {
          productQuery = 'SELECT id, name, sku FROM "Product" WHERE LOWER(sku) = LOWER($1)'
          productResult = await pool.query(productQuery, [update.sku])
        }

        if (!productResult || productResult.rows.length === 0) {
          if (update.name) {
            productQuery = 'SELECT id, name, sku FROM "Product" WHERE LOWER(name) = LOWER($1)'
            productResult = await pool.query(productQuery, [update.name])
          }
        }

        if (!productResult || productResult.rows.length === 0) {
          results.push({
            sku: update.sku || '',
            name: update.name || '',
            supplier: update.supplier,
            status: 'not_found',
            message: 'Produit non trouvé',
          })
          continue
        }

        const product = productResult.rows[0]

        // Update supplier
        await pool.query(
          `UPDATE "Product" SET supplier = $1, "updatedAt" = NOW() WHERE id = $2`,
          [update.supplier.trim() || null, product.id]
        )

        results.push({
          sku: product.sku || '',
          name: product.name,
          supplier: update.supplier,
          status: 'success',
          message: 'Mis à jour',
        })
      } catch (error) {
        console.error('Error updating product:', error)
        results.push({
          sku: update.sku || '',
          name: update.name || '',
          supplier: update.supplier,
          status: 'error',
          message: 'Erreur lors de la mise à jour',
        })
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Import suppliers error:', error)
    return NextResponse.json(
      { error: 'Failed to import suppliers' },
      { status: 500 }
    )
  }
}
