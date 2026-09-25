import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeFilterSearch } from '../../lib/seo/filter-url'
import { analyticsModuleHref } from '../../lib/analytics/navigation'

test('consecutive filter changes keep brand, period and device', () => {
  let search = mergeFilterSearch('', { query: 'milk' })
  search = mergeFilterSearch(search, { days: '7' })
  search = mergeFilterSearch(search, { device: 'MOBILE' })
  const result = new URLSearchParams(search)
  assert.equal(result.get('query'), 'milk')
  assert.equal(result.get('days'), '7')
  assert.equal(result.get('device'), 'MOBILE')
  assert.equal(result.get('country'), 'mar')
})

test('exact drilldown is atomic and a new query resets match only', () => {
  let search = mergeFilterSearch(
    '?country=all&page=https%3A%2F%2Fexample.test',
    {
      query: 'olaplex n° 3',
      match: 'exact',
    },
  )
  assert.equal(new URLSearchParams(search).get('match'), 'exact')
  search = mergeFilterSearch(search, { query: 'milk shake' })
  const result = new URLSearchParams(search)
  assert.equal(result.get('match'), 'contains')
  assert.equal(result.get('country'), 'all')
  assert.equal(result.get('page'), 'https://example.test')
})

test('clearing a filter preserves the others and excludes unrelated URL keys', () => {
  const result = new URLSearchParams(
    mergeFilterSearch('?query=olaplex&device=DESKTOP&unrelated=value', {
      query: '',
    }),
  )
  assert.equal(result.get('query'), '')
  assert.equal(result.get('device'), 'DESKTOP')
  assert.equal(result.has('unrelated'), false)
})

test('Google segments never leak into internal analytics or vice versa', () => {
  assert.equal(
    analyticsModuleHref(
      '/analytics/seo',
      '/analytics/acquisition',
      'device=MOBILE&country=mar&query=milk',
    ),
    '/analytics/acquisition',
  )
  assert.equal(
    analyticsModuleHref(
      '/analytics/sessions',
      '/analytics/seo',
      'device=mobile&source=facebook&days=90',
    ),
    '/analytics/seo',
  )
  assert.equal(
    analyticsModuleHref(
      '/analytics/acquisition',
      '/analytics/conversion',
      'device=mobile&days=7',
    ),
    '/analytics/conversion?device=mobile&days=7',
  )
  assert.equal(
    analyticsModuleHref('/analytics/seo', '/analytics/seo', 'query=milk'),
    '/analytics/seo?query=milk',
  )
})
