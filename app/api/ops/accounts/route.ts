import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import bcrypt from 'bcryptjs'
import { getOpsSession, isFounder } from '@/lib/auth'

/**
 * GET /api/ops/accounts
 * Lists the staff accounts that can be managed from the BOS: anyone with an
 * ADMIN role plus the founder allowlist. Founder-only (getOpsSession).
 * Passwords are never returned. Used by the Settings > Comptes panel to let a
 * founder reset another account's password without knowing the current one.
 */
export async function GET() {
  const session = await getOpsSession()
  if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const r = await pool.query(
    `SELECT id, email, name, role, banned, "createdAt"
     FROM "User"
     WHERE role = 'ADMIN' OR email IN ('mekouar01@gmail.com','marjanhajar20@gmail.com')
     ORDER BY role DESC, id ASC`
  )

  const me = session.user?.email || ''
  const accounts = r.rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    banned: u.banned,
    createdAt: u.createdAt,
    isFounder: isFounder(u.email),
    isSelf: u.email === me,
  }))

  return NextResponse.json({ accounts })
}

/**
 * POST /api/ops/accounts
 * Cree un compte (equipe ou cliente). Fondateurs uniquement.
 *
 * Le code de parrainage est tire avec `crypto.randomInt` et non `Math.random` :
 * un code devinable laisserait reclamer la prime de parrainage d'autrui. Le
 * generateur du site utilisait encore `Math.random`, non prevu pour ca.
 */
export async function POST(req: NextRequest) {
  const session = await getOpsSession()
  if (!session) return NextResponse.json({ error: 'Réservé aux fondateurs' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const phone = String(body.phone ?? '').trim()
  const password = String(body.password ?? '')
  const role = body.role === 'ADMIN' ? 'ADMIN' : 'USER'

  if (!name || !email) {
    return NextResponse.json({ error: 'Nom et e-mail obligatoires' }, { status: 400 })
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'E-mail invalide' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Mot de passe : minimum 6 caractères' }, { status: 400 })
  }

  /* Comparaison en minuscules : sans ca, « Achraf@… » et « achraf@… » creent
     deux comptes, et la connexion en trouve un au hasard. */
  const existing = await pool.query(`SELECT id FROM "User" WHERE LOWER(email) = $1`, [email])
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: 'Cet e-mail a déjà un compte' }, { status: 409 })
  }

  const hash = await bcrypt.hash(password, 10)
  const { randomInt } = await import('crypto')
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'SHINE-'
  for (let i = 0; i < 5; i++) code += chars[randomInt(chars.length)]

  const result = await pool.query(`
    INSERT INTO "User" (name, email, password, phone, role, points, "pendingPoints", "referralCode", "createdAt")
    VALUES ($1, $2, $3, $4, $5, 0, 0, $6, NOW())
    RETURNING id, name, email, role, banned, "createdAt"
  `, [name, email, hash, phone || null, role, code])

  return NextResponse.json({ success: true, account: result.rows[0] }, { status: 201 })
}
