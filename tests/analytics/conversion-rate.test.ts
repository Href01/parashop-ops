import assert from 'node:assert/strict'
import test from 'node:test'

import { DERIVEES, DENOMINATEUR, MESURES, assembler, mesuresBrutes, problemeCompatibilite, sourcesRequises } from '@/lib/analytics/model'
import { MIN_OBS } from '@/lib/analytics/metrics'

/* « Une visite sur 40 finit en commande » : commandes / visites, pour chaque canal et chaque campagne. */

test('le taux de conversion est commandes / visites, en pourcentage', () => {
  const calc = DERIVEES.tauxConversion.calc
  assert.equal(calc({ commandes: 3, sessions: 120 }), 2.5)
  assert.equal(calc({ commandes: 0, sessions: 29 }), 0, 'des visites et aucune commande : 0 %, un vrai zéro')
})

test('sans visite il n y a pas de taux : jamais 0 %, qui dirait personne n a commande', () => {
  assert.equal(DERIVEES.tauxConversion.calc({ commandes: 6, sessions: 0 }), null, 'commandes saisies à la main : pas de visite')
  assert.equal(DERIVEES.tauxConversion.calc({ commandes: 0, sessions: 0 }), null)
})

test('la mesure croise commandes et visites, et la fiabilité vient des visites', () => {
  assert.equal(MESURES.tauxConversion.sql, null, 'dérivée : calculée après les agrégats, jamais en SQL')
  assert.equal(MESURES.tauxConversion.seuil, MIN_OBS)
  assert.equal(DENOMINATEUR.tauxConversion, 'sessions')
  const brutes = mesuresBrutes(['tauxConversion'])
  assert.ok(brutes.includes('commandes') && brutes.includes('sessions'))
  assert.deepEqual(new Set(sourcesRequises(['tauxConversion'])), new Set(['commandes', 'sessions']))
})

test('elle se ventile par canal et par campagne (les deux sources savent classer)', () => {
  assert.equal(problemeCompatibilite({ dimension: 'canal', mesures: ['tauxConversion'] }), null)
  assert.equal(problemeCompatibilite({ dimension: 'campagne', mesures: ['tauxConversion'] }), null)
})

test('sous le seuil de visites on affiche l effectif, pas un pourcentage qui prétend généraliser', () => {
  const lignes = assembler(
    { mesures: ['tauxConversion'], periode: { debut: '2026-10-01', fin: '2026-10-30' } },
    { 'Google Ads': { commandes: 0, sessions: 29 }, 'Instagram Ads': { commandes: 3, sessions: 2308 }, 'Instagram (DM · via pub)': { commandes: 6, sessions: 0 } },
  )
  const par = Object.fromEntries(lignes.map((l) => [l.cle, l.mesures.tauxConversion]))
  assert.equal(par['Google Ads'].valeur, null); assert.equal(par['Google Ads'].n, 29); assert.equal(par['Google Ads'].fiable, false)
  assert.ok(Math.abs((par['Instagram Ads'].valeur as number) - 0.13) < 0.01, '3 / 2 308 = 0,13 %')
  assert.equal(par['Instagram Ads'].fiable, true)
  assert.equal(par['Instagram (DM · via pub)'].valeur, null, 'DM : pas de visite, pas de taux')
})
