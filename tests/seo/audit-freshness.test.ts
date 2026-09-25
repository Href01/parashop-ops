import test from 'node:test'
import assert from 'node:assert/strict'
import { reusableAudit, type TechnicalReport } from '../../lib/seo/technical'

test('backfill reuses only recent complete technical and Google checks', () => {
  const now = Date.parse('2026-09-25T17:00:00Z')
  const report: TechnicalReport = {
    checkedAt: '2026-09-25T16:45:00Z', discovered: 1, checked: 1, complete: true,
    issues: [], healthy: 1, sitemapError: null,
    indexing: [{url: 'https://www.shinecosmetics.ma/', verdict: 'PASS', coverage: null, lastCrawl: null, googleCanonical: null, declaredCanonical: null, error: null}],
  }
  assert.equal(reusableAudit(report, now), true)
  assert.equal(reusableAudit(null, now), false)
  assert.equal(reusableAudit({...report, complete: false}, now), false)
  assert.equal(reusableAudit({...report, indexing: []}, now), false)
  assert.equal(reusableAudit({...report, indexing: [{...report.indexing![0], error: 'permission'}]}, now), false)
  assert.equal(reusableAudit({...report, checkedAt: 'invalid'}, now), false)
  assert.equal(reusableAudit({...report, checkedAt: '2026-09-25T16:00:00Z'}, now), false)
  assert.equal(reusableAudit({...report, checkedAt: '2026-09-25T18:00:00Z'}, now), false)
})
