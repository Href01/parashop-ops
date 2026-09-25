import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DATASETS,
  comparison,
  csvCell,
  daysBetween,
  makeReport,
  pacificDay,
  parseFilters,
  reportCsv,
  shiftDay,
  sumMetrics,
  type Filters,
  type SearchRow,
} from '../../lib/seo/model'

const filters: Filters = {
  days: 7,
  country: 'mar',
  device: 'all',
  query: '',
  page: '',
  match: 'contains',
}
const end = '2026-09-23'
const coverage = daysBetween('2026-09-10', end).flatMap((day) =>
  DATASETS.map((dataset) => ({ day, dataset, capped: false })),
)
const row = (overrides: Partial<SearchRow> = {}): SearchRow => ({
  day: end,
  dataset: 'site',
  query: '',
  page: '',
  country: 'mar',
  device: 'MOBILE',
  clicks: 4,
  impressions: 40,
  position: 6,
  ...overrides,
})
test('impression-weighted position and recomputed CTR, never averages of averages', () => {
  const m = sumMetrics([
    row({ impressions: 90, position: 2, clicks: 9 }),
    row({ impressions: 10, position: 22, clicks: 1 }),
  ])
  assert.equal(m.position, 4)
  assert.equal(m.ctr, 0.1)
})
test('no impressions means unknown position and CTR, not zero', () => {
  assert.deepEqual(sumMetrics([]), {
    clicks: 0,
    impressions: 0,
    ctr: null,
    position: null,
  })
})
test('Pacific date respects timezone and leap/month boundaries', () => {
  assert.equal(pacificDay(new Date('2026-09-25T02:00:00Z')), '2026-09-24')
  assert.equal(shiftDay('2024-03-01', -1), '2024-02-29')
  assert.equal(daysBetween('2026-08-30', '2026-09-01').length, 3)
})
test('validated defaults and bounded filters', () => {
  assert.deepEqual(parseFilters(new URLSearchParams()), {
    ...filters,
    days: 28,
  })
  for (const query of [
    'country=morocco',
    'device=PHONE',
    'match=regex',
    `query=${'a'.repeat(121)}`,
  ])
    assert.throws(() => parseFilters(new URLSearchParams(query)))
})
test('property totals never sum site, query, page and detail together', () => {
  const report = makeReport(
    DATASETS.map((dataset) =>
      row({
        dataset,
        query: dataset === 'query' || dataset === 'detail' ? 'olaplex' : '',
      }),
    ),
    coverage,
    end,
    filters,
  )
  assert.equal(report.current.clicks, 4)
  assert.equal(report.current.impressions, 40)
  assert.equal(report.comparable, true)
})
test('full periods do not overlap and zero-data imported days remain real zeros', () => {
  const r = makeReport(
    [row(), row({ day: '2026-09-16', clicks: 7 })],
    coverage,
    end,
    filters,
  )
  assert.equal(r.start, '2026-09-17')
  assert.equal(r.previousEnd, '2026-09-16')
  assert.equal(r.previousStart, '2026-09-10')
  assert.equal(r.current.clicks, 4)
  assert.equal(r.previous.clicks, 7)
  assert.equal(r.daily[0].current?.impressions, 0)
})
test('missing import disables alerts and renders missing day as null', () => {
  const r = makeReport(
    [row()],
    coverage.filter((i) => i.day !== end),
    end,
    filters,
  )
  assert.equal(r.comparable, false)
  assert.equal(r.missingSlices, 4)
  assert.equal(r.daily.at(-1)?.current, null)
  assert.deepEqual(r.alerts, [])
})
test('capped or truncated data must not raise ranking alerts', () => {
  assert.equal(
    makeReport(
      [],
      coverage.map((r, i) => (i === 0 ? { ...r, capped: true } : r)),
      end,
      filters,
    ).comparable,
    false,
  )
  assert.equal(makeReport([], coverage, end, filters, true).comparable, false)
})
test('query filtering uses query totals, page drilldown uses detail rows', () => {
  const rows = [
    row(),
    row({ dataset: 'query', query: 'olaplex maroc', impressions: 20 }),
    row({
      dataset: 'detail',
      query: 'olaplex maroc',
      page: '/marques/olaplex',
      impressions: 12,
    }),
  ]
  const r = makeReport(rows, coverage, end, { ...filters, query: 'OLAPLEX' })
  assert.equal(r.current.impressions, 20)
  assert.equal(r.pages[0].current.impressions, 12)
  assert.equal(r.aggregation, 'property')
  assert.equal(r.detailed, true)
})
test('exact keyword excludes longer phrases', () => {
  const rows = [
    row({ dataset: 'query', query: 'olaplex', impressions: 10 }),
    row({ dataset: 'query', query: 'olaplex maroc', impressions: 40 }),
  ]
  assert.equal(
    makeReport(rows, coverage, end, {
      ...filters,
      query: 'olaplex',
      match: 'exact',
    }).current.impressions,
    10,
  )
})
test('page filter uses page totals and query-page detail', () => {
  const r = makeReport(
    [
      row({ dataset: 'page', page: '/p', impressions: 30 }),
      row({ dataset: 'detail', query: 'olaplex', page: '/p', impressions: 10 }),
    ],
    coverage,
    end,
    { ...filters, page: '/p' },
  )
  assert.equal(r.current.impressions, 30)
  assert.equal(r.queries[0].current.impressions, 10)
  assert.equal(r.aggregation, 'page')
})
test('country and device filters preserve scope', () => {
  const r = makeReport(
    [
      row(),
      row({ country: 'fra', clicks: 100 }),
      row({ device: 'DESKTOP', clicks: 200 }),
    ],
    coverage,
    end,
    { ...filters, device: 'MOBILE' },
  )
  assert.equal(r.current.clicks, 4)
})
test('low volume is not a confident drop', () => {
  const before = sumMetrics([row({ impressions: 8, position: 5 })])
  const now = sumMetrics([row({ impressions: 12, position: 38 })])
  assert.equal(comparison('milk', now, before, true).signal, 'low-volume')
})
test('disappeared keyword is unobserved, never ranked zero', () => {
  const r = comparison('olaplex', sumMetrics([]), sumMetrics([row()]), true)
  assert.equal(r.signal, 'unobserved')
  assert.equal(r.positionDelta, null)
})
test('meaningful drop and CTR opportunity require sufficient volume', () => {
  assert.equal(
    comparison(
      'x',
      sumMetrics([row({ position: 10 })]),
      sumMetrics([row()]),
      true,
    ).signal,
    'drop',
  )
  assert.equal(
    comparison(
      'x',
      sumMetrics([row({ impressions: 100, clicks: 1 })]),
      sumMetrics([row({ impressions: 100 })]),
      true,
    ).signal,
    'opportunity',
  )
})
test('CSV is quoted, formula-safe and preserves unknown as blank', () => {
  assert.equal(csvCell(' =HYPERLINK("evil")'), '"\' =HYPERLINK(""evil"")"')
  assert.equal(csvCell(null), '""')
  assert.equal(csvCell('-cmd'), '"\'-cmd"')
  assert.ok(reportCsv([]).startsWith('\uFEFF'))
})
