import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { GATE_COOKIE, gateEnabled, gateToken } from '@/lib/gate'

/**
 * Two-layer protection for the whole BOS:
 *
 *  Layer 1 — branded gate page (/gate): a shared password in front of
 *  everything, even the login page. Enabled by setting GATE_PASSWORD (or the
 *  older BASIC_AUTH_PASSWORD). Verified via an unforgeable hashed cookie.
 *
 *  Layer 2 — NextAuth founder session. Every page and API requires a valid
 *  founder session, except the sign-in/gate pages and their endpoints. Without
 *  it the previous setup only protected the home page server-side, so other
 *  pages (e.g. /ads) rendered their shell to anyone.
 */

const FOUNDER_EMAILS = ['mekouar01@gmail.com', 'marjanhajar20@gmail.com']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Vercel Cron has no browser cookie or NextAuth session. Authenticate its
  // Bearer token here before the gate/session layers, then let the destination
  // route enforce the same secret. Without this bypass every configured cron
  // returned 401 from the middleware and never reached its handler.
  const cronSecret = process.env.CRON_SECRET
  const cronAuthorized = Boolean(
    cronSecret && req.headers.get('authorization') === `Bearer ${cronSecret}`
  )
  if (cronAuthorized) return NextResponse.next()

  /* Le serveur de collaboration n'a ni cookie ni session : il s'authentifie
     avec le meme REALTIME_TOKEN que les clients WebSocket lui presentent.
     Strictement limite a la route des documents — ce jeton donne deja acces a
     tous les documents par le WebSocket, il n'ouvre donc rien de plus.
     Raison d'etre : ce serveur n'atteint plus sa propre base depuis le
     2026-07-20 ; en passant par le BOS il redevient utilisable sans dependre
     de sa DATABASE_URL. */
  const jetonRealtime = process.env.REALTIME_TOKEN
  if (
    jetonRealtime
    && pathname.startsWith('/api/ops/workspace/state')
    && req.headers.get('authorization') === `Bearer ${jetonRealtime}`
  ) {
    return NextResponse.next()
  }

  /* L'agent SEO concurrence tourne dans le cloud d'Anthropic : ni cookie ni
     session. Il presente SEO_AGENT_TOKEN, et seulement sur ses routes machine
     (reclamer une demande, lire son contexte, publier un rapport). La route de
     destination reverifie le jeton en temps constant. */
  const jetonSeo = process.env.SEO_AGENT_TOKEN
  if (
    jetonSeo
    && pathname.startsWith('/api/ops/seo/agent/machine/')
    && req.headers.get('authorization') === `Bearer ${jetonSeo}`
  ) {
    return NextResponse.next()
  }

  // Public storefront endpoints (cross-origin, intentionally open) — bypass
  // both the shared gate and the founder session. e.g. /api/public/districts
  // is consumed by the shinecosmetics.ma checkout.
  if (pathname.startsWith('/api/public')) {
    return NextResponse.next()
  }

  // Layer 1 — shared gate (skip the gate page + its endpoint)
  if (gateEnabled() && !pathname.startsWith('/gate') && !pathname.startsWith('/api/gate')) {
    const expected = await gateToken()
    const cookie = req.cookies.get(GATE_COOKIE)?.value
    if (!expected || cookie !== expected) {
      if (pathname.startsWith('/api')) {
        return NextResponse.json({ error: 'Gate required' }, { status: 401 })
      }
      const url = req.nextUrl.clone()
      url.pathname = '/gate'
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }
  }

  // Allow the auth + gate flows through layer 2
  if (pathname.startsWith('/auth') || pathname.startsWith('/api/auth') || pathname.startsWith('/gate') || pathname.startsWith('/api/gate')) {
    return NextResponse.next()
  }

  // Layer 2 — founder session
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  const email = (token?.email as string | undefined) || undefined
  const isFounder = !!email && FOUNDER_EMAILS.includes(email)

  if (!isFounder) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = req.nextUrl.clone()
    url.pathname = '/auth/signin'
    url.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  // Everything except Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|woff2?)$).*)'],
}
