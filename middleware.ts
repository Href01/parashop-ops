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
