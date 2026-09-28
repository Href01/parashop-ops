import assert from 'node:assert/strict'
import test from 'node:test'
import { LivraisonDirection, OptionLivreeSchema, consignesBrief, validerDemande, verifierAMontrer, verifierCouverture, verifierLivraison, verifierOption, verifierPack, verifierVariete } from '../../lib/ads/direction-model'
import { disposition, etatPlan, evenementsSonores, siteCreneaux, type PlanReel } from '../../lib/ads/reel-model'

const PROMPT = 'Editorial beauty photograph, 50mm lens, soft window light from the left, a cream tadelakt shelf in a Moroccan bathroom, warm morning palette of sand, ivory and pale gold, gentle steam in the air, shallow depth of field, calm premium mood, room for a headline at the top.'
const plan = (o: Record<string, unknown>) => OptionLivreeSchema.parse({ concept: 'Un plan', pourquoi: 'Parce que ça arrête le pouce.', prompt: PROMPT, texte: { fr: 'Ta *routine* du soir' }, produitIds: [], ...o })
const PACK = { 111: [98, 102, 103, 96] }
const NOMS = [{ fr: 'Nettoyant' }, { fr: 'Sérum' }, { fr: 'Crème' }, { fr: 'SPF' }]

test('un pack de 4 se montre produit par produit, et en entier', () => {
  // Le Reel #15 : la photo du pack animée, 3 soins sur 4 dans l'étiquette.
  const quinze = [plan({ mouvement: 'rebond', duree: 2, animes: [111] }), plan({ mouvement: 'fin', duree: 2.5, animes: [111] })]
  assert.throws(() => verifierPack(quinze, PACK), /pas la photo du pack/)
  const trois = [plan({ mouvement: 'rebond', duree: 2, animes: [102] }), plan({ mouvement: 'fin', duree: 3, animes: [98, 102, 96] })]
  assert.throws(() => verifierPack(trois, PACK), /tous les 4, aucun oublié/)
  const bon = [plan({ mouvement: 'rebond', duree: 2, animes: [102] }), plan({ mouvement: 'etapes', duree: 4.5, animes: [98, 102, 103, 96], points: NOMS })]
  assert.doesNotThrow(() => verifierPack(bon, PACK))
  // Le plan « site » montre l'achat du pack lui-même : permis.
  assert.doesNotThrow(() => verifierPack([...bon, plan({ mouvement: 'site', duree: 4.5, animes: [111], ecrans: ['produit', 'panier', 'livraison'] })], PACK))
})

test('pas deux fois la même charpente, ni le DM par habitude', () => {
  const recents = [['rebond', 'zoom', 'etiquette', 'dm', 'etiquette', 'fin'], ['rebond', 'etiquette', 'dm', 'fin'], ['rebond', 'etiquette', 'pop', 'dm', 'fin']]
  assert.throws(() => verifierVariete(['rebond', 'etiquette', 'dm', 'fin'], recents, 'Un reel ASMR'), /Même charpente/)
  assert.throws(() => verifierVariete(['rebond', 'etapes', 'site', 'fin'], recents, 'Un reel'), /s'ouvraient déjà par « rebond »/)
  assert.throws(() => verifierVariete(['quiz', 'etapes', 'dm', 'fin'], recents, 'Montre la texture'), /Pas de conversation DM/)
  // « étapes d'achat » contient « achat », pas « chat » : pas de DM demandé.
  assert.throws(() => verifierVariete(['quiz', 'dm', 'fin'], recents, "Montre les étapes d'achat"), /Pas de conversation DM/)
  assert.doesNotThrow(() => verifierVariete(['quiz', 'dm', 'fin'], recents, 'Une cliente pose sa question en DM'))
  assert.doesNotThrow(() => verifierVariete(['zoom', 'etapes', 'site', 'fin'], recents, 'Un reel'))
})

test('chaque consigne du brief est tenue par un plan', () => {
  const brief = "• Understand the products and the bundle\nUn geste inattendu qui arrête le pouce\n• Un problème que la cliente reconnaît en 1 s\n• La texture en gros plan\nShow real website buying steps\ndo not talk about l'été"
  assert.equal(consignesBrief(brief).length, 6)
  assert.throws(() => verifierCouverture(undefined, brief, 6), /couverture » manque/)
  assert.throws(() => verifierCouverture([{ consigne: 'geste', plans: [1] }], brief, 6), /1 consigne\(s\) sur 6/)
  const couv = consignesBrief(brief).map((c, k) => ({ consigne: c, plans: k === 5 ? [] : [k + 1] }))
  assert.doesNotThrow(() => verifierCouverture(couv, brief, 6))
  assert.throws(() => verifierCouverture(couv.map((c) => ({ ...c, plans: [7] })), brief, 6), /inexistant/)
  // Un brief d'une seule phrase n'a pas besoin de table.
  assert.doesNotThrow(() => verifierCouverture(undefined, 'Un reel pour le pack', 4))
})

test('ce que le brief coche doit se voir : site, paiement à la livraison, prix, texture, voix', () => {
  const opts = [plan({ mouvement: 'zoom', duree: 2 }), plan({ mouvement: 'fin', duree: 3, animes: [102] })]
  const d = { brief: 'Un reel', objectif: 'site' as const }
  assert.throws(() => verifierAMontrer(opts, { ...d, montrer: ['site'] }, true), /plan « site »/)
  // Sans captures, on ne peut pas exiger le plan « site ».
  assert.doesNotThrow(() => verifierAMontrer(opts, { ...d, montrer: ['site'] }, false))
  assert.throws(() => verifierAMontrer(opts, { ...d, montrer: ['cod'] }, true), /badge « cod »/)
  assert.throws(() => verifierAMontrer(opts, { ...d, montrer: ['prix'] }, true), /prix: true/)
  assert.doesNotThrow(() => verifierAMontrer(opts, { ...d, montrer: ['texture'] }, true))
  assert.throws(() => verifierAMontrer(opts, { ...d, montrer: ['voix'] }, true), /deux plans avec « voix »/)
  // Le brief qui dit « website » en toutes lettres vaut la case.
  assert.throws(() => verifierAMontrer(opts, { brief: 'Show real website buying steps', montrer: [] }, true), /plan « site »/)
  // Les nouveaux champs du brief passent la validation, avec leurs défauts.
  const v = validerDemande({ type: 'reel', nombre: 4, format: 'story', produitIds: [111], brief: 'Un reel du pack', objectif: 'site', montrer: ['site', 'cod'] })
  assert.equal(v.offre, 'aucune')
  assert.deepEqual(v.montrer, ['site', 'cod'])
})

test('les plans « etapes » et « site » : leurs règles', () => {
  assert.throws(() => verifierOption(plan({ mouvement: 'etapes', duree: 4.5, animes: [98, 102, 103, 96], points: NOMS.slice(0, 3) }), 1, 'reel', [98, 102, 103, 96]), /4 nom\(s\)/)
  assert.throws(() => verifierOption(plan({ mouvement: 'etapes', duree: 3, animes: [98, 102, 103, 96], points: NOMS }), 1, 'reel', [98, 102, 103, 96]), /4 étapes se lisent en 4.5 s/)
  assert.doesNotThrow(() => verifierOption(plan({ mouvement: 'etapes', duree: 4.5, animes: [98, 102, 103, 96], points: NOMS }), 1, 'reel', [98, 102, 103, 96]))
  assert.throws(() => verifierOption(plan({ mouvement: 'site', duree: 4.5, animes: [111], ecrans: ['panier', 'produit'] }), 2, 'reel', [111]), /ordre du site/)
  assert.throws(() => verifierOption(plan({ mouvement: 'site', duree: 3, animes: [111], ecrans: ['produit', 'panier', 'livraison'] }), 2, 'reel', [111]), /4.5 s au moins/)
  assert.throws(() => verifierOption(plan({ mouvement: 'rebond', duree: 2, animes: [111], ecrans: ['produit', 'panier'] }), 0, 'reel', [111]), /ne sert que dans un plan « site »/)
  assert.doesNotThrow(() => verifierOption(plan({ mouvement: 'site', duree: 4.5, animes: [111], ecrans: ['produit', 'panier', 'livraison'] }), 2, 'reel', [111]))
  // Une livraison complète qui tient tout : pack, variété, brief, cases.
  const l = LivraisonDirection.parse({
    demandeId: 1, style: 'Hanji paper screen, zellige niche, soft morning light, celadon accents',
    options: [
      { concept: 'Accroche', pourquoi: 'Le geste arrête le pouce.', prompt: PROMPT, texte: { fr: 'Tes *taches* résistent ?' }, produitIds: [], animes: [102], mouvement: 'revele', duree: 2 },
      { concept: 'Texture', pourquoi: 'La matière rassure.', prompt: PROMPT, texte: { fr: 'Légère, *sans graisser*' }, produitIds: [], mouvement: 'zoom', duree: 2 },
      { concept: 'Routine', pourquoi: 'Les 4 soins, dans l’ordre.', prompt: PROMPT, texte: { fr: '4 gestes, *1 routine*' }, produitIds: [], animes: [98, 102, 103, 96], mouvement: 'etapes', duree: 4.5, points: NOMS },
      { concept: 'Le site', pourquoi: 'Montrer que commander est simple.', prompt: PROMPT, texte: { fr: 'Commande en *30 s*' }, produitIds: [], animes: [111], mouvement: 'site', duree: 4.5, ecrans: ['produit', 'panier', 'livraison'] },
      { concept: 'Fin', pourquoi: 'Le bouton, sans frein.', prompt: PROMPT, texte: { fr: 'Ta routine *complète*' }, produitIds: [], animes: [98, 102, 103, 96], mouvement: 'fin', duree: 2.5, confiance: ['cod', 'livraison'], prix: true },
    ],
    couverture: [{ consigne: 'Le pack', plans: [3, 5] }, { consigne: 'Le site', plans: [4] }],
  })
  const d = validerDemande({ type: 'reel', nombre: 5, format: 'story', creatifId: 15, brief: 'Montre le pack\nShow real website buying steps', montrer: ['site', 'cod', 'prix', 'texture'] })
  assert.doesNotThrow(() => verifierLivraison(l, d, [111, 98, 102, 103, 96], true, { packs: PACK, recents: [['rebond', 'etiquette', 'dm', 'fin']], siteDispo: true }))
})

test('le moteur : la routine numérotée et le téléphone du site', () => {
  const etapes: PlanReel = { mouvement: 'etapes', duree: 4.5, produits: 4, texte: '4 gestes', points: ['Nettoyant', 'Sérum', 'Crème', 'SPF'] }
  // Au début : le premier en vedette, avec son numéro et son nom.
  const e1 = etatPlan(etapes, 0.6, false)
  assert.equal(e1.produits[0].cx, 0.5)
  assert.ok(e1.produits[0].hauteur > 0.25, 'en grand')
  assert.equal(e1.produits[1].opacite, 0)
  assert.deepEqual(e1.etapes.map((x) => [x.numero, x.texte, x.grand]), [[1, 'Nettoyant', true]])
  // À la fin : les quatre rangés, chacun avec son numéro, tous dans le cadre.
  const fin = etatPlan(etapes, 4.4, false)
  const rangee = disposition(4, 'etapes')
  fin.produits.forEach((p, k) => { assert.ok(Math.abs(p.cx - rangee[k].cx) < 0.01); assert.ok(p.bas <= 0.8) })
  assert.deepEqual(fin.etapes.map((x) => x.numero), [1, 2, 3, 4])
  assert.ok(fin.etapes.every((x) => !x.grand))
  // Un pop et un tic par produit.
  const ev = evenementsSonores([etapes])
  assert.equal(ev.filter((x) => x.son === 'pop').length, 4)

  const cibles = [{ x: 0.37, y: 0.6, w: 0.59, h: 0.06 }, { x: 0.38, y: 0.93, w: 0.58, h: 0.057 }, { x: 0.38, y: 0.93, w: 0.58, h: 0.057 }]
  const site: PlanReel = { mouvement: 'site', duree: 4.5, produits: 1, texte: 'Commande en *30 s*', ecrans: cibles.map((cible) => ({ cible })), points: ['Ajoute au panier', 'Ton panier', 'Paie à la livraison'] }
  const { touche } = siteCreneaux(site)
  // Pas de produit détouré : le produit est dans les captures.
  assert.equal(etatPlan(site, 1, false).produits.length, 0)
  // Au moment de toucher, le doigt est sur le bouton de l'écran, et l'onde part juste après.
  const t0 = etatPlan(site, touche(0), false).site!
  assert.equal(t0.ecran, 0)
  assert.ok(Math.abs(t0.doigt!.x - (0.37 + 0.59 / 2)) < 0.01 && Math.abs(t0.doigt!.y - 0.63) < 0.01)
  assert.ok(t0.doigt!.appui > 0.9)
  assert.ok(etatPlan(site, touche(0) + 0.2, false).site!.onde)
  // Puis l'écran suivant glisse, avec son libellé.
  const t1 = etatPlan(site, touche(1) - 0.1, false).site!
  assert.equal(t1.ecran, 1)
  assert.equal(t1.etiquette.texte, 'Ton panier')
  const sons = evenementsSonores([site])
  assert.equal(sons.filter((x) => x.son === 'clic').length, 3)
  assert.ok(sons.every((x) => x.t < site.duree))
})

test('un plan muet (voix null en base) se retouche sans erreur', () => {
  // Le Reel #15 v2 : « le BOS refuse un patch d'option sans voix (Expected object, received null) ».
  const p = OptionLivreeSchema.safeParse({ concept: 'Plan', pourquoi: 'Parce que ça arrête le pouce.', prompt: PROMPT, texte: { fr: 'Ta *routine*' }, produitIds: [], animes: [102], mouvement: 'rebond', duree: 2, voix: null })
  assert.equal(p.success, true)
  assert.doesNotThrow(() => verifierOption(p.data!, 1, 'reel', [102]))
})

test('les fonds Shine dessinés : pas de consigne d’image, et exigés par le brief « fond Shine »', () => {
  const sans = { concept: 'Plan', pourquoi: 'Parce que ça arrête le pouce.', texte: { fr: 'Ta *routine*' }, produitIds: [], animes: [102], mouvement: 'rebond', duree: 2 }
  // Sans fond dessiné, la consigne d'image reste obligatoire.
  assert.throws(() => verifierOption(OptionLivreeSchema.parse(sans), 0, 'reel', [102]), /200 caractères/)
  assert.doesNotThrow(() => verifierOption(OptionLivreeSchema.parse({ ...sans, fond: 'vert' }), 0, 'reel', [102]))
  // Hors d'un Reel, pas de fond dessiné.
  assert.throws(() => verifierOption(OptionLivreeSchema.parse({ concept: 'Carte', pourquoi: 'Parce que ça arrête le pouce.', texte: { fr: 'Ta *routine*' }, fond: 'vert' }), 0, 'carrousel', []), /fonds Shine dessinés servent aux Reels/)
  // Le brief « fond Shine » : chaque plan sur un fond dessiné.
  const opts = [plan({ mouvement: 'zoom', duree: 2, fond: 'vert' }), plan({ mouvement: 'fin', duree: 3, animes: [102] })]
  assert.throws(() => verifierAMontrer(opts, { brief: 'Un reel', montrer: [], fond: 'shine' }, false), /plan\(s\) 2 en décor peint/)
  assert.doesNotThrow(() => verifierAMontrer(opts.map((o) => ({ ...o, fond: 'aurore' as const })), { brief: 'Un reel', montrer: [], fond: 'shine' }, false))
  assert.equal(validerDemande({ type: 'reel', nombre: 4, format: 'story', produitIds: [111], brief: 'Un reel du pack' }).fond, 'libre')
})

test('le quiz ouvert : personne ne touche, l’appel à commenter arrive, le produit attend la suite', () => {
  const q: PlanReel = { mouvement: 'quiz', duree: 2, produits: 1, texte: '*Taches* : on met quoi dessus ?', choix: ['4 soins coréens', 'Du citron', 'Du dentifrice'], ouvert: true, appel: 'Commente ta réponse 👇' }
  const fin = etatPlan(q, 1.95, true)
  assert.equal(fin.quiz!.doigt, null)
  assert.ok(fin.quiz!.choix.every((c) => !c.choisi && c.eteint === 0), 'aucune réponse choisie')
  assert.ok(fin.quiz!.appel && fin.quiz!.appel.echelle > 0.9)
  assert.equal(etatPlan(q, 0.6, true).quiz!.appel, null, 'pas avant que les réponses soient là')
  assert.equal(fin.produits[0].opacite, 0)
  const sons = evenementsSonores([q])
  assert.ok(!sons.some((x) => x.son === 'clic'))
  assert.throws(() => verifierOption(plan({ mouvement: 'rebond', duree: 2, animes: [102], ouvert: true }), 0, 'reel', [102]), /ne sert qu'à un quiz/)
})

test('la mise en valeur tient sur plusieurs mots', async () => {
  const { mots } = await import('../../lib/ads/reel-model')
  // Le Reel #18 : « *897 DH* » et « *4 soins coréens* » ne surlignaient que le dernier mot de la phrase.
  assert.deepEqual(mots('*897 DH* avec BIENVENUE10, livraison offerte').map((m) => m.accent), [true, true, false, false, false, false])
  assert.deepEqual(mots('Réponse C : *4 soins coréens*').map((m) => m.accent), [false, false, true, true, true])
  assert.deepEqual(mots('*Sans compte*, en 2 gestes').map((m) => m.accent), [true, true, false, false, false])
  assert.deepEqual(mots('Cheveux *secs* après').map((m) => m.accent), [false, true, false])
  assert.deepEqual(mots('Sans étoiles ici').map((m) => m.accent), [false, false, true])
})

test('le bonneteau : on entoure, on mélange, on retrouve le produit suivi', async () => {
  const { emplacements, melangeCreneaux } = await import('../../lib/ads/reel-model')
  const pop: PlanReel = { mouvement: 'pop', duree: 2.5, produits: 4, texte: 'Où est le *sérum* ? 👀', melange: true }
  const { debut, n, revele } = melangeCreneaux(pop)
  assert.ok(n >= 3, 'au moins 3 échanges')
  // Chaque échange garde une permutation : 4 produits, 4 places.
  for (let k = 0; k <= n; k++) assert.deepEqual([...emplacements(4, k)].sort(), [0, 1, 2, 3])
  // Le produit suivi finit au centre, pas sous les boutons d'Instagram (v3 : il finissait à droite).
  for (const k of [2, 3, 4, 5, 6]) assert.ok([1, 2].includes(emplacements(4, k)[0]), `après ${k} échanges`)
  // L'anneau avant le mélange, rien pendant, puis la révélation : le suivi grandit, les autres s'effacent.
  assert.ok(etatPlan(pop, 0.7, true).anneau)
  assert.equal(etatPlan(pop, debut + 0.3, true).anneau, null)
  const fin = etatPlan(pop, 2.45, true)
  assert.ok(fin.anneau)
  assert.ok(fin.produits[0].echelle > fin.produits[1].echelle && fin.produits[1].opacite < 0.6)
  // Le suivi finit à la place que donnent les échanges, et tous restent dans l'écran.
  assert.ok(Math.abs(fin.produits[0].cx - disposition(4, 'pop')[emplacements(4, n)[0]].cx) < 0.01)
  assert.ok(fin.produits.every((p) => p.cx >= 0.15 && p.cx <= 0.85))
  const sons = evenementsSonores([pop])
  assert.equal(sons.filter((x) => x.son === 'glisse').length, n)
  assert.ok(sons.some((x) => x.son === 'ding' && Math.abs(x.t - revele) < 0.01))
  assert.throws(() => verifierOption(plan({ mouvement: 'pop', duree: 2.5, animes: [102, 98], melange: true }), 0, 'reel', [102, 98]), /3 ou 4 produits/)
})
