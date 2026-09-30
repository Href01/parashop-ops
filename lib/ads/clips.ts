import 'server-only'
import { createHash } from 'node:crypto'
import pool from '@/lib/db'
import { etapeDirection, type Message } from './direction-model'
import { urlClip } from './reel-model'

/**
 * LES CLIPS VIDEO DES REELS : des images reelles (tournees au telephone, ou generees
 * par Higgsfield via son connecteur MCP dans Claude) en fond d'un plan, a la place du decor.
 * Le BOS n'appelle aucune API video : il signe les envois, copie les clips et les pose.
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
  return signatureEnvoi(DOSSIER, 'video')
}

/** Un envoi direct du navigateur vers Cloudinary, signe par le BOS (la limite de 4,5 Mo de Vercel ne s'applique pas). */
function signatureEnvoi(folder: string, type: 'image' | 'video') {
  const { nuage, cle, secret } = identifiants()
  const timestamp = String(Math.floor(Date.now() / 1000))
  const params = { folder, timestamp }
  const signature = createHash('sha1').update(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&') + secret).digest('hex')
  return { url: `https://api.cloudinary.com/v1_1/${nuage}/${type}/upload`, apiKey: cle, timestamp, folder, signature }
}

/** Les pieces jointes de la discussion (photos, videos d'Achraf) : dans shine-ads/echanges. */
export function signaturePiece(type: unknown) {
  return signatureEnvoi('shine-ads/echanges', type === 'video' ? 'video' : 'image')
}

export const nuageShine = () => identifiants().nuage

/** Un clip de plan : une video du Cloudinary de Shine, rien d'autre. */
export function verifierClip(url: string | null | undefined) {
  if (!url) return
  const { nuage } = identifiants()
  if (!url.startsWith(`https://res.cloudinary.com/${nuage}/video/upload/`)) throw new Error('Clip : seule une vidéo envoyée depuis le studio est acceptée.')
}

/** Copie une video sur Cloudinary (les sorties de Higgsfield expirent au bout de 7 jours). */
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

/**
 * Un clip deja genere ailleurs — Higgsfield par le connecteur MCP de Claude (credits de l'abonnement),
 * ou un autre outil : copie sur Cloudinary, pose dans le plan, et trace dans le journal (sans cout : il
 * est paye hors du BOS).
 */
/** La bande-son du Reel (musique ou ambiance, faite ailleurs) : copiee sur Cloudinary et posee sur le plan 1. */
export async function poserBandeSon(o: { optionId: number; url: string; volume?: unknown; par: string | null }) {
  const url = String(o.url || '').trim()
  if (!/^https:\/\/\S+$/i.test(url) || url.length > 2000) throw new Error('Adresse de la bande-son : une URL https complète.')
  const opt = (await pool.query(`SELECT id, carte, mouvement FROM "AdsCreativeOption" WHERE id = $1`, [o.optionId])).rows[0]
  if (!opt || !opt.mouvement) throw new Error('Plan de Reel introuvable.')
  if (opt.carte !== 1) throw new Error('La bande-son se pose sur le plan 1 (elle court sous tout le Reel).')
  const { nuage } = identifiants()
  const son = url.startsWith(`https://res.cloudinary.com/${nuage}/video/upload/`) ? { url } : await copierSurCloudinary(url, `bande-${opt.id}-${Date.now()}`)
  const volume = Math.min(1, Math.max(0, Number(o.volume ?? 0.5) || 0.5))
  await pool.query(`UPDATE "AdsCreativeOption" SET motion = jsonb_set(coalesce(motion, '{}'::jsonb), '{bandeSon}', $2::jsonb), maj_le = now() WHERE id = $1`, [opt.id, JSON.stringify({ url: son.url, volume })])
  return { url: son.url, volume }
}

/**
 * Cloudinary convertit une video a la premiere demande d'une transformation ; pour un long
 * clip, cela prend jusqu'a 2 minutes. On lance les deux conversions (apercu, export) des que
 * le clip est pose : quand Achraf ouvre le Studio, elles sont pretes.
 */
export async function prechaufferClip(url: string | null | undefined) {
  if (!url || !/^https:\/\/res\.cloudinary\.com\//.test(url)) return
  await Promise.allSettled([false, true].map((hd) => fetch(urlClip(url, hd), { headers: { Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(4000) })))
}

/** Des credits notes par le directeur artistique : un nombre positif raisonnable, sinon rien (« non chiffre »). */
export const creditsNotes = (x: unknown) => { const n = Number(x); return Number.isFinite(n) && n >= 0 && n <= 2000 && x !== '' && x != null ? Math.round(n * 100) / 100 : null }
/** Le nom d'un modele Higgsfield tel que l'agent le note (« kling-3.0 », « seedance-2.0-720p »). */
export const nomModele = (x: unknown) => String(x ?? '').toLowerCase().replace(/[^a-z0-9.:_-]/g, '').slice(0, 50)

export async function poserClipDepuisUrl(o: { optionId: number; url: string; par: string | null; source?: string; modele?: string; credits?: unknown }) {
  const url = String(o.url || '').trim()
  if (!/^https:\/\/\S+$/i.test(url) || url.length > 2000) throw new Error('Adresse du clip : une URL https complète.')
  const opt = (await pool.query(`SELECT id, creatif_id, demande_id, carte, mouvement, motion FROM "AdsCreativeOption" WHERE id = $1`, [o.optionId])).rows[0]
  if (!opt) throw new Error('Plan introuvable.')
  if (!opt.mouvement) throw new Error('Seuls les plans d’un Reel ont un clip.')
  // Le directeur artistique ne filme que ce qu'Achraf a valide : avant le storyboard, seulement l'accroche (plan 1).
  if (o.par === 'agent' && opt.demande_id) {
    const dem = (await pool.query(`SELECT parametres, echanges FROM "AdsAgentRequest" WHERE id = $1`, [opt.demande_id])).rows[0]
    if (dem) {
      const { etape } = etapeDirection(dem.parametres ?? {}, (dem.echanges ?? []) as Message[])
      if (etape === 'proposer') throw new Error('Achraf n’a pas encore validé l’idée : aucun clip avant sa validation.')
      if (etape === 'storyboard' && opt.carte !== 1) throw new Error('Storyboard pas encore validé : seul le plan 1 (l’accroche) se filme avant. Soumets le storyboard (« proposer --palier=storyboard ») et attends le OK d’Achraf.')
    }
  }
  const { nuage } = identifiants()
  const clip = url.startsWith(`https://res.cloudinary.com/${nuage}/video/upload/`) ? { url, duree: null } : await copierSurCloudinary(url, `plan-${opt.id}-ext-${Date.now()}`)
  await pool.query(`UPDATE "AdsCreativeOption" SET motion = jsonb_set(coalesce(motion, '{}'::jsonb), '{clip}', $2::jsonb), maj_le = now() WHERE id = $1`,
    [opt.id, JSON.stringify({ url: clip.url, duree: clip.duree, debut: 0 })])
  const modele = nomModele(o.modele)
  await pool.query(
    `INSERT INTO "AdsClipGeneration" (option_id, creatif_id, modele, endpoint, prompt, image_url, duree, statut, video_source, clip_url, demande_par, credits)
     VALUES ($1, $2, $3, 'externe', $4, '', $5, 'terminee', $6, $7, $8, $9)`,
    [opt.id, opt.creatif_id, modele ? `higgsfield:${modele}` : (o.source || 'externe').slice(0, 60), String(opt.motion?.clipPrompt ?? ''), Math.round(clip.duree ?? 0), url, clip.url, o.par, creditsNotes(o.credits)])
  await prechaufferClip(clip.url)
  return clip
}
