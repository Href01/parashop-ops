import assert from 'node:assert/strict'
import test from 'node:test'

import { lectureMarge, lectureConversion, type FacteurLecture } from '@/lib/analytics/lecture'

/* Les chiffres de l'audit du 2026-10-29 : marge 5 256 → 2 880 MAD sur 30 jours. */
const FACTEURS: FacteurLecture[] = [
  { label: 'Volume de commandes', effet: 1237, de: '17 cmd', a: '21 cmd' },
  { label: 'Taux de livraison', effet: -1237, de: '100,0 %', a: '81,0 %', provisoire: '3 commandes encore en cours' },
  { label: 'Marge par commande', effet: -2376, de: '309 MAD', a: '169 MAD' },
]

test('la marge qui recule désigne le facteur ferme le plus lourd, et met le provisoire à part', () => {
  const l = lectureMarge({ depart: 5256, arrivee: 2880, facteurs: FACTEURS })!
  assert.match(l.titre, /recule de 2\s376 MAD/)
  assert.match(l.titre, /−45 %/)
  assert.match(l.detail ?? '', /Premier facteur : marge par commande/)
  assert.match(l.detail ?? '', /309 MAD → 169 MAD/)
  assert.match(l.detail ?? '', /Taux de livraison est provisoire : 3 commandes encore en cours/)
  assert.doesNotMatch(l.detail ?? '', /Premier facteur : taux de livraison/, "un facteur provisoire n'est jamais accusé")
})

test("un facteur qui va dans l'autre sens n'est pas désigné responsable d'un recul", () => {
  const l = lectureMarge({ depart: 1000, arrivee: 600, facteurs: [
    { label: 'Volume de commandes', effet: 900, de: '10 cmd', a: '19 cmd' },
    { label: 'Marge par commande', effet: -1300, de: '100 MAD', a: '40 MAD' },
    { label: 'Taux de livraison', effet: 0, de: '90,0 %', a: '90,0 %' },
  ] })!
  assert.match(l.detail ?? '', /Premier facteur : marge par commande/)
})

test("sous 5 % d'écart la marge est dite stable, sans chercher de coupable", () => {
  const l = lectureMarge({ depart: 1000, arrivee: 1030, facteurs: FACTEURS })!
  assert.match(l.titre, /stable/)
  assert.equal(l.detail, undefined)
})

test("une marge qui progresse le dit, et rien n'est inventé sans données", () => {
  assert.match(lectureMarge({ depart: 1000, arrivee: 1500, facteurs: [{ label: 'Volume de commandes', effet: 500, de: '10 cmd', a: '15 cmd' }] })!.titre, /progresse de 500 MAD \(\+50 %\)/)
  assert.equal(lectureMarge({ depart: 0, arrivee: 0, facteurs: [] }), null)
  assert.equal(lectureMarge({ depart: NaN, arrivee: 1, facteurs: [] }), null)
  assert.match(lectureMarge({ depart: 0, arrivee: 400, facteurs: [] })!.titre, /progresse de 400 MAD : 0 MAD → 400 MAD/, 'départ nul : pas de pourcentage inventé')
})

/* L'entonnoir réel du 30 j : 3 449 → 182 → 59 → 12 → 9 → 9 → 9. */
const ENTONNOIR = [
  { label: 'Fiche produit', sessions: 3449 }, { label: 'Ajout au panier', sessions: 182 },
  { label: 'Checkout démarré', sessions: 59 }, { label: 'Clic sur « Commander »', sessions: 12 },
  { label: 'Coordonnées validées', sessions: 9 }, { label: 'Téléphone vérifié (code)', sessions: 9 }, { label: 'Commande acceptée', sessions: 9 },
]

test("la conversion donne la réponse, puis la pire perte APRÈS le panier (la première marche est toujours la pire)", () => {
  const l = lectureConversion(ENTONNOIR)!
  assert.match(l.titre, /9 sessions sur 3\s449 vont jusqu'à « Commande acceptée » \(0,3 %\)/)
  assert.match(l.detail ?? '', /Plus grosse perte : Fiche produit → Ajout au panier \(95 % s'arrêtent\)/)
  assert.match(l.detail ?? '', /Une fois le parcours engagé, c'est Checkout démarré → Clic sur « Commander » \(80 % s'arrêtent\)/)
})

test("quand la pire marche est déjà après le panier, elle n'est pas dite deux fois", () => {
  const l = lectureConversion([
    { label: 'Panier', sessions: 100 }, { label: 'Checkout', sessions: 90 }, { label: 'Envoi', sessions: 20 }, { label: 'Achat', sessions: 18 },
  ])!
  assert.equal((l.detail ?? '').match(/s'arrêtent/g)?.length, 1)
  assert.match(l.detail ?? '', /Checkout → Envoi \(78 % s'arrêtent\)/)
})

test("un entonnoir vide ou à une seule marche ne produit aucune phrase", () => {
  assert.equal(lectureConversion([]), null)
  assert.equal(lectureConversion([{ label: 'A', sessions: 10 }]), null)
  assert.equal(lectureConversion([{ label: 'A', sessions: 0 }, { label: 'B', sessions: 0 }]), null)
  assert.match(lectureConversion([{ label: 'A', sessions: 1 }, { label: 'B', sessions: 1 }])!.titre, /1 session sur 1 /)
})
