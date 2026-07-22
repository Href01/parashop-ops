import { NextResponse } from 'next/server'
import pool from '@/lib/db'
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
