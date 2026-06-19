import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

/**
 * POST /api/ops/messages/send
 *
 * Reply to a customer from the BOS inbox. Enforces the WhatsApp 24h service
 * window (free-form text only allowed within 24h of the customer's last inbound
 * message). Delegates the actual send to the storefront (which holds the token).
 *
 * Body: { phone, text }
 */
export async function POST(req: NextRequest) {
  let phone: string | undefined, text: string | undefined
  try {
    ({ phone, text } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Body invalide' }, { status: 400 })
  }

  if (!phone || !text?.trim()) {
    return NextResponse.json({ error: 'phone et text requis' }, { status: 400 })
  }

  try {
    // Check the 24h service window: last INBOUND message from this customer
    const lastInbound = await pool.query(
      `SELECT "createdAt" FROM "MessageLog"
       WHERE phone = $1 AND direction = 'in'
       ORDER BY "createdAt" DESC LIMIT 1`,
      [phone]
    )

    if (lastInbound.rows.length === 0) {
      return NextResponse.json(
        { error: 'La cliente ne vous a jamais écrit. Vous ne pouvez répondre librement que dans les 24h après son message. Utilisez un template pour l\'initier.' },
        { status: 403 }
      )
    }

    const lastInboundTime = new Date(lastInbound.rows[0].createdAt).getTime()
    const hoursSince = (Date.now() - lastInboundTime) / (1000 * 60 * 60)

    if (hoursSince > 24) {
      return NextResponse.json(
        { error: `Fenêtre de 24h dépassée (dernier message il y a ${Math.round(hoursSince)}h). Réponse libre impossible — utilisez un template.` },
        { status: 403 }
      )
    }

    // Find userId for tracking
    const userRow = await pool.query('SELECT id FROM "User" WHERE phone = $1 LIMIT 1', [phone])
    const userId = userRow.rows[0]?.id

    // Delegate to storefront
    const storefrontUrl = process.env.NEXT_PUBLIC_STOREFRONT_URL || 'https://www.shinecosmetics.ma'
    const res = await fetch(`${storefrontUrl}/api/whatsapp/send-message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.INTERNAL_API_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone, text: text.trim(), userId }),
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      return NextResponse.json({ error: error.error || 'Échec de l\'envoi' }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ success: true, ...data })
  } catch (error) {
    console.error('[messages/send] Failed:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
