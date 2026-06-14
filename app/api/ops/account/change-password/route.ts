import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { isFounder } from '@/lib/auth'
import pool from '@/lib/db'

/**
 * POST /api/ops/account/change-password
 * Changes the signed-in founder's password. Verifies the current password
 * (bcrypt) before setting the new one. Body: { currentPassword, newPassword }.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const email = session?.user?.email
    if (!email || !isFounder(email)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { currentPassword, newPassword } = await req.json().catch(() => ({}))
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Le nouveau mot de passe doit faire au moins 8 caractères.' }, { status: 400 })
    }

    const r = await pool.query(`SELECT id, password FROM "User" WHERE email = $1`, [email])
    const user = r.rows[0]
    if (!user) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })

    const valid = await bcrypt.compare(currentPassword, user.password)
    if (!valid) return NextResponse.json({ error: 'Mot de passe actuel incorrect.' }, { status: 400 })

    const hash = await bcrypt.hash(newPassword, 10)
    await pool.query(`UPDATE "User" SET password = $1 WHERE id = $2`, [hash, user.id])

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[Account] change-password', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
