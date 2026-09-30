import assert from 'node:assert/strict'
import test from 'node:test'
import { APPELS, LivraisonDirection, OptionLivreeSchema, consignesBrief, validerDemande, verifierAMontrer, verifierCouverture, verifierLivraison, verifierOption, verifierPack, verifierVariete } from '../../lib/ads/direction-model'
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
  // Au début : le premier surgit à SA place, grand, mis en avant ; sa solution en grande étiquette reliée à lui.
  const e1 = etatPlan(etapes, 0.6, false)
  const rang = disposition(4, 'etapes')
  assert.equal(e1.produits[0].cx, rang[0].cx)
  assert.ok(e1.produits[0].hauteur >= 0.25 && e1.produits[0].echelle > 1.05, 'grand et mis en avant')
  assert.equal(e1.produits[1].opacite, 0)
  const grande = e1.etapes.find((x) => x.grand)!
  assert.equal(grande.texte, 'Nettoyant')
  assert.ok(Math.abs(grande.vers!.cx - rang[0].cx) < 0.01, 'le trait va au produit présenté')
  // Pendant le deuxième : le premier reste grand mais s'efface un peu.
  const e2 = etatPlan(etapes, 1.6, false)
  assert.ok(e2.produits[0].opacite < 0.6 && e2.produits[0].hauteur >= 0.25)
  assert.equal(e2.etapes.find((x) => x.grand)!.texte, 'Sérum')
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

test('le jeu A/B/C : lettres, étiquettes, appel à commenter', () => {
  const jeu: PlanReel = { mouvement: 'pop', duree: 3, produits: 3, texte: 'A, B ou C ?', lettres: true, points: ['Taches', 'Pores', 'Rides'], appel: 'Commente ta réponse 👇' }
  assert.equal(etatPlan(jeu, 0.5, false).appel, null, 'pas avant que les produits soient là')
  assert.ok(etatPlan(jeu, 1.6, false).appel!.echelle > 0.9)
  const zoom: PlanReel = { mouvement: 'zoom', duree: 3, produits: 0, texte: 'On te dit *laquelle*', appel: 'Commente ton type de peau 👇' }
  assert.ok(etatPlan(zoom, 1.5, false).appel)
  assert.throws(() => verifierOption(plan({ mouvement: 'etiquette', duree: 2.5, animes: [102], points: [{ fr: 'A' }, { fr: 'B' }], appel: 'peau' }), 1, 'reel', [102]), /appel à commenter/)
  assert.throws(() => verifierOption(plan({ mouvement: 'zoom', duree: 2, lettres: true }), 1, 'reel', []), /lettres A, B, C/)
  assert.throws(() => verifierOption(plan({ mouvement: 'pop', duree: 3, animes: [102, 107, 100], points: [{ fr: 'Taches' }, { fr: 'Pores' }] }), 1, 'reel', [102, 107, 100]), /une étiquette par produit/)
  assert.doesNotThrow(() => verifierOption(plan({ mouvement: 'pop', duree: 3, animes: [102, 107, 100], lettres: true, appel: 'reponse', fond: 'nuit', points: [{ fr: 'Taches' }, { fr: 'Pores' }, { fr: 'Rides' }] }), 1, 'reel', [102, 107, 100]))
})

test('montrer : schémas animés, post-it, vrai avis', async () => {
  const { postitArrache } = await import('../../lib/ads/reel-model')
  // Le schéma : son temps et ses étiquettes arrivent au moteur.
  const z: PlanReel = { mouvement: 'zoom', duree: 3.5, produits: 0, texte: 'Au Maroc, le *soleil* tape', illustration: 'taches', points: ['UV toute l’année', 'Trop de mélanine'] }
  const e = etatPlan(z, 1.2, false)
  assert.equal(e.illustration!.type, 'taches')
  assert.deepEqual(e.illustration!.labels, ['UV toute l’année', 'Trop de mélanine'])
  assert.ok(Math.abs(e.illustration!.p - 1.2 / 3.5) < 0.001)
  // Le post-it : il cache, tremble, puis s'arrache et disparaît.
  const r: PlanReel = { mouvement: 'revele', duree: 2.5, produits: 1, texte: 'Ce que personne ne te dit', cache: true }
  const t0 = postitArrache(r)
  assert.ok(etatPlan(r, t0 - 0.3, true).postit!.opacite > 0.5)
  assert.equal(etatPlan(r, t0 + 0.5, true).postit, null)
  assert.ok(evenementsSonores([r]).some((x) => x.son === 'glisse' && Math.abs(x.t - t0) < 0.01))
  // L'avis : les étoiles s'allument une à une.
  const a: PlanReel = { mouvement: 'zoom', duree: 3, produits: 0, texte: 'Ce qu’elles en *disent*', avis: { texte: 'Très bon produit', note: 5 } }
  assert.equal(etatPlan(a, 0.5, false).avis!.etoiles, 1)
  assert.equal(etatPlan(a, 2, false).avis!.etoiles, 5)
  // Les règles : un schéma sur un zoom, un avis sur un zoom, pas les deux, un post-it sur un produit.
  assert.throws(() => verifierOption(plan({ mouvement: 'rebond', duree: 2, animes: [102], illustration: 'taches' }), 0, 'reel', [102]), /« zoom »/)
  assert.throws(() => verifierOption(plan({ mouvement: 'zoom', duree: 3, illustration: 'taches', avisId: 23 }), 1, 'reel', []), /pas les deux/)
  assert.throws(() => verifierOption(plan({ mouvement: 'zoom', duree: 3, cache: true }), 1, 'reel', []), /post-it/)
  assert.doesNotThrow(() => verifierOption(plan({ mouvement: 'zoom', duree: 3, illustration: 'barriere', fond: 'vert', points: [{ fr: 'Pigment' }, { fr: 'Niacinamide + TXA' }] }), 1, 'reel', []))
})

test('les recettes : la charpente imposée, vérifiée plan par plan', async () => {
  const { RECETTES, verifierRecette } = await import('../../lib/ads/direction-model')
  const d = validerDemande({ type: 'options', nombre: 2, format: 'feed', produitIds: [111], brief: 'Un Reel sur les taches', recette: 'secret' })
  assert.equal(d.type, 'reel'); assert.equal(d.nombre, RECETTES.secret.plans.length); assert.equal(d.format, 'story')
  const Z = (o: Record<string, unknown>) => plan({ mouvement: 'zoom', duree: 3, fond: 'vert', ...o })
  const bon = [
    plan({ mouvement: 'revele', duree: 2.5, animes: [102], cache: true }),
    Z({ illustration: 'taches' }), Z({ illustration: 'citron' }), Z({ illustration: 'barriere' }), Z({ illustration: 'bouclier' }),
    plan({ mouvement: 'etapes', duree: 4.5, animes: [98, 102, 103, 96], points: NOMS }),
    plan({ mouvement: 'fin', duree: 3.5, animes: [98, 102, 103, 96] }),
  ]
  assert.doesNotThrow(() => verifierRecette(bon, 'secret'))
  assert.throws(() => verifierRecette(bon.map((o, i) => (i === 0 ? { ...o, cache: false } : o)), 'secret'), /post-it/)
  assert.throws(() => verifierRecette(bon.map((o, i) => (i === 2 ? { ...o, illustration: 'barriere' as const } : o)), 'secret'), /l’idée reçue/)
  assert.throws(() => verifierRecette(bon.slice(0, 6), 'secret'), /7 plans/)
  // Une recette choisie n'est pas refusée parce qu'un Reel récent a la même charpente (c'est voulu).
  const recents = [bon.map((o) => o.mouvement ?? '')]
  assert.throws(() => verifierVariete(bon.map((o) => o.mouvement ?? ''), recents, 'Un reel'), /Même charpente/)
})

test('les clips vidéo : l’adresse recadrée, l’instant exact, les règles', async () => {
  const { urlClip, instantClip } = await import('../../lib/ads/reel-model')
  const brut = 'https://res.cloudinary.com/dlgdhwfqa/video/upload/v1790600000/shine-ads/clips/goutte.mov'
  assert.equal(urlClip(brut), 'https://res.cloudinary.com/dlgdhwfqa/video/upload/c_fill,w_720,h_1280,ac_none,q_auto:good,vc_h264/v1790600000/shine-ads/clips/goutte.mp4')
  assert.match(urlClip(brut, true), /c_fill,w_1080,h_1920/)
  // Une transformation déjà présente est remplacée, pas empilée.
  assert.equal(urlClip('https://res.cloudinary.com/x/video/upload/q_auto/v1/a/b.mp4'), 'https://res.cloudinary.com/x/video/upload/c_fill,w_720,h_1280,ac_none,q_auto:good,vc_h264/v1/a/b.mp4')
  // L'instant : départ décalé, et un clip plus court que le plan reprend au début.
  assert.equal(instantClip(1, 0.5, 6), 1.5)
  assert.ok(Math.abs(instantClip(4.5, 0, 4) - 0.5) < 1e-9)
  assert.ok(instantClip(4, 0, 4) < 4)
  // Seules les vidéos Cloudinary passent ; un départ après la fin est refusé ; pas de clip hors d'un Reel.
  assert.equal(OptionLivreeSchema.safeParse({ concept: 'P', pourquoi: 'Parce que ça arrête le pouce.', texte: { fr: 'Ta *peau*' }, clip: { url: 'https://exemple.com/v.mp4' } }).success, false)
  assert.throws(() => verifierOption(plan({ mouvement: 'zoom', duree: 3, fond: 'vert', clip: { url: brut, duree: 4, debut: 4.5 } }), 1, 'reel', []), /commence après sa fin/)
  assert.doesNotThrow(() => verifierOption(plan({ mouvement: 'zoom', duree: 3, fond: 'vert', clip: { url: brut, duree: 6, debut: 0.5 } }), 1, 'reel', []))
  assert.throws(() => verifierOption(OptionLivreeSchema.parse({ concept: 'Carte', pourquoi: 'Parce que ça arrête le pouce.', prompt: PROMPT, texte: { fr: 'Ta *peau*' }, clip: { url: brut } }), 0, 'carrousel', []), /ne servent que dans un Reel/)
})

test('les appels qui poussent l’algorithme : partage et enregistrement', () => {
  assert.match(APPELS.partage.fr, /Envoie-la/)
  assert.match(APPELS.enregistre.fr, /Enregistre-la/)
  for (const appel of ['partage', 'enregistre']) {
    assert.equal(OptionLivreeSchema.safeParse({ concept: 'Plan', pourquoi: 'Parce que ça arrête le pouce.', texte: { fr: 'Ta *peau*' }, appel }).success, true)
  }
})

test('le Reel tout en vidéo (Higgsfield) : chaque plan est un clip, la fin porte l’offre', async () => {
  const { verifierRenduVideo } = await import('../../lib/ads/direction-model')
  // Le brief « vidéo » devient un Reel vertical, sans recette ni fond dessiné ; on discute d'abord par défaut.
  const d = validerDemande({ type: 'options', nombre: 5, format: 'feed', brief: 'Une goutte de sérum sur une main au soleil', produitIds: [96], rendu: 'video', recette: 'secret', fond: 'shine' })
  assert.deepEqual([d.type, d.format, d.recette, d.fond, d.alignement], ['reel', 'story', undefined, 'libre', true])
  assert.equal(validerDemande({ type: 'reel', nombre: 4, format: 'story', brief: 'Un reel pour le sérum', produitIds: [96], alignement: false }).alignement, false)
  const MOUV = 'Slow push-in on the fingertips as a single golden drop falls from the dropper and spreads on the skin, soft sunlight, product stays still.'
  const clip = (o: Record<string, unknown>) => plan({ mouvement: 'zoom', duree: 3.5, clipPrompt: MOUV, ...o })
  const bon = [clip({}), clip({ produitIds: [96] }), plan({ mouvement: 'site', duree: 4.5, animes: [96], ecrans: ['produit', 'panier', 'livraison'] }), plan({ mouvement: 'fin', duree: 3, animes: [96], fond: 'vert', confiance: ['cod'] })]
  assert.doesNotThrow(() => verifierRenduVideo(bon, {}))
  assert.throws(() => verifierRenduVideo(bon, { recette: 'secret' }), /pas de recette/)
  assert.throws(() => verifierRenduVideo([plan({ mouvement: 'rebond', duree: 2, animes: [96] }), ...bon.slice(1)], {}), /pas « rebond »/)
  assert.throws(() => verifierRenduVideo([plan({ mouvement: 'zoom', duree: 3 }), ...bon.slice(1)], {}), /clipPrompt/)
  assert.throws(() => verifierRenduVideo(bon.slice(0, 3), {}), /carte de fin/)
  // Une fin sur un décor (pas de fond dessiné) est un clip comme les autres.
  assert.throws(() => verifierRenduVideo([...bon.slice(0, 3), plan({ mouvement: 'fin', duree: 3, animes: [96], confiance: ['cod'] })], {}), /clipPrompt/)
})

test('le son et le texte « dans la vidéo » : le BOS se tait, le clip parle', async () => {
  const { urlSonClip } = await import('../../lib/ads/reel-model')
  assert.equal(urlSonClip('https://res.cloudinary.com/x/video/upload/c_fill,w_720/v1/shine-ads/clips/goutte.mp4'), 'https://res.cloudinary.com/x/video/upload/v1/shine-ads/clips/goutte.mp3')
  const z: PlanReel = { mouvement: 'zoom', duree: 3, produits: 0, texte: 'Une *goutte* suffit' }
  assert.ok(etatPlan(z, 1.5, false).mots.length > 0)
  assert.equal(etatPlan({ ...z, texteVideo: true }, 1.5, false).mots.length, 0)
  // Son et texte « dans la vidéo » n'existent que sur un plan à clip.
  assert.throws(() => verifierOption(plan({ mouvement: 'zoom', duree: 3, clipSon: true }), 1, 'reel', []), /ne servent qu'à un plan à clip/)
  assert.doesNotThrow(() => verifierOption(plan({ mouvement: 'zoom', duree: 3, clipSon: true, texteVideo: true, clipPrompt: 'Slow push-in on a drop of serum sliding down the glass, soft light, the bottle stays still.' }), 1, 'reel', []))
})

test('filmé sans image de départ : seulement un plan sans produit, avec sa consigne de mouvement', async () => {
  const { verifierRenduVideo } = await import('../../lib/ads/direction-model')
  const MOUV = 'Slow motion: long dark wavy hair lifts in a warm evening breeze on a Casablanca rooftop, soft backlight, shallow depth of field.'
  const sans = (o: Record<string, unknown>) => OptionLivreeSchema.parse({ concept: 'Ambiance', pourquoi: 'Parce que ça arrête le pouce.', prompt: '', texte: { fr: 'Tes *cheveux* respirent' }, mouvement: 'zoom', duree: 3, sansDepart: true, clipPrompt: MOUV, produitIds: [], ...o })
  assert.doesNotThrow(() => verifierOption(sans({}), 1, 'reel', [96]))
  assert.throws(() => verifierOption(sans({ produitIds: [96] }), 1, 'reel', [96]), /SANS produit/)
  assert.throws(() => verifierOption(sans({ produitIds: undefined }), 1, 'reel', [96]), /SANS produit/)
  assert.throws(() => verifierOption(sans({ clipPrompt: 'Hair.' }), 1, 'reel', [96]), /clipPrompt/)
  assert.throws(() => verifierOption(sans({ mouvement: 'revele', animes: [96] }), 1, 'reel', [96]), /SANS produit/)
  // La carte de fin filmée sans image : les vrais produits sont posés par-dessus, le clip n'en montre aucun.
  assert.doesNotThrow(() => verifierOption(sans({ mouvement: 'fin', animes: [96], confiance: ['cod'], prix: true }), 4, 'reel', [96]))
  assert.doesNotThrow(() => verifierRenduVideo([sans({}), sans({ mouvement: 'fin', animes: [96], confiance: ['cod'] })], {}))
  // Sans « sansDepart », un plan sans consigne d'image reste refusé.
  assert.throws(() => verifierOption(sans({ sansDepart: false }), 1, 'reel', [96]), /200 caractères/)
  // En rendu vidéo, il passe sans image de départ.
  const fin = plan({ mouvement: 'fin', duree: 3, animes: [96], fond: 'vert', confiance: ['cod'] })
  assert.doesNotThrow(() => verifierRenduVideo([sans({}), fin], {}))
})

test('une image faite ailleurs doit être au format du plan', async () => {
  const { formatProche } = await import('../../lib/ads/creatif-model')
  assert.ok(formatProche(1080, 1920, 'story'))
  assert.ok(formatProche(768, 1344, 'story'), '9:16 arrondi par le modèle')
  assert.equal(formatProche(1024, 1024, 'story'), false, 'un carré animé donnerait un clip carré')
  assert.ok(formatProche(1024, 1280, 'feed'))
  assert.equal(formatProche(0, 0, 'feed'), false)
})

test('les paliers : l’idée, le storyboard (en vidéo), puis la création', async () => {
  const { etapeDirection } = await import('../../lib/ads/direction-model')
  const video = { alignement: true, rendu: 'video', storyboard: true }
  const ok = (palier?: 'idee' | 'storyboard') => ({ auteur: 'achraf' as const, texte: '✓ Validé', le: '', valide: true, ...(palier ? { palier } : {}) })
  const prop = (palier: 'idee' | 'storyboard') => ({ auteur: 'agent' as const, texte: 'Proposition', le: '', palier })
  assert.deepEqual(etapeDirection(video, []), { idee: false, storyboard: false, etape: 'proposer' })
  assert.equal(etapeDirection(video, [prop('idee'), { auteur: 'achraf', texte: 'Change le plan 2', le: '' }]).etape, 'proposer', 'une réponse n’est pas une validation')
  assert.equal(etapeDirection(video, [prop('idee'), ok('idee')]).etape, 'storyboard')
  // Une validation d'avant les paliers (sans « palier ») vaut pour l'idée.
  assert.equal(etapeDirection(video, [prop('idee'), ok()]).etape, 'storyboard')
  assert.deepEqual(etapeDirection(video, [prop('idee'), ok('idee'), prop('storyboard'), ok('storyboard')]), { idee: true, storyboard: true, etape: 'creer' })
  // Sans storyboard demandé, en motion, ou sans discussion : pas de deuxième palier.
  assert.equal(etapeDirection({ ...video, storyboard: false }, [ok('idee')]).etape, 'creer')
  assert.equal(etapeDirection({ alignement: true, rendu: 'motion', storyboard: true }, [ok('idee')]).storyboard, null)
  assert.equal(etapeDirection({ alignement: false, rendu: 'video' }, []).etape, 'creer')
})

test('les pièces jointes : images et vidéos de Shine, liens https', async () => {
  const { piecesValides } = await import('../../lib/ads/direction-model')
  const p = piecesValides([
    { url: 'https://res.cloudinary.com/shine/image/upload/v1/shine-ads/echanges/gel.jpg' },
    'https://res.cloudinary.com/shine/video/upload/v1/shine-ads/echanges/clip.mp4',
    { url: 'https://www.tiktok.com/@cosrx/video/123' },
    { url: 'https://res.cloudinary.com/autre/image/upload/x.jpg' },
  ], 'shine')
  assert.deepEqual(p.map((x) => x.type), ['image', 'video', 'lien', 'lien'])
  assert.deepEqual(piecesValides(undefined, 'shine'), [])
  assert.throws(() => piecesValides([{ url: 'http://exemple.com' }], 'shine'), /https/)
  assert.throws(() => piecesValides(Array(9).fill('https://a.b/c'), 'shine'), /8 pièces/)
})

test('un seul film : chaque son de clip ramené au même niveau, la bande-son sur le plan 1, le texte d’accroche dès la 1re image', async () => {
  const { gainNormalise, niveauDb, NIVEAU_CLIP_DB } = await import('../../lib/ads/reel-model')
  // Le grincement de #39 (-42 dB) remonte, la mousse (-27 dB) descend un peu : les deux finissent au même niveau.
  assert.ok(Math.abs(20 * Math.log10(gainNormalise(-42)) + -42 - NIVEAU_CLIP_DB) < 0.01 || gainNormalise(-42) === 8)
  assert.ok(Math.abs(20 * Math.log10(gainNormalise(-27)) + -27 - NIVEAU_CLIP_DB) < 0.01)
  assert.equal(gainNormalise(-90), 1, 'un silence ne se gonfle pas')
  assert.equal(gainNormalise(-10), 0.5, 'borné vers le bas')
  const sinus = Array.from({ length: 4800 }, (_, i) => 0.5 * Math.sin(i / 5))
  assert.ok(Math.abs(niveauDb(sinus) - 20 * Math.log10(0.5 / Math.SQRT2)) < 0.2)
  // La bande-son : Cloudinary de Shine seulement, et sur le plan 1.
  const bande = { url: 'https://res.cloudinary.com/shine/video/upload/v1/shine-ads/clips/bande.mp3', volume: 0.4 }
  assert.doesNotThrow(() => verifierOption(plan({ mouvement: 'zoom', duree: 2, bandeSon: bande }), 0, 'reel', []))
  assert.throws(() => verifierOption(plan({ mouvement: 'zoom', duree: 2, bandeSon: bande }), 2, 'reel', []), /plan 1/)
  assert.equal(OptionLivreeSchema.safeParse({ concept: 'P', pourquoi: 'Parce que ça arrête le pouce.', texte: { fr: 'Ta *peau*' }, bandeSon: { url: 'https://exemple.com/a.mp3' } }).success, false)
  // L'accroche : des mots visibles dès t = 0 ; les autres plans gardent leur entrée.
  const z: PlanReel = { mouvement: 'zoom', duree: 2, produits: 0, texte: 'Ta peau *brille* à midi ?' }
  assert.ok(etatPlan(z, 0, true).mots[0].opacite > 0.9, 'premier mot lisible à la 1re image')
  assert.ok(etatPlan(z, 0.3, true).mots.every((m) => m.opacite > 0.9), 'toute l’accroche en 0,3 s')
  assert.equal(etatPlan(z, 0, false).mots[0].opacite, 0)
})

test('le plan-séquence (FOOH) : un long plan filmé, sans texte, raccordé sans coupure', async () => {
  const { verifierMontage } = await import('../../lib/ads/direction-model')
  const { transitionA, evenementsSonores } = await import('../../lib/ads/reel-model')
  // Un plan 1 filmé de 10 s passe ; un plan 1 animé de 10 s reste refusé.
  assert.doesNotThrow(() => verifierMontage([10, 3], true))
  assert.throws(() => verifierMontage([10, 3]), /2,5 s/)
  assert.throws(() => verifierMontage([16, 3], true), /15 s/)
  // Un plan filmé peut rester sans texte (le réalisme d'abord) ; un plan animé, non.
  const MOUV = 'Handheld phone POV from a highway overpass: a flatbed truck stacked with green boxes drives toward the bridge.'
  const sansTexte = (o: Record<string, unknown>) => OptionLivreeSchema.parse({ concept: 'Le camion', pourquoi: 'Le spectacle arrête le pouce.', prompt: PROMPT, texte: { fr: '' }, produitIds: [], mouvement: 'zoom', duree: 5, clipPrompt: MOUV, ...o })
  assert.doesNotThrow(() => verifierOption(sansTexte({}), 0, 'reel', [98]))
  assert.throws(() => verifierOption(sansTexte({ clipPrompt: null }), 0, 'reel', [98]), /texte à poser/)
  // Le raccord : ni transition dessinée, ni souffle, ni flash.
  const plans: PlanReel[] = [{ mouvement: 'zoom', duree: 5, produits: 0, texte: '' }, { mouvement: 'zoom', duree: 5, produits: 0, texte: '', transition: 'raccord' }]
  assert.equal(transitionA(plans, 1, 0.1), null)
  assert.equal(evenementsSonores(plans).filter((e) => e.son === 'souffle').length, 0)
  assert.equal(etatPlan(plans[1], 0.02, false).flash, 0)
})
