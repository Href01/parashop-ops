import 'server-only'
import { createHash } from 'node:crypto'

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
