import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { batchUpdateAllRFM, updateUserRFM, getSegmentStats } from '@/lib/integrations/rfm-calculator'
import pool from '@/lib/db'

/**
 * POST /api/ops/utils/update-rfm
 * Batch update RFM scores for all customers
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log(`🔄 Manual RFM batch update triggered by ${session.user.email}`)

    const result = await batchUpdateAllRFM()

    const stats = await getSegmentStats()

    return NextResponse.json({
      success: true,
      message: `RFM scores updated: ${result.success} success, ${result.failed} failed`,
      result,
      segments: stats,
    })

  } catch (error: any) {
    console.error('Batch RFM update error:', error)
    return NextResponse.json(
      { error: 'Failed to update RFM scores', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET /api/ops/utils/update-rfm?userId=X
 * Update RFM for a specific user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    // Get user phone
    const userResult = await pool.query(
      'SELECT phone FROM "User" WHERE id = $1',
      [userId]
    )

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const phone = userResult.rows[0].phone

    if (!phone) {
      return NextResponse.json({ error: 'User has no phone number' }, { status: 400 })
    }

    const updated = await updateUserRFM(parseInt(userId), phone)

    if (!updated) {
      return NextResponse.json({ error: 'Failed to update RFM' }, { status: 500 })
    }

    // Get updated user data
    const updatedUser = await pool.query(
      'SELECT * FROM "User" WHERE id = $1',
      [userId]
    )

    return NextResponse.json({
      success: true,
      user: updatedUser.rows[0],
    })

  } catch (error: any) {
    console.error('Update RFM error:', error)
    return NextResponse.json(
      { error: 'Failed to update RFM', details: error.message },
      { status: 500 }
    )
  }
}
