import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { calculerPeriodesUtc0, decalageHeures, heureLocaleDepuisUtcSql, instantDepuisHeureLocaleSql, minuitLocalEnUtcSql } from '../../lib/analytics/maroc-time'

/* La base de Neon donne UTC+0 au Maroc hors ramadan depuis le 21/09/2026 (heure
   reelle : UTC+1). Ces tests figent les faits dont depend la correction. */

test('Morocco is UTC+1, except during Ramadan (UTC+0)', () => {
  assert.equal(decalageHeures(Date.UTC(2026, 6, 1, 12)), 1, 'July')
  assert.equal(decalageHeures(Date.UTC(2026, 9, 24, 12)), 1, '24 Oct 2026 — the day PostgreSQL starts answering 0')
  assert.equal(decalageHeures(Date.UTC(2026, 11, 15, 12)), 1, 'December')
  assert.equal(decalageHeures(Date.UTC(2026, 2, 1, 12)), 0, 'Ramadan 2026')
  assert.equal(decalageHeures(Date.UTC(2027, 1, 20, 12)), 0, 'Ramadan 2027')
})

test('the UTC+0 periods are found, ordered, disjoint, and on whole seconds', () => {
  const { zero, jours } = calculerPeriodesUtc0()
  assert.ok(zero.length >= 10)
  const r2026 = zero.find((p) => p.debut === Date.UTC(2026, 1, 15, 2, 0, 0))
  assert.ok(r2026, 'Ramadan 2026 starts 15 Feb 2026 at 02:00 UTC')
  assert.equal(r2026!.fin, Date.UTC(2026, 2, 22, 2, 0, 0), '... and ends 22 Mar 2026 at 02:00 UTC')
  for (let i = 0; i < zero.length; i++) {
    assert.equal(zero[i].debut % 1000, 0); assert.equal(zero[i].fin % 1000, 0)
    assert.ok(zero[i].debut < zero[i].fin)
    if (i > 0) assert.ok(zero[i - 1].fin <= zero[i].debut)
  }
  assert.deepEqual(jours.find((j) => j.de === '2026-02-16'), { de: '2026-02-16', a: '2026-03-22' })
})

test('the SQL carries explicit boundaries and no time-zone name', () => {
  const heure = heureLocaleDepuisUtcSql('t."createdAt"')
  assert.match(heure, /TIMESTAMP '2026-02-15 02:00:00'/)
  assert.match(heure, /ELSE t\."createdAt" \+ INTERVAL '1 hour'/)
  const minuit = minuitLocalEnUtcSql('$1')
  assert.match(minuit, /DATE '2026-02-16'/)
  assert.match(minuit, /- INTERVAL '1 hour'/)
  assert.match(instantDepuisHeureLocaleSql('$5::text'), /- INTERVAL '1 hour'/)
  for (const sql of [heure, minuit]) assert.ok(!/time zone|Casablanca/i.test(sql), 'the database must not be asked for Morocco rules')
})

/* GARDE-FOU : ne jamais reintroduire une conversion « Africa/Casablanca » cote SQL.
   Elle derive d'une heure depuis le 21/09/2026. Passer par lib/analytics/metrics.ts. */
function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) { if (!['node_modules', '.next'].includes(e)) sources(p, out) }
    else if (/\.(ts|tsx)$/.test(e)) out.push(p)
  }
  return out
}

test('no SQL in the BOS converts to Morocco time through PostgreSQL', () => {
  const fautifs: string[] = []
  for (const f of [...sources('app'), ...sources('lib')]) {
    const chemin = f.replaceAll(String.fromCharCode(92), '/')
    if (/(maroc-time|analytics\/metrics)\.ts$/.test(chemin)) continue
    readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      const t = l.trim()
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
      if (/AT TIME ZONE '(\$\{[A-Z_]+\}|Africa\/Casablanca)'/.test(l)) fautifs.push(`${f}:${i + 1}`)
    })
  }
  assert.deepEqual(fautifs, [], 'use heureLocaleUtc / heureLocaleDepuisTz / instantDepuisLocal from lib/analytics/metrics.ts')
})
