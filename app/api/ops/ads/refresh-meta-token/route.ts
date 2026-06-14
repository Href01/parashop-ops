import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import { getMetaToken, saveMetaToken } from '@/lib/meta-token'

/**
 * GET /api/ops/ads/refresh-meta-token
 * Best-effort extension of the Meta long-lived user token via fb_exchange_token,
 * stored in DB. Runs on a weekly Vercel Cron so an ordinary user token stays
 * alive automatically. (A System User token never expires and ignores this.)
 *
 * Needs META_APP_ID + META_APP_SECRET in env. Auth: Vercel Cron (Bearer
 * CRON_SECRET) or founder session.
 */

const VERSION = (process.env.META_GRAPH_VERSION || 'v21.0').replace(/^\/+|\/+$/g, '')
const GRAPH = `https://graph.facebook.com/${VERSION}`

async function authorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`) return true
  const session = await getServerSession(authOptions)
  return !!session?.user?.email && isFounder(session.user.email)
}

export async function GET(req: NextRequest) {
  try {
    if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const appId = process.env.META_APP_ID
    const appSecret = process.env.META_APP_SECRET
    if (!appId || !appSecret) {
      return NextResponse.json({ error: 'META_APP_ID / META_APP_SECRET manquants (requis pour le refresh).', refreshed: false }, { status: 503 })
    }
    const current = await getMetaToken()
    if (!current) {
      return NextResponse.json({ error: 'Aucun token Meta à rafraîchir.', refreshed: false }, { status: 503 })
    }

    const url = `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token`
      + `&client_id=${encodeURIComponent(appId)}`
      + `&client_secret=${encodeURIComponent(appSecret)}`
      + `&fb_exchange_token=${encodeURIComponent(current)}`
    const res = await fetch(url, { cache: 'no-store' })
    const data = await res.json()
    if (!res.ok || !data.access_token) {
      return NextResponse.json({ error: data?.error?.message || `Refresh échoué (${res.status})`, refreshed: false }, { status: 502 })
    }

    await saveMetaToken(data.access_token, data.expires_in)
    // System User tokens return no expires_in (they never expire)
    const days = data.expires_in ? Math.round(data.expires_in / 86400) : null
    return NextResponse.json({ refreshed: true, expiresInDays: days, neverExpires: !data.expires_in })
  } catch (e) {
    console.error('[Ads] refresh-meta-token', e)
    return NextResponse.json({ error: 'Internal server error', details: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
