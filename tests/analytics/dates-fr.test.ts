import assert from 'node:assert/strict'
import test from 'node:test'

import { dateFr, plageFr } from '@/lib/analytics/dates-fr'

/* Les barres de periode affichaient « 2026-10-04 → 2026-11-02 ». Le format est lu en UTC :
   un jour ne doit jamais glisser selon le fuseau de la machine. */

test('un jour s ecrit avec son mois en lettres et son annee', () => {
  assert.equal(dateFr('2026-11-02'), '2 nov. 2026')
  assert.equal(dateFr('2026-09-05'), '5 sept. 2026')
})

test('une plage ne repete l annee qu une fois quand elle est commune', () => {
  assert.equal(plageFr('2026-10-04', '2026-11-02'), '4 oct. → 2 nov. 2026')
  assert.equal(plageFr('2025-12-20', '2026-01-10'), '20 déc. 2025 → 10 janv. 2026', 'annees differentes : les deux')
})

test('un seul jour n affiche pas de fleche', () => {
  assert.equal(plageFr('2026-11-02', '2026-11-02'), '2 nov. 2026')
})

test('le 1er et le dernier jour du mois ne glissent pas', () => {
  assert.equal(dateFr('2026-10-01'), '1 oct. 2026')
  assert.equal(dateFr('2026-10-31'), '31 oct. 2026')
})

test('une valeur illisible est rendue telle quelle, jamais « Invalid Date »', () => {
  assert.equal(dateFr('pas une date'), 'pas une date')
  assert.equal(plageFr('x', 'y'), 'x → y')
})
