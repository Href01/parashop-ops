import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

/**
 * GET /api/ops/realtime-token → { url, token, user }
 *
 * Hands the collaboration server URL + shared token to an authenticated founder only,
 * so the secret is NEVER inlined into the public client bundle. The client fetches this
 * right before opening the WebSocket.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const s = await getServerSession(authOptions)
  if (!s?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const name = (s.user.name || s.user.email.split('@')[0] || 'Fondateur').trim()
  return NextResponse.json(
    {
      url: process.env.NEXT_PUBLIC_REALTIME_URL || '',
      token: process.env.REALTIME_TOKEN || '',
      user: { name, email: s.user.email },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
