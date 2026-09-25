import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { saveDay, CLAIM_SQL, type SqlClient } from '../../lib/seo/persistence'
import { DATASETS, type SearchRow } from '../../lib/seo/model'

test('Postgres: migration, idempotent replacement, rollback and lease isolation', async () => {
  // Isolated in-memory Postgres. Never reads DATABASE_URL or touches the shared store.
  const db = new PGlite()
  try {
    const migration = await readFile(
      new URL('../../migrations/043_seo_insights.sql', import.meta.url),
      'utf8',
    )
    await db.exec(migration)
    await db.exec(migration)
    let releases = 0
    const client: SqlClient = {
      query: (sql, params) => db.query(sql, params),
      release: () => {
        releases++
      },
    }
    const row = (
      dataset: (typeof DATASETS)[number],
      clicks: number,
    ): SearchRow => ({
      day: '2026-09-23',
      dataset,
      query: 'Olaplex "N3"',
      page: 'https://www.shinecosmetics.ma/p',
      country: 'mar',
      device: 'MOBILE',
      clicks,
      impressions: 40,
      position: 7.2,
    })
    const batches = (clicks: number) =>
      DATASETS.map((dataset) => ({
        rows: [row(dataset, clicks)],
        capped: false,
      }))
    await saveDay(
      client,
      'sc-domain:shinecosmetics.ma',
      '2026-09-23',
      batches(2),
    )
    await saveDay(
      client,
      'sc-domain:shinecosmetics.ma',
      '2026-09-23',
      batches(3),
    )
    const count = await db.query<{ n: number; clicks: number }>(
      'SELECT COUNT(*)::int AS n, SUM(clicks)::int AS clicks FROM "SeoSearchDaily"',
    )
    assert.deepEqual(count.rows[0], { n: 4, clicks: 12 })
    const imports = await db.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM "SeoImportDay"',
    )
    assert.equal(imports.rows[0].n, 4)
    const faulty: SqlClient = {
      ...client,
      query: async (sql, params) => {
        if (
          sql.startsWith('INSERT INTO "SeoImportDay"') &&
          params?.[2] === 'page'
        )
          throw new Error('simulated database failure')
        return db.query(sql, params)
      },
    }
    await assert.rejects(
      saveDay(
        faulty,
        'sc-domain:shinecosmetics.ma',
        '2026-09-23',
        batches(100),
      ),
      /simulated/,
    )
    const after = await db.query<{ n: number }>(
      'SELECT SUM(clicks)::int AS n FROM "SeoSearchDaily"',
    )
    assert.equal(after.rows[0].n, 12)
    assert.equal(releases, 3)
    await saveDay(
      client,
      'sc-domain:shinecosmetics.ma',
      '2026-09-23',
      DATASETS.map(() => ({ rows: [], capped: false })),
    )
    assert.equal(
      (
        await db.query<{ n: number }>(
          'SELECT COUNT(*)::int AS n FROM "SeoSearchDaily"',
        )
      ).rows[0].n,
      0,
    )
    assert.equal(
      (
        await db.query<{ n: number }>(
          'SELECT COUNT(*)::int AS n FROM "SeoImportDay"',
        )
      ).rows[0].n,
      4,
    )
    const first = await db.query(CLAIM_SQL, [
      'property',
      '11111111-1111-4111-8111-111111111111',
    ])
    const second = await db.query(CLAIM_SQL, [
      'property',
      '22222222-2222-4222-8222-222222222222',
    ])
    assert.equal(first.rows.length, 1)
    assert.equal(second.rows.length, 0)
    await db.query(
      'UPDATE "SeoSyncState" SET locked_until=now()-interval \'1 minute\' WHERE property=$1',
      ['property'],
    )
    assert.equal(
      (
        await db.query(CLAIM_SQL, [
          'property',
          '22222222-2222-4222-8222-222222222222',
        ])
      ).rows.length,
      1,
    )
  } finally {
    await db.close()
  }
})
