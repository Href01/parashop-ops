import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

// POST /api/ops/products/bulk-update - Update multiple products at once
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { updates } = body

    // updates format: [{ id: 1, costPrice: 120 }, { id: 2, costPrice: 95 }, ...]
    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: 'Invalid updates array' }, { status: 400 })
    }

    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      const results = []

      for (const update of updates) {
        const { id, costPrice, lowStockThreshold } = update

        const updateFields: string[] = []
        const values: any[] = []
        let paramIndex = 1

        if (costPrice !== undefined) {
          updateFields.push(`"costPrice" = $${paramIndex}`)
          values.push(costPrice)
          paramIndex++
        }

        if (lowStockThreshold !== undefined) {
          updateFields.push(`"lowStockThreshold" = $${paramIndex}`)
          values.push(lowStockThreshold)
          paramIndex++
        }

        if (updateFields.length > 0) {
          updateFields.push(`"updatedAt" = NOW()`)
          values.push(id)

          const query = `
            UPDATE "Product"
            SET ${updateFields.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING id, name, "costPrice"
          `

          const result = await client.query(query, values)
          if (result.rows.length > 0) {
            results.push(result.rows[0])
          }
        }
      }

      await client.query('COMMIT')

      return NextResponse.json({
        success: true,
        updated: results.length,
        products: results,
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Bulk update error:', error)
    return NextResponse.json(
      { error: 'Failed to bulk update products' },
      { status: 500 }
    )
  }
}
