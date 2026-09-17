import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('les leads attendent 30 minutes et les conversions excluent les annulations', () => {
  const source = readFileSync('app/api/ops/leads/route.ts', 'utf8')
  assert.equal((source.match(/<= NOW\(\) - INTERVAL '30 minutes'/g) ?? []).length, 3)
  assert.match(source, /o\."createdAt" >= a\."createdAt"/)
  assert.doesNotMatch(source, /o\."createdAt" >= a\."updatedAt"/)
  assert.equal((source.match(/AND o\.status <> 'CANCELLED'/g) ?? []).length, 2)
})

test('le tableau leads affiche un echec de lecture sans simuler une liste vide', () => {
  const source = readFileSync('app/leads/page.tsx', 'utf8')
  assert.match(source, /if \(!res\.ok\)/)
  assert.match(source, /role="alert"/)
  assert.match(source, /setError/)
  assert.match(source, /data &&/)
})
