import assert from 'node:assert/strict'
import test from 'node:test'
import { conseils, famille, verdicts, type EntreeConseils, type PubPourConseil } from '../../lib/ads/conseils'
import { BOUTONS, FORMATS_IMAGE, consigneImage, formatParDefaut } from '../../lib/ads/creatif-model'

const m = (depense: number, messages: number, achats = 0, ctr: number | null = 1) => ({ depense, messages, achats, coutParResultat: messages + achats ? depense / (messages + achats) : null, ctr })
const pub = (adId: string, o: Partial<PubPourConseil> & { j30: PubPourConseil['j30'] }): PubPourConseil => ({
  adId, nom: `Pub ${adId}`, statut: 'ACTIVE', objectif: 'OUTCOME_ENGAGEMENT', optimisation: 'CONVERSATIONS', boost: false, fatigue: false, frequence7j: 1.5, j7: m(0, 0), ...o,
})

test('famille : une campagne Messages reste Messages, même lancée en objectif Engagement', () => {
  assert.equal(famille({ objectif: 'OUTCOME_ENGAGEMENT', optimisation: 'CONVERSATIONS' }), 'messages')
  assert.equal(famille({ objectif: 'OUTCOME_SALES', optimisation: 'OFFSITE_CONVERSIONS' }), 'ventes')
  assert.equal(famille({ objectif: 'POST_ENGAGEMENT', optimisation: 'POST_ENGAGEMENT' }), 'autre')
})

test('verdicts : chaque pub contre la médiane de SA famille, jamais un DM contre un achat', () => {
  const pubs = [
    // Messages : 2 DH, 5 DH, 12 DH par conversation → médiane 5.
    pub('a', { j30: m(223, 100) }), pub('b', { j30: m(500, 100) }), pub('c', { j30: m(600, 50) }),
    // Ventes : un achat a 300 DH n'est pas « 60 fois plus cher » qu'un DM.
    pub('v1', { optimisation: 'OFFSITE_CONVERSIONS', objectif: 'OUTCOME_SALES', j30: m(300, 0, 1) }),
    pub('v2', { optimisation: 'OFFSITE_CONVERSIONS', objectif: 'OUTCOME_SALES', j30: m(330, 0, 1) }),
    pub('rien', { j30: m(250, 0) }), pub('petit', { j30: m(40, 1) }),
  ]
  const v = verdicts(pubs, 100)
  assert.equal(v.a.verdict, 'gagnante')
  assert.match(v.a.raison, /2,2 DH par message/)
  assert.equal(v.b.verdict, 'surveiller')
  assert.equal(v.c.verdict, 'couper')
  assert.equal(v.v1.verdict, 'surveiller', 'compared with the other Sales ad, not with DMs')
  assert.equal(v.rien.verdict, 'couper')
  assert.match(v.rien.raison, /sans aucun message/)
  assert.equal(v.petit.verdict, 'trop_tot')
})

const base = (): EntreeConseils => ({
  v: { jours: 30, depense: 2281, livrees: 19, ca: 9432, marge: 5444, profitApresPub: 3163, coutParCommandeLivree: 120, seuilParCommande: 287, parCanal: [{ canal: 'Instagram', commandes: 8 }, { canal: 'Website', commandes: 5 }, { canal: 'WhatsApp', commandes: 2 }] },
  precedent: null, pubs: [], enAttente: 0, depenseMois: 0, jourDuMois: 10, joursDansMois: 30, repartitions: {},
  strategie: { budgetMensuel: null, coutParCommandeMax: null, frequenceMax: 3, depenseMinAvantVerdict: 100, boostsAutorises: false, manques: [], produitsExclus: [] },
  produits: [],
})

test('conseils : une perte le dit, avec les commandes encore en route', () => {
  const e = base()
  e.v = { ...e.v, jours: 7, depense: 890, livrees: 2, marge: 438, profitApresPub: -452, coutParCommandeLivree: 445, seuilParCommande: 219 }
  e.enAttente = 6
  const c = conseils(e)
  assert.equal(c[0].niveau, 'alerte')
  assert.match(c[0].titre, /Tu perds 452 DH/)
  assert.match(c[0].detail, /6 commande\(s\).*en cours de livraison/)
  assert.ok(c.some((x) => x.id === 'seuil'))
})

test('conseils : relancer la meilleure pub en pause, suivre les DM, pousser le bon produit, compléter la stratégie', () => {
  const e = base()
  e.pubs = [pub('pause', { statut: 'CAMPAIGN_PAUSED', j30: m(223, 100) }), pub('b', { j30: m(500, 100) }), pub('c', { j30: m(600, 60) })]
  e.produits = [
    { id: 49, nom: 'Sun And More', marque: 'Milk Shake', margeShine: 106, stockVendable: 19, importBloque: false, vendus90j: 21 },
    { id: 33, nom: 'Masque 21', marque: 'Salerm', margeShine: 127, stockVendable: 0, importBloque: true, vendus90j: 16 },
    { id: 96, nom: 'Relief Sun', marque: 'Beauty of Joseon', margeShine: 40, stockVendable: 8, importBloque: false, vendus90j: 2 },
  ]
  e.strategie.manques = ['budget mensuel']
  const c = conseils(e)
  const ids = c.map((x) => x.id)
  assert.ok(ids.includes('relancer-pause'))
  assert.ok(ids.includes('suivi'), '10 of 15 orders came from DMs')
  assert.ok(ids.includes('pousser-49'), 'Salerm is blocked at customs: never pushed')
  assert.ok(!ids.includes('pousser-33'))
  assert.equal(c.find((x) => x.id === 'pousser-49')?.action?.demande?.genre, 'creatifs')
  assert.ok(ids.includes('strategie'))
  // Ordre : alertes, puis opportunites, puis conseils.
  const niveaux = c.map((x) => x.niveau)
  assert.deepEqual(niveaux, [...niveaux].sort((a, b) => ['alerte', 'opportunite', 'conseil'].indexOf(a) - ['alerte', 'opportunite', 'conseil'].indexOf(b)))
})

test('conseils : le budget du mois, dépassé ou sous-utilisé', () => {
  const e = base()
  e.strategie.budgetMensuel = 3000
  e.depenseMois = 1500; e.jourDuMois = 10
  assert.ok(conseils(e).some((x) => x.id === 'budget-haut'))
  e.depenseMois = 300
  assert.ok(conseils(e).some((x) => x.id === 'budget-bas'))
})

test('la consigne du visuel : le vrai produit, aucun texte, de la place pour l’accroche', () => {
  const t = consigneImage({ angle: 'démonstration', accroche: 'Cheveux secs après la plage ?', visuel: 'Flacon sur une serviette, lumière du soir', public: 'femmes 25-40', format: 'reel' }, [{ nom: 'Sun And More', marque: 'Milk Shake' }], 'story')
  assert.match(t, /Milk Shake « Sun And More »/)
  assert.match(t, /Reproduce the product EXACTLY/)
  assert.match(t, /ABSOLUTELY NO TEXT/)
  assert.match(t, /top 18%.*bottom 25%/)
  assert.match(t, /Flacon sur une serviette/)
  assert.equal(formatParDefaut('reel'), 'story')
  assert.equal(formatParDefaut('image'), 'feed')
  // Tailles de generation : multiples de 16, rapport exact.
  for (const f of Object.values(FORMATS_IMAGE)) {
    const [w, h] = f.taille.split('x').map(Number)
    assert.equal(w % 16, 0); assert.equal(h % 16, 0)
    assert.ok(Math.abs(w / h - f.ratio) < 0.01)
  }
  assert.equal(BOUTONS.message.ar, 'أرسلي رسالة')
})
