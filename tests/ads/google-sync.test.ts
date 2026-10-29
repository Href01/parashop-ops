import test from 'node:test'
import assert from 'node:assert/strict'

/* La synchro Google ecrit la depense reelle dans "AdSpendDaily" : le tableau de
   bord additionne toute la table, une erreur d'unite (micros → dirhams) ou de
   devise fausserait la marge nette. On fait tourner le vrai code contre une
   fausse API Google et une fausse base. */

const ENV = {
  GOOGLE_ADS_CUSTOMER_ID: '1380745039', GOOGLE_ADS_CLIENT_ID: 'id', GOOGLE_ADS_CLIENT_SECRET: 'secret',
  GOOGLE_ADS_REFRESH_TOKEN: 'refresh', GOOGLE_ADS_PROJECT_ID: 'shine-cosmetics',
}

function fakeGoogle(currency: string, rows: unknown[]) {
  const seen: { url: string; body: string }[] = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    const body = String(init?.body ?? '')
    seen.push({ url: u, body })
    if (u.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'tok', expires_in: 3600 })
    if (body.includes('customer.currency_code')) return Response.json({ results: [{ customer: { currencyCode: currency } }] })
    return Response.json({ results: rows })
  }) as typeof fetch
  return seen
}

test('without the Google variables nothing runs and nothing breaks', async () => {
  for (const k of Object.keys(ENV)) delete process.env[k]
  const { synchroniserPubsGoogle } = await import('../../lib/ads/google-sync')
  assert.deepEqual(await synchroniserPubsGoogle(), { configured: false })
})

test('spend is converted from micros to dirhams and upserted as platform Google', async () => {
  Object.assign(process.env, ENV)
  const seen = fakeGoogle('MAD', [
    { campaign: { id: '24390118480', name: 'Olaplex — Search Maroc' }, segments: { date: '2026-10-30' }, metrics: { costMicros: '12340000', impressions: '210', clicks: '18', conversionsValue: 790 } },
    { campaign: { id: '24390118480', name: 'Olaplex — Search Maroc' }, segments: { date: '2026-10-31' }, metrics: { costMicros: '8000000', impressions: '90', clicks: '7' } },
    { campaign: { name: 'sans id' }, segments: { date: '2026-10-31' }, metrics: { costMicros: '1000000' } },
  ])
  const { default: pool } = await import('../../lib/db')
  const writes: unknown[][] = []
  ;(pool as unknown as { query: (sql: string, p?: unknown[]) => Promise<unknown> }).query = async (sql: string, p?: unknown[]) => {
    if (/INSERT INTO "AdSpendDaily"/.test(sql)) { assert.match(sql, /'Google'/); assert.match(sql, /ON CONFLICT \(platform, "externalId", date\)/); writes.push(p ?? []) }
    return { rows: [], rowCount: 0 }
  }
  const { synchroniserPubsGoogle } = await import('../../lib/ads/google-sync')
  const r = await synchroniserPubsGoogle({ from: '2026-10-30' })
  assert.equal(r.configured, true)
  if (!r.configured) return
  assert.equal(r.upserts, 2, 'a row without a campaign id is skipped')
  assert.equal(r.spend, 20.34)
  assert.deepEqual(writes[0], ['2026-10-30', '24390118480', 'Olaplex — Search Maroc', 12.34, 790, 210, 18])
  assert.deepEqual(writes[1], ['2026-10-31', '24390118480', 'Olaplex — Search Maroc', 8, 0, 90, 7])
  const gaql = seen.find((s) => s.body.includes('FROM campaign'))?.body ?? ''
  assert.match(gaql, /BETWEEN '2026-10-30' AND/)
  assert.ok(!seen.some((s) => /developer-token/i.test(s.body)), 'no developer token is needed')
  assert.ok(!seen.some((s) => /pageSize/.test(s.body)), 'pageSize makes the real API answer 400 (found by a live dry run)')
})

test('an account that is not in MAD is refused rather than mixed into the dirham totals', async () => {
  Object.assign(process.env, ENV)
  fakeGoogle('EUR', [{ campaign: { id: '1', name: 'x' }, segments: { date: '2026-10-30' }, metrics: { costMicros: '5000000' } }])
  const { synchroniserPubsGoogle } = await import('../../lib/ads/google-sync')
  await assert.rejects(() => synchroniserPubsGoogle(), /EUR, pas en MAD/)
})
