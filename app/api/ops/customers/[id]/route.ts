import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'
import bcrypt from 'bcryptjs'
import { getOpsSession } from '@/lib/auth'

/**
 * GET /api/ops/customers/[id]
 * Get customer detail with full history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: customerId } = await params

    // Get customer data
    const customerResult = await pool.query(`
      SELECT * FROM "User"
      WHERE id = $1
    `, [customerId])

    if (customerResult.rows.length === 0) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const customer = customerResult.rows[0]

    // Get order history
    const ordersResult = await pool.query(`
      SELECT
        id,
        total,
        status,
        "createdAt",
        "deliveryCity",
        "paymentMethod"
      FROM "Order"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 20
    `, [customerId])

    // Get customer activity timeline
    const activityResult = await pool.query(`
      SELECT
        type,
        action,
        description,
        metadata,
        "createdAt"
      FROM "CustomerActivity"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 50
    `, [customerId])

    // Real metrics from confirmed/delivered orders (the stored User columns were
    // never populated — they showed 0/New/Bronze for everyone).
    const metricsResult = await pool.query(`
      SELECT
        COUNT(*)::int as "totalOrders",
        COALESCE(SUM(total), 0)::float as "totalSpent",
        COALESCE(AVG(total), 0)::float as "avgOrderValue",
        MAX("createdAt") as "lastOrderDate"
      FROM "Order"
      WHERE "userId" = $1 AND status IN ('CONFIRMED', 'DELIVERED')
    `, [customerId])
    const m = metricsResult.rows[0]
    const orders = Number(m.totalOrders) || 0
    const ca = Number(m.totalSpent) || 0
    const last = m.lastOrderDate ? new Date(m.lastOrderDate) : null
    const daysSince = last ? Math.floor((Date.now() - last.getTime()) / 86400000) : null
    const segment = orders === 0 ? 'New'
      : (ca >= 1500 || orders >= 3) ? 'VIP'
      : (daysSince != null && daysSince > 90) ? 'At Risk'
      : 'Regular'
    const tier = ca >= 2000 ? 'Gold' : ca >= 500 ? 'Silver' : 'Bronze'

    // Override the stale stored columns with live values
    Object.assign(customer, {
      ordersCount: orders,
      lifetimeValue: ca,
      averageOrderValue: orders > 0 ? ca / orders : 0,
      lastOrderDate: m.lastOrderDate,
      daysSinceLastOrder: daysSince,
      segment,
      tier,
    })

    // CRM: recent WhatsApp messages (sent + received)
    const messagesResult = await pool.query(`
      SELECT id, direction, type, body, status, "createdAt", "orderId"
      FROM "MessageLog"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 10
    `, [customerId]).catch(() => ({ rows: [] }))

    // CRM: reviews left by this customer
    const reviewsResult = await pool.query(`
      SELECT r.id, r.rating, r.comment, r.approved, r."createdAt", p.name as "productName"
      FROM "Review" r
      LEFT JOIN "Product" p ON p.id = r."productId"
      WHERE r."userId" = $1
      ORDER BY r."createdAt" DESC
      LIMIT 10
    `, [customerId]).catch(() => ({ rows: [] }))

    /* Journal de fidelite : le detail derriere le solde de points. Sans lui on
       voit la cagnotte mais jamais d'ou elle vient, et une cliente qui conteste
       ses points ne peut pas etre departagee. */
    const loyaltyResult = await pool.query(`
      SELECT points, type, reason, pending, "createdAt"
      FROM "LoyaltyTransaction"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 20
    `, [customerId]).catch(() => ({ rows: [] }))

    /* Parrainages accordes par cette cliente. `pointsGiven` dit si la prime a
       deja ete versee — c'est la question qu'on se pose reellement. */
    const referralsResult = await pool.query(`
      SELECT r."pointsGiven", r."createdAt", u.name, u.email
      FROM "Referral" r
      JOIN "User" u ON u.id = r."referredId"
      WHERE r."referredById" = $1
      ORDER BY r."createdAt" DESC
    `, [customerId]).catch(() => ({ rows: [] }))

    return NextResponse.json({
      customer,
      orders: ordersResult.rows,
      activity: activityResult.rows,
      metrics: m,
      messages: messagesResult.rows,
      reviews: reviewsResult.rows,
      loyalty: loyaltyResult.rows,
      referrals: referralsResult.rows,
    })

  } catch (error: any) {
    console.error('GET customer detail error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customer', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/ops/customers/[id]
 * Update customer information
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: customerId } = await params
    const body = await request.json()

    /* MOT DE PASSE : traite a part, et jamais melange aux autres champs. Il ne
       part pas dans le UPDATE dynamique plus bas, sinon on ecrirait un jour le
       mot de passe en clair a la faveur d'un refactor. Reserve aux fondatrices
       et fondateurs : reinitialiser un acces n'est pas une edition de fiche. */
    if ('password' in body) {
      if (!await getOpsSession()) {
        return NextResponse.json({ error: 'Réservé aux fondateurs' }, { status: 403 })
      }
      const pwd = String(body.password ?? '')
      if (pwd.length < 6) {
        return NextResponse.json({ error: 'Minimum 6 caractères' }, { status: 400 })
      }
      const hash = await bcrypt.hash(pwd, 10)
      const r = await pool.query(
        `UPDATE "User" SET password = $1, "tempPassword" = NULL WHERE id = $2 RETURNING id`,
        [hash, customerId]
      )
      if (r.rows.length === 0) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      }
      await pool.query(`
        INSERT INTO "CustomerActivity" ("userId", "type", "action", "description", "createdAt")
        VALUES ($1, 'Profile', 'Password reset', $2, NOW())
      `, [customerId, `Réinitialisé par ${session.user.email}`]).catch(() => {})
      return NextResponse.json({ success: true })
    }

    const {
      name,
      phone,
      email,
      address,
      segment,
      tier,
      tags,
      notes,
      emailOptIn,
      smsOptIn,
      whatsappOptIn,
      banned,
      points,
      role,
    } = body

    // Build update query dynamically
    const updates: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (name !== undefined) {
      updates.push(`"name" = $${paramIndex}`)
      values.push(name)
      paramIndex++
    }

    if (phone !== undefined) {
      updates.push(`"phone" = $${paramIndex}`)
      values.push(phone)
      paramIndex++
    }

    if (email !== undefined) {
      updates.push(`"email" = $${paramIndex}`)
      values.push(email)
      paramIndex++
    }

    if (address !== undefined) {
      updates.push(`"address" = $${paramIndex}`)
      values.push(address)
      paramIndex++
    }

    if (segment !== undefined) {
      updates.push(`"segment" = $${paramIndex}`)
      values.push(segment)
      paramIndex++
    }

    if (tier !== undefined) {
      updates.push(`"tier" = $${paramIndex}`)
      values.push(tier)
      paramIndex++
    }

    if (tags !== undefined) {
      updates.push(`"tags" = $${paramIndex}`)
      values.push(tags)
      paramIndex++
    }

    if (notes !== undefined) {
      updates.push(`"notes" = $${paramIndex}`)
      values.push(notes)
      paramIndex++
    }

    if (emailOptIn !== undefined) {
      updates.push(`"emailOptIn" = $${paramIndex}`)
      values.push(emailOptIn)
      paramIndex++
    }

    if (smsOptIn !== undefined) {
      updates.push(`"smsOptIn" = $${paramIndex}`)
      values.push(smsOptIn)
      paramIndex++
    }

    if (whatsappOptIn !== undefined) {
      updates.push(`"whatsappOptIn" = $${paramIndex}`)
      values.push(whatsappOptIn)
      paramIndex++
    }

    if (banned !== undefined) {
      updates.push(`"banned" = $${paramIndex}`)
      values.push(Boolean(banned))
      paramIndex++
    }

    if (points !== undefined) {
      updates.push(`"points" = $${paramIndex}`)
      values.push(Number(points) || 0)
      paramIndex++
    }

    /* ROLE : promouvoir en ADMIN ouvre `/admin` sur la boutique. On n'accepte
       donc que les deux valeurs connues — une chaine libre venue du client
       ecrirait n'importe quoi dans la colonne qui garde cet acces — et on
       reserve le geste aux fondatrices et fondateurs. */
    if (role !== undefined) {
      if (!await getOpsSession()) {
        return NextResponse.json({ error: 'Réservé aux fondateurs' }, { status: 403 })
      }
      if (role !== 'ADMIN' && role !== 'USER') {
        return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 })
      }
      updates.push(`"role" = $${paramIndex}`)
      values.push(role)
      paramIndex++
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // Update customer
    const result = await pool.query(`
      UPDATE "User"
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, [...values, customerId])

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    // Log activity
    await pool.query(`
      INSERT INTO "CustomerActivity" ("userId", "type", "action", "description", "createdAt")
      VALUES ($1, 'Profile', 'Updated', $2, NOW())
    `, [customerId, `Updated by ${session.user.email}`])

    return NextResponse.json({
      success: true,
      customer: result.rows[0],
    })

  } catch (error: any) {
    console.error('PUT customer error:', error)
    return NextResponse.json(
      { error: 'Failed to update customer', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/ops/customers/[id]
 *
 * Ne supprime QUE les comptes sans histoire. C'est deliberement plus strict que
 * l'ancien ecran du site, dont le `DELETE ... WHERE role != 'ADMIN'` etait un
 * piege : les cles etrangeres de la base disent que
 *
 *   · "Order"."userId"       → SET NULL  : supprimer une cliente DETACHE ses
 *     commandes pour toujours. Le chiffre d'affaires reste, mais plus personne
 *     ne sait a qui il appartenait — perte irreversible et silencieuse ;
 *   · "LoyaltyTransaction", "Review", "Referral", "Address" → RESTRICT : la
 *     suppression ECHOUE des qu'il existe le moindre historique.
 *
 * Autrement dit l'ancien bouton plantait en 500 pour presque toute vraie
 * cliente, et ne « marchait » que sur les comptes vides — en orphelinant leurs
 * commandes au passage. On verifie donc AVANT, et on propose le bannissement,
 * qui est ce qu'on veut reellement dans 99 % des cas.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!await getOpsSession()) {
      return NextResponse.json({ error: 'Réservé aux fondateurs' }, { status: 403 })
    }

    const { id: customerId } = await params

    const who = await pool.query(`SELECT id, role, email FROM "User" WHERE id = $1`, [customerId])
    if (who.rows.length === 0) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }
    if (who.rows[0].role === 'ADMIN') {
      return NextResponse.json(
        { error: 'Un compte administrateur ne se supprime pas ici. Rétrograde-le en cliente d’abord.' },
        { status: 409 }
      )
    }

    const liens = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM "Order"              WHERE "userId"      = $1)::int AS commandes,
        (SELECT COUNT(*) FROM "Review"             WHERE "userId"      = $1)::int AS avis,
        (SELECT COUNT(*) FROM "LoyaltyTransaction" WHERE "userId"      = $1)::int AS fidelite,
        (SELECT COUNT(*) FROM "Referral"           WHERE "referredById" = $1
                                                      OR "referredId"   = $1)::int AS parrainages,
        (SELECT COUNT(*) FROM "Address"            WHERE "userId"      = $1)::int AS adresses
    `, [customerId])

    const l = liens.rows[0]
    const bloquants = Object.entries(l).filter(([, n]) => Number(n) > 0)

    if (bloquants.length > 0) {
      return NextResponse.json({
        error: 'Ce compte a un historique : le supprimer effacerait le lien avec ses commandes.',
        suggestion: 'Bannis-le plutôt — il perd l’accès, l’historique reste intact.',
        liens: l,
      }, { status: 409 })
    }

    await pool.query(`DELETE FROM "User" WHERE id = $1`, [customerId])
    return NextResponse.json({ success: true, deleted: who.rows[0].email })

  } catch (error: any) {
    console.error('DELETE customer error:', error)
    return NextResponse.json(
      { error: 'Failed to delete customer', details: error.message },
      { status: 500 }
    )
  }
}
