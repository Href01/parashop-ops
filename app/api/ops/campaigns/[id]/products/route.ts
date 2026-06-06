import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * POST /api/ops/campaigns/[id]/products
 * Add products to campaign
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: campaignId } = await params
    const body = await request.json()

    const {
      productId,
      targetSales,
      targetRevenue,
      discountPercent,
      specialPrice,
    } = body

    if (!productId) {
      return NextResponse.json({ error: 'productId is required' }, { status: 400 })
    }

    // Add product to campaign
    const result = await pool.query(`
      INSERT INTO "CampaignProduct" (
        "campaignId",
        "productId",
        "targetSales",
        "targetRevenue",
        "discountPercent",
        "specialPrice"
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT ("campaignId", "productId") DO UPDATE SET
        "targetSales" = EXCLUDED."targetSales",
        "targetRevenue" = EXCLUDED."targetRevenue",
        "discountPercent" = EXCLUDED."discountPercent",
        "specialPrice" = EXCLUDED."specialPrice"
      RETURNING *
    `, [
      campaignId,
      productId,
      targetSales,
      targetRevenue,
      discountPercent,
      specialPrice,
    ])

    return NextResponse.json({
      success: true,
      campaignProduct: result.rows[0],
    })

  } catch (error: any) {
    console.error('Add campaign product error:', error)
    return NextResponse.json(
      { error: 'Failed to add product', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET /api/ops/campaigns/[id]/products
 * Get products for a campaign with performance
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: campaignId } = await params

    const result = await pool.query(`
      SELECT
        cp.*,
        p.name as "productName",
        p.brand,
        p.image,
        p.price,
        p."costPrice"
      FROM "CampaignProduct" cp
      JOIN "Product" p ON p.id = cp."productId"
      WHERE cp."campaignId" = $1
      ORDER BY cp.id
    `, [campaignId])

    return NextResponse.json({
      products: result.rows,
    })

  } catch (error: any) {
    console.error('Get campaign products error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch products', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/ops/campaigns/[id]/products?productId=X
 * Remove product from campaign
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: campaignId } = await params
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId')

    if (!productId) {
      return NextResponse.json({ error: 'productId required' }, { status: 400 })
    }

    await pool.query(
      'DELETE FROM "CampaignProduct" WHERE "campaignId" = $1 AND "productId" = $2',
      [campaignId, productId]
    )

    return NextResponse.json({
      success: true,
      message: 'Product removed from campaign',
    })

  } catch (error: any) {
    console.error('Remove campaign product error:', error)
    return NextResponse.json(
      { error: 'Failed to remove product', details: error.message },
      { status: 500 }
    )
  }
}
