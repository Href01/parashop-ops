import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/ops/avis/[id]/reject
 *
 * Rejects a review by calling the storefront API.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const reviewId = parseInt(id)
  if (isNaN(reviewId)) {
    return NextResponse.json({ error: 'Invalid review ID' }, { status: 400 })
  }

  try {
    // Call the storefront review rejection endpoint
    const storefrontUrl = process.env.NEXT_PUBLIC_STOREFRONT_URL || 'https://www.shinecosmetics.ma'
    const res = await fetch(`${storefrontUrl}/api/admin/reviews/${reviewId}/reject`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.INTERNAL_API_SECRET}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      return NextResponse.json({ error: error.error || 'Rejection failed' }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('[reject review] Failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
