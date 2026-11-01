import assert from 'node:assert/strict'
import test from 'node:test'

import { livraisonOfferteEligible, normaliserTarifs, zoneDeVille } from '@/lib/livraison-regles'
import { remiseDejaAccordee } from '@/lib/order-edit'

/* Regles de la boutique (lib/livraison.ts) : frais de la zone sous le seuil, 0 des que le
   SOUS-TOTAL des produits, avant code promo, l'atteint. Grille reelle : 19/35 MAD, seuil 499. */
const GRILLE = normaliserTarifs({ casa: { frais: 19, gratuitDes: 499 }, autres: { frais: 35, gratuitDes: 499 } })
const e = (ville: string, sousTotal: number, fraisActuels: number) =>
  livraisonOfferteEligible({ ville, sousTotal, fraisActuels, tarifs: GRILLE })

test('la commande 362 : 615 MAD a Agadir avec 35 MAD de frais a droit a la livraison offerte', () => {
  assert.equal(e('Agadir', 615, 35), true)
})

test('le seuil est inclus (>=) et se lit sur les produits AVANT code promo', () => {
  assert.equal(e('Rabat', 499, 35), true)
  assert.equal(e('Rabat', 498, 35), false)
})

test('Casablanca et les autres villes ont chacune leurs frais ; « casablanca - Maarif » est Casablanca', () => {
  assert.equal(zoneDeVille('casablanca - Maarif'), 'casa')
  assert.equal(zoneDeVille('Agadir'), 'autres')
  assert.equal(e('Casablanca', 520, 19), true)
  assert.equal(e('Casablanca', 520, 35), false, 'frais negocies : pas ceux de la zone, on ne touche pas')
})

test('une livraison deja offerte, negociee ou en main propre n est jamais proposee', () => {
  assert.equal(e('Agadir', 900, 0), false, 'deja gratuite')
  assert.equal(e('Agadir', 900, 25), false, 'frais negocies')
  assert.equal(e('Agadir', 300, 35), false, 'sous le seuil')
})

test('une grille a frais 0 ne propose rien, et une grille illisible garde ses valeurs par defaut', () => {
  const zero = normaliserTarifs({ casa: { frais: 0, gratuitDes: 100 }, autres: { frais: 0, gratuitDes: 100 } })
  assert.equal(livraisonOfferteEligible({ ville: 'Rabat', sousTotal: 500, fraisActuels: 0, tarifs: zero }), false)
  assert.equal(normaliserTarifs('nimportequoi').autres.frais, 35)
})

test('remise deja accordee : saisie a la main, ou enfouie dans le total comme le fait la boutique', () => {
  assert.equal(remiseDejaAccordee({ discountTotal: 0, productsTotal: 450, revenue: 405 }), true, '362 a la creation : 450 -> 405')
  assert.equal(remiseDejaAccordee({ discountTotal: 62, productsTotal: 615, revenue: 553 }), true)
  assert.equal(remiseDejaAccordee({ discountTotal: 0, productsTotal: 180, revenue: 180 }), false, 'code enregistre mais jamais accorde (ex. #6)')
  assert.equal(remiseDejaAccordee({ discountTotal: 0, productsTotal: 250, revenue: 260 }), false, 'revenue > produits : pas une remise')
})
