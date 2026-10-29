import test from 'node:test'
import assert from 'node:assert/strict'
import { AGENTS_AUTOMATISES, VILLES_HEBERGEUR, fenetreSql, traficAutomatiseSql } from '../../lib/analytics/automated'

const sql = traficAutomatiseSql({ session: 's', paniers: 'st.paniers', duree: 'st.duree', commande: 'o.id' })

test('a session with a cart or an order is never automated', () => {
  assert.match(sql, /NOT \(COALESCE\(st\.paniers, 0\) > 0 OR o\.id IS NOT NULL\)/)
})

test('Morocco is never treated as automated by the city rule', () => {
  assert.match(sql, /COALESCE\(s\.country, ''\) <> 'MA'/)
})

test('big cities (diaspora) are only automated when the visit is short', () => {
  assert.match(sql, /COALESCE\(st\.duree, 0\) <= 120/)
  for (const v of ['Frankfurt am Main', 'London', 'New York City']) assert.ok(VILLES_HEBERGEUR.includes(v))
})

test('known review crawlers are covered', () => {
  for (const a of ['google-adwords', 'adsbot', 'facebookexternalhit', 'meta-externalagent']) assert.ok(AGENTS_AUTOMATISES.includes(a), a)
  assert.match(sql, /google-adwords/)
})

test('the date window bounds the column on both sides, with placeholders only, and asks the database for no time zone', () => {
  const f = fenetreSql('e."createdAt"', '$1', '$2')
  assert.match(f, /e\."createdAt" >= /)
  assert.match(f, /e\."createdAt" < /)
  assert.match(f, /\(\$1\)::date/)
  assert.match(f, /\(\$2\)::date \+ 1/)
  assert.ok(!/Casablanca|time zone/i.test(f), 'no database time-zone rule: PostgreSQL gets Morocco wrong since 21/09/2026')
  assert.ok(!/\(e\."createdAt" AT TIME ZONE/.test(f), 'no function applied to the column')
})
