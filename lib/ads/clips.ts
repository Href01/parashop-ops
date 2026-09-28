import 'server-only'
import { createHash } from 'node:crypto'
import pool from '@/lib/db'
import { MODELES_VIDEO, MODELE_DEFAUT, TERMINAUX, corpsVideo, dureeConseillee, dureeVideo, statutDepuis, verifierBudget, type CleModeleVideo, type StatutClip } from './clips-model'

/**
 * LES CLIPS VIDEO DES REELS : des images reelles (tournees au telephone, ou generees
 * par un outil video IA) en fond d'un plan, a la place du decor peint.
 *
 * Le navigateur envoie le fichier DIRECTEMENT a Cloudinary : une video de telephone
 * depasse la limite d'une requete Vercel (4,5 Mo). Le BOS ne fait que signer l'envoi
 * (dossier impose, signature valable une heure) et n'accepte ensuite, dans un plan,
 * qu'une video de SON Cloudinary.
 */

const DOSSIER = 'shine-ads/clips'

function identifiants() {
  const nuage = process.env.CLOUDINARY_CLOUD_NAME, cle = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET
  if (!nuage || !cle || !secret) throw new Error('Cloudinary n’est pas configuré sur le BOS (CLOUDINARY_*).')
  return { nuage, cle, secret }
}

/** De quoi envoyer UN clip depuis le navigateur. */
export function signatureClip() {
  const { nuage, cle, secret } = identifiants()
  const timestamp = String(Math.floor(Date.now() / 1000))
  const params = { folder: DOSSIER, timestamp }
  const signature = createHash('sha1').update(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&') + secret).digest('hex')
  return { url: `https://api.cloudinary.com/v1_1/${nuage}/video/upload`, apiKey: cle, timestamp, folder: DOSSIER, signature }
}

/** Un clip de plan : une video du Cloudinary de Shine, rien d'autre. */
export function verifierClip(url: string | null | undefined) {
  if (!url) return
  const { nuage } = identifiants()
  if (!url.startsWith(`https://res.cloudinary.com/${nuage}/video/upload/`)) throw new Error('Clip : seule une vidéo envoyée depuis le studio est acceptée.')
}

/* ------------------------------------------------------------------ */
/* L'ANIMATION PAR HIGGSFIELD (image de depart → clip)                 */
/* ------------------------------------------------------------------ */

const HF = 'https://api.higgsfield.ai'
const PLAFOND_JOUR = () => Number(process.env.ADS_CLIPS_USD_JOUR) || 5
const PLAFOND_CLIP = () => Number(process.env.ADS_CLIP_USD_MAX) || 2
// Pour tester tout le chemin sans cle ni depense : en local seulement, jamais en production.
const simulation = () => process.env.HIGGSFIELD_SIMULATION === '1' && process.env.NODE_ENV !== 'production'
const VIDEO_SIMULEE = 'https://res.cloudinary.com/demo/video/upload/du_6,c_fill,w_720,h_1280/dog.mp4'

function cleHiggsfield(): string | null {
  const id = process.env.HIGGSFIELD_KEY_ID, secret = process.env.HIGGSFIELD_KEY_SECRET
  return id && secret ? `Key ${id}:${secret}` : null
}

/** Ce que le studio affiche : la generation est-elle branchee, a quel prix, combien deja depense aujourd'hui. */
export async function etatClipsIA() {
  const depense = await depenseJour()
  return {
    disponible: Boolean(cleHiggsfield()) || simulation(), simulation: simulation() && !cleHiggsfield(),
    plafondJour: PLAFOND_JOUR(), plafondClip: PLAFOND_CLIP(), depenseJour: depense,
    modeles: (Object.keys(MODELES_VIDEO) as CleModeleVideo[]).map((k) => ({ cle: k, nom: MODELES_VIDEO[k].nom, aide: MODELES_VIDEO[k].aide, min: MODELES_VIDEO[k].min, max: MODELES_VIDEO[k].max })),
  }
}

async function depenseJour(): Promise<number> {
  try {
    const r = await pool.query(`SELECT coalesce(sum(usd_estime), 0)::float AS usd FROM "AdsClipGeneration"
      WHERE cree_le > now() - interval '24 hours' AND statut NOT IN ('echouee', 'refusee', 'annulee')`)
    return Number(r.rows[0].usd) || 0
  } catch (e) { if ((e as { code?: string }).code === '42P01') return 0; throw e }
}

async function appelHF(chemin: string, corps?: unknown): Promise<Record<string, unknown>> {
  const cle = cleHiggsfield()
  if (!cle) throw new Error('Higgsfield n’est pas branché : ajoute HIGGSFIELD_KEY_ID et HIGGSFIELD_KEY_SECRET sur Vercel (projet parashop-ops).')
  const r = await fetch(chemin.startsWith('http') ? chemin : `${HF}/${chemin}`, {
    method: corps === undefined ? 'GET' : 'POST',
    headers: { Authorization: cle, ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
    signal: AbortSignal.timeout(60_000),
  })
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok) {
    const detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail ?? j).slice(0, 300)
    const motif = r.status === 401 ? 'clés refusées' : r.status === 403 ? 'crédit Higgsfield insuffisant' : r.status === 400 && /concurrent/i.test(detail) ? 'trop de générations en même temps, réessaie dans une minute' : r.status === 423 || r.status === 503 ? 'modèle momentanément indisponible' : detail
    throw new Error(`Higgsfield (${r.status}) : ${motif}. Correlation : ${r.headers.get('x-correlation-id') ?? '—'}`)
  }
  return j
}

/** Copie la video terminee sur Cloudinary (les sorties Higgsfield expirent au bout de 7 jours). */
async function copierSurCloudinary(url: string, nom: string): Promise<{ url: string; duree: number | null }> {
  const { nuage, cle, secret } = identifiants()
  const params = { folder: DOSSIER, public_id: nom, timestamp: String(Math.floor(Date.now() / 1000)) }
  const signature = createHash('sha1').update(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&') + secret).digest('hex')
  const f = new FormData()
  f.append('file', url)
  for (const [k, v] of Object.entries(params)) f.append(k, v)
  f.append('api_key', cle); f.append('signature', signature)
  const r = await fetch(`https://api.cloudinary.com/v1_1/${nuage}/video/upload`, { method: 'POST', body: f, signal: AbortSignal.timeout(180_000) })
  const j = (await r.json().catch(() => ({}))) as { secure_url?: string; duration?: number; error?: { message?: string } }
  if (!r.ok || !j.secure_url) throw new Error(`Cloudinary : ${j.error?.message ?? r.status}`)
  return { url: j.secure_url, duree: typeof j.duration === 'number' ? Math.round(j.duration * 10) / 10 : null }
}

type LigneClip = { id: number; option_id: number | null; creatif_id: number | null; modele: string; request_id: string | null; status_url: string | null; statut: StatutClip; usd_estime: string | null; clip_url: string | null; erreur: string | null; cree_le: string }

/** L'image de depart du plan (la plus recente choisie), et de quoi l'animer. */
async function preparerAnimation(optionId: number, modele: CleModeleVideo, duree: number) {
  if (!MODELES_VIDEO[modele]) throw new Error('Modèle vidéo inconnu.')
  const o = (await pool.query(`SELECT id, creatif_id, mouvement, motion FROM "AdsCreativeOption" WHERE id = $1`, [optionId])).rows[0]
  if (!o) throw new Error('Plan introuvable.')
  if (!o.mouvement) throw new Error('Seuls les plans d’un Reel s’animent.')
  const consigne = String(o.motion?.clipPrompt ?? '').trim()
  if (consigne.length < 30) throw new Error('Écris d’abord la consigne du mouvement (ce qui bouge dans le clip), puis enregistre le plan.')
  const image = (await pool.query(`SELECT url FROM "AdsCreativeImage" WHERE option_id = $1 ORDER BY choisie DESC, cree_le DESC LIMIT 1`, [optionId])).rows[0]?.url as string | undefined
  if (!image) throw new Error('Peins d’abord l’image de départ du plan : c’est elle que la vidéo anime (le vrai produit y est exact).')
  const m = MODELES_VIDEO[modele]
  return { o, corps: corpsVideo(modele, { prompt: consigne, image, duree }), endpoint: m.endpoint, image, consigne, duree: dureeVideo(modele, duree) }
}

/** Le cout d'un clip avant de le lancer (Higgsfield fait foi). */
export async function estimerClip(optionId: number, modele: CleModeleVideo, duree: number) {
  const p = await preparerAnimation(optionId, modele, duree)
  if (simulation() && !cleHiggsfield()) return { usd: 0.37, credits: null, simulation: true }
  const e = await appelHF(`estimate/${p.endpoint}`, p.corps)
  return { usd: Number(e.usd), credits: e.credits ?? null, simulation: false }
}

/** Lance l'animation d'un plan : budget verifie, une seule generation a la fois par plan. */
export async function animerPlan(o: { optionId: number; modele?: CleModeleVideo; duree?: number; par: string | null }) {
  const modele = o.modele ?? MODELE_DEFAUT
  const plan = (await pool.query(`SELECT duree FROM "AdsCreativeOption" WHERE id = $1`, [o.optionId])).rows[0]
  const p = await preparerAnimation(o.optionId, modele, o.duree ?? dureeConseillee(Number(plan?.duree) || 3))
  const enCours = await pool.query(`SELECT id FROM "AdsClipGeneration" WHERE option_id = $1 AND statut IN ('soumise', 'en_cours', 'televersement')`, [o.optionId])
  if (enCours.rowCount) throw new Error('Un clip est déjà en cours pour ce plan : attends qu’il arrive.')
  const sim = simulation() && !cleHiggsfield()
  const estimation = sim ? 0.37 : Number((await appelHF(`estimate/${p.endpoint}`, p.corps)).usd)
  verifierBudget({ estimation, depenseJour: await depenseJour(), plafondJour: PLAFOND_JOUR(), plafondClip: PLAFOND_CLIP() })
  // Pas de nouvel envoi automatique apres un delai ambigu : Higgsfield n'a pas de cle d'idempotence.
  const envoi = sim ? { request_id: `sim-${Date.now()}`, status_url: 'simulation' } : await appelHF(p.endpoint, p.corps)
  const r = await pool.query(
    `INSERT INTO "AdsClipGeneration" (option_id, creatif_id, modele, endpoint, prompt, image_url, duree, request_id, status_url, statut, usd_estime, demande_par)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'soumise', $10, $11) RETURNING *`,
    [o.optionId, p.o.creatif_id, modele, p.endpoint, String((p.corps as { prompt?: string }).prompt ?? p.consigne), p.image, p.duree, envoi.request_id, envoi.status_url, estimation, o.par])
  return r.rows[0] as LigneClip
}

/**
 * Le suivi d'un clip (appele par le studio toutes les quelques secondes, ou par la routine) :
 * une fois termine, la video est copiee sur Cloudinary et posee comme clip du plan.
 */
export async function suivreClip(id: number): Promise<LigneClip> {
  const g = (await pool.query(`SELECT * FROM "AdsClipGeneration" WHERE id = $1`, [id])).rows[0] as LigneClip | undefined
  if (!g) throw new Error('Génération introuvable.')
  if (TERMINAUX.includes(g.statut) || g.statut === 'televersement') return g
  let statut: StatutClip, video: string | null = null, erreur: string | null = null
  if (g.status_url === 'simulation') {
    const age = Date.now() - new Date(g.cree_le).getTime()
    statut = age > 8000 ? 'terminee' : 'en_cours'
    video = statut === 'terminee' ? VIDEO_SIMULEE : null
  } else {
    const s = await appelHF(g.status_url || `requests/${g.request_id}/status`)
    statut = statutDepuis(String(s.status))
    video = (s.video as { url?: string } | undefined)?.url ?? null
    erreur = typeof s.error === 'string' ? s.error : null
  }
  if (statut !== 'terminee') {
    const u = await pool.query(`UPDATE "AdsClipGeneration" SET statut = $2, erreur = coalesce($3, erreur), maj_le = now() WHERE id = $1 AND statut IN ('soumise', 'en_cours') RETURNING *`,
      [id, statut, statut === 'refusee' ? 'Refusé par la modération de Higgsfield (non facturé) : reformule la consigne.' : erreur])
    return (u.rows[0] ?? g) as LigneClip
  }
  if (!video) throw new Error('Higgsfield dit « terminé » sans vidéo : réessaie le suivi dans un instant.')
  // Un seul suivi copie la video, meme si le studio et la routine suivent en meme temps.
  const pris = await pool.query(`UPDATE "AdsClipGeneration" SET statut = 'televersement', video_source = $2, maj_le = now() WHERE id = $1 AND statut IN ('soumise', 'en_cours') RETURNING id`, [id, video])
  if (!pris.rowCount) return (await pool.query(`SELECT * FROM "AdsClipGeneration" WHERE id = $1`, [id])).rows[0] as LigneClip
  try {
    const clip = await copierSurCloudinary(video, `plan-${g.option_id}-hf-${id}`)
    if (g.option_id) {
      await pool.query(`UPDATE "AdsCreativeOption" SET motion = jsonb_set(coalesce(motion, '{}'::jsonb), '{clip}', $2::jsonb), maj_le = now() WHERE id = $1`,
        [g.option_id, JSON.stringify({ url: clip.url, duree: clip.duree, debut: 0 })])
    }
    return (await pool.query(`UPDATE "AdsClipGeneration" SET statut = 'terminee', clip_url = $2, maj_le = now() WHERE id = $1 RETURNING *`, [id, clip.url])).rows[0] as LigneClip
  } catch (e) {
    // La video reste chez Higgsfield 7 jours : on repasse « en cours » pour que le prochain suivi retente la copie.
    await pool.query(`UPDATE "AdsClipGeneration" SET statut = 'en_cours', erreur = $2, maj_le = now() WHERE id = $1`, [id, `Copie Cloudinary : ${(e as Error).message}`])
    throw e
  }
}

/** Les dernieres generations d'un plan (le studio les montre sous le bouton). */
export async function clipsDuPlan(optionId: number) {
  try {
    return (await pool.query(`SELECT id, modele, duree, statut, usd_estime::float AS usd, erreur, cree_le FROM "AdsClipGeneration" WHERE option_id = $1 ORDER BY cree_le DESC LIMIT 5`, [optionId])).rows
  } catch (e) { if ((e as { code?: string }).code === '42P01') return []; throw e }
}
