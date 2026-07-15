// Smoke test: connect a Yjs client to the running server, write a value, confirm it
// persists to Postgres, then a SECOND client loads the value back. Also checks that a
// bad token is rejected, and that HTTP GET returns 200 (Render health check).
const path = require('path')
const { HocuspocusProvider } = require('@hocuspocus/provider')
// Force the SAME yjs instance the provider uses (avoids the "multiple yjs" sync bug in Node).
const providerDir = path.dirname(require.resolve('@hocuspocus/provider'))
const Y = require(require.resolve('yjs', { paths: [providerDir] }))
console.log('yjs identity ok:', require.resolve('yjs', { paths: [providerDir] }))
const WS = require('ws')
const { Pool } = require('pg')
const fs = require('fs')
const http = require('http')

const DATABASE_URL = fs.readFileSync('../.env', 'utf8').match(/DATABASE_URL\s*=\s*"?([^"\n]+)"?/)[1]
const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
const URL = 'ws://127.0.0.1:3999'
const TOKEN = 'testtok'
const DOC = 'test:smoke:' + Date.now()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function connect(doc, token, onFail) {
  const opts = { url: URL, name: DOC, token, document: doc, WebSocketPolyfill: WS }
  if (onFail) opts.onAuthenticationFailed = onFail
  return new HocuspocusProvider(opts)
}
function synced(provider) {
  return new Promise((res, rej) => {
    if (provider.synced) return res()
    provider.on('synced', () => res())
    setTimeout(() => rej(new Error('sync timeout')), 8000)
  })
}

;(async () => {
  // 0. HTTP health check
  const health = await new Promise((res) => {
    http.get('http://127.0.0.1:3999/', (r) => { let b = ''; r.on('data', (d) => (b += d)); r.on('end', () => res({ code: r.statusCode, body: b })) }).on('error', () => res({ code: 0 }))
  })
  console.log('health GET:', health.code, JSON.stringify(health.body))

  // 1. client 1: connect + write
  const doc1 = new Y.Doc()
  const p1 = connect(doc1, TOKEN)
  await synced(p1)
  doc1.getMap('data').set('hello', 'bonjour-monde')
  await wait(1500) // broadcast + persist (Database.store debounces)

  // 2. verify persisted to Postgres
  const row = await pool.query('SELECT length(data) AS bytes FROM "WorkspaceDoc" WHERE name=$1', [DOC])
  const bytes = row.rows[0]?.bytes ?? 0
  console.log('persisted row bytes:', bytes)

  // 3. client 2: fresh doc, should load the value back
  const doc2 = new Y.Doc()
  const p2 = connect(doc2, TOKEN)
  await synced(p2)
  await wait(400)
  const val = doc2.getMap('data').get('hello')
  console.log('client2 loaded value:', val)

  // 4. bad token rejected
  let rejected = false
  const pBad = connect(new Y.Doc(), 'WRONG', () => { rejected = true })
  await wait(1500)
  console.log('bad token rejected:', rejected)

  const ok = health.code === 200 && bytes > 0 && val === 'bonjour-monde' && rejected
  console.log(ok ? 'SMOKE TEST PASSED ✓' : 'SMOKE TEST FAILED ✗')

  p1.destroy(); p2.destroy(); pBad.destroy()
  await pool.query('DELETE FROM "WorkspaceDoc" WHERE name=$1', [DOC])
  await pool.end()
  process.exit(ok ? 0 : 1)
})().catch((e) => { console.error('ERR', e.message); process.exit(1) })
