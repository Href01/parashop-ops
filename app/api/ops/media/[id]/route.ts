import { NextRequest, NextResponse } from 'next/server'

const STOREFRONT_URL = process.env.STOREFRONT_URL || 'https://www.shinecosmetics.ma'

/**
 * GET /api/ops/media/[id]
 * Proxy WhatsApp media (image/audio/doc) from the storefront (which has the token).
 * Used by Messages UI to display images sent by customers.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'INTERNAL_API_SECRET manquant' }, { status: 500 })
  }

  try {
    const res = await fetch(`${STOREFRONT_URL}/api/whatsapp/media/${id}`, {
      headers: { Authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` },
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      return NextResponse.json({ error: error.error || 'Média introuvable' }, { status: res.status })
    }

    // Stream the media back
    const buffer = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('[ops/media] Proxy failed:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
