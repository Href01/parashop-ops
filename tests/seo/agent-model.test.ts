import assert from 'node:assert/strict'
import test from 'node:test'
import { cibleDeAction, domaine, fenetresImpact, lienRedaction, motsPorteurs, pageCorrespond, validerChangement } from '../../lib/seo/agent-model'

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

test('un changement propose par l’agent est verifie avant de pouvoir etre applique', () => {
  assert.deepEqual(validerChangement({ type: 'metaTitle', produitId: 34, valeur: ' Milk Shake Leave In Conditioner 350 ml ' }),
    { type: 'metaTitle', produitId: 34, valeur: 'Milk Shake Leave In Conditioner 350 ml' })
  assert.equal(validerChangement({ type: 'metaTitle', produitId: 34, valeur: 'x'.repeat(90) }), null, 'titre trop long')
  assert.equal(validerChangement({ type: 'metaTitle', produitId: 'abc', valeur: 'Titre correct de fiche' }), null, 'produit invalide')
  assert.equal(validerChangement({ type: 'faq', produitId: 34, questionFR: 'Est-ce le même produit ?', reponseFR: 'Oui, même flacon et même formule.' }), null, 'FAQ sans arabe')
  assert.equal(validerChangement({ type: 'description', produitId: 34, valeur: '…' }), null, 'type inconnu')
})

test('la page d’une action se retrouve depuis son texte ou son changement', () => {
  assert.deepEqual(cibleDeAction('https://www.shinecosmetics.ma/products/34-milk-shake-spray-conditionner-350ml'), { produitId: 34 })
  assert.deepEqual(cibleDeAction('Fiche 65 (Sun & More)'), { produitId: 65 })
  assert.deepEqual(cibleDeAction('/marques/milk-shake'), { chemin: '/marques/milk-shake' })
  assert.deepEqual(cibleDeAction('Page marque — https://www.shinecosmetics.ma/marques/olaplex/'), { chemin: '/marques/olaplex' })
  assert.deepEqual(cibleDeAction(null, { type: 'metaTitle', produitId: 49, valeur: 'Titre de fiche produit' }), { produitId: 49 })
  assert.equal(cibleDeAction('Decision d’offre (Achraf)'), null)
})

test('une URL Search Console correspond a la fiche, pas a une autre qui commence pareil', () => {
  assert.ok(pageCorrespond('https://www.shinecosmetics.ma/products/34-milk-shake-spray', { produitId: 34 }))
  assert.ok(!pageCorrespond('https://www.shinecosmetics.ma/products/340-autre', { produitId: 34 }))
  assert.ok(!pageCorrespond('https://www.shinecosmetics.ma/ar/products/34-x', { produitId: 34 }), 'la version arabe est une autre page')
  assert.ok(pageCorrespond('https://www.shinecosmetics.ma/marques/milk-shake', { chemin: '/marques/milk-shake' }))
})

test('l’impact se mesure sur deux fenetres egales, et « trop tot » sous 7 jours de recul', () => {
  assert.deepEqual(fenetresImpact('2026-09-26T18:00:00Z', '2026-09-30'), { tropTot: true, joursDispo: 4 })
  assert.deepEqual(fenetresImpact('2026-09-01T10:00:00Z', '2026-09-15'),
    { tropTot: false, jours: 14, avant: ['2026-08-18', '2026-08-31'], apres: ['2026-09-02', '2026-09-15'] })
  const long = fenetresImpact('2026-06-01', '2026-09-15')
  assert.equal(long.tropTot, false)
  if (!long.tropTot) assert.equal(long.jours, 28)
  assert.deepEqual(fenetresImpact('2026-09-26', null), { tropTot: true, joursDispo: 0 })
})

test('une action « article de blog » devient un lien vers l’atelier DeepSeek, deja rempli', () => {
  // Les trois actions reelles du 26/09 (rapports 1, 2 et 4).
  const milk = lienRedaction({ levier: 'Article de blog — /admin/blog', page: 'Nouvel article /blog', action: 'Article de blog FR+AR : « Leave In Conditioner, Incredible Milk ou Integrity : quel soin sans rinçage Milk Shake choisir ? ». Pour chaque soin : cheveux cibles, usage. Liens vers les fiches 34, 2, 50, 49 et 48.' })
  const u = new URL(milk!.url)
  assert.equal(milk!.libelle, 'Rédiger avec DeepSeek')
  assert.equal(u.searchParams.get('sujet'), 'Leave In Conditioner, Incredible Milk ou Integrity : quel soin sans rinçage Milk Shake choisir ?')
  assert.equal(u.searchParams.get('produits'), '34,2,50,49,48')
  assert.equal(u.searchParams.get('requete'), null)
  const solaire = new URL(lienRedaction({ levier: 'Article de blog — /admin/blog + maillage vers fiches', page: 'Nouvel article /blog', action: 'Article de blog FR+AR : « Crème solaire coréenne au Maroc : Relief Sun, Isntree Watery Sun Gel ou SKIN1004 Water-Fit Sun Serum ? » — un H2 par produit, liens vers les fiches 96, 91 et 97.' })!.url)
  assert.equal(solaire.searchParams.get('produits'), '96,91,97')
  // Article existant : on ouvre son editeur, on n'en cree pas un second.
  assert.deepEqual(lienRedaction({ levier: 'Article de blog — /admin/blog ; maillage interne', page: 'https://www.shinecosmetics.ma/blog/masque-salerm-pour-cheveux-secs ; https://www.shinecosmetics.ma/blog/salerm-21-comment-utiliser-maroc', action: 'Article « masque-salerm-pour-cheveux-secs » : titre « Masque Salerm 21 » …' }), { url: 'https://www.shinecosmetics.ma/admin/blog/new?article=masque-salerm-pour-cheveux-secs', libelle: 'Ouvrir l’article' })
  // Le format demande a l'agent (AGENT.md, point 7).
  const format = new URL(lienRedaction({ levier: 'Article de blog', page: 'Nouvel article /blog', action: 'Article de blog FR+AR : « Quel Olaplex choisir après une coloration ? » — requête « olaplex maroc » — fiches 16, 52' })!.url)
  assert.equal(format.searchParams.get('sujet'), 'Quel Olaplex choisir après une coloration ?')
  assert.equal(format.searchParams.get('requete'), 'olaplex maroc')
  assert.equal(format.searchParams.get('produits'), '16,52')
  // Pas une action de blog, ou pas de sujet : pas de bouton.
  assert.equal(lienRedaction({ levier: 'champ metaTitle — admin produit', action: 'metaTitle fiche 35 : « Salerm 21 Masque sans rinçage 1 kg »' }), null)
  assert.equal(lienRedaction({ levier: 'Article de blog', action: 'Écrire un article sur les solaires' }), null)
})
