import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import pool from '@/lib/db'
import { getOpsSession } from '@/lib/auth'

/**
 * POST /api/ops/accounts/[id]/password
 * Admin reset: a founder sets a NEW password for any staff account WITHOUT
 * needing the current one. Distinct from /api/ops/account/change-password,
 * which changes the signed-in user's own password and verifies the old one.
 * Body: { newPassword }. Only ADMIN-role / founder accounts are resettable so
 * this can never touch a customer account by guessing an id.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getOpsSession()
    if (!session) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { id } = await params
    const userId = parseInt(id, 10)
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Compte invalide' }, { status: 400 })
    }

    const { newPassword } = await req.json().catch(() => ({}))
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return NextResponse.json({ error: 'Le mot de passe doit faire au moins 8 caractères.' }, { status: 400 })
    }

    // Only staff accounts are manageable here — never a customer account.
    const target = await pool.query(
      `SELECT id, email, role FROM "User" WHERE id = $1
       AND (role = 'ADMIN' OR email IN ('mekouar01@gmail.com','marjanhajar20@gmail.com'))`,
      [userId]
    )
    if (target.rows.length === 0) {
      return NextResponse.json({ error: 'Compte introuvable ou non géré ici.' }, { status: 404 })
    }

    const hash = await bcrypt.hash(newPassword, 10)
    await pool.query(`UPDATE "User" SET password = $1, "tempPassword" = NULL WHERE id = $2`, [hash, userId])

    return NextResponse.json({ ok: true, email: target.rows[0].email })
  } catch (e) {
    console.error('[Accounts] reset password', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
