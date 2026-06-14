import { NextRequest, NextResponse } from 'next/server'
import { GATE_COOKIE, gateToken, verifyGatePassword } from '@/lib/gate'

/** POST /api/gate — verify the shared gate password, set the gate cookie. */
export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({}))
  if (typeof password !== 'string' || !verifyGatePassword(password)) {
    return NextResponse.json({ error: 'Mot de passe incorrect.' }, { status: 401 })
  }
  const token = await gateToken()
  if (!token) return NextResponse.json({ error: 'Gate non configuré.' }, { status: 503 })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(GATE_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
  return res
}
