import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

/**
 * Two-layer protection for the whole BOS:
 *
 *  Layer 1 — Basic Auth gate (a shared password in front of everything, even
 *  the login page). Enabled by setting BASIC_AUTH_USER / BASIC_AUTH_PASSWORD.
 *
 *  Layer 2 — NextAuth founder session. Every page and API requires a valid
 *  founder session, except the sign-in page and the auth endpoints. Without it
 *  the previous setup only protected the home page server-side, so other pages
 *  (e.g. /ads) rendered their shell to anyone.
 */

const FOUNDER_EMAILS = ['mekouar01@gmail.com', 'marjanhajar20@gmail.com']

function basicAuthOk(req: NextRequest): boolean {
  const pass = process.env.BASIC_AUTH_PASSWORD
  if (!pass) return true // gate disabled until configured
  const user = process.env.BASIC_AUTH_USER || 'shine'
  const header = req.headers.get('authorization')
  if (!header?.startsWith('Basic ')) return false
  try {
    const [u, p] = atob(header.slice(6)).split(':')
    return u === user && p === pass
  } catch {
    return false
  }
}

export async function middleware(req: NextRequest) {
  // Layer 1 — shared gate
  if (!basicAuthOk(req)) {
    return new NextResponse('Authentification requise', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Shine BOS", charset="UTF-8"' },
    })
  }

  const { pathname } = req.nextUrl

  // Allow the auth flow itself through layer 2
  if (pathname.startsWith('/auth') || pathname.startsWith('/api/auth')) {
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
