import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchDay,
  latestFinalDay,
  READ_SCOPE,
  SeoError,
  normalizeInspection,
  PRIORITY_URLS,
  readPrivateKey,
} from '../../lib/seo/google'

test('server key supports a local file without requiring secrets inside the project', async () => {
  const key = await readPrivateKey({ GSC_PRIVATE_KEY_FILE: '/secure/example.pem' }, async (path) => {
    assert.equal(path, '/secure/example.pem')
    return 'test-key'
  })
  assert.equal(key, 'test-key')
  assert.equal(await readPrivateKey({ GSC_PRIVATE_KEY: 'line1\\nline2', GSC_PRIVATE_KEY_FILE: '/unused' }, async () => {
    throw new Error('must not read file when inline key is configured')
  }), 'line1\nline2')
})

test('key errors never expose file paths or underlying errors', async () => {
  await assert.rejects(readPrivateKey({ GSC_PRIVATE_KEY_FILE: '/secret/path' }, async () => {
    throw new Error('private filesystem details')
  }), (error: unknown) => error instanceof SeoError && error.code === 'key_unavailable' && !error.message.includes('/secret') && !error.message.includes('filesystem'))
  await assert.rejects(readPrivateKey({}), SeoError)
})
test('inspection stores Google snapshot facts and never invents an index verdict', () => {
  const missing = normalizeInspection(PRIORITY_URLS[0], {})
  assert.equal(missing.verdict, null)
  assert.ok(missing.error)
  const found = normalizeInspection(PRIORITY_URLS[1], {
    inspectionResult: {
      indexStatusResult: {
        verdict: 'PASS',
        coverageState: 'Indexée',
        lastCrawlTime: '2026-09-12T03:37:44Z',
        googleCanonical: PRIORITY_URLS[1],
      },
    },
  })
  assert.equal(found.verdict, 'PASS')
  assert.equal(found.lastCrawl, '2026-09-12T03:37:44Z')
  assert.ok(
    PRIORITY_URLS.every((url) =>
      url.startsWith('https://www.shinecosmetics.ma/'),
    ),
  )
})
test('read-only scope; final data, explicit aggregation and dimensions', async () => {
  const bodies: Record<string, unknown>[] = []
  const result = await fetchDay(
    async (body) => {
      bodies.push(body)
      return {
        rows: [
          {
            keys: ['olaplex', 'mar', 'MOBILE'],
            clicks: 1,
            impressions: 8,
            position: 4,
          },
        ],
      }
    },
    '2026-09-23',
    'query',
  )
  assert.equal(
    READ_SCOPE,
    'https://www.googleapis.com/auth/webmasters.readonly',
  )
  assert.equal(bodies[0].dataState, 'final')
  assert.equal(bodies[0].aggregationType, 'byProperty')
  assert.deepEqual(bodies[0].dimensions, ['query', 'country', 'device'])
  assert.equal(result.rows[0].query, 'olaplex')
  assert.equal(result.capped, false)
})
test('empty result is a successful observed slice, not an error', async () => {
  assert.deepEqual(await fetchDay(async () => ({}), '2026-09-23', 'site'), {
    rows: [],
    capped: false,
  })
})
test('malformed response rejects the entire import', async () => {
  await assert.rejects(
    fetchDay(
      async () => ({
        rows: [{ keys: ['mar'], clicks: -1, impressions: 2, position: 1 }],
      }),
      '2026-09-23',
      'site',
    ),
    SeoError,
  )
})
test('pagination uses 25k offset and reports the 50k ceiling', async () => {
  const offsets: number[] = []
  const result = await fetchDay(
    async (body) => {
      const offset = body.startRow as number
      offsets.push(offset)
      return {
        rows: Array.from({ length: 25000 }, (_, i) => ({
          keys: [`q${i + offset}`, 'mar', 'MOBILE'],
          clicks: 0,
          impressions: 1,
          position: 20,
        })),
      }
    },
    '2026-09-23',
    'query',
  )
  assert.deepEqual(offsets, [0, 25000])
  assert.equal(result.rows.length, 50000)
  assert.equal(result.capped, true)
})
test('duplicate keys fail closed to prevent double counting', async () => {
  const row = {
    keys: ['mar', 'MOBILE'],
    clicks: 1,
    impressions: 2,
    position: 3,
  }
  await assert.rejects(
    fetchDay(async () => ({ rows: [row, row] }), '2026-09-23', 'site'),
    /Pagination Google incohérente/,
  )
})
test('latest date is based on Google finalized dates, not assumed today', async () => {
  assert.equal(
    await latestFinalDay(
      async () => ({
        rows: [
          { keys: ['2026-09-23'], clicks: 1, impressions: 1, position: 1 },
        ],
      }),
      '2026-09-15',
      '2026-09-25',
    ),
    '2026-09-23',
  )
  assert.equal(
    await latestFinalDay(async () => ({}), '2026-09-15', '2026-09-25'),
    null,
  )
})
