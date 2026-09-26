import test from 'node:test'
import assert from 'node:assert/strict'
import { SEO_RELEASES, releaseObservationDays } from '../../lib/seo/releases'
test('publication monitoring excludes the mixed deployment day and does not invent future observations', () => {
  assert.equal(releaseObservationDays('2026-09-25', '2026-09-23'), 0)
  assert.equal(releaseObservationDays('2026-09-25', '2026-09-25'), 0)
  assert.equal(releaseObservationDays('2026-09-25', '2026-09-26'), 1)
  assert.equal(releaseObservationDays('2026-09-25', '2026-10-02'), 7)
  assert.equal(releaseObservationDays('2026-09-25', '2026-10-23'), 28)
  assert.equal(releaseObservationDays('2026-09-25', null), 0)
  assert.equal(releaseObservationDays('invalid', '2026-09-25'), 0)
  assert.ok(SEO_RELEASES.every(release => release.commits.length > 0))
})
