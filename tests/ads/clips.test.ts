import assert from 'node:assert/strict'
import test from 'node:test'
import { MODELES_VIDEO, corpsVideo, dureeConseillee, dureeVideo, statutDepuis, verifierBudget } from '../../lib/ads/clips-model'
import { APPELS, OptionLivreeSchema } from '../../lib/ads/direction-model'

const IMG = 'https://res.cloudinary.com/dlgdhwfqa/image/upload/v1/shine-ads/cadre.jpg'

test('Higgsfield : le corps de chaque modèle suit sa documentation', () => {
  // Kling 3.0 Turbo : prompt, image_url, duration 3 à 15, resolution 720p|1080p ; pas de son.
  assert.deepEqual(Object.keys(corpsVideo('kling-3-turbo', { prompt: 'A drop falls.', image: IMG, duree: 4 })).sort(), ['duration', 'image_url', 'prompt', 'resolution'])
  assert.equal(corpsVideo('kling-3-turbo', { prompt: 'x', image: IMG, duree: 4 }).resolution, '1080p')
  // Seedance 2.5 : duree 4 à 30, 720p, sans audio genere.
  const s = corpsVideo('seedance-2-5', { prompt: 'x', image: IMG, duree: 2 })
  assert.equal(s.duration, 4); assert.equal(s.generate_audio, false); assert.equal(s.resolution, '720p')
  // Kling 3.0 Standard : son coupe (il est actif par defaut chez Kling).
  assert.equal(corpsVideo('kling-3-std', { prompt: 'x', image: IMG, duree: 20 }).sound, 'off')
  assert.equal(dureeVideo('kling-3-std', 20), 15)
  assert.equal(dureeVideo('kling-3-turbo', 4.4), 4)
  assert.equal(dureeConseillee(2.5), 4)
  for (const m of Object.values(MODELES_VIDEO)) assert.match(m.endpoint, /^[a-z0-9-]+\/[a-z0-9.\-/]+$/)
})

test('la consigne de mouvement porte toujours les garde-fous du produit', () => {
  const p = String(corpsVideo('kling-3-turbo', { prompt: 'Slow push-in, a clear drop slides down the bottle.', image: IMG, duree: 4 }).prompt)
  assert.match(p, /^Slow push-in/)
  assert.match(p, /same shape, colours and label/)
  assert.match(p, /No added text/)
})

test('les états Higgsfield et le budget', () => {
  assert.equal(statutDepuis('queued'), 'soumise')
  assert.equal(statutDepuis('in_progress'), 'en_cours')
  assert.equal(statutDepuis('completed'), 'terminee')
  assert.equal(statutDepuis('nsfw'), 'refusee')
  assert.equal(statutDepuis('canceled'), 'annulee')
  assert.equal(statutDepuis('failed'), 'echouee')
  assert.equal(statutDepuis('quelque-chose'), 'echouee')
  const b = { depenseJour: 3.5, plafondJour: 5, plafondClip: 2 }
  assert.doesNotThrow(() => verifierBudget({ ...b, estimation: 1.2 }))
  assert.throws(() => verifierBudget({ ...b, estimation: 1.8 }), /Plafond du jour/)
  assert.throws(() => verifierBudget({ ...b, estimation: 2.4 }), /plafond par clip/)
  assert.throws(() => verifierBudget({ ...b, estimation: Number.NaN }), /pas donné de coût/)
})

test('les appels qui poussent l’algorithme : partage et enregistrement', () => {
  assert.match(APPELS.partage.fr, /Envoie-la/)
  assert.match(APPELS.enregistre.fr, /Enregistre-la/)
  for (const appel of ['partage', 'enregistre']) {
    assert.equal(OptionLivreeSchema.safeParse({ concept: 'Plan', pourquoi: 'Parce que ça arrête le pouce.', texte: { fr: 'Ta *peau*' }, appel }).success, true)
  }
})
