import assert from 'node:assert/strict'
import test from 'node:test'

import { estPostBooste, libelleCampagne } from '@/lib/analytics/post-booste'

/* Noms reels de AdSpendDaily : « Publication Instagram : … » est la campagne creee par le
   bouton Booster (27-28/10 : 258 clics, 0 session). Les campagnes qui envoient vers le
   site ne doivent jamais etre etiquetees ainsi. */

test('un post booste est reconnu a son nom automatique, avec ou sans retour a la ligne', () => {
  assert.equal(estPostBooste('Publication Instagram : IMPERFECTIONS⁉️\nLET’S...'), true)
  assert.equal(estPostBooste('Publication Instagram : IMPERFECTIONS⁉️ LET’S...'), true)
  assert.equal(estPostBooste('  Publication Facebook : Promo'), true)
  assert.equal(estPostBooste('Instagram post: Hair care'), true)
})

test('les campagnes vers le site et la recherche ne sont jamais prises pour un post booste', () => {
  assert.equal(estPostBooste('Nouvelle campagne de Ventes'), false)
  assert.equal(estPostBooste('Olaplex — Search Maroc'), false)
  assert.equal(estPostBooste('Campagne Instagram Stories'), false, 'le mot Instagram ne suffit pas')
  assert.equal(estPostBooste('(sans campagne)'), false)
  assert.equal(estPostBooste(null), false)
  assert.equal(estPostBooste(undefined), false)
})

test('le libelle affiche la nature de la campagne, et laisse les autres intactes', () => {
  assert.equal(libelleCampagne('Publication Instagram : X'), 'Post boosté · Publication Instagram : X')
  assert.equal(libelleCampagne('Nouvelle campagne de Ventes'), 'Nouvelle campagne de Ventes')
})
