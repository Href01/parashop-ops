import { NextRequest, NextResponse } from 'next/server'

const STOREFRONT_URL = process.env.STOREFRONT_URL || 'https://www.shinecosmetics.ma'

/**
 * POST /api/ops/customers/[id]/send-reward
 * Manually send the loyalty-reward (50 DH) confirmation WhatsApp to a customer.
 * Delegates to the storefront (which holds the WhatsApp token).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'INTERNAL_API_SECRET manquant' }, { status: 500 })
  }

  try {
    const res = await fetch(`${STOREFRONT_URL}/api/reviews/send-reward-confirmation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.INTERNAL_API_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: Number(id) }),
    })
    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: data.error || 'Échec de l\'envoi' }, { status: res.status })
    }
    return NextResponse.json(data)
  } catch (error) {
    console.error('[send-reward] failed:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
