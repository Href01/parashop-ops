/**
 * L'ANIMATION D'UN PLAN PAR HIGGSFIELD — la partie pure (testee seule).
 *
 * La methode des createurs : d'abord une IMAGE DE DEPART soignee (peinte par le BOS
 * avec la VRAIE photo produit en reference : le flacon est exact), puis une IA video
 * l'anime (image → video). Le produit part juste du premier plan ; la consigne de
 * mouvement garde l'etiquette immobile et fait bouger la matiere, la lumiere, la camera.
 *
 * Specification : docs.higgsfield.ai (lue le 28/09/2026) — `Authorization: Key id:secret`,
 * POST /<endpoint> → { request_id, status_url }, GET status_url jusqu'a « completed »
 * ({ video: { url } }), sorties gardees 7 jours, POST /estimate/<endpoint> pour le cout.
 */

export type CleModeleVideo = 'kling-3-turbo' | 'seedance-2-5' | 'kling-3-std'
type Parametres = { prompt: string; image: string; duree: number }

export const MODELES_VIDEO: Record<CleModeleVideo, { nom: string; aide: string; endpoint: string; min: number; max: number; corps: (p: Parametres) => Record<string, unknown> }> = {
  // 1080p et sans son (le Reel a sa bande-son) : le meilleur rendu pour une matiere en macro.
  'kling-3-turbo': {
    nom: 'Kling 3.0 Turbo · 1080p', aide: 'Net et rapide : textures, gouttes, lumière.',
    endpoint: 'kling-video/v3.0-turbo/image-to-video', min: 3, max: 15,
    corps: (p) => ({ prompt: p.prompt, image_url: p.image, duration: p.duree, resolution: '1080p' }),
  },
  'seedance-2-5': {
    nom: 'Seedance 2.5 · 720p', aide: 'Mouvements fluides : mains, gestes, application.',
    endpoint: 'bytedance/seedance-2.5/image-to-video', min: 4, max: 30,
    corps: (p) => ({ prompt: p.prompt, image_url: p.image, duration: p.duree, resolution: '720p', generate_audio: false }),
  },
  'kling-3-std': {
    nom: 'Kling 3.0 Standard', aide: 'Plus de contrôle (CFG) ; sans son.',
    endpoint: 'kling-video/v3.0/std/image-to-video', min: 3, max: 15,
    corps: (p) => ({ prompt: p.prompt, image_url: p.image, duration: p.duree, sound: 'off' }),
  },
}
export const MODELE_DEFAUT: CleModeleVideo = 'kling-3-turbo'

/** La duree demandee, bornee par le modele (secondes entieres). */
export function dureeVideo(modele: CleModeleVideo, voulu: number): number {
  const m = MODELES_VIDEO[modele]
  return Math.min(m.max, Math.max(m.min, Math.round(voulu)))
}
/** Un clip un peu plus long que le plan : de quoi choisir le « Départ » (le meilleur moment de la matiere). */
export const dureeConseillee = (dureePlan: number) => Math.ceil(dureePlan + 1.5)

/** Le corps de la requete ; la consigne de mouvement recoit toujours les garde-fous du produit. */
export function corpsVideo(modele: CleModeleVideo, p: Parametres) {
  return MODELES_VIDEO[modele].corps({ ...p, prompt: consigneMouvement(p.prompt), duree: dureeVideo(modele, p.duree) })
}

/**
 * Les garde-fous ajoutes a toute consigne de mouvement : l'image de depart porte le vrai
 * produit ; la video ne doit ni le deformer, ni ecrire, ni inventer une personne.
 */
export function consigneMouvement(prompt: string) {
  return [
    prompt.trim(),
    'Keep any product bottle, jar or tube exactly as in the first frame: same shape, colours and label, never morphing, never rewriting or blurring its text; if the product moves, it moves as a rigid object.',
    'Photorealistic, real skin texture with visible pores, natural light. No added text, captions, logos, watermarks or subtitles. No face morphing, no extra fingers.',
  ].join('\n')
}

/** Les etats de Higgsfield, dans les mots du BOS. */
export type StatutClip = 'soumise' | 'en_cours' | 'televersement' | 'terminee' | 'echouee' | 'refusee' | 'annulee'
export function statutDepuis(hf: string): StatutClip {
  switch (hf) {
    case 'queued': return 'soumise'
    case 'in_progress': return 'en_cours'
    case 'completed': return 'terminee'
    case 'nsfw': return 'refusee'
    case 'canceled': return 'annulee'
    default: return 'echouee'
  }
}
export const TERMINAUX: StatutClip[] = ['terminee', 'echouee', 'refusee', 'annulee']

/** Le budget : un plafond par jour (dollars) et par clip ; l'estimation de Higgsfield fait foi. */
export function verifierBudget(o: { estimation: number; depenseJour: number; plafondJour: number; plafondClip: number }) {
  if (!(o.estimation >= 0)) throw new Error('Higgsfield n’a pas donné de coût pour ce clip : génération annulée par prudence.')
  if (o.estimation > o.plafondClip) throw new Error(`Ce clip coûterait ${o.estimation.toFixed(2)} $ : au-dessus du plafond par clip (${o.plafondClip.toFixed(2)} $). Raccourcis-le ou change de modèle.`)
  if (o.depenseJour + o.estimation > o.plafondJour) throw new Error(`Plafond du jour atteint : ${o.depenseJour.toFixed(2)} $ déjà engagés sur ${o.plafondJour.toFixed(2)} $ (ce clip : ${o.estimation.toFixed(2)} $).`)
}
