import assert from 'node:assert/strict'
import test from 'node:test'
import { domaine, motsPorteurs } from '../../lib/seo/agent-model'

/**
 * Relier une requete suivie (« olaplex n°3 prix maroc ») aux recherches reelles
 * de Search Console (« olaplex 3 », « olaplex no 3 ») : c'est ce qui donne a
 * l'agent la vraie position de Shine. Une requete exacte a souvent moins de
 * cinq impressions par mois ; ses variantes disent la demande.
 */

test('le numero Olaplex se lit pareil, quelle que soit son ecriture', () => {
  for (const q of ['olaplex n°3', 'olaplex N° 3', 'olaplex n3', 'olaplex no 3', 'Olaplex nº3']) {
    assert.deepEqual(motsPorteurs(q), ['olaplex', '3'], q)
  }
})

test('les mots d’intention et « maroc » ne comptent pas comme sens', () => {
  assert.deepEqual(motsPorteurs('olaplex n°3 prix maroc'), ['olaplex', '3'])
  assert.deepEqual(motsPorteurs('olaplex original maroc'), ['olaplex'])
})

test('les accents et la casse sont neutralises, pas les mots', () => {
  assert.deepEqual(motsPorteurs('Crème solaire coréenne maroc'), ['creme', 'solaire', 'coreenne'])
  assert.deepEqual(motsPorteurs('milk shake sun & more'), ['milk', 'shake', 'sun', '&', 'more'])
})

test('l’arabe est garde', () => {
  assert.deepEqual(motsPorteurs('milk shake للشعر'), ['milk', 'shake', 'للشعر'])
})

test('le domaine d’un resultat, sans www, et une URL illisible rendue telle quelle', () => {
  assert.equal(domaine('https://www.primini.ma/prix/151867/x'), 'primini.ma')
  assert.equal(domaine('https://shinecosmetics.ma/marques/olaplex'), 'shinecosmetics.ma')
  assert.equal(domaine('pas une url'), 'pas une url')
})
