import { NextRequest, NextResponse } from 'next/server'
import { getOpsSession } from '@/lib/auth'

const STOREFRONT_URL = process.env.STOREFRONT_URL || 'https://www.shinecosmetics.ma'

/**
 * POST /api/ops/orders/[id]/review-request
 * Manually trigger the WhatsApp review magic-link for this order's customer.
 * Admin-gated; delegates the actual send to the storefront (which holds the
 * WhatsApp token) via a shared secret.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getOpsSession()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: orderId } = await params

  if (!process.env.INTERNAL_API_SECRET) {
    return NextResponse.json(
      { error: 'INTERNAL_API_SECRET manquant — ajoutez-le sur les deux projets Vercel' },
      { status: 500 }
    )
  }

  try {
    const res = await fetch(`${STOREFRONT_URL}/api/reviews/send-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.INTERNAL_API_SECRET}`,
      },
      body: JSON.stringify({ orderId: Number(orderId) }),
    })
    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || 'Échec de l’envoi' }, { status: res.status })
    }
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur réseau vers le storefront' },
      { status: 502 }
    )
  }
}
