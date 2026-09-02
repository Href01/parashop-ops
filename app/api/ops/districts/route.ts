import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getAllDistricts } from '@/lib/sendit'
import pool from '@/lib/db'

interface CachedDistrict {
  id: number
  ville: string
  name: string
  arabic_name: string
  price: number
  delais: string
  refreshedAt: string
}

async function readCachedDistricts() {
  return pool.query<CachedDistrict>(
    `SELECT id, ville, name, "arabicName" AS arabic_name,
            price::double precision AS price, delais, "refreshedAt"
     FROM "SenditDistrictCache" ORDER BY name ASC`
  )
}

// GET /api/ops/districts - Get all Sendit districts
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const initial = await readCachedDistricts()
    const refreshedAt = initial.rows[0]?.refreshedAt
    const fresh = Boolean(
      refreshedAt && Date.now() - new Date(refreshedAt).getTime() < 24 * 60 * 60 * 1000
    )
    if (initial.rowCount && fresh) {
      return NextResponse.json(initial.rows, { headers: { 'X-District-Cache': 'hit' } })
    }

    const client = await pool.connect()
    let transactionOpen = false
    try {
      await client.query('BEGIN')
      transactionOpen = true
      const lock = await client.query<{ acquired: boolean }>(
        `SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired`,
        ['shine:sendit-district-cache']
      )
      if (!lock.rows[0]?.acquired) {
        await client.query('ROLLBACK')
        transactionOpen = false
        if (initial.rowCount) {
          return NextResponse.json(initial.rows, { headers: { 'X-District-Cache': 'stale' } })
        }
        return NextResponse.json({ error: 'Mise à jour des destinations en cours' }, { status: 503 })
      }

      const recheck = await client.query<{ refreshedAt: string }>(
        `SELECT MAX("refreshedAt") AS "refreshedAt" FROM "SenditDistrictCache"`
      )
      const latest = recheck.rows[0]?.refreshedAt
      if (latest && Date.now() - new Date(latest).getTime() < 24 * 60 * 60 * 1000) {
        await client.query('COMMIT')
        transactionOpen = false
        const cached = await readCachedDistricts()
        return NextResponse.json(cached.rows, { headers: { 'X-District-Cache': 'hit-after-lock' } })
      }

      const districts = await getAllDistricts()
      if (districts.length === 0) {
        throw new Error('Sendit returned an empty district list; preserving the existing cache')
      }
      await client.query(
        `WITH incoming AS (
           SELECT * FROM jsonb_to_recordset($1::jsonb) AS d(
             id int, ville text, name text, arabic_name text, price numeric, delais text
           )
         )
         INSERT INTO "SenditDistrictCache" (id, ville, name, "arabicName", price, delais, "refreshedAt")
         SELECT id, ville, name, arabic_name, price, delais, NOW() FROM incoming
         ON CONFLICT (id) DO UPDATE SET
           ville = EXCLUDED.ville, name = EXCLUDED.name, "arabicName" = EXCLUDED."arabicName",
           price = EXCLUDED.price, delais = EXCLUDED.delais, "refreshedAt" = NOW()`,
        [JSON.stringify(districts)]
      )
      await client.query(
        `DELETE FROM "SenditDistrictCache"
         WHERE id <> ALL($1::int[])`,
        [districts.map((district) => district.id)]
      )
      await client.query('COMMIT')
      transactionOpen = false
      const cached = await readCachedDistricts()
      return NextResponse.json(cached.rows, { headers: { 'X-District-Cache': 'refreshed' } })
    } catch (error) {
      if (transactionOpen) await client.query('ROLLBACK').catch(() => {})
      if (initial.rowCount) {
        console.error('District refresh failed; serving stale cache:', error)
        return NextResponse.json(initial.rows, { headers: { 'X-District-Cache': 'stale-on-error' } })
      }
      throw error
    } finally {
      client.release()
    }
  } catch (error: unknown) {
    console.error('Get districts error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch districts', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
