import assert from 'node:assert/strict'
import test from 'node:test'
import { dureeMinDm, fautesFrancais, idees, motMisEnValeurVide, promptFinal, saison, sujetDemande, validerDemande, verifierLivraison, verifierOption, LivraisonDirection, OptionLivreeSchema, type ProduitPourIdee } from '../../lib/ads/direction-model'
import { disposition, dureeTotale, etatPlan, evenementsSonores, mots, nbImages, particules, planA, rebondir, ressort, transitionA, urlDetouree, type PlanReel } from '../../lib/ads/reel-model'

test('le brief : bornes, format et produits', () => {
  assert.throws(() => validerDemande({ type: 'carrousel', nombre: 12, format: 'carre', produitIds: [1], brief: 'Un carrousel produit' }), /de 3 à 10 cartes/)
  assert.throws(() => validerDemande({ type: 'carrousel', nombre: 4, format: 'story', produitIds: [1], brief: 'Un carrousel produit' }), /pas de format Story/)
  assert.throws(() => validerDemande({ type: 'reel', nombre: 4, format: 'feed', produitIds: [1], brief: 'Un reel qui rebondit' }), /vertical/)
  assert.throws(() => validerDemande({ type: 'options', nombre: 3, format: 'feed', brief: 'Trois visuels' }), /au moins un produit/)
  assert.throws(() => validerDemande({ type: 'options', nombre: 3, format: 'feed', produitIds: [1], brief: 'x' }), /décris en une phrase/)
  const d = validerDemande({ type: 'reel', nombre: 4, format: 'story', produitIds: [49], styles: ['ete', 'inconnu'], brief: 'Reel plage Sun and More' })
  assert.deepEqual(d.styles, ['ete'])
  assert.equal(d.qualite, 'high')
  assert.match(sujetDemande(d), /^Reel animé en 4 plans \(9:16\) — Reel plage/)
  // Depuis une creation existante, le brief peut rester vide.
  assert.doesNotThrow(() => validerDemande({ creatifId: 3, type: 'options', nombre: 2, format: 'feed' }))
})

const PROMPT = 'Editorial beauty photograph, 50mm lens, soft window light from the left, a cream tadelakt shelf in a Moroccan bathroom, warm morning palette of sand, ivory and pale gold, gentle steam in the air, shallow depth of field, calm premium mood, room for a headline at the top.'
const plan = (o: Record<string, unknown>) => ({ concept: 'Chute sur le sable', pourquoi: 'Le mouvement arrête le pouce en une seconde.', prompt: PROMPT, texte: { fr: 'Cheveux secs après la plage ?' }, ...o })

test('la livraison d’un Reel : chaque plan anime de vrais produits sur un décor vide', () => {
  const d = validerDemande({ type: 'reel', nombre: 3, format: 'story', produitIds: [49, 34], brief: 'Reel plage Sun and More' })
  const ok = LivraisonDirection.parse({
    demandeId: 1, style: 'Atlantic beach at golden hour, warm sand, turquoise accents',
    creation: { angle: 'problème/solution', accroche: 'Cheveux secs après la plage ?' },
    options: [
      plan({ mouvement: 'rebond', duree: 2, animes: [49], produitIds: [] }),
      plan({ mouvement: 'duo', duree: 3, animes: [49, 34], produitIds: [] }),
      plan({ mouvement: 'fin', duree: 3, animes: [49, 34], produitIds: [] }),
    ],
  })
  assert.doesNotThrow(() => verifierLivraison(ok, d, [49, 34], false))
  const casse = (i: number, patch: Record<string, unknown>) => ({ ...ok, options: ok.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  assert.throws(() => verifierLivraison(casse(0, { produitIds: null }), d, [49, 34], false), /décor doit être vide/)
  assert.throws(() => verifierLivraison(casse(1, { animes: [49] }), d, [49, 34], false), /exactement deux produits/)
  assert.throws(() => verifierLivraison(casse(0, { duree: 4 }), d, [49, 34], false), /2,5 s au plus/)
  assert.throws(() => verifierLivraison(casse(0, { animes: [7] }), d, [49, 34], false), /hors de la création/)
  assert.throws(() => verifierLivraison({ ...ok, creation: undefined }, d, [49, 34], false), /ajoute « creation »/)
  assert.throws(() => verifierLivraison({ ...ok, options: ok.options.slice(0, 2) }, d, [49, 34], false), /3 plan/)
  // Un carrousel n'a ni mouvement ni produits animes.
  const c = validerDemande({ type: 'carrousel', nombre: 3, format: 'carre', produitIds: [49], brief: 'Carrousel produit' })
  assert.throws(() => verifierLivraison({ ...ok, options: ok.options }, c, [49, 34], true), /ne servent que dans un Reel/)
})

test('le prompt final : garde-fous toujours collés, décor vide pour l’animation', () => {
  const p = promptFinal({ prompt: PROMPT, format: 'story', position: 'haut', style: 'Beach set', produits: 0, styleCarte1: true, decorPourAnimation: true })
  assert.match(p, /No product, bottle, jar or packaging/)
  assert.match(p, /background plate for a motion ad/)
  assert.match(p, /LAST attached image is the first frame/)
  assert.match(p, /ABSOLUTELY NO TEXT/)
  assert.match(p, /top 20% and the bottom 22%/)
  const q = promptFinal({ prompt: PROMPT, format: 'feed', position: 'bas', style: null, produits: 2, styleCarte1: false })
  assert.match(q, /first 2 attached images are the REAL products/)
  assert.match(q, /bottom 30%/)
})

test('les idées de brief : le produit qui rapporte, jamais un produit bloqué ou exclu', () => {
  const p = (id: number, marque: string, marge: number, vendus: number, o: Partial<ProduitPourIdee> = {}): ProduitPourIdee =>
    ({ id, nom: `Produit ${id}`, marque, categorie: 'cheveux', margeShine: marge, stockVendable: 10, importBloque: false, vendus90j: vendus, ...o })
  const liste = idees({
    mois: 8,
    produits: [p(33, 'Salerm', 200, 30, { importBloque: true }), p(49, 'Milk Shake', 106, 21), p(34, 'Milk Shake', 90, 12), p(50, 'Milk Shake', 80, 5), p(60, 'Olaplex', 150, 20)],
    exclus: [60],
    pubsGagnantes: [{ nom: 'Publication Instagram', texte: 'Si tes cheveux sont secs…', raison: '2,2 DH par message.' }],
  })
  assert.equal(liste[0].type, 'reel')
  assert.deepEqual(liste[0].produitIds, [49], 'Salerm is blocked at customs, Olaplex is excluded')
  assert.match(liste[0].brief, /rentrée/)
  assert.ok(liste.some((x) => x.type === 'carrousel' && x.produitIds.length === 3))
  assert.ok(liste.some((x) => x.id.startsWith('duo-')))
  assert.ok(liste.some((x) => x.id === 'gagnante'))
  for (const x of liste) assert.doesNotThrow(() => validerDemande(x), x.titre)
  assert.equal(saison(6).nom, 'été')
  assert.equal(saison(0).nom, 'hiver')
})

const PLANS: PlanReel[] = [
  { mouvement: 'rebond', duree: 2, produits: 1, texte: 'Cheveux *secs* après la plage ?' },
  { mouvement: 'duo', duree: 3, produits: 2, texte: 'Lequel pour toi ?' },
  { mouvement: 'fin', duree: 3, produits: 2, texte: 'Écris-nous en DM' },
]

test('le moteur du Reel : timeline, courbes, rebond et carte de fin', () => {
  assert.equal(dureeTotale(PLANS), 8)
  assert.equal(nbImages(PLANS), 240)
  assert.deepEqual(planA(PLANS, 0), { i: 0, local: 0 })
  assert.deepEqual(planA(PLANS, 2.5), { i: 1, local: 0.5 })
  assert.deepEqual(planA(PLANS, 99), { i: 2, local: 3 })
  assert.equal(rebondir(0), 0); assert.ok(Math.abs(rebondir(1) - 1) < 1e-9)
  assert.ok(ressort(0.26) > 1.1, 'the spring overshoots'); assert.ok(Math.abs(ressort(1.2) - 1) < 0.01)
  // Le flacon part du haut et se pose sur sa ligne de sol.
  const debut = etatPlan(PLANS[0], 0.11, true).produits[0], pose = etatPlan(PLANS[0], 1.5, true).produits[0]
  assert.ok(debut.bas < 0.1, `starts above the frame (${debut.bas})`)
  assert.ok(Math.abs(pose.bas - 0.78) < 0.01)
  assert.ok(Math.max(...[0.35, 0.37, 0.39].map((t) => etatPlan(PLANS[0], t, true).produits[0].ecrasement)) > 0.05, 'squashes on impact')
  // Le mot marque *secs* est mis en valeur ; sans marque, c'est le dernier.
  assert.deepEqual(mots('Cheveux *secs* après').map((m) => m.accent), [false, true, false])
  assert.deepEqual(mots('Écris-nous en DM').map((m) => m.accent), [false, false, true])
  // « ? » isole reste colle a son mot, et le mot marque le reste.
  assert.deepEqual(mots('Lequel pour *toi* ?').map((m) => [m.texte, m.accent]), [['Lequel', false], ['pour', false], ['toi ?', true]])
  // Une coupe, pas un fondu : le voile blanc ne vit que 0,12 s, jamais sur le premier plan.
  assert.ok(etatPlan(PLANS[1], 0, false).flash > 0.3)
  assert.equal(etatPlan(PLANS[1], 0.2, false).flash, 0)
  assert.equal(etatPlan(PLANS[0], 0, true).flash, 0)
  // Le « ou » du duo et le bouton de fin arrivent, puis pulsent.
  assert.equal(etatPlan(PLANS[1], 0.3, false).chip, null)
  assert.ok(etatPlan(PLANS[1], 1.5, false).chip!.echelle > 0.9)
  assert.ok(etatPlan(PLANS[2], 2, false).cta!.cy < 0.8, 'the button stays above the Reels caption zone')
  // Tout reste dans les zones sures.
  for (let t = 0; t < 8; t += 0.25) {
    const { i, local } = planA(PLANS, t)
    const e = etatPlan(PLANS[i], local, i === 0)
    for (const x of e.produits) assert.ok(x.bas <= 0.8, `product ground line under the caption zone at t=${t}`)
    assert.ok(e.texteHaut >= 0.14)
  }
})

test('le détourage : la photo de fiche, par l’IA de Cloudinary', () => {
  assert.equal(urlDetouree('https://res.cloudinary.com/dlgdhwfqa/image/upload/v1790456557/shine-cosmetics/products/nladd352uwqozmsyg5jt.jpg'),
    'https://res.cloudinary.com/dlgdhwfqa/image/upload/e_background_removal/c_limit,w_900,h_900/f_png/v1790456557/shine-cosmetics/products/nladd352uwqozmsyg5jt.jpg')
  assert.equal(urlDetouree('https://exemple.com/a.jpg'), null)
  assert.equal(urlDetouree(null), null)
})

test('le vocabulaire créatif : DM, étiquette, quiz, tempo, transitions', () => {
  const d = validerDemande({ type: 'reel', nombre: 3, format: 'story', produitIds: [49, 34], brief: 'Reel conversation DM' })
  const base = LivraisonDirection.parse({
    demandeId: 1, style: 'Warm Casablanca apartment, cream linen, soft morning light',
    creation: { angle: 'conversation', accroche: 'Elle a demandé, on a répondu' },
    options: [
      plan({ mouvement: 'quiz', duree: 2.5, animes: [49], produitIds: [], choix: [{ fr: 'Secs' }, { fr: 'Frisés' }, { fr: 'Colorés' }] }),
      plan({ mouvement: 'dm', duree: 4, animes: [49], produitIds: [], transition: 'vague', bulles: [{ de: 'cliente', texte: { fr: 'Salam, vous avez un soin pour cheveux secs ?' } }, { de: 'shine', texte: { fr: 'Oui ! Le Sun And More, sans rinçage.' } }] }),
      plan({ mouvement: 'etiquette', duree: 3, animes: [49], produitIds: [], transition: 'traversee', ambiance: 'etincelles', points: [{ fr: '12 bienfaits' }, { fr: 'Filtre UV' }] }),
    ],
  })
  assert.doesNotThrow(() => verifierLivraison(base, d, [49, 34], false))
  const casse = (i: number, patch: Record<string, unknown>) => ({ ...base, options: base.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) })
  assert.throws(() => verifierLivraison(casse(1, { bulles: base.options[1].bulles!.slice(0, 1) }), d, [49, 34], false), /2 à 5 messages/)
  assert.throws(() => verifierLivraison(casse(2, { points: base.options[2].points!.slice(0, 1) }), d, [49, 34], false), /2 ou 3 atouts/)
  assert.throws(() => verifierLivraison(casse(0, { choix: [] }), d, [49, 34], false), /2 ou 3 réponses/)
  assert.throws(() => verifierLivraison(casse(2, { duree: 2.25 }), d, [49, 34], false), /demi-secondes/)
  assert.throws(() => verifierLivraison(casse(0, { transition: 'balayage' }), d, [49, 34], false), /premier plan/)
  assert.throws(() => verifierLivraison(casse(2, { animes: [49, 34] }), d, [49, 34], false), /un seul produit/)
})

test('le moteur : bulles tapées puis envoyées, doigt du quiz, reflet, transitions, particules reproductibles', () => {
  const dm: PlanReel = { mouvement: 'dm', duree: 4, produits: 1, texte: 'Elle a demandé', bulles: [{ de: 'cliente', texte: 'Salam' }, { de: 'shine', texte: 'Oui !' }] }
  const tot = etatPlan(dm, 0.5, true).dm!
  assert.ok(tot.bulles[0].frappe > 0 && tot.bulles[0].echelle === 0, 'the three dots come before the message')
  const tard = etatPlan(dm, 3.9, true)
  assert.ok(tard.dm!.bulles.every((b) => b.echelle > 0.9) && tard.dm!.fiche > 0.9, 'every message and the product card are shown')
  assert.ok(tard.produits[0].opacite > 0.9)
  const quiz: PlanReel = { mouvement: 'quiz', duree: 2.5, produits: 1, texte: 'Tes cheveux sont…', choix: ['Secs', 'Frisés', 'Colorés'] }
  assert.equal(etatPlan(quiz, 0.5, true).quiz!.choix[0].choisi, false)
  const apres = etatPlan(quiz, 2.2, true).quiz!
  assert.ok(apres.choix[0].choisi && apres.choix[1].eteint > 0.9)
  // Le reflet Shine passe une fois, peu apres la pose du flacon.
  const chute: PlanReel = { mouvement: 'rebond', duree: 2, produits: 1, texte: 'x' }
  assert.equal(etatPlan(chute, 0.2, true).produits[0].reflet, null)
  assert.ok(etatPlan(chute, 0.6, true).produits[0].reflet! > 0)
  assert.equal(etatPlan(chute, 1.8, true).produits[0].reflet, null)
  assert.ok(etatPlan(chute, 0.4, true).secousse.dy !== 0, 'the frame shakes on impact')
  // Transitions : seulement a l'entree d'un plan, et jamais sur le premier.
  const plans: PlanReel[] = [chute, { ...dm, transition: 'vague' }]
  assert.equal(transitionA(plans, 0, 0.1), null)
  assert.deepEqual(transitionA(plans, 1, 0.19), { type: 'vague', p: 0.5 })
  assert.equal(transitionA(plans, 1, 0.5), null)
  assert.equal(etatPlan(plans[1], 0, false).flash, 0, 'no white flash under a designed transition')
  // Les particules : les memes a chaque rendu (apercu = export).
  assert.deepEqual(particules('bulles', 1.3, 2), particules('bulles', 1.3, 2))
  assert.equal(particules('sable', 1, 1).length, 34)
  assert.deepEqual(particules('aucune', 1, 1), [])
})

test('le français affiché : accents obligatoires, mot mis en valeur porteur de sens', () => {
  // Les fautes exactes du premier Reel livré.
  assert.deepEqual(fautesFrancais("Taches *apres* l'ete ?"), ['apres', 'ete'])
  assert.deepEqual(fautesFrancais('Etape 2 : le *serum*'), ['etape', 'serum'])
  assert.deepEqual(fautesFrancais('Commande sur le site, paiement a la livraison'), ['a la livraison'])
  assert.deepEqual(fautesFrancais('Cheveux *secs* après l’été ? Ça marche, elle a la peau sèche.'), [])
  assert.equal(motMisEnValeurVide("Taches *apres* l'ete ?"), 'apres')
  assert.equal(motMisEnValeurVide('Cheveux *secs* après l’été ?'), null)
  assert.equal(dureeMinDm(4, false), 5)
  assert.equal(dureeMinDm(3, true), 4.5)
  const o = (x: Record<string, unknown>) => OptionLivreeSchema.parse({ concept: 'Plan', pourquoi: 'Parce que ça arrête le pouce.', prompt: PROMPT, texte: { fr: 'Cheveux *secs* après l’été ?' }, produitIds: [], animes: [49], mouvement: 'rebond', duree: 2, ...x })
  assert.doesNotThrow(() => verifierOption(o({}), 0, 'reel', [49]))
  assert.throws(() => verifierOption(o({ texte: { fr: "Taches *apres* l'ete ?" } }), 0, 'reel', [49]), /sans accents/)
  assert.throws(() => verifierOption(o({ texte: { fr: 'Cheveux secs *après* l’été ?' } }), 0, 'reel', [49]), /mot vide/)
  assert.throws(() => verifierOption(o({ mouvement: 'dm', duree: 4, animes: [], bulles: [1, 2, 3, 4].map(() => ({ de: 'cliente', texte: { fr: 'Salam' } })) }), 1, 'reel', [49]), /se lisent en 5 s/)
  assert.throws(() => verifierOption(o({ mouvement: 'rebond', animes: [49, 34, 96, 98] }), 1, 'reel', [49, 34, 96, 98]), /3 produits au plus/)
  assert.doesNotThrow(() => verifierOption(o({ mouvement: 'fin', duree: 3, animes: [49, 34, 96, 98] }), 3, 'reel', [49, 34, 96, 98]))
  assert.throws(() => verifierOption(o({ voix: { fr: 'Apres la plage' } }), 0, 'reel', [49]), /sans accents/)
})

test('le moteur : une routine de 4 produits tient dans un plan, les bruitages suivent l’image', () => {
  const place = disposition(4, 'fin')
  assert.equal(place.length, 4)
  assert.ok(place.every((p) => p.cx > 0.08 && p.cx < 0.92), 'four products stay inside the frame')
  const plans: PlanReel[] = [
    { mouvement: 'rebond', duree: 2, produits: 1, texte: 'x' },
    { mouvement: 'dm', duree: 4.5, produits: 1, texte: 'y', transition: 'vague', bulles: [{ de: 'cliente', texte: 'Salam' }, { de: 'shine', texte: 'Oui !' }, { de: 'cliente', texte: 'Top' }] },
    { mouvement: 'fin', duree: 3, produits: 4, texte: 'z' },
  ]
  const ev = evenementsSonores(plans)
  // Le choc tombe quand le flacon touche l'etagere (premier contact de la chute).
  const choc = ev.find((e) => e.son === 'choc')!
  assert.ok(Math.abs(choc.t - (0.1 + 0.75 * 0.364)) < 0.01)
  // Le souffle de la vague a l'entree du plan 2 ; puis envoi, ding, envoi, et le ding de la fiche.
  assert.ok(ev.some((e) => e.son === 'souffle' && e.t === 2))
  assert.deepEqual(ev.filter((e) => e.t >= 2 && e.t < 6.5 && ['envoi', 'ding'].includes(e.son)).map((e) => e.son), ['envoi', 'ding', 'envoi', 'ding'])
  // La carte de fin : 4 pops et le carillon du bouton, sans rien apres la fin.
  assert.equal(ev.filter((e) => e.son === 'pop' && e.t >= 6.5).length, 4)
  assert.ok(ev.some((e) => e.son === 'cta' && Math.abs(e.t - 6.95) < 0.01))
  assert.ok(ev.every((e) => e.t < dureeTotale(plans)))
  assert.deepEqual(ev.map((e) => e.t), [...ev.map((e) => e.t)].sort((a, b) => a - b))
})
