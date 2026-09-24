import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EVENT_STATUS_SQL } from '../../lib/event-status'

test('events filter and order on the same date-derived status as their displayed badge', () => {
  const route = readFileSync('app/api/ops/events/route.ts', 'utf8')
  assert.match(route, /conditions\.push\(`\(\$\{EVENT_STATUS_SQL\}\) = \$/)
  assert.match(route, /status: EVENT_STATUS_SQL/)
  assert.match(route, /\$\{EVENT_STATUS_SQL\} as "computedStatus"/)
  assert.doesNotMatch(route, /conditions\.push\(`e\.status/)
  assert.match(EVENT_STATUS_SQL, /CURRENT_DATE > e\."endDate"::date THEN 'Completed'/)
})
