import 'server-only'
import { createHash } from 'node:crypto'
import pool from '@/lib/db'

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
/** Des credits notes par le directeur artistique : un nombre positif raisonnable, sinon rien (« non chiffre »). */
export const creditsNotes = (x: unknown) => { const n = Number(x); return Number.isFinite(n) && n >= 0 && n <= 2000 && x !== '' && x != null ? Math.round(n * 100) / 100 : null }
/** Le nom d'un modele Higgsfield tel que l'agent le note (« kling-3.0 », « seedance-2.0-720p »). */
export const nomModele = (x: unknown) => String(x ?? '').toLowerCase().replace(/[^a-z0-9.:_-]/g, '').slice(0, 50)

export async function poserClipDepuisUrl(o: { optionId: number; url: string; par: string | null; source?: string; modele?: string; credits?: unknown }) {
  const url = String(o.url || '').trim()
  if (!/^https:\/\/\S+$/i.test(url) || url.length > 2000) throw new Error('Adresse du clip : une URL https complète.')
  const opt = (await pool.query(`SELECT id, creatif_id, mouvement, motion FROM "AdsCreativeOption" WHERE id = $1`, [o.optionId])).rows[0]
  if (!opt) throw new Error('Plan introuvable.')
  if (!opt.mouvement) throw new Error('Seuls les plans d’un Reel ont un clip.')
  const { nuage } = identifiants()
  const clip = url.startsWith(`https://res.cloudinary.com/${nuage}/video/upload/`) ? { url, duree: null } : await copierSurCloudinary(url, `plan-${opt.id}-ext-${Date.now()}`)
  await pool.query(`UPDATE "AdsCreativeOption" SET motion = jsonb_set(coalesce(motion, '{}'::jsonb), '{clip}', $2::jsonb), maj_le = now() WHERE id = $1`,
    [opt.id, JSON.stringify({ url: clip.url, duree: clip.duree, debut: 0 })])
  const modele = nomModele(o.modele)
  await pool.query(
    `INSERT INTO "AdsClipGeneration" (option_id, creatif_id, modele, endpoint, prompt, image_url, duree, statut, video_source, clip_url, demande_par, credits)
     VALUES ($1, $2, $3, 'externe', $4, '', $5, 'terminee', $6, $7, $8, $9)`,
    [opt.id, opt.creatif_id, modele ? `higgsfield:${modele}` : (o.source || 'externe').slice(0, 60), String(opt.motion?.clipPrompt ?? ''), Math.round(clip.duree ?? 0), url, clip.url, o.par, creditsNotes(o.credits)])
  return clip
}
