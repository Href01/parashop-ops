import test from 'node:test'
import assert from 'node:assert/strict'
import { DATASETS, daysBetween, makeReport, reportCsv, shiftDay, type Filters, type SearchRow } from '../../lib/seo/model'

const end = '2026-09-23'
const filters: Filters = { days: 7, country: 'mar', device: 'all', query: '', page: '', match: 'contains' }
const coverage = daysBetween('2026-07-30', end).flatMap(day => DATASETS.map(dataset => ({ day, dataset, capped: false })))
const row = (overrides: Partial<SearchRow> = {}): SearchRow => ({ day: end, dataset: 'detail', query: 'olaplex', page: '/marques/olaplex', country: 'mar', device: 'MOBILE', clicks: 3, impressions: 30, position: 6, ...overrides })

for (const days of [7, 28] as const) test(`query-page pairs compare non-overlapping ${days}-day periods without mixing destinations`, () => {
  const r = makeReport([
    row({ day: shiftDay(end, -days), impressions: 40, position: 3 }),
    row(), row({ impressions: 10, position: 2, device: 'DESKTOP' }),
    row({ page: '/products/15', impressions: 80, position: 15 }),
    row({ query: 'olaplex n3', impressions: 200 }),
    row({ dataset: 'query', impressions: 800 }),
    row({ country: 'fra', impressions: 900 }),
  ], coverage, end, { ...filters, days })
  assert.equal(r.queryPages.length, 3)
  const pair = r.queryPages.find(p => p.query === 'olaplex' && p.page === '/marques/olaplex')!
  assert.equal(pair.current.impressions, 40)
  assert.equal(pair.current.position, 5)
  assert.equal(pair.previous.position, 3)
  assert.equal(pair.positionDelta, 2)
  assert.equal(r.queries[0].current.impressions, 800)
  assert.equal(r.current.impressions, 0, 'pair rows are not property totals')
})

test('exact query, page and device filters apply to pairs', () => {
  const r = makeReport([row(), row({ query: 'olaplex n3' }), row({ page: '/products/15' }), row({ device: 'DESKTOP' })], coverage, end, { ...filters, query: 'OLAPLEX', match: 'exact', page: '/marques/olaplex', device: 'MOBILE' })
  assert.equal(r.queryPages.length, 1)
  assert.equal(r.queryPages[0].current.impressions, 30)
})

test('unobserved landing pairs stay visible and incomplete collection disables deltas', () => {
  const rows = [row({ day: shiftDay(end, -7) })]
  const complete = makeReport(rows, coverage, end, filters).queryPages[0]
  assert.equal(complete.signal, 'unobserved')
  assert.equal(complete.current.position, null)
  const partial = makeReport(rows, coverage.filter(c => c.day !== end), end, filters).queryPages[0]
  assert.equal(partial.positionDelta, null)
  assert.equal(partial.impressionDelta, null)
})

test('pair CSV has separate query and URL columns and escapes formula input', () => {
  const r = makeReport([row({ query: '=HYPERLINK("x")' })], coverage, end, filters)
  const csv = reportCsv(r.queryPages, true)
  assert.match(csv, /^\uFEFF"Requête";"Page d’arrivée"/)
  assert.match(csv, /"'=/)
  assert.match(csv, /"CTR précédent"/)
  assert.doesNotMatch(csv, /\["/)
})
