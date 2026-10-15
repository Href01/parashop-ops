import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'
import { CLE_CAMPAGNES_MIXTES, campagnesMixtes } from '@/lib/partner-ledger'

/**
 * GET /api/ops/partners/:id/campaigns → les campagnes connues (depense des 90
 *     derniers jours), avec celles deja liees au partenaire.
 * PUT /api/ops/partners/:id/campaigns { externalIds: string[], mixtes?: string[] } → remplace les listes.
 *
 * Deux facons de lier une campagne :
 *  - « ses produits seulement » (externalIds) : TOUTE sa depense entre dans son releve ;
 *  - « mixte » (mixtes) : seule sa part entre, au prorata de ses ventes du mois.
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
  const mixtes = new Set(await campagnesMixtes(partnerId))
  const campaigns = r.rows.map((x) => ({ ...x, spend: Math.round(Number(x.spend) * 100) / 100, mode: x.linked ? 'dedie' : mixtes.has(x.externalId) ? 'mixte' : null }))
  return NextResponse.json({ campaigns }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await guard())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const partnerId = Number((await params).id)
  const b = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(b.externalIds)
    ? b.externalIds.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0)
    : []
  const mixtes: string[] = Array.isArray(b.mixtes)
    ? b.mixtes.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0 && !ids.includes(x))
    : await campagnesMixtes(partnerId)
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
    const cur = await client.query(`SELECT value FROM "AppSetting" WHERE key = $1 FOR UPDATE`, [CLE_CAMPAGNES_MIXTES])
    let tous: Record<string, string[]> = {}
    try { tous = JSON.parse(cur.rows[0]?.value ?? '{}') || {} } catch { tous = {} }
    tous[String(partnerId)] = [...new Set(mixtes)]
    await client.query(
      `INSERT INTO "AppSetting" (key, value, "updatedAt") VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = now()`,
      [CLE_CAMPAGNES_MIXTES, JSON.stringify(tous)],
    )
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: e instanceof Error ? e.message : 'echec' }, { status: 500 })
  } finally {
    client.release()
  }
  return NextResponse.json({ ok: true, linked: ids.length })
}
