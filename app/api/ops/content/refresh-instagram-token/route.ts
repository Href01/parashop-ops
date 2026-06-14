import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import { getInstagramToken, saveInstagramToken } from '@/lib/ig-token'

/**
 * GET /api/ops/content/refresh-instagram-token
 * Extends the Instagram long-lived token by another ~60 days and stores it in DB.
 * Runs on a weekly Vercel Cron (well before the 60-day expiry) so the token never
 * dies. Also callable manually by the founder.
 *
 * Auth: either a Vercel Cron request (Authorization: Bearer $CRON_SECRET) or a
 * founder session. Instagram requires the token to be >24h old to refresh.
 */

const IG_BASE = (process.env.IG_API_BASE || 'https://graph.instagram.com').replace(/\/+$/, '')
const IG_VERSION = (process.env.IG_GRAPH_VERSION || '').replace(/^\/+|\/+$/g, '')
const GRAPH = IG_VERSION ? `${IG_BASE}/${IG_VERSION}` : IG_BASE

async function authorized(req: NextRequest): Promise<boolean> {
  // Vercel Cron sends this header when CRON_SECRET is configured
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`) return true
  // Otherwise require a founder session (manual trigger)
  const session = await getServerSession(authOptions)
  return !!session?.user?.email && isFounder(session.user.email)
}

export async function GET(req: NextRequest) {
  try {
    if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const current = await getInstagramToken()
    if (!current) {
      return NextResponse.json({ error: 'Aucun token Instagram à rafraîchir.', refreshed: false }, { status: 503 })
    }

    const url = `${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(current)}`
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json()
    if (!res.ok || !data.access_token) {
      // e.g. "token must be at least 24 hours old" → harmless, the weekly cron retries
      return NextResponse.json({ error: data?.error?.message || `Refresh échoué (${res.status})`, refreshed: false }, { status: 502 })
    }

    await saveInstagramToken(data.access_token, data.expires_in)
    const days = data.expires_in ? Math.round(data.expires_in / 86400) : 60
    return NextResponse.json({ refreshed: true, expiresInDays: days })
  } catch (e) {
    console.error('[Content] refresh-instagram-token', e)
    return NextResponse.json({ error: 'Internal server error', details: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
