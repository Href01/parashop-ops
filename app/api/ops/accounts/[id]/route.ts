import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getOpsSession, isFounder } from '@/lib/auth'

/**
 * Gestion d'un compte de l'equipe : role, bannissement, suppression.
 * Fondateurs uniquement — ces trois gestes donnent ou retirent un acces.
 *
 * Trois garde-fous, chacun contre un enfermement reel :
 *
 *  1. On ne se modifie pas soi-meme. Se retrograder ou se bannir par megarde
 *     coupe l'acces a l'ecran qui permettrait de le reparer.
 *  2. On ne touche pas a une fondatrice ou un fondateur. Leur acces au BOS
 *     vient d'une liste d'e-mails ecrite dans le code (`ALLOWED_EMAILS`), pas
 *     de la colonne `role` : les bannir ne les sortirait donc PAS du BOS, mais
 *     leur fermerait `/admin` sur la boutique. Un demi-bannissement trompeur.
 *  3. On ne supprime pas un compte qui a une histoire (voir DELETE).
 */

async function garde(id: string) {
  const session = await getOpsSession()
  if (!session) return { erreur: NextResponse.json({ error: 'Réservé aux fondateurs' }, { status: 403 }) }

  const r = await pool.query(`SELECT id, email, role, banned FROM "User" WHERE id = $1`, [id])
  if (r.rows.length === 0) return { erreur: NextResponse.json({ error: 'Compte introuvable' }, { status: 404 }) }

  const cible = r.rows[0]
  if (cible.email === session.user?.email) {
    return { erreur: NextResponse.json({ error: 'Tu ne peux pas modifier ton propre compte ici' }, { status: 409 }) }
  }
  if (isFounder(cible.email)) {
    return { erreur: NextResponse.json({ error: 'Un compte fondateur ne se modifie pas depuis cet écran' }, { status: 409 }) }
  }
  return { session, cible }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { erreur } = await garde(id)
    if (erreur) return erreur

    const body = await req.json().catch(() => ({}))
    const updates: string[] = []
    const values: unknown[] = []
    let i = 1

    if (body.role !== undefined) {
      if (body.role !== 'ADMIN' && body.role !== 'USER') {
        return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 })
      }
      updates.push(`"role" = $${i++}`)
      values.push(body.role)
    }
    if (body.banned !== undefined) {
      updates.push(`"banned" = $${i++}`)
      values.push(Boolean(body.banned))
    }
    if (updates.length === 0) {
      return NextResponse.json({ error: 'Rien à modifier' }, { status: 400 })
    }

    values.push(id)
    const r = await pool.query(
      `UPDATE "User" SET ${updates.join(', ')} WHERE id = $${i}
       RETURNING id, name, email, role, banned, "createdAt"`,
      values
    )
    return NextResponse.json({ success: true, account: r.rows[0] })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('PATCH account error:', message)
    return NextResponse.json({ error: 'Échec de la modification', details: message }, { status: 500 })
  }
}

/**
 * Supprime un compte de l'equipe, seulement s'il n'a aucune histoire.
 *
 * Meme raison que pour les clientes : "Order"."userId" est en SET NULL, donc
 * supprimer detacherait les commandes sans retour possible, et les tables
 * "Review" / "LoyaltyTransaction" / "Referral" / "Address" sont en RESTRICT,
 * donc la requete echouerait de toute facon. On verifie avant, et on repond
 * pourquoi plutot que de laisser tomber une erreur de base de donnees.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { erreur, cible } = await garde(id)
    if (erreur) return erreur

    const liens = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM "Order"              WHERE "userId"       = $1)::int AS commandes,
        (SELECT COUNT(*) FROM "Review"             WHERE "userId"       = $1)::int AS avis,
        (SELECT COUNT(*) FROM "LoyaltyTransaction" WHERE "userId"       = $1)::int AS fidelite,
        (SELECT COUNT(*) FROM "Referral"           WHERE "referredById" = $1
                                                      OR "referredId"    = $1)::int AS parrainages,
        (SELECT COUNT(*) FROM "Address"            WHERE "userId"       = $1)::int AS adresses
    `, [id])

    const l = liens.rows[0]
    if (Object.values(l).some((n) => Number(n) > 0)) {
      return NextResponse.json({
        error: 'Ce compte a un historique : le supprimer effacerait le lien avec ses commandes.',
        suggestion: 'Bannis-le plutôt — il perd l’accès, l’historique reste intact.',
        liens: l,
      }, { status: 409 })
    }

    await pool.query(`DELETE FROM "User" WHERE id = $1`, [id])
    return NextResponse.json({ success: true, deleted: cible?.email })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('DELETE account error:', message)
    return NextResponse.json({ error: 'Échec de la suppression', details: message }, { status: 500 })
  }
}
