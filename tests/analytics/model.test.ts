import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assembler,
  construireSql,
  problemeCompatibilite,
  type Requete,
} from '../../lib/analytics/model'

const periode = { debut: '2026-08-01', fin: '2026-08-31' }

test('la base livraison filtre et date les commandes livrees', () => {
  const req: Requete = { mesures: ['livrees', 'caLivre'], periode, basis: 'cash', filtres: [] }
  const sql = construireSql('commandes', req, periode)?.texte ?? ''

  assert.match(sql, /o\."deliveredAt"/)
  assert.match(sql, /DELIVERED/)
  assert.doesNotMatch(sql, /o\."createdAt" AT TIME ZONE 'Africa\/Casablanca'\)\:\:date BETWEEN/)
})

test('la base cohorte conserve la date de creation', () => {
  const req: Requete = { mesures: ['commandes', 'livrees'], periode, basis: 'cohorte', filtres: [] }
  const sql = construireSql('commandes', req, periode)?.texte ?? ''

  assert.match(sql, /o\."createdAt"/)
})

test('les produits evenementiels sont rattaches au catalogue canonique', () => {
  const req: Requete = { dimension: 'produit', mesures: ['vuesProduit'], periode, filtres: [] }
  const sql = construireSql('evenements', req, periode)?.texte ?? ''

  assert.match(sql, /LEFT JOIN "Product" p ON p\.id/)
  assert.match(sql, /COALESCE\(NULLIF\(TRIM\(p\.name\)/)
})

test('une segmentation impossible est refusee explicitement', () => {
  const erreur = problemeCompatibilite({
    mesures: ['depensePub'],
    filtres: [{ dimension: 'appareil', valeurs: ['mobile'] }],
  })

  assert.match(erreur ?? '', /Appareil/)
  assert.match(erreur ?? '', /pub/)
})

test('la comparaison conserve les cles absentes de la periode courante', () => {
  const req: Requete = { dimension: 'canal', mesures: ['tauxLivraison'], periode, filtres: [] }
  const lignes = assembler(
    req,
    { Courant: { commandes: 40, livrees: 20 } },
    { Disparu: { commandes: 40, livrees: 10 } },
  )

  const disparue = lignes.find((ligne) => ligne.cle === 'Disparu')
  assert.ok(disparue)
  assert.equal(disparue.mesures.tauxLivraison.valeur, null)
  assert.equal(disparue.mesures.tauxLivraison.precedent, 25)
})

test('une limite multi-source est appliquee apres fusion', () => {
  const req: Requete = {
    dimension: 'canal',
    mesures: ['commandes', 'sessions'],
    periode,
    filtres: [],
    limite: 5,
  }

  assert.doesNotMatch(construireSql('commandes', req, periode)?.texte ?? '', /LIMIT 5/)
  assert.doesNotMatch(construireSql('sessions', req, periode)?.texte ?? '', /LIMIT 5/)
})
