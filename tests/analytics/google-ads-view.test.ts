import assert from 'node:assert/strict'
import test from 'node:test'

import {
  construireVueGoogle, parserCampagnes, parserGroupes, parserMotsCles, idNumerique, normaliserMotCle, NON_RATTACHE,
  type GoogleDonnees, type LigneSite, type LigneCmd,
} from '@/lib/analytics/google-ads-view'

const CAMP = '24390118480', GRP_MARQUE = '202231463512', GRP_N3 = '203170161722'

/* Les trois requetes Google (REST : nombres en chaines, argent en micros), reduites a l'essentiel. */
const campagnes = parserCampagnes([{ campaign: { id: CAMP, name: 'Olaplex — Search Maroc' }, metrics: { impressions: '138', clicks: '30', costMicros: '46990000' } }])
const groupes = parserGroupes([
  { campaign: { id: CAMP, name: 'Olaplex — Search Maroc' }, adGroup: { id: GRP_MARQUE, name: 'Olaplex — marque' }, metrics: { impressions: '78', clicks: '23', costMicros: '32370000' } },
  { campaign: { id: CAMP, name: 'Olaplex — Search Maroc' }, adGroup: { id: GRP_N3, name: 'Olaplex N°3 [p15]' }, metrics: { impressions: '40', clicks: '3', costMicros: '5400000' } },
])
const motsCles = parserMotsCles([
  { campaign: { id: CAMP, name: 'Olaplex — Search Maroc' }, adGroup: { id: GRP_MARQUE, name: 'Olaplex — marque' }, adGroupCriterion: { keyword: { text: 'olaplex', matchType: 'EXACT' } }, metrics: { impressions: '35', clicks: '11', costMicros: '15420000' } },
  { campaign: { id: CAMP, name: 'Olaplex — Search Maroc' }, adGroup: { id: GRP_MARQUE, name: 'Olaplex — marque' }, adGroupCriterion: { keyword: { text: 'olaplex maroc', matchType: 'EXACT' } }, metrics: { impressions: '6', clicks: '2', costMicros: '2720000' } },
  { campaign: { id: CAMP, name: 'Olaplex — Search Maroc' }, adGroup: { id: GRP_MARQUE, name: 'Olaplex — marque' }, adGroupCriterion: { keyword: { text: 'olaplex maroc', matchType: 'PHRASE' } }, metrics: { impressions: '9', clicks: '2', costMicros: '3870000' } },
  { campaign: { id: CAMP, name: 'Olaplex — Search Maroc' }, adGroup: { id: GRP_N3, name: 'Olaplex N°3 [p15]' }, adGroupCriterion: { keyword: { text: 'olaplex 3', matchType: 'EXACT' } }, metrics: { impressions: '17', clicks: '1', costMicros: '1130000' } },
])
const GOOGLE: GoogleDonnees = { campagnes, groupes, motsCles }

/* Le site : 29 visites, dont 5 d'avant le suivi par identifiant (« olaplex-search », sans groupe ni mot-cle). */
const TRAFIC: LigneSite[] = [
  { campagne: 'olaplex-search', groupe: null, motCle: null, sessions: 5, paniers: 0 },
  { campagne: CAMP, groupe: GRP_MARQUE, motCle: 'olaplex', sessions: 12, paniers: 1 },
  { campagne: CAMP, groupe: GRP_MARQUE, motCle: 'Olaplex Maroc', sessions: 4, paniers: 0 },
  { campagne: CAMP, groupe: GRP_N3, motCle: 'olaplex 3', sessions: 3, paniers: 0 },
  { campagne: CAMP, groupe: GRP_MARQUE, motCle: null, sessions: 5, paniers: 0 },
]
const CMD: LigneCmd[] = [
  { campagne: CAMP, groupe: GRP_MARQUE, motCle: 'olaplex', passees: 2, livrees: 1, annulees: 0, enCours: 1, caLivre: 395, margeLivree: 190 },
]
const vue = (niveau: 'campagne' | 'groupe' | 'motcle', google: GoogleDonnees | null = GOOGLE) =>
  construireVueGoogle({ niveau, google, trafic: TRAFIC, commandes: CMD, emballageParColis: 7 })

test('l API Google est lue en dirhams : les micros sont divises, les chaines deviennent des nombres', () => {
  assert.deepEqual(campagnes, [{ campagneId: CAMP, campagne: 'Olaplex — Search Maroc', impressions: 138, clics: 30, depense: 46.99 }])
  assert.equal(motsCles.length, 4)
  assert.equal(motsCles[0].depense, 15.42)
  assert.deepEqual(parserCampagnes([{ metrics: {} }]), [], 'une ligne sans identifiant est ignoree')
})

test('une visite se rattache par IDENTIFIANT : olaplex-search (ancien nom ecrit en dur) n est pas un identifiant', () => {
  assert.equal(idNumerique(CAMP), CAMP)
  assert.equal(idNumerique('olaplex-search'), null)
  assert.equal(idNumerique(null), null)
  assert.equal(idNumerique('123'), null, 'trop court pour un identifiant Google')
})

test('campagne : depense, clics et visites se rejoignent ; les 5 visites d avant le suivi sont a part, pas devinees', () => {
  const v = vue('campagne')
  const c = v.lignes.find((l) => l.cle === CAMP)!
  assert.equal(c.libelle, 'Olaplex — Search Maroc')
  assert.equal(c.depense, 46.99); assert.equal(c.clics, 30)
  assert.equal(c.sessions, 24, '12 + 4 + 3 + 5 rattachees a la campagne')
  const nr = v.lignes.find((l) => l.cle === NON_RATTACHE)!
  assert.equal(nr.sessions, 5); assert.equal(nr.rattache, false)
  assert.equal(nr.depense, null, 'pas de depense inventee pour des visites sans identifiant')
  assert.equal(v.lignes[v.lignes.length - 1].cle, NON_RATTACHE, 'Non rattache toujours en dernier')
})

test('mot-cle : exact et expression d un meme texte s additionnent, et la casse du lien n empeche pas la jointure', () => {
  const v = vue('motcle')
  const maroc = v.lignes.find((l) => l.libelle === 'olaplex maroc')!
  assert.equal(maroc.clics, 4, '2 exact + 2 expression')
  assert.equal(maroc.depense, 6.59)
  assert.equal(maroc.sessions, 4, 'Olaplex Maroc dans l URL = olaplex maroc chez Google')
  assert.equal(maroc.contexte, 'Olaplex — marque')
  const sans = v.lignes.find((l) => l.cle === `${GRP_MARQUE}|`)!
  assert.equal(sans.sessions, 5, 'visites du groupe sans mot-cle transmis : gardees, rangees a part')
  assert.equal(normaliserMotCle('  Olaplex   N3 '), 'olaplex n3')
})

test('profit = marge livree - emballage - depense ; le taux de conversion est commandes / visites', () => {
  const v = vue('motcle')
  const o = v.lignes.find((l) => l.libelle === 'olaplex')!
  assert.equal(o.marge, 183, '190 - 7 x 1 livree')
  assert.equal(o.profit, 167.58, '183 - 15,42')
  assert.equal(o.commandes, 2); assert.equal(o.sessions, 12)
  assert.equal(o.tauxConversion, 16.67)
  assert.equal(o.cpc, 1.4); assert.equal(o.ctr, 31.43)
})

test('si Google n a pas repondu, la depense et le profit sont inconnus (null), jamais 0', () => {
  const v = vue('campagne', null)
  assert.equal(v.googleDisponible, false)
  for (const l of v.lignes) { assert.equal(l.depense, null); assert.equal(l.profit, null); assert.equal(l.clics, null) }
  assert.equal(v.totaux.depense, null); assert.equal(v.totaux.profit, null)
  assert.ok(v.totaux.sessions > 0, 'les visites, elles, viennent de la boutique et restent affichees')
})

test('les totaux ne dependent pas du niveau et incluent les visites non rattachees', () => {
  const a = vue('campagne').totaux, b = vue('motcle').totaux, c = vue('groupe').totaux
  assert.deepEqual(a, b); assert.deepEqual(a, c)
  assert.equal(a.sessions, 29); assert.equal(a.paniers, 1)
  assert.equal(a.depense, 46.99); assert.equal(a.clics, 30)
  assert.equal(a.visitesParClic, 96.67, '29 visites pour 30 clics : un seul clic n a pas ouvert de page')
  assert.equal(a.profit, 183 - 46.99, 'marge livree apres emballage moins TOUTE la depense Google')
})

test('un mot-cle sans depense sur la periode mais avec des visites est garde, a 0 de depense (Google a repondu)', () => {
  const v = construireVueGoogle({
    niveau: 'motcle', google: GOOGLE, emballageParColis: 7, commandes: [],
    trafic: [{ campagne: CAMP, groupe: GRP_N3, motCle: 'olaplex hair perfector', sessions: 2, paniers: 0 }],
  })
  const l = v.lignes.find((x) => x.libelle === 'olaplex hair perfector')!
  assert.equal(l.depense, 0); assert.equal(l.sessions, 2)
  assert.equal(l.cpc, null, 'pas de clic connu : pas de CPC')
})

test('la depense passe avant les visites dans le tri', () => {
  const v = vue('motcle')
  const rattachees = v.lignes.filter((l) => l.rattache)
  assert.equal(rattachees[0].libelle, 'olaplex', 'le mot-cle qui coute le plus')
  const dep = rattachees.map((l) => l.depense ?? -1)
  assert.deepEqual(dep, [...dep].sort((x, y) => y - x))
})

test('une ligne Google sans aucune activite (groupe dormant) n apparait pas, mais ses visites si elles existent', () => {
  const dormant: GoogleDonnees = {
    campagnes: campagnes,
    groupes: [...groupes, { campagneId: '999', campagne: 'Ancienne', groupeId: '55555', groupe: 'Groupe d annonces 1', impressions: 0, clics: 0, depense: 0 }],
    motsCles,
  }
  const sans = construireVueGoogle({ niveau: 'groupe', google: dormant, trafic: [], commandes: [], emballageParColis: 0 })
  assert.equal(sans.lignes.some((l) => l.cle === '55555'), false)
  const avec = construireVueGoogle({ niveau: 'groupe', google: dormant, trafic: [{ campagne: CAMP, groupe: '55555', motCle: null, sessions: 3, paniers: 0 }], commandes: [], emballageParColis: 0 })
  assert.equal(avec.lignes.find((l) => l.cle === '55555')?.sessions, 3, 'des visites reelles ne disparaissent jamais')
})
