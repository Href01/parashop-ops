import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * GET /api/ops/partners/:id/campaigns → les campagnes connues (depense des 90
 *     derniers jours), avec celles deja liees au partenaire.
 * PUT /api/ops/partners/:id/campaigns { externalIds: string[] } → remplace la liste.
 *
 * Lier une campagne fait entrer TOUTE sa depense dans le releve du partenaire :
 * a reserver aux campagnes qui ne montrent que ses produits.
 */
export const dynamic = 'force-dynamic'

async function guard() {
  const s = await getServerSession(authOptions)
  return s?.user?.email || null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const partnerId = Number((await params).id)
  const r = await pool.query(
    `SELECT a."externalId", MAX(a."campaignName") AS name, MAX(a.platform) AS platform,
            SUM(a.spend)::double precision AS spend, MAX(a.date) AS "lastDate",
            BOOL_OR(pc."partnerId" IS NOT NULL) AS linked
       FROM "AdSpendDaily" a
       LEFT JOIN "PartnerAdCampaign" pc ON pc."externalId" = a."externalId" AND pc."partnerId" = $1
      WHERE a.date >= CURRENT_DATE - INTERVAL '90 days' OR pc."partnerId" IS NOT NULL
      GROUP BY a."externalId" ORDER BY MAX(a.date) DESC, SUM(a.spend) DESC`,
    [partnerId],
  )
  const campaigns = r.rows.map((x) => ({ ...x, spend: Math.round(Number(x.spend) * 100) / 100 }))
  return NextResponse.json({ campaigns }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const partnerId = Number((await params).id)
  const b = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(b.externalIds)
    ? b.externalIds.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)
    : []
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`DELETE FROM "PartnerAdCampaign" WHERE "partnerId" = $1`, [partnerId])
    for (const e of ids) {
      await client.query(
        `INSERT INTO "PartnerAdCampaign" ("partnerId", "externalId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [partnerId, e],
      )
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: e instanceof Error ? e.message : 'echec' }, { status: 500 })
  } finally {
    client.release()
  }
  return NextResponse.json({ ok: true, linked: ids.length })
}
