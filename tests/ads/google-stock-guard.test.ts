import test from 'node:test'
import assert from 'node:assert/strict'

/* La garde protege de l'argent reel : elle ne doit mettre en pause QUE ce qui est
   epuise, ne jamais rien activer, et ne rien toucher en cas de doute. */

const ENV = {
  GOOGLE_ADS_CUSTOMER_ID: '1380745039', GOOGLE_ADS_CLIENT_ID: 'id', GOOGLE_ADS_CLIENT_SECRET: 's',
  GOOGLE_ADS_REFRESH_TOKEN: 'r', GOOGLE_ADS_PROJECT_ID: 'p',
}

type Op = { adGroupOperation?: { update?: { resourceName?: string; status?: string }; updateMask?: string } }

function fakeGoogle(groups: { id: string; name: string }[], opts: { failMutate?: boolean } = {}) {
  const mutations: Op[][] = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('oauth2.googleapis.com')) return Response.json({ access_token: 't', expires_in: 3600 })
    if (u.endsWith('googleAds:search')) return Response.json({ results: groups.map((g) => ({ adGroup: { id: g.id, name: g.name }, campaign: { name: 'Olaplex' } })) })
    if (u.endsWith('googleAds:mutate')) {
      if (opts.failMutate) return Response.json({ error: { message: 'boom' } }, { status: 500 })
      mutations.push(JSON.parse(String(init?.body)).mutateOperations)
      return Response.json({})
    }
    if (u.includes('api.telegram.org')) return Response.json({ ok: true })
    throw new Error('unexpected fetch ' + u)
  }) as typeof fetch
  return mutations
}

async function fakeDb(rows: (sql: string, params: unknown[]) => { trouves: number; ok: number }) {
  const { default: pool } = await import('../../lib/db')
  ;(pool as unknown as { query: (s: string, p: unknown[]) => Promise<unknown> }).query = async (sql: string, params: unknown[]) => ({ rows: [rows(sql, params)] })
}

test('group names say what they sell', async () => {
  const { cibleDuGroupe } = await import('../../lib/ads/google-stock-guard')
  assert.deepEqual(cibleDuGroupe('Olaplex N°3 [p15]'), { ids: [15] })
  assert.deepEqual(cibleDuGroupe('Routine [p110, 118]'), { ids: [110, 118] })
  assert.deepEqual(cibleDuGroupe('Olaplex — marque [marque:Olaplex]'), { marque: 'Olaplex' })
  assert.equal(cibleDuGroupe('Groupe sans étiquette'), null)
})

test('a group whose products are all out of stock is paused — and only that group', async () => {
  Object.assign(process.env, ENV, { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: 'c' })
  const mutations = fakeGoogle([
    { id: '1', name: 'Olaplex N°3 [p15]' }, { id: '2', name: 'Olaplex N°4 [p16]' }, { id: '3', name: 'Sans étiquette' },
  ])
  await fakeDb((_s, p) => ({ trouves: 1, ok: (p[0] as number[])[0] === 15 ? 0 : 1 })) // 15 epuise, 16 en stock
  const { gardeStockGoogle } = await import('../../lib/ads/google-stock-guard')
  const r = await gardeStockGoogle()
  assert.equal(r.configured, true)
  if (!r.configured) return
  assert.equal(r.surveilles, 2, 'the untagged group is never touched')
  assert.deepEqual(r.mis_en_pause, ['Olaplex N°3 [p15]'])
  assert.equal(mutations.length, 1)
  assert.deepEqual(mutations[0], [{ adGroupOperation: { update: { resourceName: 'customers/1380745039/adGroups/1', status: 'PAUSED' }, updateMask: 'status' } }])
  assert.ok(mutations[0].every((o) => o.adGroupOperation?.update?.status === 'PAUSED'), 'it only ever pauses, never enables')
})

test('dry run reports but changes nothing', async () => {
  Object.assign(process.env, ENV)
  const mutations = fakeGoogle([{ id: '1', name: 'Olaplex N°3 [p15]' }])
  await fakeDb(() => ({ trouves: 1, ok: 0 }))
  const { gardeStockGoogle } = await import('../../lib/ads/google-stock-guard')
  const r = await gardeStockGoogle({ dry: true })
  assert.equal(mutations.length, 0)
  assert.ok(r.configured && r.mis_en_pause.length === 1)
})

test('an unknown product or an empty brand is never a reason to pause', async () => {
  Object.assign(process.env, ENV)
  const mutations = fakeGoogle([{ id: '1', name: 'X [p99999]' }, { id: '2', name: 'Marque [marque:Inconnue]' }])
  await fakeDb(() => ({ trouves: 0, ok: 0 }))
  const { gardeStockGoogle } = await import('../../lib/ads/google-stock-guard')
  const r = await gardeStockGoogle()
  assert.ok(r.configured && r.mis_en_pause.length === 0)
  assert.equal(mutations.length, 0)
})

test('a brand group pauses only when no product of the brand can be sold', async () => {
  Object.assign(process.env, ENV)
  let m = fakeGoogle([{ id: '9', name: 'Olaplex — marque [marque:Olaplex]' }])
  await fakeDb(() => ({ trouves: 16, ok: 3 }))
  const { gardeStockGoogle } = await import('../../lib/ads/google-stock-guard')
  await gardeStockGoogle(); assert.equal(m.length, 0, 'some products still sell')
  m = fakeGoogle([{ id: '9', name: 'Olaplex — marque [marque:Olaplex]' }])
  await fakeDb(() => ({ trouves: 16, ok: 0 }))
  await gardeStockGoogle(); assert.equal(m.length, 1)
})

test('without Google variables, or when Google fails, nothing is paused', async () => {
  for (const k of Object.keys(ENV)) delete process.env[k]
  const { gardeStockGoogle } = await import('../../lib/ads/google-stock-guard')
  assert.deepEqual(await gardeStockGoogle(), { configured: false })
  Object.assign(process.env, ENV)
  fakeGoogle([{ id: '1', name: 'Olaplex N°3 [p15]' }], { failMutate: true })
  await fakeDb(() => ({ trouves: 1, ok: 0 }))
  await assert.rejects(() => gardeStockGoogle(), /mutate 500/)
})
