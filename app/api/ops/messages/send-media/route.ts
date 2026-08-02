import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export const maxDuration = 60

/**
 * POST /api/ops/messages/send-media
 *
 * Send a PHOTO to a customer from the BOS inbox. Same rules as the text reply:
 * WhatsApp only allows free-form content within 24h of the customer's last
 * inbound message. The storefront holds the Cloudinary + WhatsApp credentials,
 * so we forward the file there rather than uploading from here.
 *
 * Multipart body: file, phone, caption?
 */
export async function POST(req: NextRequest) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Body invalide' }, { status: 400 })
  }

  const file = form.get('file') as File | null
  const phone = (form.get('phone') as string | null)?.trim()
  const caption = ((form.get('caption') as string | null) || '').trim()

  if (!phone) return NextResponse.json({ error: 'phone requis' }, { status: 400 })
  if (!file) return NextResponse.json({ error: 'Aucune image' }, { status: 400 })
  if (!file.type?.startsWith('image/')) {
    return NextResponse.json({ error: 'Type non supporté (image uniquement)' }, { status: 400 })
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Image trop lourde — max 5 Mo' }, { status: 400 })
  }

  if (!process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'INTERNAL_API_SECRET manquant' }, { status: 500 })
  }

  try {
    // Same 24h service-window check as the text reply — fail here with a clear
    // message rather than letting Meta reject the send with an opaque code.
    const lastInbound = await pool.query(
      `SELECT "createdAt" FROM "MessageLog"
       WHERE phone = $1 AND direction = 'in'
       ORDER BY "createdAt" DESC LIMIT 1`,
      [phone]
    )

    if (lastInbound.rows.length === 0) {
      return NextResponse.json(
        { error: 'La cliente ne vous a jamais écrit. Vous ne pouvez envoyer une photo que dans les 24h après son message.' },
        { status: 403 }
      )
    }

    const hoursSince = (Date.now() - new Date(lastInbound.rows[0].createdAt).getTime()) / (1000 * 60 * 60)
    if (hoursSince > 24) {
      return NextResponse.json(
        { error: `Fenêtre de 24h dépassée (dernier message il y a ${Math.round(hoursSince)}h). Envoi de photo impossible.` },
        { status: 403 }
      )
    }

    const userRow = await pool.query('SELECT id FROM "User" WHERE phone = $1 LIMIT 1', [phone])
    const userId = userRow.rows[0]?.id

    const forward = new FormData()
    forward.append('file', file, file.name || 'photo.jpg')
    forward.append('phone', phone)
    if (caption) forward.append('caption', caption)
    if (userId) forward.append('userId', String(userId))

    const storefrontUrl = process.env.STOREFRONT_URL || 'https://www.shinecosmetics.ma'
    const res = await fetch(`${storefrontUrl}/api/whatsapp/send-media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` },
      body: forward,
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      return NextResponse.json({ error: error.error || 'Échec de l\'envoi' }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ success: true, ...data })
  } catch (error) {
    console.error('[messages/send-media] Failed:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
