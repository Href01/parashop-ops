import assert from 'node:assert/strict'
import test from 'node:test'
import { CONFIANCE, dureeVoix, motsVoixMax, verifierOption, voixTropLongue, OptionLivreeSchema } from '../../lib/ads/direction-model'
import { etatPlan, evenementsSonores, type PlanReel } from '../../lib/ads/reel-model'
import { dureeVoixPlan, hashtags, verifierPublication } from '../../app/ads/studio/publier'
import type { Creatif, Option } from '../../app/ads/agent/ui/types'

const PROMPT = 'Editorial beauty photograph, 50mm lens, soft window light from the left, a cream tadelakt shelf in a Moroccan bathroom, warm morning palette of sand, ivory and pale gold, gentle steam in the air, shallow depth of field, calm premium mood, room for a headline at the top.'
const plan = (o: Record<string, unknown>) => OptionLivreeSchema.parse({ concept: 'Chute sur le sable', pourquoi: 'Le mouvement arrête le pouce en une seconde.', prompt: PROMPT, texte: { fr: 'Cheveux secs après la plage ?' }, produitIds: [], ...o })

test('la voix off chuchotée : estimée au plus près des vraies voix du Reel #15', () => {
  // Les quatre voix reelles : 6 s, 7 s, ~4 s, ~5 s.
  const reelles: [string, number][] = [
    ['Chut… monte le son. Ce soir, on s’occupe de tes taches.', 6],
    ['Un nettoyant doux, un sérum, une crème… et le SPF, toujours.', 7],
    ['Elle a juste écrit un message… et on lui a répondu.', 4.5],
    ['Quatre gestes, chaque soir. Écris-nous « routine ».', 5],
  ]
  for (const [texte, d] of reelles) assert.ok(Math.abs(dureeVoix(texte) - d) <= 1.5, `${texte} : ${dureeVoix(texte)} s estimées pour ${d} s`)
  assert.equal(dureeVoix('   '), 0)
  // Une accroche de 2,5 s : 4 mots chuchotés, pas 11.
  assert.equal(motsVoixMax(2.5), 4)
  assert.equal(voixTropLongue('Chut… monte le son.', 2.5), false)
  assert.equal(voixTropLongue(reelles[0][0], 2.5), true)
  // Le compte ne prend pas la ponctuation seule pour un mot.
  assert.equal(dureeVoix('Chut !'), dureeVoix('Chut!'))
})

test('un plan dont la voix déborde est refusé, avec le nombre de mots qui tient', () => {
  const long = plan({ mouvement: 'rebond', duree: 2.5, animes: [49], voix: { fr: 'Chut… monte le son. Ce soir, on s’occupe de tes taches.' } })
  assert.throws(() => verifierOption(long, 0, 'reel', [49]), /voix off \(fr\) dure ~\d+(\.\d)? s .* 4 mots au plus/)
  const court = plan({ mouvement: 'rebond', duree: 2.5, animes: [49], voix: { fr: 'Chut… monte le son.' } })
  assert.doesNotThrow(() => verifierOption(court, 0, 'reel', [49]))
  // La darija compte aussi.
  const darija = plan({ mouvement: 'rebond', duree: 2.5, animes: [49], voix: { fr: 'Chut… monte le son.', darija: 'Tla3i l’son, lyoum ghadi nhdro 3la dak lbe9 li kaybane mn b3d sif.' } })
  assert.throws(() => verifierOption(darija, 0, 'reel', [49]), /\(darija\)/)
})

test('la carte de fin rassure : badges de confiance et prix, seulement sur « fin »', () => {
  assert.equal(CONFIANCE.cod.fr, 'Paiement à la livraison')
  assert.throws(() => verifierOption(plan({ mouvement: 'rebond', duree: 2, animes: [49], confiance: ['cod'] }), 1, 'reel', [49]), /carte de fin/)
  assert.doesNotThrow(() => verifierOption(plan({ mouvement: 'fin', duree: 3, animes: [49], confiance: ['cod', 'livraison'], prix: true }), 2, 'reel', [49]))
  const fin: PlanReel = { mouvement: 'fin', duree: 3, produits: 1, texte: 'Ta *routine*', confiance: ['Paiement à la livraison', 'Livraison 24-48 h'], prix: '997 DH' }
  // Avant leur entree, rien ; puis les badges arrivent l'un apres l'autre, et le prix tombe en tournant.
  assert.deepEqual(etatPlan(fin, 0.5, false).badges.map((b) => b.echelle), [0, 0])
  assert.equal(etatPlan(fin, 0.5, false).sticker, null)
  const e = etatPlan(fin, 2, false)
  assert.ok(e.badges.every((b) => b.echelle > 0.9), 'badges posés')
  assert.equal(e.sticker?.texte, '997 DH')
  assert.ok(Math.abs(e.sticker!.rotation + 12) < 0.5, 'le sticker se pose penché à -12°')
  // Un pop pour le prix, un « tic » par badge.
  const ev = evenementsSonores([fin])
  assert.equal(ev.filter((x) => x.son === 'tic').length, 2)
  assert.ok(ev.some((x) => x.son === 'pop' && Math.abs(x.t - 0.6) < 0.01))
  // Hors carte de fin, jamais de badge.
  assert.deepEqual(etatPlan({ ...fin, mouvement: 'pop' }, 2, false).badges, [])
})

const option = (o: Partial<Option>): Option => ({
  id: 1, creatif_id: 1, demande_id: null, serie: 1, carte: 1, role: null, concept: 'x', pourquoi: null, prompt: PROMPT, texte: { fr: 'Taches après l’été ?' },
  position: 'haut', format: 'story', produit_ids: [], animes: [111], mouvement: 'rebond', duree: 2.5, motion: null,
  style: null, brief: null, qualite: 'high', note: null, modele: null, cree_le: '2026-09-28', ...o,
})
const creatif = (o: Partial<Creatif>): Creatif => ({
  id: 1, rapport_id: null, produit_ids: [111], angle: 'ASMR', format: 'reel', public: null, accroche: 'Taches après l’été ?', script: null,
  texte_fr: 'Légende', texte_darija: 'Caption', texte_ar: null, titre: null, cta: 'Envoyer un message', visuel: null, statut: 'idee', ad_id: null, cree_le: '2026-09-28',
  images: [], options: [], ...o,
})

test('avant de publier : accents, décors, accroche, carte de fin, paiement à la livraison, voix', () => {
  const opts = [
    option({ id: 1, carte: 1, duree: 2.5, motion: { voix: { fr: 'Chut… monte le son.' } } }),
    option({ id: 2, carte: 2, mouvement: 'etiquette', duree: 4, motion: { voix: { fr: 'Un nettoyant doux, un sérum, une crème… et le SPF, toujours.' } } }),
    option({ id: 3, carte: 3, mouvement: 'fin', duree: 3, animes: [111], motion: { confiance: ['cod'] } }),
  ]
  const images = opts.map((o, k) => ({ id: k + 1, option_id: o.id, carte: o.carte, url: 'https://x/y.png', format: 'story', choisie: false, cree_le: '2026-09-28' })) as unknown as Creatif['images']
  const points = (c: Creatif, os = opts) => Object.fromEntries(verifierPublication(c, os, 'reel', ['fr', 'darija']).map((p) => [p.id, p]))
  const p = points(creatif({ images }))
  assert.equal(p.accents.ok, true)
  assert.equal(p.peints.ok, true)
  assert.equal(p.accroche.ok, true)
  assert.equal(p.fin.ok, true)
  assert.equal(p.confiance.ok, true)
  // Le plan 2 : ~7 s de voix pour 4 s de plan.
  assert.equal(p.voix.ok, false)
  assert.match(p.voix.detail, /plan 2 \(fr\)/)
  // Mesuree par Cloudinary, la vraie duree l'emporte sur l'estimation.
  const mesure = opts.map((o) => (o.id === 2 ? { ...o, motion: { ...o.motion, voixUrl: { fr: { url: 'u', texte: o.motion!.voix!.fr!, duree: 3.9 } } } } : o))
  assert.equal(points(creatif({ images }), mesure).voix.ok, true)
  // Une voix generee pour un AUTRE texte ne compte pas : on revient a l'estimation.
  assert.ok(dureeVoixPlan({ ...mesure[1], motion: { ...mesure[1].motion, voix: { fr: 'Autre texte bien plus long que prévu, avec des pauses, encore et encore.' } } }, 'fr') > 4)
  // Sans accents, sans decor, sans paiement a la livraison : tout se voit.
  const q = points(creatif({ accroche: 'Taches apres l’ete ?', images: [] }), opts.map((o) => ({ ...o, motion: o.mouvement === 'fin' ? {} : o.motion })))
  assert.equal(q.accents.ok, false)
  assert.match(q.accents.detail, /« apres »/)
  assert.equal(q.peints.ok, false)
  assert.equal(q.confiance.ok, false)
})

test('les hashtags : la marque, le besoin, le Maroc, sans accents ni doublons', () => {
  const h = hashtags(['Beauty of Joseon', 'Shine'], ['Visage', 'Visage'])
  assert.ok(h.includes('#beautyofjoseon'))
  assert.ok(h.includes('#kbeauty'))
  assert.ok(h.includes('#paiementalalivraison'))
  assert.equal(h.length, new Set(h).size)
  assert.ok(hashtags(['Élancyl'], ['Corps']).includes('#elancyl'))
})
