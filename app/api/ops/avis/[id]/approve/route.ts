import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/ops/avis/[id]/approve
 *
 * Approves a review by calling the storefront API (which handles the 50 DH bonus logic).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const reviewId = parseInt(id)
  if (isNaN(reviewId)) {
    return NextResponse.json({ error: 'Invalid review ID' }, { status: 400 })
  }

  try {
    // Call the storefront review approval endpoint (it has the maybeGrantReviewReward logic)
    const storefrontUrl = process.env.STOREFRONT_URL || 'https://www.shinecosmetics.ma'
    const res = await fetch(`${storefrontUrl}/api/admin/reviews/${reviewId}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.INTERNAL_API_SECRET}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      return NextResponse.json({ error: error.error || 'Approval failed' }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('[approve review] Failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
