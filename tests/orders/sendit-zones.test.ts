import assert from 'node:assert/strict'
import test from 'node:test'

import { suggererZones, normaliser, MAX_SUGGESTIONS, type Zone } from '@/lib/sendit-zones'

const z = (id: number, name: string, ville = 'Casablanca'): Zone => ({ id, name, ville })
const CASA = ['Maarif', 'Belvédère', 'Ain Sebaa', 'Bouskoura', 'Sidi Maarouf', 'Hay Hassani', 'Californie', 'Gauthier'].map((n, i) => z(100 + i, `Casablanca - ${n}`))
const AUTRES = [z(1, 'Salé'), z(2, 'Salé - Hay Salam', 'Salé'), z(3, 'Rabat - Agdal', 'Rabat'), z(4, 'Kenitra', 'Kenitra'), z(5, 'Marrakech - Gueliz', 'Marrakech')]
const TOUTES = [...CASA, ...AUTRES]

test("la comparaison ignore les accents et la casse : « Sale » retrouve « Salé »", () => {
  assert.equal(normaliser('Salé'), 'sale')
  assert.equal(normaliser('  BELVÉDÈRE '), 'belvedere')
  const s = suggererZones('Sale', TOUTES)
  assert.equal(s.type, 'propositions')
  if (s.type === 'propositions') assert.deepEqual(s.zones.map((x) => x.id), [1], 'une correspondance EXACTE prime sur les zones qui contiennent « Salé »')
})

test("une ville qui n'existe qu'une fois est proposée", () => {
  const s = suggererZones('kenitra', TOUTES)
  assert.deepEqual(s, { type: 'propositions', zones: [AUTRES[3]] })
})

test("une ville trop générale ne produit AUCUNE suggestion au hasard : « Casablanca » a 8 zones ici", () => {
  assert.ok(CASA.length > MAX_SUGGESTIONS)
  assert.deepEqual(suggererZones('Casablanca', TOUTES), { type: 'trop-large', total: CASA.length })
})

test("sans correspondance, ou avec un texte trop court, on ne propose rien", () => {
  assert.deepEqual(suggererZones('Tombouctou', TOUTES), { type: 'aucune' })
  assert.deepEqual(suggererZones('', TOUTES), { type: 'aucune' })
  assert.deepEqual(suggererZones(null, TOUTES), { type: 'aucune' })
  assert.deepEqual(suggererZones('Sa', TOUTES), { type: 'aucune' }, 'deux lettres correspondent à tout : pas de suggestion')
})

test("un quartier saisi avec sa ville est retrouvé, et les propositions sont triées", () => {
  const s = suggererZones('maarif', TOUTES)
  assert.equal(s.type, 'propositions')
  if (s.type === 'propositions') assert.deepEqual(s.zones.map((x) => x.name), ['Casablanca - Maarif'])
  const t = suggererZones('Hay', [z(9, 'Rabat - Hay Riad', 'Rabat'), z(8, 'Casablanca - Hay Hassani'), z(7, 'Salé - Hay Salam', 'Salé')])
  assert.equal(t.type, 'propositions')
  if (t.type === 'propositions') assert.deepEqual(t.zones.map((x) => x.id), [8, 9, 7], 'ordre alphabétique stable')
})

test("« Autre » (valeur par défaut) n'est pas rangé sous « Casablanca - Autres quartiers » : un mot entier, pas une inclusion", () => {
  // constaté sur les 517 zones réelles : « Autre » × 2 commandes → « Casablanca - Autres quartiers »
  const zones = [z(1, 'Casablanca - Autres quartiers'), z(2, 'Marrakech', 'Marrakech'), z(3, 'Marrakech - Targa', 'Marrakech')]
  assert.deepEqual(suggererZones('Autre', zones), { type: 'aucune' })
  // un mot entier reste trouvé : « Targa » dans « Marrakech - Targa »
  const s = suggererZones('targa', zones)
  assert.equal(s.type, 'propositions')
  if (s.type === 'propositions') assert.deepEqual(s.zones.map((x) => x.id), [3])
})
